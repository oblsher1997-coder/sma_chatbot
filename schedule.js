export const GROUPS = [
  // Teacher: Mokhinur — weekday groups (available)
  { id: 1,  teacher: 'Мохинур', ageMin: 4,  ageMax: 5,  days: 'Пн/Ср/Пт', time: '10:00', room: 'A', lessonsPerMonth: 12, available: true },
  { id: 2,  teacher: 'Мохинур', ageMin: 4,  ageMax: 5,  days: 'Пн/Ср/Пт', time: '14:00', room: 'A', lessonsPerMonth: 12, available: true },
  { id: 3,  teacher: 'Мохинур', ageMin: 6,  ageMax: 7,  days: 'Пн/Ср/Пт', time: '15:30', room: 'A', lessonsPerMonth: 12, available: true },
  { id: 4,  teacher: 'Мохинур', ageMin: 7,  ageMax: 8,  days: 'Пн/Ср/Пт', time: '17:00', room: 'A', lessonsPerMonth: 12, available: true },
  { id: 10, teacher: 'Мохинур', ageMin: 10, ageMax: 12, days: 'Вт/Чт',    time: '14:20', room: 'C', lessonsPerMonth: 8,  available: true },
  { id: 11, teacher: 'Мохинур', ageMin: 9,  ageMax: 10, days: 'Вт/Чт',    time: '16:00', room: 'C', lessonsPerMonth: 8,  available: true },
  { id: 12, teacher: 'Мохинур', ageMin: 13, ageMax: 15, days: 'Вт/Чт',    time: '17:20', room: 'C', lessonsPerMonth: 8,  available: true },

  // Teacher: Maftuna — weekday+Saturday groups (available)
  { id: 5,  teacher: 'Мафтуна', ageMin: 4,  ageMax: 5,  days: 'Вт/Чт/Сб', time: '10:00', room: 'A', lessonsPerMonth: 12, available: true },
  { id: 6,  teacher: 'Мафтуна', ageMin: 6,  ageMax: 7,  days: 'Вт/Чт/Сб', time: '11:30', room: 'A', lessonsPerMonth: 12, available: true },
  { id: 7,  teacher: 'Мафтуна', ageMin: 6,  ageMax: 7,  days: 'Вт/Чт/Сб', time: '14:00', room: 'A', lessonsPerMonth: 12, available: true },
  { id: 8,  teacher: 'Мафтуна', ageMin: 7,  ageMax: 8,  days: 'Вт/Чт/Сб', time: '15:30', room: 'A', lessonsPerMonth: 12, available: true },
  { id: 9,  teacher: 'Мафтуна', ageMin: 9,  ageMax: 10, days: 'Вт/Чт/Сб', time: '17:00', room: 'B', lessonsPerMonth: 12, available: true },

  // Sat/Sun groups — FULL, never offered to parents
  { id: 13, teacher: 'Мохинур', ageMin: 6,  ageMax: 7,  days: 'Сб/Вс', time: '12:00', room: 'A', lessonsPerMonth: 8,  available: false },
  { id: 14, teacher: 'Мохинур', ageMin: 9,  ageMax: 10, days: 'Сб/Вс', time: '13:30', room: 'B', lessonsPerMonth: 8,  available: false },
  { id: 15, teacher: 'Мохинур', ageMin: 7,  ageMax: 8,  days: 'Сб/Вс', time: '15:00', room: 'A', lessonsPerMonth: 8,  available: false },
];

export function getGroupsForAge(age) {
  return GROUPS.filter(g => g.available && age >= g.ageMin && age <= g.ageMax);
}
