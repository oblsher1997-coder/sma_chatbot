import { Telegraf } from 'telegraf';
import 'dotenv/config';
import { chat, resetConversation } from './deepseek.js';
import {
  trackSession, trackMessage, trackStage, trackConversion, trackDiagnostic, trackDiagnosticCancel,
  trackDropout, setReminded, setLanguage, getUserData,
  getStats, buildStatsMessage,
  getAllUserIds, markBlocked,
} from './analytics.js';
import { scheduleReminder, cancelReminder } from './reminder.js';
import { appendApplication, appendDiagnostic, noteDiagnostic, prepareSheets } from './sheets.js';
import {
  DIAGNOSTIC_MODE, WELCOME, T, TIMES, ageLabel, timeLabel, dateLabel, dateButton,
  menuText, remindMenuText,
  langKeyboard, mainKeyboard, ageKeyboard, diagAgeKeyboard, timeKeyboard, dateKeyboard,
  slotKeyboard, phoneKeyboard, confirmKeyboard, continueKeyboard, applyKeyboard,
  attendKeyboard, cantComeKeyboard,
  parseAge, parseTime, parseClock, normalizePhone, isApplyIntent, looksLikeQuestion,
  groupMessage, diagGroupMessage, diagCancelMessage,
} from './form.js';
import {
  freeDates, freeTimes, book, upcoming, release, block, slotEnd, slotsFor, isValidAge, parseDayMonth,
  confirmOwn, cancelOwn, dueReminders, markReminded,
} from './diagnostics.js';
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

// Field limits follow the CRM intake schema (childName ≤150, groupInterest ≤100,
// format ≤30, notes ≤2000).
function crmLead(f, { lang, username, chatId, isTest }) {
  const age = ageLabel(f.age, 'ru');
  const isDiag = f.kind === 'diag';
  const when = isDiag ? `${dateLabel(f.date, 'ru')}, ${f.slot}–${slotEnd(f.slot)}` : timeLabel(f.time, 'ru');
  return {
    childName: `${isTest ? '🧪 ТЕСТ · ' : ''}${f.childName}`.slice(0, 150),
    parentName: f.parentName.slice(0, 150),
    phone: f.phone,
    groupInterest: (isDiag ? `Диагностика · ${dateButton(f.date, 'ru')} ${f.slot}` : `${age} · ${when}`).slice(0, 100),
    format: isDiag ? 'диагностика' : 'офлайн',
    source: 'telegram',
    notes: [
      isDiag ? `🔍 Диагностика: ${when}` : null,
      `👶 Возраст: ${age}`,
      isDiag ? null : `🕐 Удобное время: ${when}`,
      f.question ? `❓ Вопрос: ${f.question}` : null,
      `💬 Telegram: ${username ? `@${username}` : '—'}`,
      `🌐 Язык: ${lang === 'uz' ? 'узбекский' : 'русский'}`,
      `Telegram chat: ${chatId}`,
    ].filter(Boolean).join('\n').slice(0, 2000),
  };
}

// Forms in progress: chatId → { kind, step, age, childName, time | date+slot, parentName, phone, question }
// The menu's main button opens MAIN_KIND; the other kind stays in code for DIAGNOSTIC_MODE = false.
const MAIN_KIND = DIAGNOSTIC_MODE ? 'diag' : 'app';
const FLOW = {
  app: ['age', 'name', 'time', 'phone', 'confirm'],
  diag: ['age', 'date', 'slot', 'name', 'phone', 'confirm'],
};
// Stages after which a parent shouldn't be reminded or re-funnelled
const DONE_STAGES = ['converted', 'diag_booked'];

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
// One reminder after 30 min of silence: "continue" if a form is in progress,
// otherwise an invitation to the main form.
function scheduleUserReminder(chatId) {
  if (isAdminId(chatId)) return;
  scheduleReminder(chatId, async () => {
    const user = await getUserData(chatId);
    if (!user || user.reminded || DONE_STAGES.includes(user.stage)) return;
    // Told the diagnostic isn't for their child's age — don't invite them again
    if (DIAGNOSTIC_MODE && user.dropoutReason === 'age_out_of_range') return;
    const lang = await getLang(chatId);
    const form = forms.get(chatId);
    const text = form
      ? (form.kind === 'diag' ? T[lang].diagRemindForm : T[lang].remindForm)
      : remindMenuText(lang);
    await bot.telegram.sendMessage(chatId, text, {
      reply_markup: form ? continueKeyboard(lang) : applyKeyboard(lang),
    });
    await setReminded(chatId);
  });
}

// ─── Forms ───────────────────────────────────────────────────────────────────
function advance(form) {
  const flow = FLOW[form.kind];
  form.step = flow[flow.indexOf(form.step) + 1];
}

// Sends the question for the current step and restarts the reminder timer.
async function sendStep(chatId) {
  const form = forms.get(chatId);
  if (!form) return;
  const lang = await getLang(chatId);
  const t = T[lang];
  let prompt;

  if (form.kind === 'diag') {
    switch (form.step) {
      case 'age': prompt = [t.diagAge, diagAgeKeyboard(lang)]; break;
      case 'date': {
        const dates = freeDates();
        if (!dates.length) {
          forms.delete(chatId);
          await bot.telegram.sendMessage(chatId, t.diagNoDates, { reply_markup: mainKeyboard(lang) });
          return;
        }
        prompt = [t.diagDate, dateKeyboard(dates, lang)];
        break;
      }
      case 'slot': {
        const times = freeTimes(form.date);
        if (!times.length) {
          // The day filled up meanwhile — pick another one
          form.step = 'date';
          return sendStep(chatId);
        }
        prompt = [t.diagSlot(dateLabel(form.date, lang)), slotKeyboard(times, lang)];
        break;
      }
      case 'name': prompt = [t.diagName, null]; break;
      case 'phone': prompt = [t.diagPhone, phoneKeyboard(lang)]; break;
      case 'confirm': prompt = [t.diagConfirm(form), confirmKeyboard(lang, t.btnBook)]; break;
    }
  } else {
    prompt = {
      age: [t.stepAge, ageKeyboard(lang)],
      name: [t.stepName, null],
      time: [t.stepTime, timeKeyboard(lang)],
      phone: [t.stepPhone, phoneKeyboard(lang)],
      confirm: [t.confirm(form), confirmKeyboard(lang)],
    }[form.step];
  }

  if (!prompt) return; // 'sending' — submit in progress
  const [text, markup] = prompt;
  await bot.telegram.sendMessage(chatId, text, markup ? { reply_markup: markup } : {});
  scheduleUserReminder(chatId);
}

// Call after setting form.step: records the funnel stage and asks the question.
async function enterStep(chatId) {
  const form = forms.get(chatId);
  if (!form) return;
  if (!isAdminId(chatId)) await trackStage(chatId, `${form.kind === 'diag' ? 'diag' : 'form'}_${form.step}`);
  await sendStep(chatId);
}

async function startForm(chatId, question = null, kind = MAIN_KIND) {
  forms.set(chatId, { kind, step: 'age', question: question || null });
  await enterStep(chatId);
}

// The diagnostic is only for children 5–10 — politely close the booking.
async function declineDiagnosticAge(ctx) {
  const chatId = ctx.chat.id;
  forms.delete(chatId);
  cancelReminder(chatId);
  if (ctx.callbackQuery) await clearButtons(ctx);
  if (!isAdminId(chatId)) await trackDropout(chatId, 'age_out_of_range');
  const lang = await getLang(chatId);
  await ctx.reply(T[lang].diagAgeDecline, { reply_markup: mainKeyboard(lang) });
}

async function acceptAge(ctx, form, age) {
  if (form.kind === 'diag' && !isValidAge(age)) return declineDiagnosticAge(ctx);
  form.age = age;
  advance(form);
  if (ctx.callbackQuery) await markChosen(ctx, ageLabel(age, await getLang(ctx.chat.id)));
  await enterStep(ctx.chat.id);
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

async function notifyTeachers(chatId, text) {
  try {
    const sent = await bot.telegram.sendMessage(TEACHER_GROUP_CHAT_ID, text);
    await registerReply(sent.message_id, chatId);
  } catch (err) {
    console.error('[teachers] Failed to notify group:', err.message);
  }
}

async function submitApplication(ctx, form) {
  const chatId = ctx.chat.id;
  forms.delete(chatId);
  cancelReminder(chatId);

  const lang = await getLang(chatId);
  const meta = { lang, username: ctx.from?.username, chatId, isTest: isAdminId(chatId) };
  // Last-resort record in the PM2 logs in case every channel below fails
  const { step, ...answers } = form;
  console.log('[application]', JSON.stringify({ ...answers, ...meta }));

  await ctx.reply(T[lang].done, { reply_markup: mainKeyboard(lang) });

  await notifyTeachers(chatId, groupMessage(form, meta));
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
  if (!meta.isTest) await trackConversion(chatId, { ...answers, lang });
}

async function submitDiagnostic(ctx, form) {
  const chatId = ctx.chat.id;
  const lang = await getLang(chatId);
  const meta = { lang, username: ctx.from?.username, chatId, isTest: isAdminId(chatId) };
  const { step, kind, ...answers } = form;

  const booked = await book({
    date: form.date,
    time: form.slot,
    childName: form.childName,
    age: form.age,
    parentName: form.parentName,
    phone: form.phone,
    ...meta,
  });
  if (!booked) {
    // Someone took the window between the pick and the confirmation
    form.step = 'slot';
    await ctx.reply(T[lang].diagTaken);
    await enterStep(chatId);
    return;
  }

  forms.delete(chatId);
  cancelReminder(chatId);
  // Last-resort record in the PM2 logs in case every channel below fails
  console.log('[diagnostic]', JSON.stringify({ ...answers, ...meta }));

  await ctx.reply(T[lang].diagDone(form), { reply_markup: mainKeyboard(lang) });

  await notifyTeachers(chatId, diagGroupMessage(form, meta));
  void sendLeadToCrm(crmLead(form, meta));
  await appendDiagnostic({
    ...meta,
    date: dateLabel(form.date, 'ru'),
    time: `${form.slot}–${slotEnd(form.slot)}`,
    childName: form.childName,
    age: ageLabel(form.age, 'ru'),
    parentName: form.parentName,
    phone: form.phone,
    question: form.question,
  });
  if (!meta.isTest) await trackDiagnostic(chatId, { ...answers, lang });
}

// Free text while a form is in progress. A valid answer moves the form on;
// anything else is treated as a question: the AI answers, then the step repeats.
async function handleFormText(ctx, form, text) {
  const chatId = ctx.chat.id;

  switch (form.step) {
    case 'age': {
      const age = parseAge(text);
      if (age) return acceptAge(ctx, form, age);
      break;
    }
    case 'name':
      if (!looksLikeQuestion(text)) {
        form.childName = text.trim();
        advance(form);
        return enterStep(chatId);
      }
      break;
    case 'time': {
      const time = parseTime(text);
      if (time) {
        form.time = time;
        advance(form);
        return enterStep(chatId);
      }
      break;
    }
    case 'slot': {
      // "11:30" typed instead of tapped
      const slot = parseClock(text);
      if (slot && freeTimes(form.date).includes(slot)) {
        form.slot = slot;
        advance(form);
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
    await ctx.reply(menuText(lang), { reply_markup: mainKeyboard(lang) });
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
      form = { kind: MAIN_KIND, step: 'age', question: null };
      forms.set(chatId, form);
    }
    if (form.step !== 'age') return; // stale button from an earlier message
    if (data === 'age:other') return declineDiagnosticAge(ctx);
    return acceptAge(ctx, form, data === 'age:lt5' ? 'lt5' : Number(data.slice(4)));
  }

  if (!form) {
    // A stale "Отправить" tapped after a successful submit — nothing to do
    if (data === 'form:send') {
      const user = await getUserData(chatId);
      if (isAdminId(chatId) || DONE_STAGES.includes(user?.stage)) return;
    }
    // Otherwise the form was lost in a bot restart — begin again from the first step
    return startForm(chatId);
  }

  if (data.startsWith('time:')) {
    const key = data.slice(5);
    if (form.step !== 'time' || !TIMES[key]) return;
    form.time = key;
    advance(form);
    await markChosen(ctx, timeLabel(key, lang));
    return enterStep(chatId);
  }

  if (data.startsWith('ddate:')) {
    const date = data.slice(6);
    if (form.step !== 'date') return;
    if (!freeTimes(date).length) {
      await ctx.reply(T[lang].diagTaken);
      return sendStep(chatId);
    }
    form.date = date;
    advance(form);
    await markChosen(ctx, dateLabel(date, lang));
    return enterStep(chatId);
  }

  if (data.startsWith('dslot:')) {
    const slot = data.slice(6);
    if (form.step !== 'slot') return;
    if (!freeTimes(form.date).includes(slot)) {
      await ctx.reply(T[lang].diagTaken);
      return sendStep(chatId);
    }
    form.slot = slot;
    advance(form);
    await markChosen(ctx, `${slot}–${slotEnd(slot)}`);
    return enterStep(chatId);
  }

  if (data === 'dback') {
    if (form.step !== 'slot') return;
    form.step = 'date';
    await clearButtons(ctx);
    return enterStep(chatId);
  }

  if (data === 'form:send') {
    if (form.step !== 'confirm') return;
    form.step = 'sending'; // a second tap while submitting is ignored
    await clearButtons(ctx);
    return form.kind === 'diag' ? submitDiagnostic(ctx, form) : submitApplication(ctx, form);
  }

  if (data === 'form:restart') {
    forms.set(chatId, { kind: form.kind, step: 'age', question: form.question });
    await clearButtons(ctx);
    return enterStep(chatId);
  }
}

// ─── Diagnostic reminders ────────────────────────────────────────────────────
// Checked every minute. "Sent" flags live in diagnostics.json, so a restart
// neither repeats nor loses a reminder.
const sheetLabels = (b) => ({ date: dateLabel(b.date, 'ru'), time: `${b.time}–${slotEnd(b.time)}`, chatId: b.chatId });
let remindersRunning = false;

async function sendDiagnosticReminders() {
  if (remindersRunning) return;
  remindersRunning = true;
  try {
    for (const { booking: b, kind } of dueReminders()) {
      const lang = b.lang === 'uz' ? 'uz' : 'ru';
      const [text, markup] = kind === 'dayBefore'
        ? [T[lang].diagRemindDayBefore(b), attendKeyboard(b, lang)]
        : [T[lang].diagRemindSoon(b), cantComeKeyboard(b, lang)];
      try {
        await bot.telegram.sendMessage(b.chatId, text, { reply_markup: markup });
        await markReminded(b, kind);
        console.log(`[diag-reminder] ${kind} → ${b.chatId} (${b.date} ${b.time})`);
      } catch (err) {
        console.error('[diag-reminder] Failed:', b.chatId, err.message);
        // Bot blocked or chat gone — don't retry every minute
        if ([400, 403].includes(err?.response?.error_code)) await markReminded(b, kind);
      }
    }
  } finally {
    remindersRunning = false;
  }
}

// "✅ Приду" / "❌ Не смогу прийти" under a reminder: dok:YYYY-MM-DD:HH:MM / dno:…
async function handleAttendanceCallback(ctx, data) {
  const chatId = ctx.chat.id;
  const lang = await getLang(chatId);
  const [date, time] = [data.slice(4, 14), data.slice(15)];
  await clearButtons(ctx);

  if (data.startsWith('dok:')) {
    const own = await confirmOwn(date, time, chatId);
    await ctx.reply(own ? T[lang].diagComing : T[lang].diagAlreadyCancelled, { reply_markup: mainKeyboard(lang) });
    if (own) await noteDiagnostic(sheetLabels(own), '✅ подтвердил');
    return;
  }

  const own = await cancelOwn(date, time, chatId);
  if (!own) {
    await ctx.reply(T[lang].diagAlreadyCancelled, { reply_markup: mainKeyboard(lang) });
    return;
  }
  console.log(`[diag-cancel] ${chatId} cancelled ${date} ${time}`);
  await ctx.reply(T[lang].diagCancelled, { reply_markup: mainKeyboard(lang) });
  await notifyTeachers(chatId, diagCancelMessage(own));
  await noteDiagnostic(sheetLabels(own), '❌ отменил родитель');
  if (!own.isTest) await trackDiagnosticCancel(chatId);
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
    // Either way the menu's main form opens — the AI may still use the other name
    case 'START_APPLICATION':
    case 'START_DIAGNOSTIC':
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

// ─── Diagnostic bookings (admin only) ────────────────────────────────────────
bot.command('diag', async (ctx) => {
  if (!isAdminChat(ctx)) { await ctx.reply('Нет доступа.'); return; }

  const list = upcoming();
  if (!list.length) {
    await ctx.reply('🔍 Записей на диагностику пока нет.\n\nЗанять окно вручную: /diag_block 19.10 11:00');
    return;
  }

  const lines = ['🔍 Записи на диагностику', ''];
  let day = null;
  for (const b of list) {
    if (b.date !== day) {
      day = b.date;
      lines.push(`📅 ${dateLabel(b.date, 'ru')}`);
    }
    lines.push(b.blocked
      ? `  ${b.time} — ⛔ занято вручную`
      : `  ${b.time} — ${b.childName}, ${ageLabel(b.age, 'ru')} · ${b.parentName}, ${b.phone}` +
        `${b.confirmed ? ' · ✅ подтвердил' : ''}${b.isTest ? ' · 🧪 ТЕСТ' : ''}`);
  }
  lines.push('', 'Освободить окно (если родитель отменил) — кнопкой ниже.', 'Занять окно вручную: /diag_block 19.10 11:00');

  await ctx.reply(lines.join('\n'), {
    reply_markup: {
      inline_keyboard: list.map((b) => [{
        text: `❌ Освободить ${dateButton(b.date, 'ru')} ${b.time}`,
        callback_data: `dfree:${b.date}:${b.time}`,
      }]),
    },
  });
});

bot.command('diag_block', async (ctx) => {
  if (!isAdminChat(ctx)) { await ctx.reply('Нет доступа.'); return; }

  const [, dayText = '', timeText = ''] = ctx.message.text.trim().split(/\s+/);
  const date = parseDayMonth(dayText);
  const time = parseClock(timeText);
  if (!date || !time) {
    await ctx.reply('Формат: /diag_block 19.10 11:00');
    return;
  }

  const result = await block(date, time);
  const when = `${dateLabel(date, 'ru')}, ${time}`;
  if (result === 'ok') await ctx.reply(`⛔ Окно ${when} занято — в боте его больше не видно.`);
  else if (result === 'taken') await ctx.reply(`Окно ${when} уже занято.`);
  else {
    const times = slotsFor(date);
    await ctx.reply(times.length
      ? `В этот день окна только в ${times.join(', ')}.`
      : 'В этот день диагностика не проводится.');
  }
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
      '/diag — записи на диагностику, освободить окно\n' +
      '/diag_block 19.10 11:00 — занять окно вручную\n' +
      '/chatid — ID этого чата\n\n' +
      'Кнопки внизу — такие же, как у родителей: можно протестировать запись ' +
      '(в группе, CRM и таблице она будет помечена 🧪 ТЕСТ и займёт окно — освободите его через /diag).\n' +
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
// Both forms' button labels: parents may still have the old menu keyboard.
const MAIN_BUTTONS = [T.ru.btnApply, T.uz.btnApply, T.ru.btnDiag, T.uz.btnDiag];

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

    // Main button or "Диагностика" — mid-form, pick up where they left off
    if (MAIN_BUTTONS.includes(text) || (form && isApplyIntent(text))) {
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
    await ctx.reply(menuText(lang), { reply_markup: mainKeyboard(lang) });
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
  if (data.startsWith('dfree:') && isAdminChat(ctx)) {
    // dfree:YYYY-MM-DD:HH:MM
    const date = data.slice(6, 16);
    const time = data.slice(17);
    const removed = await release(date, time);
    const when = `${dateLabel(date, 'ru')}, ${time}`;
    await ctx.answerCbQuery(removed.length ? 'Освобождено' : 'Уже свободно');
    if (removed.length) {
      await ctx.reply(`✅ Окно ${when} освобождено — родители снова могут на него записаться.`);
      const child = removed.find((b) => !b.blocked);
      if (child && !child.isTest) {
        await notifyTeachers(child.chatId, `❌ Запись на диагностику отменена: ${when} (${child.childName}, ${child.phone})`);
      }
      if (child) await noteDiagnostic(sheetLabels(child), '❌ освобождено админом');
    }
    return;
  }

  await ctx.answerCbQuery();
  if (ctx.chat?.type !== 'private') return;
  cancelReminder(ctx.chat.id);

  try {
    if (data.startsWith('dok:') || data.startsWith('dno:')) await handleAttendanceCallback(ctx, data);
    else await handleFormCallback(ctx, data);
  } catch (err) {
    console.error('[callback] Error:', err.message);
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
prepareSheets().catch((err) => console.error('[sheets] Failed to prepare tabs:', err.message));
setInterval(() => sendDiagnosticReminders().catch((err) => console.error('[diag-reminder] error:', err.message)), 60_000);

bot.launch({ dropPendingUpdates: true });
console.log('✅ SpeakMotion bot is running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
