// Reference schedule data. The AI uses the schedule embedded in deepseek.js
// system prompt — keep both in sync when the timetable changes.
// Full/closed groups are excluded — only open slots are listed here.

export const GROUPS = [
  // Ages 5–6 (Seedings)
  { level: 'Seedings',  ageMin: 5,  ageMax: 6,  days: 'Пн/Ср/Пт', time: '10:00–11:00', lessonsPerMonth: 12, price: 1800000 },
  { level: 'Seedings',  ageMin: 5,  ageMax: 6,  days: 'Вт/Чт/Сб', time: '09:30–10:30', lessonsPerMonth: 12, price: 1800000 },

  // Ages 6–7 (Explorers)
  { level: 'Explorers', ageMin: 6,  ageMax: 7,  days: 'Пн/Ср/Пт', time: '14:00–15:00', lessonsPerMonth: 12, price: 1800000 },
  { level: 'Explorers', ageMin: 6,  ageMax: 7,  days: 'Пн/Ср/Пт', time: '15:30–16:30', lessonsPerMonth: 12, price: 1800000 },
  { level: 'Explorers', ageMin: 6,  ageMax: 7,  days: 'Вт/Чт/Сб', time: '10:00–11:00', lessonsPerMonth: 12, price: 1800000 },

  // Ages 7–8 (Voyagers)
  { level: 'Voyagers',  ageMin: 7,  ageMax: 8,  days: 'Пн/Ср/Пт', time: '17:00–18:00', lessonsPerMonth: 12, price: 1800000 },
  { level: 'Voyagers',  ageMin: 7,  ageMax: 8,  days: 'Вт/Чт/Сб', time: '17:10–18:10', lessonsPerMonth: 12, price: 1800000 },

  // Ages 9–10 (Achievers)
  { level: 'Achievers', ageMin: 9,  ageMax: 10, days: 'Пн/Ср/Пт', time: '11:00–12:00', lessonsPerMonth: 12, price: 1800000 },
  { level: 'Achievers', ageMin: 9,  ageMax: 10, days: 'Пн/Ср/Пт', time: '11:15–12:15', lessonsPerMonth: 12, price: 1800000 },
  { level: 'Achievers', ageMin: 9,  ageMax: 10, days: 'Вт/Чт/Сб', time: '16:00–17:00', lessonsPerMonth: 12, price: 1800000 },
  { level: 'Achievers', ageMin: 9,  ageMax: 10, days: 'Вт/Чт', time: '16:00–17:00', lessonsPerMonth: 8, price: 1200000 },

  // Ages 10–12 (Masters)
  { level: 'Masters',   ageMin: 10, ageMax: 12, days: 'Вт/Чт/Сб', time: '11:15–12:15', lessonsPerMonth: 12, price: 1800000 },
  { level: 'Masters',   ageMin: 10, ageMax: 12, days: 'Вт/Чт', time: '11:00–12:00', lessonsPerMonth: 8, price: 1200000 },

  // Ages 13–15 (Pioneers)
  { level: 'Pioneers',  ageMin: 13, ageMax: 15, days: 'Вт/Чт', time: '17:20–18:40', lessonsPerMonth: 8, price: 1200000 },
];

export function getGroupsForAge(age) {
  return GROUPS.filter(g => age >= g.ageMin && age <= g.ageMax);
}
