const timers = new Map();

const REMINDER_DELAY_MS = 30 * 60 * 1000; // 30 minutes

const REMINDER_TEXT =
  'Вы ещё здесь? 👋 Если остались вопросы или хотите продолжить запись — просто напишите, я на связи!\n\n' +
  'Hali shu yerdamisiz? 👋 Savollaringiz bo\'lsa yoki ro\'yxatdan o\'tishni davom ettirmoqchi bo\'lsangiz — yozing, men shu yerdaman!';

export function scheduleReminder(chatId, sendFn) {
  cancelReminder(chatId);
  const timer = setTimeout(async () => {
    timers.delete(chatId);
    try {
      await sendFn(REMINDER_TEXT);
    } catch (err) {
      console.error('[reminder] Failed to send reminder to', chatId, err.message);
    }
  }, REMINDER_DELAY_MS);
  timers.set(chatId, timer);
}

export function cancelReminder(chatId) {
  if (timers.has(chatId)) {
    clearTimeout(timers.get(chatId));
    timers.delete(chatId);
  }
}
