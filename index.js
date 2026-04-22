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

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : null;

async function sendReply(ctx, text) {
  if (!text) return;
  const chunks = text.match(/[\s\S]{1,4000}/g) ?? [text];
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

async function handleAction(ctx, action) {
  if (!action) return;
  const chatId = ctx.chat.id;

  switch (action.type) {
    case 'SEND_PAYMENT': {
      const paymeLink = process.env.PAYME_LINK || 'https://payme.uz';
      const clickLink = process.env.CLICK_LINK || 'https://click.uz';
      await ctx.reply('💳 Выберите способ оплаты / To\'lov usulini tanlang:', {
        reply_markup: {
          inline_keyboard: [[
            { text: '💚 Payme', url: paymeLink },
            { text: '💵 Наличные / Naqd', callback_data: 'cash' },
          ]],
        },
      });
      await trackConversion(chatId, {
        childName: action.childName,
        childBirthYear: action.childBirthYear,
        parentName: action.parentName,
        parentPhone: action.parentPhone,
        group: action.group,
        at: new Date().toISOString(),
      });
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
        await addToWaitlist({
          chatId,
          name: action.name,
          phone: action.phone,
          preferred_time: action.preferred_time,
        });
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
  const requesterId = String(ctx.chat.id);
  if (ADMIN_CHAT_ID && requesterId !== ADMIN_CHAT_ID) {
    await ctx.reply('⛔ Нет доступа.');
    return;
  }
  try {
    const data = await getStats();
    const msg = buildStatsMessage(data);
    await ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[stats] Error:', err.message);
    await ctx.reply('Ошибка при загрузке статистики.');
  }
});

// /chatid — helper to find group chat ID
bot.command('chatid', (ctx) => {
  ctx.reply(`Chat ID: \`${ctx.chat.id}\`\nType: ${ctx.chat.type}`, { parse_mode: 'Markdown' });
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
    // Schedule reminder in case parent goes silent
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

  // Cancel any pending reminder — user is active
  cancelReminder(chatId);
  await trackMessage(chatId);

  try {
    await ctx.sendChatAction('typing');
    const { message, action } = await chat(chatId, ctx.message.text);
    await sendReply(ctx, message);
    await handleAction(ctx, action);

    // Re-schedule reminder after bot replies (user might go silent now)
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

// Cash payment callback
bot.on('callback_query', async (ctx) => {
  if (ctx.callbackQuery.data === 'cash') {
    await ctx.answerCbQuery();
    await ctx.reply(
      'Отлично! Оплата наличными принимается в офисе академии. ' +
      'Наш администратор свяжется с вами для уточнения деталей. 🤝'
    );
  }
});

bot.launch({ dropPendingUpdates: true });
console.log('✅ SpeakMotion bot is running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
