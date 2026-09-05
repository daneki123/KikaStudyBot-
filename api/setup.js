// ONE-CLICK health check + webhook auto-repair (the "Doctor Button").
// Visit: https://your-app.vercel.app/api/setup?key=YOUR_ADMIN_TELEGRAM_ID
const { CFG, sb } = require('./_lib');

module.exports = async (req, res) => {
  const report = { ok: true, checks: {} };
  const key = (req.query && req.query.key) || '';
  if (!CFG.ADMIN_TELEGRAM_ID || String(key) !== String(CFG.ADMIN_TELEGRAM_ID)) {
    return res.status(403).json({ ok: false, error: 'Wrong or missing ?key= — use your ADMIN_TELEGRAM_ID' });
  }

  // 1. Env vars
  const envOk = !!(CFG.BOT_TOKEN && CFG.SUPABASE_URL && CFG.SUPABASE_SERVICE_ROLE && CFG.WEBAPP_URL && CFG.BOT_USERNAME && CFG.LLM_API_KEY);
  report.checks.env_vars = envOk ? 'OK — all 6 env vars set' : 'FAIL — check Vercel env vars (see .env.example)';
  if (!envOk) report.ok = false;

  // 2. Bot token
  if (CFG.BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${CFG.BOT_TOKEN}/getMe`);
      const me = await r.json();
      report.checks.bot_token = me.ok ? `OK — talking to @${me.result.username}` : 'FAIL — token rejected';
      if (!me.ok) report.ok = false;
    } catch (e) { report.checks.bot_token = `FAIL — ${e.message}`; report.ok = false; }
  }

  // 3. Database
  try {
    const r = await sb('GET', 'users', { select: 'telegram_id', filter: { limit: '1' } });
    report.checks.database = Array.isArray(r) ? 'OK — Supabase connected' : `PROBLEM — ${JSON.stringify(r).slice(0, 140)}`;
  } catch (e) {
    report.checks.database = `FAIL — ${e.message} — if Supabase is PAUSED, open supabase.com and click Restore.`;
    report.ok = false;
  }

  // 4. AI reachable
  if (CFG.LLM_API_KEY && CFG.LLM_BASE_URL) {
    try {
      const r = await fetch(`${CFG.LLM_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CFG.LLM_API_KEY}` },
        body: JSON.stringify({ model: CFG.LLM_MODEL, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      });
      const data = await r.json();
      report.checks.ai = data && data.choices ? `OK — AI replied (model: ${CFG.LLM_MODEL})` : `FAIL — ${JSON.stringify(data).slice(0, 140)}`;
      if (!data.choices) report.ok = false;
    } catch (e) { report.checks.ai = `FAIL — ${e.message}`; report.ok = false; }
  }

  // 5. Auto-fix webhook (correct URL built from env — typos impossible)
  if (CFG.BOT_TOKEN && CFG.WEBAPP_URL) {
    try {
      const correctUrl = `${CFG.WEBAPP_URL.replace(/\/+$/, '')}/api/webhook`;
      const r = await fetch(`https://api.telegram.org/bot${CFG.BOT_TOKEN}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: correctUrl }),
      });
      const set = await r.json();
      report.checks.webhook_fixed = set.ok ? `OK — webhook set to ${correctUrl}` : `FAIL — ${JSON.stringify(set)}`;
      if (!set.ok) report.ok = false;
    } catch (e) { report.checks.webhook_fixed = `FAIL — ${e.message}`; report.ok = false; }
  }

  // 6. Read back webhook status
  if (CFG.BOT_TOKEN) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${CFG.BOT_TOKEN}/getWebhookInfo`);
      const info = await r.json();
      const w = info.result || {};
      report.checks.webhook_status = {
        url: w.url,
        pending_updates: w.pending_update_count,
        last_error: w.last_error_message ? `${w.last_error_message} @ ${new Date((w.last_error_date || 0) * 1000).toISOString()}` : 'none',
      };
    } catch (e) { report.checks.webhook_status = `FAIL — ${e.message}`; }
  }

  report.next_step = report.ok ? 'All healthy — send /start to the bot, then send it a PDF to test!' : 'Fix the FAIL items above, then visit this URL again.';
  return res.status(200).json(report);
};
