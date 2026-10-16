import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');

// Each form writes to its own tab; older consultation records on the first
// sheet are left untouched.
const TABS = {
  applications: {
    title: 'Заявки',
    header: [
      'Дата/время', 'Имя ребёнка', 'Возраст', 'Удобное время', 'Имя родителя',
      'Телефон', 'Telegram', 'Язык', 'Вопрос', 'Chat ID',
    ],
  },
  diagnostics: {
    title: 'Диагностика',
    header: [
      'Дата записи', 'Дата диагностики', 'Время', 'Имя ребёнка', 'Возраст',
      'Имя родителя', 'Телефон', 'Telegram', 'Язык', 'Вопрос', 'Chat ID',
    ],
  },
};

async function getSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function isConfigured() {
  // Read env var at call time (not at module load) so dotenv has time to run
  if (!process.env.GOOGLE_SHEETS_ID) {
    console.warn('[sheets] GOOGLE_SHEETS_ID not set — skipping');
    return false;
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.warn('[sheets] google-credentials.json not found — skipping');
    return false;
  }
  return true;
}

const readyTabs = new Set();

// Creates a tab with its header row if it doesn't exist yet.
async function ensureTab(sheets, { title, header }) {
  if (readyTabs.has(title)) return;
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  if (!meta.data.sheets?.some((s) => s.properties.title === title)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [header] },
    });
    console.log(`[sheets] Created tab «${title}»`);
  }
  readyTabs.add(title);
}

export async function prepareSheets() {
  if (!isConfigured()) return;
  const sheets = await getSheets();
  for (const tab of Object.values(TABS)) await ensureTab(sheets, tab);
}

async function appendRow(tab, row) {
  if (!isConfigured()) return;
  try {
    const sheets = await getSheets();
    await ensureTab(sheets, tab);
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `'${tab.title}'!A:K`,
      // RAW so "+998 …" phone numbers are stored as text, not parsed as formulas
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    console.log(`[sheets] Row appended to «${tab.title}»`);
  } catch (err) {
    console.error(`[sheets] Failed to append to «${tab.title}»:`, err.message);
  }
}

const now = () => new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });
const telegram = (username) => (username ? `@${username}` : '—');
const language = (lang) => (lang === 'uz' ? 'узбекский' : 'русский');
const note = (a) => [a.isTest ? '🧪 ТЕСТ' : null, a.question].filter(Boolean).join(' · ');

export function appendApplication(a) {
  return appendRow(TABS.applications, [
    now(), a.childName, a.age, a.time, a.parentName,
    a.phone, telegram(a.username), language(a.lang), note(a), String(a.chatId),
  ]);
}

export function appendDiagnostic(a) {
  return appendRow(TABS.diagnostics, [
    now(), a.date, a.time, a.childName, a.age,
    a.parentName, a.phone, telegram(a.username), language(a.lang), note(a), String(a.chatId),
  ]);
}
