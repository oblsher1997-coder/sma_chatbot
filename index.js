import { Telegraf } from 'telegraf';
import 'dotenv/config';
import { chat, resetConversation } from './deepseek.js';
import { notifyTeacher } from './escalate.js';
import { addToWaitlist } from './waitlist.js';
import {
  trackSession, trackMessage, trackStage,
  trackConversion, trackEscalation, trackWaitlist,
  trackDropout, setReminded, getUserData,
  getStats, buildStatsMessage,
} from './analytics.js';
import { scheduleReminder, cancelReminder } from './reminder.js';
import { appendEnrollment, ensureHeader } from './sheets.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPLY_MAP_PATH = path.join(__dirname, 'reply_map.json');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : null;
const TEACHER_GROUP_CHAT_ID = process.env.TEACHER_GROUP_CHAT_ID;

// pending enrollment data per chatId
const pendingEnrollments = new Map();

// ─── Reply map (group message ID → parent chat ID) ──────────────────────────
async function loadReplyMap() {
  try {
    return JSON.parse(await fs.readFile(REPLY_MAP_PATH, 'utf8'));
  } catch { return {}; }
}
async function saveReplyMap(map) {
  await fs.writeFile(REPLY_MAP_PATH, JSON.stringify(map, null, 2));
}
async function registerReply(groupMsgId, parentChatId) {
  const map = await loadReplyMap();
  map[String(groupMsgId)] = String(parentChatId);
  await saveReplyMap(map);
}
async function lookupParent(groupMsgId) {
  const map = await loadReplyMap();
  return map[String(groupMsgId)] || null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/\*(.*?)\*/gs, '$1')
    .replace(/__(.*?)__/gs, '$1')
    .replace(/_(.*?)_/gs, '$1');
}

async function sendReply(ctx, text) {
  if (!text) return;
  const clean = stripMarkdown(text);
  const chunks = clean.match(/[\s\S]{1,4000}/g) ?? [clean];
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

// ─── Action dispatcher ───────────────────────────────────────────────────────
async function handleAction(ctx, action) {
  if (!action) return;
  const chatId = ctx.chat.id;

  switch (action.type) {
    case 'SEND_PAYMENT': {
      const enrollment = {
        childName: action.childName,
        childBirthDate: action.childBirthDate ?? action.childBirthYear,
        parentName: action.parentName,
        parentPhone: action.parentPhone,
        group: action.group,
        chatId,
      };
      pendingEnrollments.set(chatId, enrollment);

      const paymeLink = process.env.PAYME_LINK || 'https://payme.uz';
      await ctx.reply('Выберите способ оплаты:', {
        reply_markup: {
          inline_keyboard: [[
            { text: '💚 Payme', url: paymeLink },
            { text: '💵 Наличные', callback_data: `cash_${chatId}` },
          ]],
        },
      });

      await appendEnrollment({ ...enrollment, paymentMethod: 'Payme (ссылка отправлена)' });
      await trackConversion(chatId, { ...enrollment, paymentMethod: 'Payme' });
      break;
    }

    case 'ESCALATE': {
      try {
        const sent = await bot.telegram.sendMessage(
          TEACHER_GROUP_CHAT_ID,
          `🔔 Новая заявка требует внимания\n\n` +
          `👤 Имя: ${action.name ?? '—'}\n` +
          `📞 Телефон: ${action.phone ?? '—'}\n` +
          `👶 Возраст ребёнка: ${action.age ?? '—'}\n` +
          `❓ Вопрос: ${action.question ?? '—'}`
        );
        // Map group message ID → parent chat ID for reply-through feature
        await registerReply(sent.message_id, chatId);
        console.log('[escalate] Teacher notified, msg_id:', sent.message_id);
      } catch (err) {
        console.error('[escalate] Failed to notify teacher:', err.message);
      }
      await trackEscalation(chatId);
      break;
    }

    case 'WAITLIST': {
      try {
        await addToWaitlist({ chatId, name: action.name, phone: action.phone, preferred_time: action.preferred_time });
      } catch (err) {
        console.error('[waitlist] Failed to save entry:', err.message);
      }
      await trackWaitlist(chatId);
      break;
    }

    case 'MILESTONE':
      if (action.stage) {
        await trackStage(chatId, action.stage);
        console.log(`[milestone] Chat ${chatId} → ${action.stage}`);
      }
      break;

    case 'DROPOUT':
      if (action.reason) {
        await trackDropout(chatId, action.reason);
        console.log(`[dropout] Chat ${chatId} reason: ${action.reason}`);
      }
      break;

    default:
      console.warn('[action] Unknown action type:', action.type);
  }
}

// ─── Commands ────────────────────────────────────────────────────────────────
bot.command('stats', async (ctx) => {
  if (ADMIN_CHAT_ID && String(ctx.chat.id) !== ADMIN_CHAT_ID) {
    await ctx.reply('Нет доступа.');
    return;
  }
  try {
    const data = await getStats();
    await ctx.reply(buildStatsMessage(data));
  } catch (err) {
    await ctx.reply('Ошибка при загрузке статистики.');
  }
});

bot.command('chatid', (ctx) => {
  ctx.reply(`Chat ID: ${ctx.chat.id}\nType: ${ctx.chat.type}`);
});

// ─── /start ──────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  // Only handle private chats
  if (ctx.chat.type !== 'private') return;

  const chatId = ctx.chat.id;
  const isAdmin = ADMIN_CHAT_ID && String(chatId) === ADMIN_CHAT_ID;

  cancelReminder(chatId);
  resetConversation(chatId);

  if (isAdmin) {
    await ctx.reply(
      'Привет! Вы вошли как администратор SpeakMotion Academy.\n\n' +
      'Доступные команды:\n' +
      '/stats — статистика бота\n' +
      '/chatid — ID этого чата\n\n' +
      'Напишите любой вопрос — я отвечу в режиме администратора.'
    );
    return;
  }

  await trackSession(chatId);
  try {
    const { message, action } = await chat(chatId, '/start', false);
    await sendReply(ctx, message);
    await handleAction(ctx, action);
    scheduleReminder(chatId, async (text) => {
      const user = await getUserData(chatId);
      if (user && !user.reminded && !['converted', 'escalated'].includes(user.stage)) {
        await ctx.reply(text);
        await setReminded(chatId);
      }
    });
  } catch (err) {
    console.error('[start] Error:', err.message);
    await ctx.reply('Произошла ошибка. Попробуйте ещё раз через несколько секунд.');
  }
});

// ─── Text messages ───────────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  const chatType = ctx.chat.type;
  const chatId = ctx.chat.id;

  // ── Teacher group: handle replies to escalation messages ──
  if (chatType === 'group' || chatType === 'supergroup') {
    if (String(chatId) !== String(TEACHER_GROUP_CHAT_ID)) return;

    const replyTo = ctx.message.reply_to_message;
    if (!replyTo) return; // ignore non-reply messages in group

    // Only react to replies to the bot's own messages
    if (replyTo.from?.id !== ctx.botInfo.id) return;

    const parentChatId = await lookupParent(replyTo.message_id);
    if (!parentChatId) return;

    const rawText = ctx.message.text.trim();
    if (!rawText.startsWith('!') || !rawText.endsWith('!')) {
      await ctx.reply('⚠️ Сообщение не отправлено. Оберните текст в ! чтобы отправить родителю, например: !Ваш ответ!');
      return;
    }
    const messageToParent = rawText.slice(1, -1).trim();

    try {
      await bot.telegram.sendMessage(
        parentChatId,
        `Ответ от учителя:\n\n${messageToParent}`
      );
      await ctx.reply('✅ Ответ отправлен родителю.');
    } catch (err) {
      console.error('[reply-forward] Failed:', err.message);
      await ctx.reply('❌ Не удалось отправить ответ родителю.');
    }
    return;
  }

  // ── Private chat only from here ──
  if (chatType !== 'private') return;

  const isAdmin = ADMIN_CHAT_ID && String(chatId) === ADMIN_CHAT_ID;
  cancelReminder(chatId);

  if (!isAdmin) await trackMessage(chatId);

  try {
    await ctx.sendChatAction('typing');
    const { message, action } = await chat(chatId, ctx.message.text, isAdmin);
    await sendReply(ctx, message);
    if (!isAdmin) {
      await handleAction(ctx, action);
      const user = await getUserData(chatId);
      if (user && !user.reminded && !['converted', 'escalated'].includes(user?.stage)) {
        scheduleReminder(chatId, async (text) => {
          const fresh = await getUserData(chatId);
          if (fresh && !fresh.reminded && !['converted', 'escalated'].includes(fresh.stage)) {
            await ctx.reply(text);
            await setReminded(chatId);
          }
        });
      }
    }
  } catch (err) {
    console.error('[message] Error:', err.message);
    await ctx.reply('Произошла ошибка. Напишите ещё раз или /start для перезапуска.');
  }
});

// ─── Cash payment callback ───────────────────────────────────────────────────
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data?.startsWith('cash_')) return;
  await ctx.answerCbQuery();

  const chatId = ctx.chat.id;
  const enrollment = pendingEnrollments.get(chatId) || {};

  try {
    const sent = await bot.telegram.sendMessage(
      TEACHER_GROUP_CHAT_ID,
      `💵 Оплата наличными\n\n` +
      `👤 Родитель: ${enrollment.parentName || '—'}\n` +
      `📞 Телефон: ${enrollment.parentPhone || '—'}\n` +
      `👶 Ребёнок: ${enrollment.childName || '—'}, ${enrollment.childBirthDate || '—'}\n` +
      `📚 Группа: ${enrollment.group || '—'}`
    );
    await registerReply(sent.message_id, chatId);
  } catch (err) {
    console.error('[cash] Failed to notify teacher:', err.message);
  }

  await appendEnrollment({ ...enrollment, paymentMethod: 'Наличные' });
  await ctx.reply('Отлично! Наш администратор свяжется с вами в ближайшее время для подтверждения оплаты. 🤝');
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
ensureHeader().catch(() => {});

bot.launch({ dropPendingUpdates: true });
console.log('✅ SpeakMotion bot is running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
