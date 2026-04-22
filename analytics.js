import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANALYTICS_PATH = path.join(__dirname, 'analytics.json');

async function read() {
  try {
    return JSON.parse(await fs.readFile(ANALYTICS_PATH, 'utf8'));
  } catch {
    return {
      users: {},
      totals: { sessions: 0, converted: 0, escalated: 0, waitlisted: 0, messages: 0 },
      dropoutReasons: {},
      daily: {},
    };
  }
}

async function write(data) {
  await fs.writeFile(ANALYTICS_PATH, JSON.stringify(data, null, 2));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDay(data, date) {
  if (!data.daily[date]) {
    data.daily[date] = { sessions: 0, converted: 0, escalated: 0, waitlisted: 0, messages: 0 };
  }
}

function ensureUser(data, chatId) {
  if (!data.users[chatId]) {
    data.users[chatId] = {
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      language: 'ru',
      stage: 'started',
      dropoutReason: null,
      reminded: false,
      messageCount: 0,
      enrollment: {},
    };
  }
}

export async function trackSession(chatId) {
  const data = await read();
  const d = today();
  ensureDay(data, d);
  ensureUser(data, chatId);

  const isNew = !data.users[chatId].firstSeen || data.users[chatId].stage === 'started'
    ? false : true;

  data.users[chatId].lastSeen = new Date().toISOString();
  data.users[chatId].stage = 'started';
  data.users[chatId].reminded = false;
  data.totals.sessions++;
  data.daily[d].sessions++;

  await write(data);
}

export async function trackMessage(chatId) {
  const data = await read();
  const d = today();
  ensureDay(data, d);
  ensureUser(data, chatId);

  data.users[chatId].lastSeen = new Date().toISOString();
  data.users[chatId].messageCount = (data.users[chatId].messageCount || 0) + 1;
  if (data.users[chatId].stage === 'started') {
    data.users[chatId].stage = 'responding';
  }
  data.totals.messages++;
  data.daily[d].messages++;

  await write(data);
}

export async function trackStage(chatId, stage) {
  const data = await read();
  ensureUser(data, chatId);
  data.users[chatId].stage = stage;
  data.users[chatId].lastSeen = new Date().toISOString();
  await write(data);
}

export async function trackConversion(chatId, enrollment = {}) {
  const data = await read();
  const d = today();
  ensureDay(data, d);
  ensureUser(data, chatId);

  data.users[chatId].stage = 'converted';
  data.users[chatId].enrollment = enrollment;
  data.totals.converted++;
  data.daily[d].converted = (data.daily[d].converted || 0) + 1;

  await write(data);
}

export async function trackEscalation(chatId) {
  const data = await read();
  const d = today();
  ensureDay(data, d);
  ensureUser(data, chatId);

  data.users[chatId].stage = 'escalated';
  data.totals.escalated++;
  data.daily[d].escalated = (data.daily[d].escalated || 0) + 1;

  await write(data);
}

export async function trackWaitlist(chatId) {
  const data = await read();
  const d = today();
  ensureDay(data, d);
  ensureUser(data, chatId);

  data.users[chatId].stage = 'waitlisted';
  data.totals.waitlisted++;
  data.daily[d].waitlisted = (data.daily[d].waitlisted || 0) + 1;

  await write(data);
}

export async function trackDropout(chatId, reason) {
  const data = await read();
  ensureUser(data, chatId);

  data.users[chatId].dropoutReason = reason;
  if (!data.dropoutReasons[reason]) data.dropoutReasons[reason] = 0;
  data.dropoutReasons[reason]++;

  await write(data);
}

export async function setReminded(chatId) {
  const data = await read();
  ensureUser(data, chatId);
  data.users[chatId].reminded = true;
  await write(data);
}

export async function setLanguage(chatId, lang) {
  const data = await read();
  ensureUser(data, chatId);
  data.users[chatId].language = lang;
  await write(data);
}

export async function getUserData(chatId) {
  const data = await read();
  return data.users[String(chatId)] || null;
}

export async function getStats() {
  return read();
}

export function buildStatsMessage(data) {
  const { users, totals, dropoutReasons, daily } = data;

  const totalUsers = Object.keys(users).length;
  const pct = (n) => totalUsers > 0 ? ` (${Math.round((n / totalUsers) * 100)}%)` : '';

  // Stage breakdown
  const stages = {};
  for (const u of Object.values(users)) {
    stages[u.stage] = (stages[u.stage] || 0) + 1;
  }

  const dropped = totalUsers - totals.converted - totals.escalated - totals.waitlisted;

  // Last 7 days
  const last7 = Object.entries(daily)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 7);

  const dailyLines = last7.map(([date, d]) =>
    `  ${date}: 👤${d.sessions} ✅${d.converted || 0} 🔔${d.escalated || 0} ⏳${d.waitlisted || 0} 💬${d.messages}`
  ).join('\n');

  // Dropout reasons
  const reasonLabels = {
    price_too_high: '💸 Дорого',
    schedule_no_fit: '🗓 Расписание не подходит',
    will_think: '🤔 Будут думать',
    speech_issues: '🗣 Логопед / речь',
    age_out_of_range: '👶 Возраст не подходит',
    other: '❓ Другое',
  };
  const reasonLines = Object.entries(dropoutReasons)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `  • ${reasonLabels[k] || k}: ${v}`)
    .join('\n') || '  Нет данных';

  // Stage funnel
  const stageLabels = {
    started: '🚀 Нажали /start',
    responding: '💬 Написали первое сообщение',
    schedule_shown: '📋 Увидели расписание',
    slot_selected: '✋ Выбрали слот',
    data_requested: '📝 Запрошены данные ребёнка',
    converted: '✅ Оплата отправлена',
    escalated: '🔔 Переданы учителю',
    waitlisted: '⏳ В листе ожидания',
  };
  const funnelLines = Object.entries(stages)
    .map(([k, v]) => `  • ${stageLabels[k] || k}: ${v}`)
    .join('\n');

  return [
    `📊 *Статистика SpeakMotion Bot*`,
    ``,
    `👥 Всего пользователей: *${totalUsers}*`,
    `🚀 Всего сессий: *${totals.sessions}*`,
    `💬 Всего сообщений: *${totals.messages}*`,
    ``,
    `✅ Успешных оплат: *${totals.converted}*${pct(totals.converted)}`,
    `🔔 Эскалаций к учителю: *${totals.escalated}*${pct(totals.escalated)}`,
    `⏳ В листе ожидания: *${totals.waitlisted}*${pct(totals.waitlisted)}`,
    `🚪 Ушли без результата: *${Math.max(0, dropped)}*${pct(Math.max(0, dropped))}`,
    ``,
    `📉 *Воронка по стадиям:*`,
    funnelLines,
    ``,
    `❓ *Причины отказа:*`,
    reasonLines,
    ``,
    `📅 *Последние 7 дней:*`,
    `  (👤сессии ✅оплаты 🔔эскалации ⏳вейтлист 💬сообщения)`,
    dailyLines || '  Нет данных',
  ].join('\n');
}
