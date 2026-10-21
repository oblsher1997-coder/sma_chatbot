# SpeakMotion Academy — Telegram Enrollment Bot

AI-powered Telegram bot that handles parent enrollment inquiries for SpeakMotion Academy (Tashkent). Conducts a full sales conversation in Russian or Uzbek, matches children to the right group, and either closes the deal or escalates to a teacher.

---

## Quick Start

### 1. Clone and install dependencies

```bash
cd speakmotion-bot
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in all four values (see setup guide below).

### 3. Start the bot

```bash
npm start
```

For development with auto-restart on file changes:

```bash
npm run dev
```

---

## Setup Guide

### Telegram Bot Token

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot` and follow the prompts (pick a name and username).
3. BotFather will reply with a token like `7123456789:AAF...`.
4. Paste it into `.env` as `TELEGRAM_BOT_TOKEN`.

### DeepSeek API Key

1. Go to [platform.deepseek.com](https://platform.deepseek.com) and create an account.
2. Navigate to **API Keys** → **Create new key**.
3. Copy the key and paste it into `.env` as `DEEPSEEK_API_KEY`.
4. Top up your balance (DeepSeek is very affordable — $0.14/1M input tokens as of 2025).

### Teacher Group Chat ID

The bot needs to know which Telegram group to forward escalated inquiries to.

**Method:**
1. Create a Telegram group (or use an existing one) for your teachers.
2. Add your bot to that group.
3. Add **@userinfobot** to the group temporarily.
4. It will print the group's chat ID (a negative number, e.g. `-1001234567890`).
5. Paste that number into `.env` as `TEACHER_GROUP_CHAT_ID`.
6. Remove @userinfobot from the group.

**Alternative:** Forward any message from the group to @userinfobot — it will show the origin chat ID.

### Payment Links (Payme / Click)

1. Register as a merchant at [payme.uz](https://payme.uz) and [click.uz](https://click.uz).
2. Each platform gives you a unique payment link for your store.
3. Paste them into `.env` as `PAYME_LINK` and `CLICK_LINK`.

Until you have real links, the bot uses placeholder URLs — parents can still read the message.

---

## File Structure

```
speakmotion-bot/
├── index.js        — Bot entry point: menu, form flows, admin commands, broadcast, CRM intake
├── form.js         — DIAGNOSTIC_MODE switch, form texts (ru/uz), keyboards, input parsers
├── diagnostics.js  — Diagnostic windows, availability and bookings (diagnostics.json)
├── deepseek.js     — DeepSeek API wrapper + conversation history + system prompt
├── sheets.js       — Writes to the «Заявки» and «Диагностика» tabs in Google Sheets
├── analytics.js    — Stats and funnel (analytics.json), /stats message
├── reminder.js     — One 30-minute reminder per silent chat
├── .env            — Your secrets (never commit this)
├── .env.example    — Template for .env
└── README.md
```

---

## How the Bot Works

### Free diagnostic (current mode, `DIAGNOSTIC_MODE = true` in `form.js`)

1. Parent opens the bot → picks a language → menu: «🔍 Записаться на диагностику» or «❓ Задать вопрос»
2. Booking, 5 steps: child's age (5–10 only; other ages get a polite refusal) → day (free days for the next 2 weeks) → time (free 30-minute windows) → child's name → phone
3. Parent confirms → gets the date, time and address; the booking goes to the teachers' group, the CRM («Заявки») and Google Sheets (tab «Диагностика»)
4. Each window takes one child per teacher who has it (a time two teachers share takes two); full windows disappear for other parents. Windows starting in less than 2 hours aren't offered. Each teacher's weekly windows (and the date they start) are set in `TEACHERS` in `diagnostics.js`.
5. Reminders: the evening before at 19:00 (with «✅ Приду» / «❌ Не смогу прийти») and 2 hours before (with «❌ Не смогу прийти»). Cancelling frees the window, tells the teachers' group and marks the Sheets row; a confirmation shows as «✅ подтвердил» in `/diag`. Parents who booked less than an hour before a reminder skip it; a reminder missed while the bot was down isn't sent late at night.

6. «🙋 Нет удобного времени» on the day/time screens (and automatically when every window is booked): the parent leaves a convenient time, the child's name and a phone; the request goes to the teachers' topic, the CRM and the «Диагностика» tab (date «⏳ подобрать время»).
7. Children 11–15 are offered «📝 Оставить номер» (short application about groups); under 5 get a polite refusal.
8. A parent who already has an upcoming booking and opens the booking again (button, word or AI) sees it with «✅ Всё верно» / «🔄 Перенести на другое время» / «👶 Записать другого ребёнка». Moving keeps the child and phone, asks only a new day and time, and releases the old window only after the new one is confirmed. The AI is told about the parent's bookings, so "am I booked?" gets the date and time.

Parents who never picked a language get answers in the script they write in (Latin → Uzbek, Cyrillic → Russian); inside a form the language never changes, and a language picked with the buttons always wins.

Admin commands: `/diag` — upcoming bookings with a «❌ Освободить» button per booking (parent cancelled; frees only that child's place); `/diag_block 19.10 11:00` — take one place in a window (e.g. booked by phone; repeat for the second place).

### Application form (`DIAGNOSTIC_MODE = false`)

1. Parent opens the bot → picks a language (Русский / O'zbekcha)
2. Menu: «📝 Оставить заявку» or «❓ Задать вопрос»
3. Application form, 4 steps: child's age (buttons) → child's name → convenient time (buttons) → phone (Telegram "share contact" button or typed)
4. Parent confirms → the application goes to the teachers' group, the CRM («Заявки») and Google Sheets (tab «Заявки»)
5. The team calls the parent, picks a group and invites them to a free offline consultation
6. «❓ Задать вопрос» → the AI answers questions (methodology, prices, address) and opens the form when the parent is ready
7. Teachers answer a parent by replying to the notification in the group with `!текст!`

### Both modes

Short messages like «Диагностика», «Консультация» or «записаться» open the menu's form directly. A parent who goes silent gets one reminder after 30 minutes. The admin sees the same menu and can submit test applications (marked 🧪 ТЕСТ).

Form progress and AI conversation history are stored in memory (per chat ID) and reset on `/start`.

---

## Deploy to Railway (Free Tier)

Railway offers a free hobby tier suitable for running this bot 24/7.

### Steps

1. Push your code to a GitHub repository (make sure `.env` is in `.gitignore`).

2. Go to [railway.app](https://railway.app) and sign in with GitHub.

3. Click **New Project** → **Deploy from GitHub repo** → select your repo.

4. In the Railway dashboard, go to your service → **Variables** tab.
   Add each variable from `.env`:
   - `TELEGRAM_BOT_TOKEN`
   - `DEEPSEEK_API_KEY`
   - `TEACHER_GROUP_CHAT_ID`
   - `PAYME_LINK`
   - `CLICK_LINK`

5. Railway will automatically detect `npm start` from `package.json` and deploy.

6. The bot will start running. Check **Logs** in the dashboard for `✅ SpeakMotion bot is running`.

> **Waitlist note:** `waitlist.json` is written to the container's local filesystem. On Railway, this resets on each deploy. For production, move waitlist storage to a Railway Postgres database or an external service like Airtable.

---

## Customization

- **System prompt / AI behavior** — edit `buildSystemPrompt()` in `deepseek.js`
- **Form questions, buttons, texts** — edit `T` and the keyboards in `form.js`
- **Teacher notification format** — edit `groupMessage()` in `form.js`
