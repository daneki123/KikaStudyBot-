// Study Pass — buy with Telegram Stars (XTR). Sends an invoice to the user's bot chat;
// webhook.js handles pre_checkout_query + successful_payment and activates the pass.
const { validateInitData, getUser, CFG } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const user = validateInitData(body.initData);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const rows = await getUser(user.id);
    if (!rows || !rows.length) return res.status(400).json({ ok: false, error: 'no_user' });
    const u = rows[0];
    const premiumUntil = u.premium_until ? new Date(u.premium_until).getTime() : 0;
    if (premiumUntil > Date.now()) {
      return res.status(200).json({ ok: false, error: 'already_premium' });
    }

    const r = await fetch(`https://api.telegram.org/bot${CFG.BOT_TOKEN}/sendInvoice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: user.id,
        title: `Kika Study Pass — ${CFG.PASS_DAYS} days`,
        description: `Unlimited AI quizzes, summaries and simple explanations for ${CFG.PASS_DAYS} days.`,
        payload: `studypass_${user.id}_${Date.now()}`,
        currency: 'XTR',
        prices: [{ label: `Study Pass (${CFG.PASS_DAYS} days)`, amount: CFG.STARS_PASS_PRICE }],
      }),
    });
    const sent = await r.json();
    if (!sent.ok) {
      console.error('sendInvoice failed:', JSON.stringify(sent));
      return res.status(200).json({ ok: false, error: 'invoice_failed' });
    }
    return res.status(200).json({ ok: true, message: 'Check your chat with the bot to pay with Stars ⭐' });
  } catch (e) {
    console.error('stars error:', e && e.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
