// User info + quota state (free actions remaining, premium status, referral).
const { validateInitData, getUser, upsertUser, quotaState, CFG } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const user = validateInitData(body.initData || req.query.initData);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

    let rows = await getUser(user.id);
    if (!rows || !rows.length) {
      await upsertUser({ telegram_id: user.id, username: user.username || null, first_name: user.first_name || null });
      rows = await getUser(user.id);
    }
    const u = rows[0];
    const q = quotaState(u);
    const lastBonus = u.last_bonus ? new Date(u.last_bonus).getTime() : 0;
    const adReady = !lastBonus || Date.now() - lastBonus >= CFG.AD_COOLDOWN_MS;

    return res.status(200).json({
      ok: true,
      user: { id: u.telegram_id, first_name: u.first_name, username: u.username },
      free_daily: CFG.FREE_DAILY_ACTIONS,
      used: q.used, bonus: q.bonus, remaining: q.remaining,
      is_premium: q.isPremium,
      premium_until: u.premium_until || null,
      reset_in_ms: Math.max(0, q.resetAt - Date.now()),
      ad_ready: adReady, ad_cooldown_ms: CFG.AD_COOLDOWN_MS, ad_bonus: CFG.AD_BONUS_ACTIONS,
      referrals: u.referrals_count || 0,
      referral_link: `https://t.me/${CFG.BOT_USERNAME}?start=ref${u.telegram_id}`,
      referral_bonus: CFG.REFERRAL_BONUS_ACTIONS,
      stars_price: CFG.STARS_PASS_PRICE, pass_days: CFG.PASS_DAYS,
      is_admin: String(user.id) === String(CFG.ADMIN_TELEGRAM_ID),
    });
  } catch (e) {
    console.error('me error:', e && e.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
