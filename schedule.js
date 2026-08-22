// Reference schedule data. The AI uses the schedule embedded in deepseek.js
// system prompt — keep both in sync when the timetable changes.
// All groups are listed regardless of fill status.
// Pricing follows lessons-per-week: 3/week = 12/month = 1 800 000; 2/week = 8/month = 1 200 000.

export const GROUPS = [
  // ── 3 lessons/week — Пн/Ср/Пт — 12/month — 1 800 000 ──
  { ageMin: 5,  ageMax: 6,  days: 'Пн/Ср/Пт', time: '09:30–10:30', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 5,  ageMax: 6,  days: 'Пн/Ср/Пт', time: '10:00–11:00', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 9,  ageMax: 10, days: 'Пн/Ср/Пт', time: '11:00–12:00', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 9,  ageMax: 10, days: 'Пн/Ср/Пт', time: '11:15–12:15', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 6,  ageMax: 7,  days: 'Пн/Ср/Пт', time: '14:00–15:00', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 6,  ageMax: 7,  days: 'Пн/Ср/Пт', time: '15:30–16:30', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 7,  ageMax: 8,  days: 'Пн/Ср/Пт', time: '17:00–18:00', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 7,  ageMax: 8,  days: 'Пн/Ср/Пт', time: '17:30–18:30', lessonsPerMonth: 12, price: 1800000 },

  // ── 3 lessons/week — Вт/Чт/Сб — 12/month — 1 800 000 ──
  { ageMin: 5,  ageMax: 6,  days: 'Вт/Чт/Сб', time: '09:30–10:30', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 6,  ageMax: 7,  days: 'Вт/Чт/Сб', time: '10:00–11:00', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 10, ageMax: 12, days: 'Вт/Чт/Сб', time: '11:15–12:15', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 9,  ageMax: 10, days: 'Вт/Чт/Сб', time: '16:00–17:00', lessonsPerMonth: 12, price: 1800000 },
  { ageMin: 7,  ageMax: 8,  days: 'Вт/Чт/Сб', time: '17:10–18:10', lessonsPerMonth: 12, price: 1800000 },

  // ── 2 lessons/week — Вт/Чт — 8/month — 1 200 000 ──
  { ageMin: 10, ageMax: 12, days: 'Вт/Чт', time: '11:00–12:00', lessonsPerMonth: 8, price: 1200000 },
  { ageMin: 9,  ageMax: 10, days: 'Вт/Чт', time: '16:00–17:00', lessonsPerMonth: 8, price: 1200000 },
  { ageMin: 13, ageMax: 15, days: 'Вт/Чт', time: '17:20–18:40', lessonsPerMonth: 8, price: 1200000 },
];

export function getGroupsForAge(age) {
  return GROUPS.filter(g => age >= g.ageMin && age <= g.ageMax);
}
