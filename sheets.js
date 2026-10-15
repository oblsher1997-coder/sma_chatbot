import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');

// Applications from the bot form go to their own tab; older consultation
// records on the first sheet are left untouched.
const APPLICATIONS_SHEET = 'Заявки';
const APPLICATIONS_HEADER = [
  'Дата/время', 'Имя ребёнка', 'Возраст', 'Удобное время', 'Имя родителя',
  'Телефон', 'Telegram', 'Язык', 'Вопрос', 'Chat ID',
];

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

let sheetReady = false;

// Creates the "Заявки" tab with a header row if it doesn't exist yet.
export async function prepareApplicationsSheet() {
  if (sheetReady || !isConfigured()) return;
  const sheets = await getSheets();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const exists = meta.data.sheets?.some((s) => s.properties.title === APPLICATIONS_SHEET);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: APPLICATIONS_SHEET } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${APPLICATIONS_SHEET}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [APPLICATIONS_HEADER] },
    });
    console.log(`[sheets] Created tab «${APPLICATIONS_SHEET}»`);
  }
  sheetReady = true;
}

export async function appendApplication(a) {
  if (!isConfigured()) return;

  const row = [
    new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' }),
    a.childName,
    a.age,
    a.time,
    a.parentName,
    a.phone,
    a.username ? `@${a.username}` : '—',
    a.lang === 'uz' ? 'узбекский' : 'русский',
    [a.isTest ? '🧪 ТЕСТ' : null, a.question].filter(Boolean).join(' · '),
    String(a.chatId),
  ];

  try {
    await prepareApplicationsSheet();
    const sheets = await getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: `'${APPLICATIONS_SHEET}'!A:J`,
      // RAW so "+998 …" phone numbers are stored as text, not parsed as formulas
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    console.log('[sheets] Application appended for', a.parentName);
  } catch (err) {
    console.error('[sheets] Failed to append application:', err.message);
  }
}
