// Free diagnostic booking: weekly windows, availability and bookings.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOOKINGS_PATH = path.join(__dirname, 'diagnostics.json');

// Each teacher's windows by weekday (0 = Sunday), Tashkent time, from the date
// they start. Each window lasts 30 minutes and takes one child per teacher who
// has it, so a time two teachers share takes two children.
const TEACHERS = [
  {
    slots: {
      1: ['11:00', '11:30', '13:30', '18:30'], // Dushanba
      2: ['13:30', '14:30', '15:00'],          // Seshanba
      3: ['11:00', '11:30', '13:30', '18:30'], // Chorshanba
      4: ['13:30', '14:30', '15:00'],          // Payshanba
      5: ['11:00', '11:30', '13:30', '18:30'], // Juma
    },
  },
  {
    from: '2026-10-26',
    slots: {
      1: ['14:00', '14:30', '15:00'],
      2: ['11:10', '11:40', '12:10', '12:40', '14:00', '14:30', '15:00', '15:30'],
      3: ['14:00', '14:30', '15:00'],
      4: ['11:10', '11:40', '12:10', '12:40'],
      5: ['10:00', '10:30', '11:00', '11:30', '12:00', '13:30'],
    },
  },
];
export const MIN_AGE = 5;
export const MAX_AGE = 10;
const DURATION_MIN = 30;
const DAYS_AHEAD = 14;
const MIN_LEAD_MIN = 120; // no booking less than 2 hours before the window starts
const TASHKENT_UTC_OFFSET_MIN = 5 * 60; // Asia/Tashkent is UTC+5 all year

// Reminders: the evening before (only between these times, so a reminder missed
// while the bot was down never arrives at night) and 2 hours before the window.
const DAY_BEFORE_FROM = '19:00';
const DAY_BEFORE_UNTIL = '21:30';
const SOON_BEFORE_MIN = 120;
const SOON_LATEST_BEFORE_MIN = 30;
const FRESH_BOOKING_MIN = 60; // booked less than an hour before a reminder → skip it

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

// Every working teacher's windows on a date; a time two teachers share is listed twice.
function teacherSlots(date) {
  return TEACHERS
    .filter((t) => !t.from || date >= t.from)
    .flatMap((t) => t.slots[weekday(date)] ?? []);
}

// Children a window takes: one per teacher who has it that day.
const capacity = (date, time) => teacherSlots(date).filter((t) => t === time).length;

export function slotsFor(date) {
  return [...new Set(teacherSlots(date))].sort();
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

// Free windows on a date: a place left and not starting too soon.
export function freeTimes(date) {
  const now = tashkentNow();
  if (date < now.date) return [];
  return slotsFor(date).filter((time) =>
    bookedCount(date, time) < capacity(date, time) &&
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
  all().push({ ...entry, createdAt: new Date(Date.now()).toISOString() });
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

// Frees one place in a window (parent cancelled): the entry created at `id`, or
// with no id (buttons sent before windows had two places) the first one there.
// Returns the removed entry, or null.
export async function release(date, time, id) {
  const removed = all().find((b) => b.date === date && b.time === time && (!id || b.createdAt === id));
  if (!removed) return null;
  bookings = all().filter((b) => b !== removed);
  await save();
  return removed;
}

// ─── Parent's own bookings ───────────────────────────────────────────────────
// The chat id must match, so a parent can only touch their own booking.
export function findOwn(date, time, chatId) {
  return all().find((b) =>
    b.date === date && b.time === time && !b.blocked && String(b.chatId) === String(chatId));
}

// This parent's bookings that haven't started yet, soonest first.
export function ownUpcoming(chatId) {
  const now = tashkentNow();
  return all()
    .filter((b) => !b.blocked && String(b.chatId) === String(chatId) &&
      (b.date > now.date || (b.date === now.date && toMin(b.time) > now.minutes)))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

export async function confirmOwn(date, time, chatId) {
  const own = findOwn(date, time, chatId);
  if (!own) return null;
  own.confirmed = true;
  await save();
  return own;
}

// Returns the cancelled booking, or null if it no longer exists.
export async function cancelOwn(date, time, chatId) {
  const own = findOwn(date, time, chatId);
  if (!own) return null;
  bookings = all().filter((b) => b !== own);
  await save();
  return own;
}

// ─── Reminders ───────────────────────────────────────────────────────────────
// Minutes since the epoch on the Tashkent wall clock
const wallNow = () => Math.floor(Date.now() / 60_000) + TASHKENT_UTC_OFFSET_MIN;
const wallAt = (date, time) => Date.parse(`${date}T${time}:00Z`) / 60_000;
const wallFromIso = (iso) => Math.floor(Date.parse(iso) / 60_000) + TASHKENT_UTC_OFFSET_MIN;

// Bookings whose 'dayBefore' or 'soon' reminder is due right now.
export function dueReminders() {
  const now = wallNow();
  const due = [];
  for (const b of all()) {
    if (b.blocked || !b.chatId) continue;
    const start = wallAt(b.date, b.time);
    const created = wallFromIso(b.createdAt);
    const windows = {
      dayBefore: [wallAt(addDays(b.date, -1), DAY_BEFORE_FROM), wallAt(addDays(b.date, -1), DAY_BEFORE_UNTIL)],
      soon: [start - SOON_BEFORE_MIN, start - SOON_LATEST_BEFORE_MIN],
    };
    for (const [kind, [from, until]] of Object.entries(windows)) {
      if (b.reminded?.[kind]) continue;
      if (now >= from && now < until && created <= from - FRESH_BOOKING_MIN) due.push({ booking: b, kind });
    }
  }
  return due;
}

export async function markReminded(booking, kind) {
  booking.reminded = { ...booking.reminded, [kind]: true };
  await save();
}

// Takes one place in a window, e.g. booked by phone. Returns 'ok' | 'taken' | 'no-slot'.
export async function block(date, time) {
  if (!slotsFor(date).includes(time)) return 'no-slot';
  if (bookedCount(date, time) >= capacity(date, time)) return 'taken';
  all().push({ date, time, blocked: true, createdAt: new Date(Date.now()).toISOString() });
  await save();
  return 'ok';
}
