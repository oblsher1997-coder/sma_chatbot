// Reference schedule data. The AI uses the schedule embedded in deepseek.js
// system prompt — keep both in sync when the timetable changes.

export const GROUPS = [
  // Teacher: Mokhinur — Mon/Wed/Fri (12 lessons/mo)
  { id: 1,  teacher: 'Мохинур', level: 'Seedings',  ageMin: 5,  ageMax: 6,  days: 'Пн/Ср/Пт', time: '10:00–11:00', lessonsPerMonth: 12, price: 1800000 },
  { id: 2,  teacher: 'Мохинур', level: 'Explorers', ageMin: 6,  ageMax: 7,  days: 'Пн/Ср/Пт', time: '14:00–15:00', lessonsPerMonth: 12, price: 1800000 },
  { id: 3,  teacher: 'Мохинур', level: 'Explorers', ageMin: 6,  ageMax: 7,  days: 'Пн/Ср/Пт', time: '15:30–16:30', lessonsPerMonth: 12, price: 1800000 },
  { id: 4,  teacher: 'Мохинур', level: 'Voyagers',  ageMin: 7,  ageMax: 8,  days: 'Пн/Ср/Пт', time: '17:00–18:00', lessonsPerMonth: 12, price: 1800000 },

  // Teacher: Maftuna — Tue/Thu/Sat (12 lessons/mo)
  { id: 5,  teacher: 'Мафтуна', level: 'Explorers', ageMin: 6,  ageMax: 7,  days: 'Вт/Чт/Сб', time: '10:00–11:00', lessonsPerMonth: 12, price: 1800000 },
  { id: 6,  teacher: 'Мафтуна', level: 'Voyagers',  ageMin: 7,  ageMax: 8,  days: 'Вт/Чт/Сб', time: '14:00–15:00', lessonsPerMonth: 12, price: 1800000 },
  { id: 7,  teacher: 'Мафтуна', level: 'Achievers', ageMin: 9,  ageMax: 10, days: 'Вт/Чт/Сб', time: '11:30–12:30', lessonsPerMonth: 12, price: 1800000 },
  { id: 8,  teacher: 'Мафтуна', level: 'Achievers', ageMin: 9,  ageMax: 10, days: 'Вт/Чт/Сб', time: '16:00–17:00', lessonsPerMonth: 12, price: 1800000 },

  // Teacher: Mokhinur — Tue/Thu (8 lessons/mo)
  { id: 9,  teacher: 'Мохинур', level: 'Masters',   ageMin: 10, ageMax: 12, days: 'Вт/Чт', time: '14:20–15:20', lessonsPerMonth: 8, price: 1200000 },
  { id: 10, teacher: 'Мохинур', level: 'Achievers', ageMin: 9,  ageMax: 10, days: 'Вт/Чт', time: '16:00–17:00', lessonsPerMonth: 8, price: 1200000 },
  { id: 11, teacher: 'Мохинур', level: 'Pioneers',  ageMin: 13, ageMax: 15, days: 'Вт/Чт', time: '17:20–18:40', lessonsPerMonth: 8, price: 1200000 },
  { id: 12, teacher: 'Мохинур', level: 'Achievers', ageMin: 9,  ageMax: 10, days: 'Вт/Чт', time: '10:30–11:30', lessonsPerMonth: 8, price: 1200000 },
  { id: 13, teacher: 'Мохинур', level: 'Voyagers',  ageMin: 7,  ageMax: 8,  days: 'Вт/Чт', time: '12:00–13:00', lessonsPerMonth: 8, price: 1200000 },
];

export function getGroupsForAge(age) {
  return GROUPS.filter(g => age >= g.ageMin && age <= g.ageMax);
}
