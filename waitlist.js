import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WAITLIST_PATH = path.join(__dirname, 'waitlist.json');

async function readWaitlist() {
  try {
    const raw = await fs.readFile(WAITLIST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function addToWaitlist(entry) {
  const list = await readWaitlist();
  list.push({ ...entry, addedAt: new Date().toISOString() });
  await fs.writeFile(WAITLIST_PATH, JSON.stringify(list, null, 2), 'utf8');
  console.log('[waitlist] Entry added:', entry);
}

export async function getWaitlist() {
  return readWaitlist();
}
