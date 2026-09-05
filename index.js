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
  getAllUserIds, markBlocked,
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

// Broadcast composition state (single admin). null when idle.
// { stage: 'awaiting' | 'confirm', type: 'text'|'photo', text?, photo?, caption? }
let broadcast = null;
let broadcasting = false;

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
    case 'BOOK_CONSULTATION': {
      const booking = {
        childName:     action.childName,
        childBirthDate: action.childBirthDate,
        parentName:    action.parentName,
        parentPhone:   action.parentPhone,
        group:         action.group,
        format:        'офлайн',
        chatId,
      };
      pendingEnrollments.set(chatId, booking);

      // Notify teacher group
      try {
        const sent = await bot.telegram.sendMessage(
          TEACHER_GROUP_CHAT_ID,
          `📅 Запись на бесплатную консультацию\n\n` +
          `👶 Ребёнок: ${booking.childName || '—'}, ${booking.childBirthDate || '—'}\n` +
          `👤 Родитель: ${booking.parentName || '—'}\n` +
          `📞 Телефон: ${booking.parentPhone || '—'}\n` +
          `📚 Группа интереса: ${booking.group || '—'}\n` +
          `💻 Формат: ${booking.format}`
        );
        await registerReply(sent.message_id, chatId);
        console.log('[consultation] Booked, msg_id:', sent.message_id);
      } catch (err) {
        console.error('[consultation] Failed to notify teacher:', err.message);
      }

      // Log to Google Sheets
      await appendEnrollment({ ...booking, paymentMethod: `Консультация (${booking.format})` });
      await trackConversion(chatId, booking);
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

// ─── Broadcast (admin only) ──────────────────────────────────────────────────
function isAdminChat(ctx) {
  return ADMIN_CHAT_ID && String(ctx.chat?.id) === ADMIN_CHAT_ID;
}

async function showBroadcastPreview(ctx) {
  const kb = {
    inline_keyboard: [[
      { text: '📢 Разослать всем', callback_data: 'bcast_send' },
      { text: '❌ Отмена', callback_data: 'bcast_cancel' },
    ]],
  };
  if (broadcast.type === 'photo') {
    await ctx.replyWithPhoto(broadcast.photo, {
      caption: `👁 ПРЕВЬЮ РАССЫЛКИ (так увидят родители):\n\n${broadcast.caption || ''}`,
      reply_markup: kb,
    });
  } else {
    await ctx.reply(
      `👁 ПРЕВЬЮ РАССЫЛКИ (так увидят родители):\n\n${broadcast.text}`,
      { reply_markup: kb }
    );
  }
}

async function doBroadcast(ctx) {
  if (!broadcast || broadcast.stage !== 'confirm') return;
  if (broadcasting) { await ctx.reply('Рассылка уже идёт, подождите.'); return; }

  const payload = broadcast;
  broadcast = null;
  broadcasting = true;

  try {
    const ids = await getAllUserIds();
    await ctx.reply(`📢 Начинаю рассылку для ${ids.length} пользователей…`);

    let sent = 0, blocked = 0, failed = 0;
    for (const id of ids) {
      try {
        if (payload.type === 'photo') {
          await bot.telegram.sendPhoto(id, payload.photo, { caption: payload.caption || undefined });
        } else {
          await bot.telegram.sendMessage(id, payload.text);
        }
        sent++;
      } catch (err) {
        const code = err?.response?.error_code;
        if (code === 403) { blocked++; await markBlocked(id); }
        else { failed++; console.error('[broadcast] send fail', id, err.message); }
      }
      await new Promise((r) => setTimeout(r, 50)); // ~20 msg/sec
    }

    await ctx.reply(
      `✅ Рассылка завершена!\n\n` +
      `📤 Отправлено: ${sent}\n` +
      `🚫 Заблокировали бота: ${blocked}\n` +
      `⚠️ Ошибок: ${failed}\n` +
      `👥 Всего: ${ids.length}`
    );
  } finally {
    broadcasting = false;
  }
}

bot.command('broadcast', async (ctx) => {
  if (!isAdminChat(ctx)) { await ctx.reply('Нет доступа.'); return; }
  broadcast = { stage: 'awaiting' };
  await ctx.reply(
    '📢 Режим рассылки.\n\n' +
    'Отправьте сообщение, которое хотите разослать всем пользователям:\n' +
    '• просто текст, или\n' +
    '• фото с подписью\n\n' +
    'Для отмены — /cancel'
  );
});

bot.command('cancel', async (ctx) => {
  if (!isAdminChat(ctx)) return;
  if (broadcast) {
    broadcast = null;
    await ctx.reply('Рассылка отменена.');
  }
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
      '/broadcast — рассылка всем пользователям\n' +
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

  // Admin composing a broadcast — capture this text as the broadcast content
  if (isAdmin && broadcast && broadcast.stage === 'awaiting') {
    broadcast = { stage: 'confirm', type: 'text', text: ctx.message.text };
    await showBroadcastPreview(ctx);
    return;
  }

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

// ─── Photo messages (admin broadcast composition) ────────────────────────────
bot.on('photo', async (ctx) => {
  if (ctx.chat?.type !== 'private') return;
  if (!isAdminChat(ctx)) return;
  if (!broadcast || broadcast.stage !== 'awaiting') return;

  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id; // highest resolution
  broadcast = { stage: 'confirm', type: 'photo', photo: fileId, caption: ctx.message.caption || '' };
  await showBroadcastPreview(ctx);
});

// ─── Callback queries ─────────────────────────────────────────────────────────
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery?.data;

  if (data === 'bcast_cancel' && isAdminChat(ctx)) {
    broadcast = null;
    await ctx.answerCbQuery('Отменено');
    await ctx.reply('Рассылка отменена.');
    return;
  }
  if (data === 'bcast_send' && isAdminChat(ctx)) {
    await ctx.answerCbQuery('Запускаю рассылку…');
    await doBroadcast(ctx);
    return;
  }

  await ctx.answerCbQuery();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
ensureHeader().catch(() => {});

bot.launch({ dropPendingUpdates: true });
console.log('✅ SpeakMotion bot is running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
