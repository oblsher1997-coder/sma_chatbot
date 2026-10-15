import { Telegraf } from 'telegraf';
import 'dotenv/config';
import { chat, resetConversation } from './deepseek.js';
import {
  trackSession, trackMessage, trackStage, trackConversion,
  trackDropout, setReminded, setLanguage, getUserData,
  getStats, buildStatsMessage,
  getAllUserIds, markBlocked,
} from './analytics.js';
import { scheduleReminder, cancelReminder } from './reminder.js';
import { appendApplication, prepareApplicationsSheet } from './sheets.js';
import {
  WELCOME, T, TIMES, ageLabel, timeLabel,
  langKeyboard, mainKeyboard, ageKeyboard, timeKeyboard, phoneKeyboard,
  confirmKeyboard, continueKeyboard, applyKeyboard,
  parseAge, parseTime, normalizePhone, isApplyIntent, looksLikeQuestion, groupMessage,
} from './form.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPLY_MAP_PATH = path.join(__dirname, 'reply_map.json');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID ? String(process.env.ADMIN_CHAT_ID) : null;
const TEACHER_GROUP_CHAT_ID = process.env.TEACHER_GROUP_CHAT_ID;

// CRM intake: заявки из бота видны в разделе «Заявки» CRM.
// Если переменные не заданы, шаг тихо пропускается.
const CRM_INTAKE_URL = process.env.CRM_INTAKE_URL || '';
const CRM_INTAKE_KEY = process.env.INTAKE_API_KEY || '';

// Отправка заявки в CRM (fire-and-forget: не блокирует бота, не роняет заявку
// при недоступности CRM — уведомление учителям и Google Sheets идут отдельно).
// Один повтор при таймауте/5xx: CRM изредка отвечает слишком долго.
async function sendLeadToCrm(lead) {
  if (!CRM_INTAKE_URL || !CRM_INTAKE_KEY) return;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(CRM_INTAKE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-intake-key': CRM_INTAKE_KEY },
        body: JSON.stringify(lead),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        console.log('[crm] lead sent to CRM');
        return;
      }
      console.error('[crm] intake failed:', res.status, await res.text().catch(() => ''));
      if (res.status < 500) return; // validation/auth errors won't fix themselves
    } catch (err) {
      console.error('[crm] intake error:', err.message);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 5000));
  }
}

// Field limits follow the CRM intake schema (childName ≤150, groupInterest ≤100, notes ≤2000).
function crmLead(f, { lang, username, chatId, isTest }) {
  const age = ageLabel(f.age, 'ru');
  const time = timeLabel(f.time, 'ru');
  return {
    childName: `${isTest ? '🧪 ТЕСТ · ' : ''}${f.childName}`.slice(0, 150),
    parentName: f.parentName.slice(0, 150),
    phone: f.phone,
    groupInterest: `${age} · ${time}`.slice(0, 100),
    format: 'офлайн',
    source: 'telegram',
    notes: [
      `👶 Возраст: ${age}`,
      `🕐 Удобное время: ${time}`,
      f.question ? `❓ Вопрос: ${f.question}` : null,
      `💬 Telegram: ${username ? `@${username}` : '—'}`,
      `🌐 Язык: ${lang === 'uz' ? 'узбекский' : 'русский'}`,
      `Telegram chat: ${chatId}`,
    ].filter(Boolean).join('\n').slice(0, 2000),
  };
}

// Applications in progress: chatId → { step, age, childName, time, parentName, phone, question }
// step: 'age' → 'name' → 'time' → 'phone' → 'confirm'
const forms = new Map();
// Chosen language per chat (cached here, persisted in analytics.json)
const langs = new Map();

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

// `extra` (e.g. a keyboard) is attached to the last chunk only.
async function sendReply(ctx, text, extra = {}) {
  if (!text) return;
  const clean = stripMarkdown(text);
  const chunks = clean.match(/[\s\S]{1,4000}/g) ?? [clean];
  for (let i = 0; i < chunks.length; i++) {
    await ctx.reply(chunks[i], i === chunks.length - 1 ? extra : {});
  }
}

function isAdminId(chatId) {
  return Boolean(ADMIN_CHAT_ID) && String(chatId) === ADMIN_CHAT_ID;
}

function isAdminChat(ctx) {
  return isAdminId(ctx.chat?.id);
}

async function getLang(chatId) {
  if (isAdminId(chatId)) return 'ru';
  if (langs.has(chatId)) return langs.get(chatId);
  const user = await getUserData(chatId);
  const lang = user?.language === 'uz' ? 'uz' : 'ru';
  langs.set(chatId, lang);
  return lang;
}

function fullName(person) {
  return [person?.first_name, person?.last_name].filter(Boolean).join(' ') || '—';
}

// Shows the picked answer under the question and removes its buttons.
async function markChosen(ctx, label) {
  const text = ctx.callbackQuery?.message?.text;
  if (!text) return clearButtons(ctx);
  try {
    await ctx.editMessageText(`${text}\n\n✅ ${label}`);
  } catch { /* message too old to edit — the form continues anyway */ }
}

async function clearButtons(ctx) {
  try {
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
  } catch { /* already cleared or too old — nothing to do */ }
}

// ─── Reminder ────────────────────────────────────────────────────────────────
// One reminder after 30 min of silence: "continue your application" if a form
// is in progress, otherwise an invitation to apply.
function scheduleUserReminder(chatId) {
  if (isAdminId(chatId)) return;
  scheduleReminder(chatId, async () => {
    const user = await getUserData(chatId);
    if (!user || user.reminded || user.stage === 'converted') return;
    const lang = await getLang(chatId);
    const inForm = forms.has(chatId);
    await bot.telegram.sendMessage(chatId, inForm ? T[lang].remindForm : T[lang].remindMenu, {
      reply_markup: inForm ? continueKeyboard(lang) : applyKeyboard(lang),
    });
    await setReminded(chatId);
  });
}

// ─── Application form ────────────────────────────────────────────────────────
// Sends the question for the current step and restarts the reminder timer.
async function sendStep(chatId) {
  const form = forms.get(chatId);
  if (!form) return;
  const lang = await getLang(chatId);
  const t = T[lang];
  const prompts = {
    age: [t.stepAge, ageKeyboard(lang)],
    name: [t.stepName, null],
    time: [t.stepTime, timeKeyboard(lang)],
    phone: [t.stepPhone, phoneKeyboard(lang)],
    confirm: [t.confirm(form), confirmKeyboard(lang)],
  };
  if (!prompts[form.step]) return; // 'sending' — submit in progress
  const [text, markup] = prompts[form.step];
  await bot.telegram.sendMessage(chatId, text, markup ? { reply_markup: markup } : {});
  scheduleUserReminder(chatId);
}

// Call after setting form.step: records the funnel stage and asks the question.
async function enterStep(chatId) {
  const form = forms.get(chatId);
  if (!form) return;
  if (!isAdminId(chatId)) await trackStage(chatId, `form_${form.step}`);
  await sendStep(chatId);
}

async function startForm(chatId, question = null) {
  forms.set(chatId, { step: 'age', question: question || null });
  await enterStep(chatId);
}

async function acceptPhone(ctx, form, phone, parentName) {
  const chatId = ctx.chat.id;
  form.phone = phone;
  form.parentName = parentName;
  form.step = 'confirm';
  const lang = await getLang(chatId);
  // Swaps the "send contact" keyboard back to the main menu
  await ctx.reply(T[lang].phoneOk, { reply_markup: mainKeyboard(lang) });
  await enterStep(chatId);
}

async function submitForm(ctx) {
  const chatId = ctx.chat.id;
  const form = forms.get(chatId);
  forms.delete(chatId);
  cancelReminder(chatId);

  const lang = await getLang(chatId);
  const meta = { lang, username: ctx.from?.username, chatId, isTest: isAdminId(chatId) };
  // Last-resort record in the PM2 logs in case every channel below fails
  const { step, ...answers } = form;
  console.log('[application]', JSON.stringify({ ...answers, ...meta }));

  await ctx.reply(T[lang].done, { reply_markup: mainKeyboard(lang) });

  try {
    const sent = await bot.telegram.sendMessage(TEACHER_GROUP_CHAT_ID, groupMessage(form, meta));
    await registerReply(sent.message_id, chatId);
  } catch (err) {
    console.error('[application] Failed to notify teachers:', err.message);
  }
  void sendLeadToCrm(crmLead(form, meta));
  await appendApplication({
    ...meta,
    childName: form.childName,
    age: ageLabel(form.age, 'ru'),
    time: timeLabel(form.time, 'ru'),
    parentName: form.parentName,
    phone: form.phone,
    question: form.question,
  });
  if (!meta.isTest) await trackConversion(chatId, { ...form, lang });
}

// Free text while a form is in progress. A valid answer moves the form on;
// anything else is treated as a question: the AI answers, then the step repeats.
async function handleFormText(ctx, form, text) {
  const chatId = ctx.chat.id;

  switch (form.step) {
    case 'age': {
      const age = parseAge(text);
      if (age) {
        form.age = age;
        form.step = 'name';
        return enterStep(chatId);
      }
      break;
    }
    case 'name':
      if (!looksLikeQuestion(text)) {
        form.childName = text.trim();
        form.step = 'time';
        return enterStep(chatId);
      }
      break;
    case 'time': {
      const time = parseTime(text);
      if (time) {
        form.time = time;
        form.step = 'phone';
        return enterStep(chatId);
      }
      break;
    }
    case 'phone': {
      const phone = normalizePhone(text);
      if (phone) return acceptPhone(ctx, form, phone, fullName(ctx.from));
      if (/\d{3}/.test(text.replace(/[\s()-]/g, ''))) {
        const lang = await getLang(chatId);
        await ctx.reply(T[lang].badPhone, { reply_markup: phoneKeyboard(lang) });
        scheduleUserReminder(chatId);
        return;
      }
      break;
    }
  }

  // "ок", "да" and the like at a button step → point at the buttons
  if (text.trim().length <= 3 && form.step !== 'name') {
    const lang = await getLang(chatId);
    await ctx.reply(T[lang].pickButton);
    return sendStep(chatId);
  }

  const action = await askAI(ctx, text);
  if (action?.type === 'DROPOUT') await handleAction(chatId, action);
  if (forms.has(chatId)) await sendStep(chatId);
}

async function handleFormCallback(ctx, data) {
  const chatId = ctx.chat.id;

  if (data.startsWith('lang:')) {
    const lang = data === 'lang:uz' ? 'uz' : 'ru';
    langs.set(chatId, lang);
    if (!isAdminId(chatId)) await setLanguage(chatId, lang);
    await markChosen(ctx, lang === 'uz' ? "🇺🇿 O'zbekcha" : '🇷🇺 Русский');
    await ctx.reply(T[lang].menu, { reply_markup: mainKeyboard(lang) });
    scheduleUserReminder(chatId);
    return;
  }

  if (data === 'form:start' || data === 'form:continue') {
    await clearButtons(ctx);
    return data === 'form:continue' && forms.has(chatId) ? sendStep(chatId) : startForm(chatId);
  }

  const lang = await getLang(chatId);
  let form = forms.get(chatId);

  if (data.startsWith('age:')) {
    // The bot may have restarted since the form was opened — the age button still works
    if (!form) {
      form = { step: 'age', question: null };
      forms.set(chatId, form);
    }
    if (form.step !== 'age') return; // stale button from an earlier message
    form.age = data === 'age:lt5' ? 'lt5' : Number(data.slice(4));
    form.step = 'name';
    await markChosen(ctx, ageLabel(form.age, lang));
    return enterStep(chatId);
  }

  if (!form) {
    // A stale "Отправить" tapped after a successful submit — nothing to do
    if (data === 'form:send') {
      const user = await getUserData(chatId);
      if (isAdminId(chatId) || user?.stage === 'converted') return;
    }
    // Otherwise the form was lost in a bot restart — begin again from the first step
    return startForm(chatId);
  }

  if (data.startsWith('time:')) {
    const key = data.slice(5);
    if (form.step !== 'time' || !TIMES[key]) return;
    form.time = key;
    form.step = 'phone';
    await markChosen(ctx, timeLabel(key, lang));
    return enterStep(chatId);
  }

  if (data === 'form:send') {
    if (form.step !== 'confirm') return;
    form.step = 'sending'; // a second tap while submitting is ignored
    await clearButtons(ctx);
    return submitForm(ctx);
  }

  if (data === 'form:restart') {
    forms.set(chatId, { step: 'age', question: form.question });
    await clearButtons(ctx);
    return enterStep(chatId);
  }
}

// ─── AI (free-text questions) ────────────────────────────────────────────────
// Returns the AI's action for parents; admin chats never trigger actions.
async function askAI(ctx, text) {
  const chatId = ctx.chat.id;
  const isAdmin = isAdminId(chatId);
  const lang = await getLang(chatId);
  try {
    await ctx.sendChatAction('typing');
    const { message, action } = await chat(chatId, text, isAdmin, lang);
    await sendReply(ctx, message, { reply_markup: mainKeyboard(lang) });
    return isAdmin ? null : action;
  } catch (err) {
    console.error('[ai] Error:', err.message);
    await ctx.reply(T[lang].error);
    return null;
  }
}

async function handleAction(chatId, action) {
  if (!action) return;

  switch (action.type) {
    case 'START_APPLICATION':
      // Already filling the form — the caller repeats the current step instead
      if (!forms.has(chatId)) await startForm(chatId, action.question);
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
  cancelReminder(chatId);
  resetConversation(chatId);
  forms.delete(chatId);

  if (isAdminChat(ctx)) {
    await ctx.reply(
      'Привет! Вы вошли как администратор SpeakMotion Academy.\n\n' +
      'Доступные команды:\n' +
      '/stats — статистика бота\n' +
      '/broadcast — рассылка всем пользователям\n' +
      '/chatid — ID этого чата\n\n' +
      'Кнопки внизу — такие же, как у родителей: можно протестировать заявку ' +
      '(в группе, CRM и таблице она будет помечена 🧪 ТЕСТ).\n' +
      'Любой другой текст — вопрос мне в режиме администратора.',
      { reply_markup: mainKeyboard('ru') }
    );
    return;
  }

  await trackSession(chatId);
  await ctx.reply(WELCOME, { reply_markup: langKeyboard() });
  scheduleUserReminder(chatId);
});

// ─── Text messages ───────────────────────────────────────────────────────────
bot.on('text', async (ctx) => {
  const chatType = ctx.chat.type;
  const chatId = ctx.chat.id;

  // ── Teacher group: handle replies to the bot's notifications ──
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

  const isAdmin = isAdminChat(ctx);
  const text = ctx.message.text;

  // Admin composing a broadcast — capture this text as the broadcast content
  if (isAdmin && broadcast && broadcast.stage === 'awaiting') {
    broadcast = { stage: 'confirm', type: 'text', text };
    await showBroadcastPreview(ctx);
    return;
  }

  cancelReminder(chatId);
  if (!isAdmin) await trackMessage(chatId);

  try {
    const form = forms.get(chatId);

    // "📝 Оставить заявку" or "Консультация" — mid-form, pick up where they left off
    if (text === T.ru.btnApply || text === T.uz.btnApply || (form && isApplyIntent(text))) {
      if (form) await sendStep(chatId);
      else await startForm(chatId);
      return;
    }

    if (text === T.ru.btnAsk || text === T.uz.btnAsk) {
      forms.delete(chatId);
      const lang = await getLang(chatId);
      await ctx.reply(T[lang].askPrompt, { reply_markup: mainKeyboard(lang) });
      scheduleUserReminder(chatId);
      return;
    }

    if (form) {
      await handleFormText(ctx, form, text);
      return;
    }

    if (isApplyIntent(text)) {
      await startForm(chatId);
      return;
    }

    const action = await askAI(ctx, text);
    await handleAction(chatId, action);
    if (!forms.has(chatId)) scheduleUserReminder(chatId);
  } catch (err) {
    console.error('[message] Error:', err.message);
    const lang = await getLang(chatId).catch(() => 'ru');
    await ctx.reply(T[lang].error).catch(() => {});
  }
});

// ─── Shared contact (phone step) ─────────────────────────────────────────────
bot.on('contact', async (ctx) => {
  if (ctx.chat.type !== 'private') return;
  const chatId = ctx.chat.id;
  cancelReminder(chatId);

  const form = forms.get(chatId);
  if (!form || form.step !== 'phone') {
    const lang = await getLang(chatId);
    await ctx.reply(T[lang].menu, { reply_markup: mainKeyboard(lang) });
    return;
  }

  const contact = ctx.message.contact;
  const phone = normalizePhone(contact.phone_number) || contact.phone_number;
  await acceptPhone(ctx, form, phone, fullName(contact));
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
  const data = ctx.callbackQuery?.data ?? '';

  if (data === 'bcast_cancel' && isAdminChat(ctx)) {
    broadcast = null;
    await ctx.answerCbQuery('Отменено');
    await ctx.reply('Рассылка отменена.');
    return;
  }
  if (data === 'bcast_send' && isAdminChat(ctx)) {
    await ctx.answerCbQuery('Запускаю рассылку…');
    // Run in background so the callback handler returns immediately
    // (broadcasting 1000s of users takes minutes, exceeding Telegraf's handler timeout).
    doBroadcast(ctx).catch((e) => console.error('[broadcast] error:', e.message));
    return;
  }

  await ctx.answerCbQuery();
  if (ctx.chat?.type !== 'private') return;
  cancelReminder(ctx.chat.id);

  try {
    await handleFormCallback(ctx, data);
  } catch (err) {
    console.error('[callback] Error:', err.message);
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
prepareApplicationsSheet().catch((err) => console.error('[sheets] Failed to prepare «Заявки» tab:', err.message));

bot.launch({ dropPendingUpdates: true });
console.log('✅ SpeakMotion bot is running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
