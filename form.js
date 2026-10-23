// Bot forms: the general application ("Заявка") and the free diagnostic booking.
// Texts in both languages, keyboards and input parsers. Pure helpers only —
// bot state and Telegram calls live in index.js.
import { slotEnd } from './diagnostics.js';

// true: the menu offers the free diagnostic booking. false: the diagnostic is
// paused — the menu offers the general application (consultation) again, and a
// parent asking for the diagnostic hears that the nearest days are taken.
export const DIAGNOSTIC_MODE = false;

const ADDRESS = '1-й Нукусский проезд, 19А, Ташкент';
const MAP_URL = 'https://yandex.ru/maps?text=41.298249,69.289735&si=r3h04gaghvupu1pqh7kdeykn38';

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
      'Номер выглядит неполным 🤔\n' +
      'Проверьте цифры: нужно +998 и ещё 9 цифр, например +998 90 123 45 67. Или нажмите кнопку «📱 Отправить номер».',
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

    // ── Free diagnostic ──
    btnDiag: '🔍 Записаться на диагностику',
    diagMenu:
      'Запишитесь на бесплатную диагностику языкового профиля ребёнка 🔍\n\n' +
      'Для детей 5–10 лет · 30 минут · в нашем центре. Выберите удобный день и время прямо здесь — это займёт меньше минуты.\n\n' +
      'Есть вопросы? Нажмите «❓ Задать вопрос».',
    diagAge: '🔍 Диагностика · 1/5\n\nСколько лет ребёнку?',
    diagOtherAge: 'Другой возраст',
    diagAgeDecline:
      'Диагностика проводится только для детей от 5 до 10 лет 🙏\n\n' +
      'Если у вас есть вопросы — нажмите «❓ Задать вопрос», я с радостью отвечу.',
    diagTooYoung:
      'Диагностика и занятия у нас — для детей с 5 лет 🙏 Будем рады видеть вас, когда ребёнку исполнится 5!\n\n' +
      'Если есть вопросы — нажмите «❓ Задать вопрос», я с радостью отвечу.',
    diagOtherAgePrompt: 'Укажите возраст ребёнка:',
    olderOffer:
      'Диагностика проводится для детей 5–10 лет 🙏\n\n' +
      'Для детей 11–15 лет у нас есть группы английского. Оставьте номер — мы позвоним, расскажем о занятиях и подберём удобное время 😊',
    btnLeaveNumber: '📝 Оставить номер',
    olderRemind: 'Хотите узнать о группах английского для детей 11–15 лет? Оставьте номер — мы позвоним и всё расскажем 😊',
    // Diagnostic paused (DIAGNOSTIC_MODE = false)
    diagPaused:
      'К сожалению, места на диагностику на ближайшие дни уже заняты 😔\n\n' +
      'Но вы можете записаться на наши курсы: оставьте заявку — мы позвоним, подберём удобное расписание и пригласим на бесплатную консультацию 😊',
    diagDate: '🔍 Диагностика · 2/5\n\nВыберите удобный день:',
    diagNoDates:
      'К сожалению, на ближайшие две недели все окна для диагностики заняты 😔\n' +
      'Позвоните нам: +998 95 030-65-83 — постараемся найти время.',
    diagSlot: (day) => `🔍 Диагностика · 3/5 — ${day}\n\nВыберите удобное время (диагностика длится 30 минут):`,
    btnOtherDay: '← Другой день',
    diagTaken: 'Это время только что заняли 😔 Выберите, пожалуйста, другое.',
    diagName: '🔍 Диагностика · 4/5\n\nКак зовут ребёнка? Напишите имя 👇',
    diagPhone: '🔍 Диагностика · 5/5\n\nОтправьте номер телефона — нажмите кнопку ниже 👇\nИли напишите номер вручную.',
    diagConfirm: (f) =>
      'Проверьте запись:\n\n' +
      `🔍 Диагностика: ${dateLabel(f.date, 'ru')}, ${f.slot}–${slotEnd(f.slot)}\n` +
      (f.reschedule ? `🔄 Перенос с: ${dateLabel(f.reschedule.date, 'ru')}, ${f.reschedule.time}\n` : '') +
      `👶 Ребёнок: ${f.childName}, ${ageLabel(f.age, 'ru')}\n` +
      `👤 Родитель: ${f.parentName}\n` +
      `📞 Телефон: ${f.phone}`,
    btnBook: '✅ Записаться',
    btnConfirmMove: '✅ Перенести',
    diagDone: (f) =>
      (f.reschedule ? 'Запись перенесена ✅\n\n' : 'Вы записаны на диагностику ✅\n\n') +
      `📅 ${dateLabel(f.date, 'ru')}, ${f.slot}–${slotEnd(f.slot)}\n` +
      `📍 ${ADDRESS}\n${MAP_URL}\n\n` +
      'Если планы изменятся — напишите сюда или позвоните: +998 95 030-65-83. Ждём вас! 😊',
    diagRemindForm: 'Вы не закончили запись на диагностику — осталось всего пару шагов 😊',
    btnContinueDiag: '▶️ Продолжить запись',
    // "No suitable window" → we call and find a time together
    btnNoTime: '🙋 Нет удобного времени',
    diagFull:
      'К сожалению, все окна для диагностики на ближайшие две недели заняты 😔\n' +
      'Давайте подберём время вместе — ответьте на пару вопросов, и мы позвоним.',
    waitTime: '🔍 Подберём время · 1/3\n\nКогда вам удобно приходить?',
    waitName: '🔍 Подберём время · 2/3\n\nКак зовут ребёнка? Напишите имя 👇',
    waitPhone: '🔍 Подберём время · 3/3\n\nОтправьте номер телефона — нажмите кнопку ниже 👇\nИли напишите номер вручную.',
    waitConfirm: (f) =>
      'Проверьте:\n\n' +
      '🔍 Диагностика — подберём время вместе\n' +
      `👶 Ребёнок: ${f.childName}, ${ageLabel(f.age, 'ru')}\n` +
      `🕐 Удобно: ${timeLabel(f.time, 'ru')}\n` +
      `👤 Родитель: ${f.parentName}\n` +
      `📞 Телефон: ${f.phone}`,
    waitDone: 'Спасибо! ✅ Мы позвоним и вместе подберём удобное время для диагностики 😊',
    diagRemindMenu: 'Хотите узнать языковой профиль ребёнка? Запишитесь на бесплатную диагностику — 30 минут в нашем центре 😊',
    // Reminders about a booked diagnostic (b = booking: date, time, childName)
    // The child's name stays in its own line: Russian names can't be declined reliably
    diagRemindDayBefore: (b) =>
      `Напоминаем: завтра, ${dateLabel(b.date, 'ru')}, в ${b.time}–${slotEnd(b.time)} — бесплатная диагностика 🔍\n` +
      `👶 Ребёнок: ${b.childName}\n\n` +
      `📍 ${ADDRESS}\n${MAP_URL}\n\n` +
      'Сможете прийти?',
    diagRemindSoon: (b) =>
      `Ждём вас сегодня в ${b.time} на бесплатную диагностику 😊\n` +
      `👶 Ребёнок: ${b.childName}\n\n` +
      `📍 ${ADDRESS}\n${MAP_URL}`,
    btnComing: '✅ Приду',
    btnCantCome: '❌ Не смогу прийти',
    diagComing: 'Отлично, ждём вас! 😊',
    diagCancelled: 'Запись отменена — спасибо, что предупредили 🙏',
    diagRebook: 'Если захотите выбрать другое время — нажмите «🔍 Записаться на диагностику».',
    diagAlreadyCancelled: 'Эта запись уже отменена.',
    // Parent opens the booking again while already booked (bs = their bookings)
    diagExisting: (bs) =>
      'У вас уже есть запись на диагностику ✅\n\n' +
      bs.map((b) => `📅 ${dateLabel(b.date, 'ru')}, ${b.time}–${slotEnd(b.time)} — ${b.childName}`).join('\n') +
      `\n📍 ${ADDRESS}`,
    btnKeep: '✅ Всё верно',
    btnMove: '🔄 Перенести на другое время',
    btnMoveOne: (b) => `🔄 Перенести: ${dateButton(b.date, 'ru')} ${b.time} (${b.childName})`,
    diagMoveByPhone: 'Чтобы перенести запись, позвоните нам: +998 95 030-65-83 😊',
    btnNewChild: '👶 Записать другого ребёнка',
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
      "Raqam to'liq emasga o'xshaydi 🤔\n" +
      "Raqamlarni tekshiring: +998 va yana 9 ta raqam bo'lishi kerak, masalan +998 90 123 45 67. Yoki «📱 Raqamni yuborish» tugmasini bosing.",
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

    // ── Free diagnostic ──
    btnDiag: '🔍 Diagnostikaga yozilish',
    diagMenu:
      'Farzandingizning til profilini bepul diagnostikasiga yoziling 🔍\n\n' +
      "5–10 yoshli bolalar uchun · 30 daqiqa · markazimizda. Qulay kun va vaqtni shu yerning o'zida tanlang — bir daqiqa ham ketmaydi.\n\n" +
      'Savollaringiz bormi? «❓ Savol berish» tugmasini bosing.',
    diagAge: '🔍 Diagnostika · 1/5\n\nFarzandingiz necha yoshda?',
    diagOtherAge: 'Boshqa yosh',
    diagAgeDecline:
      "Diagnostika faqat 5 yoshdan 10 yoshgacha bo'lgan bolalar uchun o'tkaziladi 🙏\n\n" +
      "Savollaringiz bo'lsa — «❓ Savol berish» tugmasini bosing, mamnuniyat bilan javob beraman.",
    diagTooYoung:
      "Diagnostika va mashg'ulotlarimiz 5 yoshdan katta bolalar uchun 🙏 Farzandingiz 5 yoshga to'lganda sizni kutib qolamiz!\n\n" +
      "Savollaringiz bo'lsa — «❓ Savol berish» tugmasini bosing, mamnuniyat bilan javob beraman.",
    diagOtherAgePrompt: 'Farzandingiz yoshini tanlang:',
    olderOffer:
      "Diagnostika 5–10 yoshli bolalar uchun o'tkaziladi 🙏\n\n" +
      "11–15 yoshli bolalar uchun bizda ingliz tili guruhlari bor. Raqamingizni qoldiring — qo'ng'iroq qilib, mashg'ulotlar haqida gapirib beramiz va qulay vaqtni tanlaymiz 😊",
    btnLeaveNumber: '📝 Raqam qoldirish',
    olderRemind: "11–15 yoshli bolalar uchun ingliz tili guruhlari haqida bilmoqchimisiz? Raqamingizni qoldiring — qo'ng'iroq qilib, hammasini aytib beramiz 😊",
    diagPaused:
      "Afsuski, yaqin kunlarga diagnostika uchun joylar band bo'lib qoldi 😔\n\n" +
      "Lekin kurslarimizga yozilishingiz mumkin: ariza qoldiring — biz qo'ng'iroq qilamiz, qulay jadval tanlaymiz va bepul konsultatsiyaga taklif qilamiz 😊",
    diagDate: '🔍 Diagnostika · 2/5\n\nQulay kunni tanlang:',
    diagNoDates:
      'Afsuski, yaqin ikki haftaga diagnostika uchun barcha vaqtlar band 😔\n' +
      "Bizga qo'ng'iroq qiling: +998 95 030-65-83 — vaqt topishga harakat qilamiz.",
    diagSlot: (day) => `🔍 Diagnostika · 3/5 — ${day}\n\nQulay vaqtni tanlang (diagnostika 30 daqiqa davom etadi):`,
    btnOtherDay: '← Boshqa kun',
    diagTaken: 'Bu vaqtni hozirgina band qilishdi 😔 Iltimos, boshqa vaqtni tanlang.',
    diagName: '🔍 Diagnostika · 4/5\n\nFarzandingizning ismi nima? Ismini yozing 👇',
    diagPhone: "🔍 Diagnostika · 5/5\n\nTelefon raqamingizni yuboring — pastdagi tugmani bosing 👇\nYoki raqamni qo'lda yozing.",
    diagConfirm: (f) =>
      'Yozilishni tekshiring:\n\n' +
      `🔍 Diagnostika: ${dateLabel(f.date, 'uz')}, ${f.slot}–${slotEnd(f.slot)}\n` +
      (f.reschedule ? `🔄 Avvalgi vaqt: ${dateLabel(f.reschedule.date, 'uz')}, ${f.reschedule.time}\n` : '') +
      `👶 Farzand: ${f.childName}, ${ageLabel(f.age, 'uz')}\n` +
      `👤 Ota-ona: ${f.parentName}\n` +
      `📞 Telefon: ${f.phone}`,
    btnBook: '✅ Yozilish',
    btnConfirmMove: "✅ Ko'chirish",
    diagDone: (f) =>
      (f.reschedule ? "Yozilish ko'chirildi ✅\n\n" : 'Siz diagnostikaga yozildingiz ✅\n\n') +
      `📅 ${dateLabel(f.date, 'uz')}, ${f.slot}–${slotEnd(f.slot)}\n` +
      `📍 ${ADDRESS}\n${MAP_URL}\n\n` +
      "Rejalaringiz o'zgarsa — shu yerga yozing yoki qo'ng'iroq qiling: +998 95 030-65-83. Sizni kutamiz! 😊",
    diagRemindForm: 'Diagnostikaga yozilishni yakunlamadingiz — bir necha qadam qoldi 😊',
    btnContinueDiag: '▶️ Davom ettirish',
    btnNoTime: "🙋 Qulay vaqt yo'q",
    diagFull:
      'Afsuski, yaqin ikki haftaga diagnostika uchun barcha vaqtlar band 😔\n' +
      "Keling, vaqtni birga tanlaymiz — bir nechta savolga javob bering, biz qo'ng'iroq qilamiz.",
    waitTime: '🔍 Vaqtni tanlaymiz · 1/3\n\nSizga qaysi vaqtda kelish qulay?',
    waitName: '🔍 Vaqtni tanlaymiz · 2/3\n\nFarzandingizning ismi nima? Ismini yozing 👇',
    waitPhone: "🔍 Vaqtni tanlaymiz · 3/3\n\nTelefon raqamingizni yuboring — pastdagi tugmani bosing 👇\nYoki raqamni qo'lda yozing.",
    waitConfirm: (f) =>
      'Tekshiring:\n\n' +
      '🔍 Diagnostika — vaqtni birga tanlaymiz\n' +
      `👶 Farzand: ${f.childName}, ${ageLabel(f.age, 'uz')}\n` +
      `🕐 Qulay vaqt: ${timeLabel(f.time, 'uz')}\n` +
      `👤 Ota-ona: ${f.parentName}\n` +
      `📞 Telefon: ${f.phone}`,
    waitDone: "Rahmat! ✅ Qo'ng'iroq qilib, diagnostika uchun qulay vaqtni birga tanlaymiz 😊",
    diagRemindMenu: "Farzandingizning til profilini bilmoqchimisiz? Bepul diagnostikaga yoziling — markazimizda 30 daqiqa 😊",
    diagRemindDayBefore: (b) =>
      `Eslatma: ertaga, ${dateLabel(b.date, 'uz')}, soat ${b.time}–${slotEnd(b.time)} da ${b.childName} uchun bepul diagnostika 🔍\n\n` +
      `📍 ${ADDRESS}\n${MAP_URL}\n\n` +
      'Kela olasizmi?',
    diagRemindSoon: (b) =>
      `Bugun soat ${b.time} da ${b.childName} uchun bepul diagnostikaga kutamiz 😊\n\n` +
      `📍 ${ADDRESS}\n${MAP_URL}`,
    btnComing: '✅ Kelaman',
    btnCantCome: '❌ Kela olmayman',
    diagComing: 'Ajoyib, sizni kutamiz! 😊',
    diagCancelled: 'Yozilish bekor qilindi — oldindan aytganingiz uchun rahmat 🙏',
    diagRebook: "Boshqa vaqtni tanlamoqchi bo'lsangiz — «🔍 Diagnostikaga yozilish» tugmasini bosing.",
    diagAlreadyCancelled: 'Bu yozilish allaqachon bekor qilingan.',
    diagExisting: (bs) =>
      'Sizda allaqachon diagnostikaga yozilish bor ✅\n\n' +
      bs.map((b) => `📅 ${dateLabel(b.date, 'uz')}, ${b.time}–${slotEnd(b.time)} — ${b.childName}`).join('\n') +
      `\n📍 ${ADDRESS}`,
    btnKeep: "✅ Hammasi to'g'ri",
    btnMove: "🔄 Boshqa vaqtga ko'chirish",
    btnMoveOne: (b) => `🔄 Ko'chirish: ${dateButton(b.date, 'uz')} ${b.time} (${b.childName})`,
    diagMoveByPhone: "Yozilishni ko'chirish uchun bizga qo'ng'iroq qiling: +998 95 030-65-83 😊",
    btnNewChild: '👶 Boshqa farzandni yozish',
  },
};

export const TIMES = {
  morning: { emoji: '🌅', ru: 'Утро', uz: 'Ertalab' },
  day: { emoji: '☀️', ru: 'День', uz: 'Kunduzi' },
  evening: { emoji: '🌆', ru: 'Вечер', uz: 'Kechqurun' },
  any: { emoji: '🤷', ru: 'Не важно', uz: "Farqi yo'q" },
};

// The menu's main button and texts follow DIAGNOSTIC_MODE.
export const menuText = (lang) => (DIAGNOSTIC_MODE ? T[lang].diagMenu : T[lang].menu);
export const mainButtonText = (lang) => (DIAGNOSTIC_MODE ? T[lang].btnDiag : T[lang].btnApply);
export const remindMenuText = (lang) => (DIAGNOSTIC_MODE ? T[lang].diagRemindMenu : T[lang].remindMenu);

// Age is stored as a number (5–18) or 'lt5' for younger children.
export function ageLabel(age, lang) {
  if (age === 'lt5') return lang === 'uz' ? '5 yoshdan kichik' : 'младше 5 лет';
  return lang === 'uz' ? `${age} yosh` : `${age} лет`;
}

// Time is a TIMES key, or the parent's own wording when typed (e.g. "после 17:00").
export function timeLabel(time, lang) {
  return TIMES[time]?.[lang] ?? time;
}

const RU_DAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const RU_DAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const RU_MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const UZ_DAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const UZ_DAYS_SHORT = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const UZ_MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

// date is 'YYYY-MM-DD' → "понедельник, 19 октября" / "dushanba, 19-oktabr"
export function dateLabel(date, lang) {
  const d = new Date(`${date}T00:00:00Z`);
  const [day, month, wd] = [d.getUTCDate(), d.getUTCMonth(), d.getUTCDay()];
  return lang === 'uz' ? `${UZ_DAYS[wd]}, ${day}-${UZ_MONTHS[month]}` : `${RU_DAYS[wd]}, ${day} ${RU_MONTHS[month]}`;
}

// date is 'YYYY-MM-DD' → "Пн 19.10" / "Du 19.10"
export function dateButton(date, lang) {
  const [, mm, dd] = date.split('-');
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${(lang === 'uz' ? UZ_DAYS_SHORT : RU_DAYS_SHORT)[wd]} ${dd}.${mm}`;
}

// ─── Keyboards ───────────────────────────────────────────────────────────────
const chunk = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

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
    keyboard: [[{ text: mainButtonText(lang) }], [{ text: T[lang].btnAsk }]],
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

export function diagAgeKeyboard(lang) {
  const row = (ages) => ages.map((n) => ({ text: String(n), callback_data: `age:${n}` }));
  return {
    inline_keyboard: [row([5, 6, 7]), row([8, 9, 10]), [{ text: T[lang].diagOtherAge, callback_data: 'age:other' }]],
  };
}

// After "Другой возраст": ages outside the diagnostic range
export function diagOtherAgeKeyboard(lang) {
  const row = (ages) => ages.map((n) => ({ text: String(n), callback_data: `age:${n}` }));
  return { inline_keyboard: [row([11, 12, 13]), row([14, 15]), [{ text: T[lang].ageUnder5, callback_data: 'age:lt5' }]] };
}

// "Оставить номер" for children 11–15; age 0 = unknown (asked in the form)
export function olderKeyboard(age, lang) {
  return { inline_keyboard: [[{ text: T[lang].btnLeaveNumber, callback_data: `older:${age}` }]] };
}

export function timeKeyboard(lang) {
  const btn = (key) => ({ text: `${TIMES[key].emoji} ${TIMES[key][lang]}`, callback_data: `time:${key}` });
  return { inline_keyboard: [[btn('morning'), btn('day')], [btn('evening'), btn('any')]] };
}

export function dateKeyboard(dates, lang) {
  const buttons = dates.map((date) => ({ text: dateButton(date, lang), callback_data: `ddate:${date}` }));
  return { inline_keyboard: [...chunk(buttons, 3), [{ text: T[lang].btnNoTime, callback_data: 'dnone' }]] };
}

export function slotKeyboard(times, lang) {
  const buttons = times.map((time) => ({ text: `${time}–${slotEnd(time)}`, callback_data: `dslot:${time}` }));
  return {
    inline_keyboard: [
      ...chunk(buttons, 2),
      [{ text: T[lang].btnOtherDay, callback_data: 'dback' }, { text: T[lang].btnNoTime, callback_data: 'dnone' }],
    ],
  };
}

export function phoneKeyboard(lang) {
  return {
    keyboard: [[{ text: T[lang].btnPhone, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

export function confirmKeyboard(lang, sendText = T[lang].btnSend) {
  return {
    inline_keyboard: [[
      { text: sendText, callback_data: 'form:send' },
      { text: T[lang].btnRestart, callback_data: 'form:restart' },
    ]],
  };
}

export function continueKeyboard(lang, text = T[lang].btnContinue) {
  return { inline_keyboard: [[{ text, callback_data: 'form:continue' }]] };
}

// Under "you already have a booking". While the diagnostic is paused, moving is by phone only.
export function existingKeyboard(bookings, lang) {
  const t = T[lang];
  const move = bookings.length === 1
    ? [[{ text: t.btnMove, callback_data: `dmove:${bookings[0].date}:${bookings[0].time}` }]]
    : bookings.map((b) => [{ text: t.btnMoveOne(b), callback_data: `dmove:${b.date}:${b.time}` }]);
  return {
    inline_keyboard: [
      [{ text: t.btnKeep, callback_data: 'dkeep' }],
      ...(DIAGNOSTIC_MODE ? move : []),
      [{ text: t.btnNewChild, callback_data: 'dnew' }],
    ],
  };
}

// Under the evening-before reminder
export function attendKeyboard(b, lang) {
  return {
    inline_keyboard: [[
      { text: T[lang].btnComing, callback_data: `dok:${b.date}:${b.time}` },
      { text: T[lang].btnCantCome, callback_data: `dno:${b.date}:${b.time}` },
    ]],
  };
}

// Under the 2-hours-before reminder
export function cantComeKeyboard(b, lang) {
  return { inline_keyboard: [[{ text: T[lang].btnCantCome, callback_data: `dno:${b.date}:${b.time}` }]] };
}

export function applyKeyboard(lang) {
  return { inline_keyboard: [[{ text: mainButtonText(lang), callback_data: 'form:start' }]] };
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

// "в 11:30", "14.30" → "11:30" / "14:30"
export function parseClock(text) {
  const m = text.match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// Returns a readable phone number, or null if it can't be a real one.
// Uzbek numbers need exactly 9 digits after 998; foreign numbers are only
// accepted in international format, starting with "+".
export function normalizePhone(raw) {
  const text = String(raw).trim();
  const international = text.startsWith('+');
  let d = text.replace(/\D/g, '');
  if (!international && d.length === 10 && d.startsWith('8')) d = d.slice(1); // old format: 8 90 123 45 67
  if (d.length === 9) d = `998${d}`;
  if (d.startsWith('998')) {
    return d.length === 12 ? `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : null;
  }
  return international && d.length >= 11 && d.length <= 15 ? `+${d}` : null;
}

const APPLY_KEYWORDS = [
  'заявк', 'консультац', 'записат', 'запиши', 'запись', 'диагност',
  'ariza', 'konsultats', 'yozil', 'yozdir', 'diagnost',
];

// Short messages like "Диагностика" or "хочу записаться" open the main form directly.
// Questions ("сколько длится консультация?") go to the AI instead.
export function isApplyIntent(text) {
  const t = text.toLowerCase().trim();
  if (t.length > 40 || t.includes('?')) return false;
  return APPLY_KEYWORDS.some((k) => t.includes(k));
}

// The diagnostic button (parents may still have it) or "диагностика" — the
// diagnostic itself, not the general application.
export function isDiagnosticIntent(text) {
  return text === T.ru.btnDiag || text === T.uz.btnDiag || /диагност|diagnost/i.test(text);
}

export function looksLikeQuestion(text) {
  return text.includes('?') || text.length > 40;
}

// ─── Outgoing summaries (always in Russian — for the teachers) ──────────────
function contactLines(f, { lang, username }) {
  return [
    `👤 Родитель: ${f.parentName}`,
    `📞 Телефон: ${f.phone}`,
    `💬 Telegram: ${username ? `@${username}` : '—'}`,
    `🌐 Язык: ${lang === 'uz' ? 'узбекский' : 'русский'}`,
  ];
}

export function groupMessage(f, meta) {
  return [
    meta.isTest ? '🧪 ТЕСТ — заявка от администратора\n' : null,
    '📝 Новая заявка',
    '',
    `👶 Ребёнок: ${f.childName}, ${ageLabel(f.age, 'ru')}`,
    `🕐 Удобное время: ${timeLabel(f.time, 'ru')}`,
    ...contactLines(f, meta),
    f.question ? `❓ Вопрос: ${f.question}` : null,
  ].filter((line) => line !== null).join('\n');
}

// f.reschedule = the old booking's { date, time }
export function diagMovedGroupMessage(f, meta) {
  return [
    meta.isTest ? '🧪 ТЕСТ\n' : null,
    '🔄 Перенос записи на диагностику',
    '',
    `Было: ${dateLabel(f.reschedule.date, 'ru')}, ${f.reschedule.time}–${slotEnd(f.reschedule.time)}`,
    `Стало: ${dateLabel(f.date, 'ru')}, ${f.slot}–${slotEnd(f.slot)}`,
    `👶 Ребёнок: ${f.childName}, ${ageLabel(f.age, 'ru')}`,
    ...contactLines(f, meta),
  ].filter((line) => line !== null).join('\n');
}

export function waitGroupMessage(f, meta) {
  return [
    meta.isTest ? '🧪 ТЕСТ\n' : null,
    '🙋 Нет удобного окна для диагностики',
    '',
    `👶 Ребёнок: ${f.childName}, ${ageLabel(f.age, 'ru')}`,
    `🕐 Удобное время: ${timeLabel(f.time, 'ru')}`,
    ...contactLines(f, meta),
    f.question ? `❓ Вопрос: ${f.question}` : null,
    '',
    '📞 Позвоните и подберите время.',
  ].filter((line) => line !== null).join('\n');
}

// b is a stored booking (date, time, childName, age, parentName, phone)
export function diagCancelMessage(b) {
  return [
    b.isTest ? '🧪 ТЕСТ\n' : null,
    '❌ Родитель отменил запись на диагностику',
    '',
    `📅 ${dateLabel(b.date, 'ru')}, ${b.time}–${slotEnd(b.time)}`,
    `👶 Ребёнок: ${b.childName}, ${ageLabel(b.age, 'ru')}`,
    `👤 Родитель: ${b.parentName}`,
    `📞 Телефон: ${b.phone}`,
    '',
    'Окно снова свободно для записи.',
  ].filter((line) => line !== null).join('\n');
}

export function diagGroupMessage(f, meta) {
  return [
    meta.isTest ? '🧪 ТЕСТ — запись от администратора\n' : null,
    '🔍 Запись на диагностику',
    '',
    `📅 ${dateLabel(f.date, 'ru')}, ${f.slot}–${slotEnd(f.slot)}`,
    `👶 Ребёнок: ${f.childName}, ${ageLabel(f.age, 'ru')}`,
    ...contactLines(f, meta),
    f.question ? `❓ Вопрос: ${f.question}` : null,
  ].filter((line) => line !== null).join('\n');
}
