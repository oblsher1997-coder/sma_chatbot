import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');

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

export async function appendEnrollment({
  childName, childBirthDate, childBirthYear, parentName, parentPhone,
  group, paymentMethod, chatId,
}) {
  if (!isConfigured()) return;

  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent' });

  const row = [
    now,
    childName      || '—',
    childBirthDate || childBirthYear || '—',
    parentName     || '—',
    parentPhone    || '—',
    group          || '—',
    paymentMethod  || '—',
    String(chatId  || ''),
  ];

  try {
    const sheets = await getSheets();
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    console.log('[sheets] Row appended for', parentName);
  } catch (err) {
    console.error('[sheets] Failed to append row:', err.message);
  }
}

export async function ensureHeader() {
  if (!isConfigured()) return;
  try {
    const sheets = await getSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'A1',
    });
    if (!res.data.values) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: process.env.GOOGLE_SHEETS_ID,
        range: 'A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            'Дата/время', 'Имя ребёнка', 'Дата рождения', 'Имя родителя',
            'Телефон', 'Группа', 'Формат консультации', 'Chat ID',
          ]],
        },
      });
      console.log('[sheets] Header row created');
    }
  } catch (err) {
    console.error('[sheets] Failed to ensure header:', err.message);
  }
}
