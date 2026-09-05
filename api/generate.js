// Generate study content: quiz (10 MCQs), summary, or simple explanation.
const { validateInitData, getUser, updateUser, sb, callLLM, parseQuiz, quotaState, PROMPTS, CFG } = require('./_lib');

module.exports = async (req, res) => {
  try {
    const body = req.body || {};
    const user = validateInitData(body.initData);
    if (!user) return res.status(401).json({ ok: false, error: 'unauthorized' });

    const mode = ['quiz', 'summary', 'simple'].includes(body.mode) ? body.mode : null;
    const materialId = Number(body.material_id);
    if (!mode || !materialId) return res.status(400).json({ ok: false, error: 'bad_request' });

    const rows = await getUser(user.id);
    if (!rows || !rows.length) return res.status(400).json({ ok: false, error: 'no_user' });
    const u = rows[0];

    const mats = await sb('GET', 'materials', { select: 'id,title,content', filter: { id: `eq.${materialId}`, telegram_id: `eq.${user.id}` } });
    if (!mats || !mats.length) return res.status(404).json({ ok: false, error: 'not_found' });
    const material = mats[0];

    // ---- quota (Study Pass = unlimited) ----
    const q = quotaState(u);
    if (!q.isPremium && q.remaining <= 0) {
      return res.status(200).json({ ok: false, error: 'quota', reset_in_ms: Math.max(0, q.resetAt - Date.now()) });
    }

    // ---- referral bonus: referrer earns +N on this user's first-ever generation ----
    const isFirst = (u.total_actions || 0) === 0;
    if (isFirst && u.referrer_id) {
      const ref = await getUser(u.referrer_id);
      if (ref && ref.length) {
        await updateUser(u.referrer_id, {
          bonus_actions: (ref[0].bonus_actions || 0) + CFG.REFERRAL_BONUS_ACTIONS,
          referrals_count: (ref[0].referrals_count || 0) + 1,
        });
      }
    }

    // ---- call the AI ----
    const prompt = `${PROMPTS[mode]}\n\n--- STUDY MATERIAL: "${material.title}" ---\n${material.content}`;
    let content;
    if (mode === 'quiz') {
      const raw = await callLLM(prompt, { json: true, maxTokens: 1600, system: 'You output only valid JSON.' });
      const questions = parseQuiz(raw);
      if (!questions) {
        console.error('quiz parse failed:', String(raw).slice(0, 200));
        return res.status(200).json({ ok: false, error: 'ai_error' });
      }
      content = JSON.stringify({ questions });
    } else {
      const text = await callLLM(prompt, { system: 'You are a helpful study assistant. Plain text only.' });
      if (!text) return res.status(200).json({ ok: false, error: 'ai_error' });
      content = text.trim();
    }

    // ---- save + charge one action (free while premium) ----
    const created = await sb('POST', 'study_items', {
      body: { material_id: materialId, telegram_id: user.id, type: mode, content },
      prefer: 'return=representation',
    });
    const patch = { total_actions: (u.total_actions || 0) + 1 };
    if (!q.isPremium) {
      patch.actions_used = q.used + 1;
      if (q.resetNeeded) patch.quota_reset_at = new Date(q.resetAt).toISOString();
    }
    await updateUser(user.id, patch);

    const after = quotaState({ ...u, ...patch });
    return res.status(200).json({ ok: true, mode, content, item_id: created && created[0] ? created[0].id : null, remaining: after.remaining });
  } catch (e) {
    console.error('generate error:', e && e.message);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
