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

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : null;

// Store enrollment data per chatId until payment method is chosen
const pendingEnrollments = new Map();

// Strip markdown asterisks/underscores the AI might accidentally include
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

async function handleAction(ctx, action) {
  if (!action) return;
  const chatId = ctx.chat.id;

  switch (action.type) {
    case 'SEND_PAYMENT': {
      const enrollment = {
        childName: action.childName,
        childBirthYear: action.childBirthYear,
        parentName: action.parentName,
        parentPhone: action.parentPhone,
        group: action.group,
        chatId,
      };
      // Save enrollment data so cash callback can use it
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

      // Log Payme option to sheets (payment link sent)
      await appendEnrollment({ ...enrollment, paymentMethod: 'Payme (ссылка отправлена)' });
      await trackConversion(chatId, { ...enrollment, paymentMethod: 'Payme' });
      break;
    }

    case 'ESCALATE': {
      try {
        await notifyTeacher(ctx.telegram, action);
        console.log('[escalate] Teacher notified for chat', chatId);
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

    case 'MILESTONE': {
      if (action.stage) {
        await trackStage(chatId, action.stage);
        console.log(`[milestone] Chat ${chatId} → ${action.stage}`);
      }
      break;
    }

    case 'DROPOUT': {
      if (action.reason) {
        await trackDropout(chatId, action.reason);
        console.log(`[dropout] Chat ${chatId} reason: ${action.reason}`);
      }
      break;
    }

    default:
      console.warn('[action] Unknown action type:', action.type);
  }
}

// /stats — admin only
bot.command('stats', async (ctx) => {
  if (ADMIN_CHAT_ID && String(ctx.chat.id) !== ADMIN_CHAT_ID) {
    await ctx.reply('Нет доступа.');
    return;
  }
  try {
    const data = await getStats();
    await ctx.reply(buildStatsMessage(data));
  } catch (err) {
    console.error('[stats] Error:', err.message);
    await ctx.reply('Ошибка при загрузке статистики.');
  }
});

// /chatid — helper
bot.command('chatid', (ctx) => {
  ctx.reply(`Chat ID: ${ctx.chat.id}\nType: ${ctx.chat.type}`);
});

// /start
bot.start(async (ctx) => {
  const chatId = ctx.chat.id;
  cancelReminder(chatId);
  resetConversation(chatId);
  await trackSession(chatId);

  try {
    const { message, action } = await chat(chatId, '/start');
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

// All text messages
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  cancelReminder(chatId);
  await trackMessage(chatId);

  try {
    await ctx.sendChatAction('typing');
    const { message, action } = await chat(chatId, ctx.message.text);
    await sendReply(ctx, message);
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
  } catch (err) {
    console.error('[message] Error:', err.message);
    await ctx.reply('Произошла ошибка. Напишите ещё раз или /start для перезапуска.');
  }
});

// Cash payment button
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data?.startsWith('cash_')) return;

  await ctx.answerCbQuery();

  const chatId = ctx.chat.id;
  const enrollment = pendingEnrollments.get(chatId) || {};

  // Notify teacher group
  const teacherMsg =
    `💵 Запись на оплату наличными\n\n` +
    `👤 Родитель: ${enrollment.parentName || '—'}\n` +
    `📞 Телефон: ${enrollment.parentPhone || '—'}\n` +
    `👶 Ребёнок: ${enrollment.childName || '—'}, ${enrollment.childBirthYear || '—'} г.р.\n` +
    `📚 Группа: ${enrollment.group || '—'}`;

  try {
    await notifyTeacher(ctx.telegram, {
      name: enrollment.parentName,
      phone: enrollment.parentPhone,
      age: enrollment.childBirthYear,
      question: `Хочет оплатить наличными. Группа: ${enrollment.group || '—'}. Ребёнок: ${enrollment.childName || '—'}`,
    });
  } catch (err) {
    console.error('[cash] Failed to notify teacher:', err.message);
  }

  // Log to Google Sheets
  await appendEnrollment({ ...enrollment, paymentMethod: 'Наличные' });

  await ctx.reply(
    'Отлично! Наш администратор свяжется с вами в ближайшее время для подтверждения оплаты наличными. 🤝'
  );
});

// Init sheets header on startup
ensureHeader().catch(() => {});

bot.launch({ dropPendingUpdates: true });
console.log('✅ SpeakMotion bot is running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
