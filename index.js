import { Telegraf } from 'telegraf';
import 'dotenv/config';
import { chat, resetConversation } from './deepseek.js';
import { notifyTeacher } from './escalate.js';
import { addToWaitlist } from './waitlist.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

async function sendReply(ctx, text) {
  if (!text) return;
  // Split long messages to respect Telegram's 4096-char limit
  const chunks = text.match(/[\s\S]{1,4000}/g) ?? [text];
  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

async function handleAction(ctx, action) {
  if (!action) return;

  switch (action.type) {
    case 'SEND_PAYMENT': {
      const paymeLink  = process.env.PAYME_LINK  || 'https://payme.uz';
      const clickLink  = process.env.CLICK_LINK  || 'https://click.uz';
      await ctx.reply('💳 Выберите способ оплаты / To\'lov usulini tanlang:', {
        reply_markup: {
          inline_keyboard: [[
            { text: '💚 Payme', url: paymeLink },
            { text: '🔵 Click', url: clickLink },
          ]],
        },
      });
      break;
    }

    case 'ESCALATE': {
      try {
        await notifyTeacher(ctx.telegram, action);
        console.log('[escalate] Teacher notified for chat', ctx.chat.id);
      } catch (err) {
        console.error('[escalate] Failed to notify teacher:', err.message);
      }
      break;
    }

    case 'WAITLIST': {
      try {
        await addToWaitlist({
          chatId: ctx.chat.id,
          name: action.name,
          phone: action.phone,
          preferred_time: action.preferred_time,
        });
      } catch (err) {
        console.error('[waitlist] Failed to save entry:', err.message);
      }
      break;
    }

    default:
      console.warn('[action] Unknown action type:', action.type);
  }
}

bot.command('chatid', (ctx) => {
  ctx.reply(`Chat ID: \`${ctx.chat.id}\`\nType: ${ctx.chat.type}`);
});

bot.start(async (ctx) => {
  resetConversation(ctx.chat.id);
  try {
    const { message, action } = await chat(ctx.chat.id, '/start');
    await sendReply(ctx, message);
    await handleAction(ctx, action);
  } catch (err) {
    console.error('[start] Error:', err.message);
    await ctx.reply(
      'Произошла ошибка при запуске. Пожалуйста, попробуйте ещё раз через несколько секунд.'
    );
  }
});

bot.on('text', async (ctx) => {
  try {
    await ctx.sendChatAction('typing');
    const { message, action } = await chat(ctx.chat.id, ctx.message.text);
    await sendReply(ctx, message);
    await handleAction(ctx, action);
  } catch (err) {
    console.error('[message] Error:', err.message);
    await ctx.reply(
      'Произошла ошибка. Пожалуйста, попробуйте ещё раз или напишите /start для перезапуска.'
    );
  }
});

bot.launch({ dropPendingUpdates: true });
console.log('✅ SpeakMotion bot is running');

process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
