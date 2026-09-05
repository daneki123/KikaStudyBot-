// Materials: list / detail (with generated items) / create from pasted text.
const { validateInitData, getUser, upsertUser, sb, CFG } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const user = validateInitData(body.initData || req.query.initData);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

    // POST → save pasted text as a new material
    if (req.method === 'POST') {
      const title = String(body.title || '').trim().slice(0, 80) || 'My notes';
      const text = String(body.text || '').trim().slice(0, CFG.MAX_MATERIAL_CHARS);
      if (text.length < CFG.MIN_MATERIAL_CHARS) {
        return res.status(200).json({ ok: false, error: 'too_short', min: CFG.MIN_MATERIAL_CHARS });
      }
      const created = await sb('POST', 'materials', {
        body: { telegram_id: user.id, title, content: text, source: 'paste' },
        prefer: 'return=representation',
      });
      return res.status(200).json({ ok: true, material: created && created[0] });
    }

    // GET ?id= → material detail + its generated study items (ownership-checked)
    const id = req.query && req.query.id;
    if (id) {
      const rows = await sb('GET', 'materials', { filter: { id: `eq.${id}`, telegram_id: `eq.${user.id}` } });
      if (!rows || !rows.length) return res.status(404).json({ ok: false, error: 'not_found' });
      const items = await sb('GET', 'study_items', {
        select: 'id,type,created_at',
        filter: { material_id: `eq.${id}`, order: 'created_at.desc', limit: '15' },
      });
      return res.status(200).json({ ok: true, material: rows[0], items: Array.isArray(items) ? items : [] });
    }

    // GET → list user's materials
    const rows = await sb('GET', 'materials', {
      select: 'id,title,source,created_at',
      filter: { telegram_id: `eq.${user.id}`, order: 'created_at.desc', limit: '50' },
    });
    return res.status(200).json({ ok: true, materials: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    console.error('materials error:', e && e.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
