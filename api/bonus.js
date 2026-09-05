// Optional rewarded-ad boost: +N extra AI actions on a cooldown.
// Core studying is free daily — this is the approval-friendly bonus pattern.
const { validateInitData, getUser, updateUser, quotaState, CFG } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const user = validateInitData(body.initData);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const rows = await getUser(user.id);
    if (!rows || !rows.length) return res.status(400).json({ ok: false, error: 'no_user' });
    const u = rows[0];

    const now = Date.now();
    const last = u.last_bonus ? new Date(u.last_bonus).getTime() : 0;
    if (last && now - last < CFG.AD_COOLDOWN_MS) {
      return res.status(200).json({ ok: false, error: 'cooldown', retry_in_ms: CFG.AD_COOLDOWN_MS - (now - last) });
    }

    const newBonus = (u.bonus_actions || 0) + CFG.AD_BONUS_ACTIONS;
    await updateUser(user.id, { bonus_actions: newBonus, last_bonus: new Date(now).toISOString() });

    const q = quotaState({ ...u, bonus_actions: newBonus }, now);
    return res.status(200).json({ ok: true, gained: CFG.AD_BONUS_ACTIONS, bonus: newBonus, remaining: q.remaining });
  } catch (e) {
    console.error('bonus error:', e && e.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
