# 🟢 Kika — Start Here

**Kika** turns any notes or PDF into AI quizzes, summaries and simple explanations — inside Telegram. The approval-friendly model: **studying is free (5 AI actions daily)**; rewarded ads, referrals and Stars only ADD more. ✅

## STEP 1 — Create the bot (2 min)
1. Telegram → **@BotFather** → `/newbot`
2. Name: `Kika` → username e.g. `KikaStudyBot` → copy the **token** = `BOT_TOKEN`

## STEP 2 — Free AI key (3 min)
1. **[console.groq.com](https://console.groq.com)** → sign up (free, no card)
2. **API Keys → Create API Key** → copy (`gsk_...`) = `LLM_API_KEY`
3. Defaults are preconfigured (Groq + `llama-3.3-70b-versatile`)

## STEP 3 — Database (2 min — reuse your Supabase)
1. Open your existing **Supabase** project (or create one)
2. **SQL Editor** → paste `schema.sql` → **Run** (creates `users`, `materials`, `study_items`)
3. **Settings → API** → copy **Project URL** + **service_role secret**

## STEP 4 — Deploy (5 min)
1. New GitHub repo (e.g. `kika`) → upload everything in this folder (`api/` + `public/` at top level)
2. **vercel.com** → Add New → Project → import → **Deploy**
3. Copy your URL = `WEBAPP_URL`

## STEP 5 — Env vars (Vercel → Settings → Environment Variables)
`BOT_TOKEN` · `BOT_USERNAME` · `WEBAPP_URL` · `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE` · `ADMIN_TELEGRAM_ID` · `LLM_BASE_URL` (`https://api.groq.com/openai/v1`) · `LLM_API_KEY` · `LLM_MODEL` (`llama-3.3-70b-versatile`)

Then **Redeploy**.

## STEP 6 — Doctor Button
Visit (and bookmark):
```
https://your-app.vercel.app/api/setup?key=YOUR_ADMIN_TELEGRAM_ID
```
All ✅ = bot connected, DB alive, AI answering.

## STEP 7 — Test 🎉
1. `/start` the bot → welcome + **⚡ Open Kika**
2. **Send the bot a PDF** (any lecture/handout) → it replies "Added ✅"
3. Open Kika → your PDF is there → tap → **🧠 Quiz** → 10 questions appear
4. Try **📝 Summary** and **💡 Simplify**

## STEP 8 — Monetization (after it works)
- **AdsGram:** add the app → block ID into `public/app.js` (`ADSGRAM_BLOCK_ID`), `ADSGRAM_DEBUG = false`. Suggested description:
  > *"Kika is a free AI study tool. Users upload their own notes/PDFs and get quizzes and summaries. 5 free AI actions daily; rewarded ads (optional) give +2 extra. Core studying is free without ads."*
- **Stars:** already built — the ⭐ Study Pass (300 Stars / 30 days) sends an invoice in chat and auto-activates.

## 💡 Marketing hook (your one-liner)
> **"Stop re-reading. Send me your PDF — get a quiz in 10 seconds."**

Post it in student groups, class WhatsApps, tutorial centres. JAMB/WAEC/university students with heavy handouts are the core market.
