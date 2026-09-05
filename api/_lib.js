// Kika — shared helpers: initData auth, Supabase REST, LLM calls, quota logic.
const crypto = require('crypto');

const CFG = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE,
  WEBAPP_URL: process.env.WEBAPP_URL,
  BOT_USERNAME: process.env.BOT_USERNAME || 'KikaStudyBot',
  ADMIN_TELEGRAM_ID: process.env.ADMIN_TELEGRAM_ID,

  // LLM — any OpenAI-compatible API (Groq recommended: fast + free tier)
  LLM_BASE_URL: process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1',
  LLM_API_KEY: process.env.LLM_API_KEY,
  LLM_MODEL: process.env.LLM_MODEL || 'llama-3.3-70b-versatile',

  // Quota — core studying is FREE daily; ads/referrals/Stars only add extra
  FREE_DAILY_ACTIONS: 5,
  AD_BONUS_ACTIONS: 2,
  AD_COOLDOWN_MS: 3 * 60 * 60 * 1000,
  REFERRAL_BONUS_ACTIONS: 3,
  STARS_PASS_PRICE: 300,   // Telegram Stars for a 30-day Study Pass
  PASS_DAYS: 30,
  MAX_MATERIAL_CHARS: 20000,
  MIN_MATERIAL_CHARS: 150,
  MAX_AGE_SEC: 24 * 60 * 60,
};

// ---------- Study prompts ----------
const PROMPTS = {
  summary: 'You are a study assistant. Summarize the study material below into clear, well-structured revision notes: short headings, bullet points, and the key facts a student must remember. Plain text only (no markdown symbols like ** or #). Keep it under 400 words.',
  quiz: 'You are a quiz creator. Create exactly 10 multiple-choice questions from the study material below. Return ONLY valid JSON in exactly this format with no other text: {"questions":[{"q":"question","options":["option A","option B","option C","option D"],"answer":0}]} where "answer" is the 0-based index of the correct option. Make questions test real understanding.',
  simple: 'You are a patient teacher. Explain the study material below in simple, easy language that a secondary school student can understand. Use short paragraphs and simple everyday analogies. Plain text only, no markdown.',
};

// ---------- Validate Telegram initData (HMAC-SHA256) ----------
function validateInitData(initData, botToken = CFG.BOT_TOKEN) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const userRaw = params.get('user');
  const authDate = params.get('auth_date');
  if (!hash || !userRaw || !authDate) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(authDate, 10) > CFG.MAX_AGE_SEC) return null;

  const dcs = [...params.entries()]
    .filter(([k]) => k !== 'hash')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
  if (calc !== hash) return null;

  try { return JSON.parse(userRaw); } catch { return null; }
}

// ---------- Supabase REST ----------
async function sb(method, table, { select = '*', filter, body, prefer } = {}) {
  const url = new URL(`${CFG.SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('select', select);
  if (filter) for (const [k, v] of Object.entries(filter)) url.searchParams.set(k, v);
  const headers = { apikey: CFG.SUPABASE_SERVICE_ROLE, Authorization: `Bearer ${CFG.SUPABASE_SERVICE_ROLE}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;
  const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  try { return JSON.parse(text); } catch { return text; }
}

const getUser = (id) => sb('GET', 'users', { filter: { telegram_id: `eq.${id}` } });
const upsertUser = (u) => sb('POST', 'users', { body: u, prefer: 'return=representation,resolution=merge-duplicates' });
const updateUser = (id, patch) => sb('PATCH', 'users', { filter: { telegram_id: `eq.${id}` }, body: patch, prefer: 'return=representation' });

// ---------- LLM ----------
async function callLLM(userContent, { json = false, maxTokens = 1200, system } = {}) {
  const r = await fetch(`${CFG.LLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CFG.LLM_API_KEY}` },
    body: JSON.stringify({
      model: CFG.LLM_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: userContent }],
      max_tokens: maxTokens,
      temperature: 0.5,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const data = await r.json();
  return (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || null;
}

// Defensively parse quiz JSON (strips code fences / stray text)
function parseQuiz(raw) {
  try {
    let t = String(raw).trim().replace(/```json|```/g, '');
    const m = t.match(/\{[\s\S]*\}/);
    if (m) t = m[0];
    const obj = JSON.parse(t);
    if (obj && Array.isArray(obj.questions) && obj.questions.length) {
      return obj.questions.filter((q) => q && q.q && Array.isArray(q.options) && q.options.length >= 2);
    }
  } catch (e) { /* fall through */ }
  return null;
}

// ---------- Quota ----------
function quotaState(u, now = Date.now()) {
  const premiumUntil = u.premium_until ? new Date(u.premium_until).getTime() : 0;
  const isPremium = premiumUntil > now;
  let used = u.actions_used || 0;
  const resetAt = u.quota_reset_at ? new Date(u.quota_reset_at).getTime() : 0;
  const resetNeeded = !resetAt || now >= resetAt;
  if (resetNeeded) used = 0;
  const bonus = u.bonus_actions || 0;
  const remaining = isPremium ? 99999 : Math.max(0, CFG.FREE_DAILY_ACTIONS - used + bonus);
  return { isPremium, used, bonus, remaining, resetNeeded, resetAt: resetAt || now + 24 * 3600 * 1000 };
}

module.exports = { CFG, PROMPTS, validateInitData, sb, getUser, upsertUser, updateUser, callLLM, parseQuiz, quotaState };
