// Application form ("Заявка"): texts in both languages, keyboards and input
// parsers. Pure helpers only — bot state and Telegram calls live in index.js.

export const WELCOME =
  'Здравствуйте! 👋 Assalomu alaykum!\n\n' +
  'SpeakMotion Academy — английский язык для детей 5–15 лет.\n' +
  'SpeakMotion Academy — 5–15 yoshli bolalar uchun ingliz tili.\n\n' +
  'Выберите язык / Tilni tanlang:';

export const T = {
  ru: {
    menu:
      'Оставьте заявку — мы позвоним, подберём удобное расписание и пригласим на бесплатную консультацию 😊\n\n' +
      'Есть вопросы? Нажмите «❓ Задать вопрос».',
    btnApply: '📝 Оставить заявку',
    btnAsk: '❓ Задать вопрос',
    askPrompt: 'Напишите ваш вопрос — я с радостью отвечу 😊',
    stepAge: '📝 Заявка · 1/4\n\nСколько лет ребёнку?',
    ageUnder5: 'Младше 5',
    stepName: '📝 Заявка · 2/4\n\nКак зовут ребёнка? Напишите имя 👇',
    stepTime: '📝 Заявка · 3/4\n\nКогда удобнее заниматься?',
    stepPhone: '📝 Заявка · 4/4\n\nОтправьте номер телефона — нажмите кнопку ниже 👇\nИли напишите номер вручную.',
    btnPhone: '📱 Отправить номер',
    badPhone:
      'Не получилось распознать номер 🤔\n' +
      'Нажмите кнопку «📱 Отправить номер» или напишите номер в формате +998 90 123 45 67',
    phoneOk: '✅ Номер получен',
    confirm: (f) =>
      'Проверьте заявку:\n\n' +
      `👶 Ребёнок: ${f.childName}, ${ageLabel(f.age, 'ru')}\n` +
      `🕐 Удобное время: ${timeLabel(f.time, 'ru')}\n` +
      `👤 Родитель: ${f.parentName}\n` +
      `📞 Телефон: ${f.phone}`,
    btnSend: '✅ Отправить',
    btnRestart: '✏️ Заново',
    done:
      'Спасибо! Заявка принята ✅\n\n' +
      'Мы свяжемся с вами в ближайшее время, подберём удобное расписание и пригласим на бесплатную консультацию 😊',
    pickButton: 'Пожалуйста, выберите вариант кнопкой 👇',
    remindForm: 'Вы не закончили заявку — осталось всего пару шагов 😊',
    btnContinue: '▶️ Продолжить заявку',
    remindMenu: 'Остались вопросы? Оставьте заявку — мы позвоним и всё расскажем 😊',
    error: 'Произошла ошибка. Попробуйте ещё раз или нажмите /start',
  },
  uz: {
    menu:
      "Ariza qoldiring — biz qo'ng'iroq qilamiz, qulay jadval tanlaymiz va bepul konsultatsiyaga taklif qilamiz 😊\n\n" +
      'Savollaringiz bormi? «❓ Savol berish» tugmasini bosing.',
    btnApply: '📝 Ariza qoldirish',
    btnAsk: '❓ Savol berish',
    askPrompt: 'Savolingizni yozing — mamnuniyat bilan javob beraman 😊',
    stepAge: '📝 Ariza · 1/4\n\nFarzandingiz necha yoshda?',
    ageUnder5: '5 yoshdan kichik',
    stepName: '📝 Ariza · 2/4\n\nFarzandingizning ismi nima? Ismini yozing 👇',
    stepTime: "📝 Ariza · 3/4\n\nQaysi vaqtda shug'ullanish qulay?",
    stepPhone: "📝 Ariza · 4/4\n\nTelefon raqamingizni yuboring — pastdagi tugmani bosing 👇\nYoki raqamni qo'lda yozing.",
    btnPhone: '📱 Raqamni yuborish',
    badPhone:
      "Raqamni aniqlab bo'lmadi 🤔\n" +
      '«📱 Raqamni yuborish» tugmasini bosing yoki raqamni +998 90 123 45 67 formatida yozing',
    phoneOk: '✅ Raqam qabul qilindi',
    confirm: (f) =>
      'Arizani tekshiring:\n\n' +
      `👶 Farzand: ${f.childName}, ${ageLabel(f.age, 'uz')}\n` +
      `🕐 Qulay vaqt: ${timeLabel(f.time, 'uz')}\n` +
      `👤 Ota-ona: ${f.parentName}\n` +
      `📞 Telefon: ${f.phone}`,
    btnSend: '✅ Yuborish',
    btnRestart: '✏️ Qaytadan',
    done:
      'Rahmat! Ariza qabul qilindi ✅\n\n' +
      "Tez orada siz bilan bog'lanamiz, qulay jadval tanlaymiz va bepul konsultatsiyaga taklif qilamiz 😊",
    pickButton: 'Iltimos, tugma orqali tanlang 👇',
    remindForm: 'Arizani yakunlamadingiz — bir necha qadam qoldi 😊',
    btnContinue: '▶️ Davom ettirish',
    remindMenu: "Savollaringiz qoldimi? Ariza qoldiring — qo'ng'iroq qilib, hammasini tushuntirib beramiz 😊",
    error: "Xatolik yuz berdi. Qaytadan urinib ko'ring yoki /start bosing",
  },
};

export const TIMES = {
  morning: { emoji: '🌅', ru: 'Утро', uz: 'Ertalab' },
  day: { emoji: '☀️', ru: 'День', uz: 'Kunduzi' },
  evening: { emoji: '🌆', ru: 'Вечер', uz: 'Kechqurun' },
  any: { emoji: '🤷', ru: 'Не важно', uz: "Farqi yo'q" },
};

// Age is stored as a number (5–18) or 'lt5' for younger children.
export function ageLabel(age, lang) {
  if (age === 'lt5') return lang === 'uz' ? '5 yoshdan kichik' : 'младше 5 лет';
  return lang === 'uz' ? `${age} yosh` : `${age} лет`;
}

// Time is a TIMES key, or the parent's own wording when typed (e.g. "после 17:00").
export function timeLabel(time, lang) {
  return TIMES[time]?.[lang] ?? time;
}

// ─── Keyboards ───────────────────────────────────────────────────────────────
export function langKeyboard() {
  return {
    inline_keyboard: [[
      { text: '🇷🇺 Русский', callback_data: 'lang:ru' },
      { text: "🇺🇿 O'zbekcha", callback_data: 'lang:uz' },
    ]],
  };
}

// Persistent menu under the input field.
export function mainKeyboard(lang) {
  return {
    keyboard: [[{ text: T[lang].btnApply }], [{ text: T[lang].btnAsk }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function ageKeyboard(lang) {
  const row = (ages) => ages.map((n) => ({ text: String(n), callback_data: `age:${n}` }));
  return {
    inline_keyboard: [
      row([5, 6, 7, 8]),
      row([9, 10, 11, 12]),
      row([13, 14, 15]),
      [{ text: T[lang].ageUnder5, callback_data: 'age:lt5' }],
    ],
  };
}

export function timeKeyboard(lang) {
  const btn = (key) => ({ text: `${TIMES[key].emoji} ${TIMES[key][lang]}`, callback_data: `time:${key}` });
  return { inline_keyboard: [[btn('morning'), btn('day')], [btn('evening'), btn('any')]] };
}

export function phoneKeyboard(lang) {
  return {
    keyboard: [[{ text: T[lang].btnPhone, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function confirmKeyboard(lang) {
  return {
    inline_keyboard: [[
      { text: T[lang].btnSend, callback_data: 'form:send' },
      { text: T[lang].btnRestart, callback_data: 'form:restart' },
    ]],
  };
}

export function continueKeyboard(lang) {
  return { inline_keyboard: [[{ text: T[lang].btnContinue, callback_data: 'form:continue' }]] };
}

export function applyKeyboard(lang) {
  return { inline_keyboard: [[{ text: T[lang].btnApply, callback_data: 'form:start' }]] };
}

// ─── Parsers ─────────────────────────────────────────────────────────────────
export function parseAge(text) {
  const m = text.match(/\d{1,2}/);
  if (!m) return null;
  const n = Number(m[0]);
  if (n < 1 || n > 18) return null;
  return n < 5 ? 'lt5' : n;
}

export function parseTime(text) {
  const t = text.toLowerCase();
  if (/утр|ertal/.test(t)) return 'morning';
  if (/дн[её]м|день|обед|kunduz|tush/.test(t)) return 'day';
  if (/вечер|kech/.test(t)) return 'evening';
  if (/важно|любое|без разниц|farq|istalgan/.test(t)) return 'any';
  if (/\d/.test(t) && t.length <= 60) return text.trim(); // e.g. "после 17:00"
  return null;
}

// Returns a readable +998 number, or null if the text isn't a phone number.
export function normalizePhone(raw) {
  let d = String(raw).replace(/\D/g, '');
  if (d.length === 9) d = `998${d}`;
  if (d.length === 12 && d.startsWith('998')) {
    return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  }
  if (d.length >= 10 && d.length <= 15) return `+${d}`;
  return null;
}

const APPLY_KEYWORDS = ['заявк', 'консультац', 'записат', 'запиши', 'запись', 'ariza', 'konsultats', 'yozil', 'yozdir'];

// Short messages like "Консультация" or "хочу записаться" open the form directly.
// Questions ("сколько длится консультация?") go to the AI instead.
export function isApplyIntent(text) {
  const t = text.toLowerCase().trim();
  if (t.length > 40 || t.includes('?')) return false;
  return APPLY_KEYWORDS.some((k) => t.includes(k));
}

export function looksLikeQuestion(text) {
  return text.includes('?') || text.length > 40;
}

// ─── Outgoing summaries (always in Russian — for the teachers) ──────────────
export function groupMessage(f, { lang, username, isTest }) {
  return [
    isTest ? '🧪 ТЕСТ — заявка от администратора\n' : null,
    '📝 Новая заявка',
    '',
    `👶 Ребёнок: ${f.childName}, ${ageLabel(f.age, 'ru')}`,
    `🕐 Удобное время: ${timeLabel(f.time, 'ru')}`,
    `👤 Родитель: ${f.parentName}`,
    `📞 Телефон: ${f.phone}`,
    `💬 Telegram: ${username ? `@${username}` : '—'}`,
    `🌐 Язык: ${lang === 'uz' ? 'узбекский' : 'русский'}`,
    f.question ? `❓ Вопрос: ${f.question}` : null,
  ].filter((line) => line !== null).join('\n');
}
