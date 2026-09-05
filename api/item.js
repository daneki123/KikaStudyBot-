// Get one study item's full content (ownership-checked).
const { validateInitData, sb } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const user = validateInitData(body.initData || req.query.initData);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const id = req.query && req.query.id;
    if (!id) return res.status(400).json({ ok: false, error: 'bad_request' });

    const rows = await sb('GET', 'study_items', { filter: { id: `eq.${id}`, telegram_id: `eq.${user.id}` } });
    if (!rows || !rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
    const it = rows[0];
    return res.status(200).json({ ok: true, item: { id: it.id, type: it.type, content: it.content, created_at: it.created_at } });
  } catch (e) {
    console.error('item error:', e && e.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
