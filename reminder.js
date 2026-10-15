const timers = new Map();

const REMINDER_DELAY_MS = 30 * 60 * 1000; // 30 minutes

// Runs `remind` once after 30 minutes of silence. Any new activity should
// call scheduleReminder again (or cancelReminder) to reset the timer.
export function scheduleReminder(chatId, remind) {
  cancelReminder(chatId);
  const timer = setTimeout(async () => {
    timers.delete(chatId);
    try {
      await remind();
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
