import 'dotenv/config';

const TEACHER_GROUP_CHAT_ID = process.env.TEACHER_GROUP_CHAT_ID;

export async function notifyTeacher(telegram, { name, phone, age, question }) {
  if (!TEACHER_GROUP_CHAT_ID) {
    console.warn('[escalate] TEACHER_GROUP_CHAT_ID is not set — skipping notification');
    return;
  }

  const text =
    `🔔 Новая заявка требует внимания\n\n` +
    `👤 Имя: ${name ?? 'не указано'}\n` +
    `📞 Телефон: ${phone ?? 'не указан'}\n` +
    `👶 Возраст ребёнка: ${age ?? 'не указан'}\n` +
    `❓ Вопрос: ${question ?? 'не указан'}`;

  await telegram.sendMessage(TEACHER_GROUP_CHAT_ID, text);
}
