// Owner-only stats: top users by lifetime AI actions.
const { validateInitData, sb, CFG } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const user = validateInitData(body.initData);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (String(user.id) !== String(CFG.ADMIN_TELEGRAM_ID)) return res.status(403).json({ ok: false, error: 'forbidden' });

    const rows = await sb('GET', 'users', {
      select: 'telegram_id,first_name,username,total_actions,premium_until,created_at',
      filter: { order: 'total_actions.desc', limit: '20' },
    });
    return res.status(200).json({ ok: true, top_users: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    console.error('admin error:', e && e.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
