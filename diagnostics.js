// Free diagnostic booking: weekly windows, availability and bookings.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKINGS_PATH = path.join(__dirname, 'diagnostics.json');

// Windows by weekday (0 = Sunday), Tashkent time. Each window lasts 30 minutes.
const SLOTS = {
  1: ['11:00', '11:30', '13:30', '18:30'], // Dushanba
  2: ['13:30', '14:30', '15:00'],          // Seshanba
  3: ['11:00', '11:30', '13:30', '18:30'], // Chorshanba
  4: ['13:30', '14:30', '15:00'],          // Payshanba
  5: ['11:00', '11:30', '13:30', '18:30'], // Juma
};
export const MIN_AGE = 5;
export const MAX_AGE = 10;
const DURATION_MIN = 30;
const DAYS_AHEAD = 14;
const MIN_LEAD_MIN = 120; // no booking less than 2 hours before the window starts
const CAPACITY = 1;       // children per window
const TASHKENT_UTC_OFFSET_MIN = 5 * 60; // Asia/Tashkent is UTC+5 all year

// Bookings are kept in memory and written through to diagnostics.json, so the
// availability check and the booking happen with no await in between.
let bookings = null;
function all() {
  if (!bookings) {
    try {
      bookings = JSON.parse(fs.readFileSync(BOOKINGS_PATH, 'utf8'));
    } catch {
      bookings = [];
    }
  }
  return bookings;
}

// Writes are chained so a slower earlier write can't overwrite a newer one.
let writing = Promise.resolve();
function save() {
  writing = writing
    .catch(() => {})
    .then(() => fs.promises.writeFile(BOOKINGS_PATH, JSON.stringify(all(), null, 2)));
  return writing;
}

// ─── Dates (all as 'YYYY-MM-DD' Tashkent calendar days) ──────────────────────
function tashkentNow() {
  const d = new Date(Date.now() + TASHKENT_UTC_OFFSET_MIN * 60_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
const toMin = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function slotEnd(time) {
  return fromMin(toMin(time) + DURATION_MIN);
}

export function isValidAge(age) {
  return typeof age === 'number' && age >= MIN_AGE && age <= MAX_AGE;
}

export function slotsFor(date) {
  return SLOTS[weekday(date)] ?? [];
}

// "19.10" → '2026-10-19' (this year, or next year if that date is long past).
export function parseDayMonth(text) {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(text.trim());
  if (!m) return null;
  const today = tashkentNow().date;
  const make = (year) => `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  let date = make(Number(today.slice(0, 4)));
  if (date < addDays(today, -30)) date = make(Number(today.slice(0, 4)) + 1);
  const check = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === date ? date : null;
}

// ─── Availability ────────────────────────────────────────────────────────────
function bookedCount(date, time) {
  return all().filter((b) => b.date === date && b.time === time).length;
}

// Free windows on a date: not booked and not starting too soon.
export function freeTimes(date) {
  const now = tashkentNow();
  if (date < now.date) return [];
  return slotsFor(date).filter((time) =>
    bookedCount(date, time) < CAPACITY &&
    (date > now.date || toMin(time) >= now.minutes + MIN_LEAD_MIN));
}

// Days in the next two weeks that still have at least one free window.
export function freeDates() {
  const today = tashkentNow().date;
  const dates = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    if (freeTimes(date).length) dates.push(date);
  }
  return dates;
}

// Returns false if the window was taken (or became too close) in the meantime.
export async function book(entry) {
  if (!freeTimes(entry.date).includes(entry.time)) return false;
  all().push({ ...entry, createdAt: new Date().toISOString() });
  await save();
  return true;
}

// ─── Admin ───────────────────────────────────────────────────────────────────
export function upcoming() {
  const today = tashkentNow().date;
  return all()
    .filter((b) => b.date >= today)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

// Frees a window (parent cancelled). Returns the removed entries.
export async function release(date, time) {
  const removed = all().filter((b) => b.date === date && b.time === time);
  if (!removed.length) return [];
  bookings = all().filter((b) => !(b.date === date && b.time === time));
  await save();
  return removed;
}

// Marks a window as taken, e.g. booked by phone. Returns 'ok' | 'taken' | 'no-slot'.
export async function block(date, time) {
  if (!slotsFor(date).includes(time)) return 'no-slot';
  if (bookedCount(date, time) >= CAPACITY) return 'taken';
  all().push({ date, time, blocked: true, createdAt: new Date().toISOString() });
  await save();
  return 'ok';
}
