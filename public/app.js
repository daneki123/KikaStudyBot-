// ===== Kika — Study with AI =====
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
const $ = (id) => document.getElementById(id);
let ME = null;
let MATERIALS = [];
let currentMaterial = null;
let currentItems = [];
let currentItem = null;
let quiz = null;
const DEMO = !tg || !tg.initData;

// ================= CONFIG =================
const ADSGRAM_BLOCK_ID = 'YOUR_ADSGRAM_BLOCK_ID'; // ←←← paste your AdsGram block ID
const ADSGRAM_DEBUG = true; // true = test ads while checking; false for production
// ==========================================

// ---------- AdsGram ----------
let _adsgram = null;
function initAds() {
  try {
    if (window.Adsgram && ADSGRAM_BLOCK_ID !== 'YOUR_ADSGRAM_BLOCK_ID') {
      _adsgram = window.Adsgram.init({ blockId: ADSGRAM_BLOCK_ID, debug: ADSGRAM_DEBUG });
    }
  } catch (e) { console.warn('AdsGram init failed', e); }
}
function showRewardedAd() {
  return new Promise((resolve) => {
    if (!_adsgram) { console.log('[mock ad] add your AdsGram blockId to go live'); setTimeout(() => resolve(true), 1200); return; }
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      _adsgram.addEventListener('onError', () => finish(false));
      _adsgram.addEventListener('onBannerNotFound', () => finish(false));
    } catch (e) {}
    _adsgram.show().then(() => finish(true)).catch(() => finish(false));
  });
}

// ---------- Helpers ----------
const api = async (path, body) => {
  const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
};
const initData = () => (tg ? tg.initData : '');
function fmtCountdown(ms){const s=Math.ceil(ms/1000),h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;return h?`${h}h ${m}m`:`${m}m ${x}s`}
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
// ---------- Telegram SDK: haptics + toast notifications ----------
const tap = (style = 'light') => { try { tg?.HapticFeedback?.impactOccurred(style); } catch {} };  // press feedback
const hap = (t) => { try { tg?.HapticFeedback?.notificationOccurred(t); } catch {} };              // outcome feedback
// every interactive press (buttons, tabs, material cards, list rows, CTAs) -> light impact
document.addEventListener('click', (e) => {
  if (e.target.closest('button, .mat-card, .wd-item')) tap('light');
}, true);
// bottom-of-screen toast — replaces browser alerts for transient feedback
function toast(msg, type = 'success') {
  let holder = $('toastHolder');
  if (!holder) { holder = document.createElement('div'); holder.id = 'toastHolder'; document.body.appendChild(holder); }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icon = type === 'error' ? '!' : type === 'info' ? '•' : '✓';
  el.innerHTML = `<span class="toast-ic">${icon}</span><span>${msg}</span>`;
  holder.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 2600);
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const MODE_META = { quiz: { t: '🧠 Quiz', ic: '🧠' }, summary: { t: '📝 Summary', ic: '📝' }, simple: { t: '💡 Simple explanation', ic: '💡' } };

// ---------- Skeletons & empty states ----------
const SVG_DOC = `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M32 18h22l12 12v40a4 4 0 0 1-4 4H32a4 4 0 0 1-4-4V22a4 4 0 0 1 4-4Z" fill="#fff"/>
  <path d="M54 18v8a4 4 0 0 0 4 4h8"/>
  <path d="M36 42h20M36 50h16M36 58h20" opacity=".55" stroke-width="2"/>
  <path d="M14 34h6M12 48h5M78 30h6M80 44h5" opacity=".3" stroke-width="2"/>
</svg>`;
const SVG_FOLDER = `<svg viewBox="0 0 96 96" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="34" y="20" width="26" height="18" rx="3" fill="#fff"/>
  <path d="M40 27h12M40 32h8" opacity=".55" stroke-width="2"/>
  <path d="M16 38h22l6 6h32a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V42a4 4 0 0 1 4-4Z" fill="#fff"/>
</svg>`;
function emptyState(kind) {
  if (kind === 'materials') {
    return `<div class="card"><div class="empty">${SVG_DOC}
      <div class="empty-t">No materials yet</div>
      <div class="empty-s">Send a PDF to the bot in chat — or paste your notes below — and they'll become quizzes and summaries.</div>
      <button class="btn-grad empty-cta" data-action="upload">📄 Upload a PDF</button>
    </div></div>`;
  }
  return `<div class="empty">${SVG_FOLDER}
    <div class="empty-t">Nothing generated yet</div>
    <div class="empty-s">Turn this material into a quiz, a summary, or a simple explanation.</div>
    <button class="btn-grad empty-cta" data-action="gen-quiz">🧠 Make your first quiz</button>
  </div>`;
}
function wireEmpty(scope) {
  (scope || document).querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.action === 'upload') {
      const bot = ME && ME.referral_link ? ME.referral_link.split('?')[0].replace('https://t.me/', '') : '';
      if (!bot) return;
      const url = `https://t.me/${bot}`;
      if (tg && tg.openTelegramLink) tg.openTelegramLink(url); else window.open(url, '_blank');
    } else if (b.dataset.action === 'gen-quiz') {
      const q = document.querySelector('.gen-btn[data-mode="quiz"]');
      if (q) q.click();
    }
  }));
}

// ---------- Tabs + internal views ----------
document.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => go(el.dataset.go)));
function go(screen) {
  if (!document.querySelector('.screen[data-screen="' + screen + '"]')) { showNotFound(); return; } // unmatched route → 404
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === screen));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.go === screen));
  if (screen === 'boost') renderBoost();
  if (screen === 'admin') DEMO ? ($('adminList').innerHTML = '<div class="muted">Admin stats appear here for the owner.</div>') : loadAdmin();
  try { if (location.hash.indexOf('tgWebAppData') === -1 && location.hash !== '#/' + screen) location.hash = '#/' + screen; } catch (e) {} // sync URL (never clobber Telegram's fragment)
  $('screens').scrollTop = 0;
}
document.querySelectorAll('[data-back]').forEach((el) => el.addEventListener('click', () => showView(el.dataset.back)));
function showView(v) {
  $('viewList').hidden = v !== 'list';
  $('viewDetail').hidden = v !== 'detail';
  $('viewItem').hidden = v !== 'item';
  $('screens').scrollTop = 0;
}

// ---------- Router (hash routes) + 404 + error boundary ----------
const ROUTES = { study: 'study', boost: 'boost', admin: 'admin' };
function showNotFound() {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.dataset.screen === 'notfound'));
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  $('screens').scrollTop = 0;
}
function handleRoute() {
  const raw = location.hash || '';
  // Telegram passes its own data in the fragment (#tgWebAppData=…) — that is NOT a route. Treat it as Home.
  if (!raw || raw === '#' || raw.toLowerCase().indexOf('tgwebappdata') !== -1) { go('study'); return; }
  const h = raw.replace(/^#\/?/, '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ROUTES, h)) go(ROUTES[h]);
  else showNotFound(); // genuinely unmatched URL → 404 view
}
window.addEventListener('hashchange', handleRoute);
// error boundary — catch fatal errors instead of a frozen screen
let errLastShown = 0;
function showErrorBoundary(detail) {
  if (Date.now() - errLastShown < 3000) return; // ignore error storms
  errLastShown = Date.now();
  $('errDetail').textContent = String(detail || '');
  $('errBoundary').hidden = false;
}
window.addEventListener('error', (e) => { if (e && e.message) showErrorBoundary(e.message + (e.filename ? '\n' + e.filename + ':' + e.lineno : '')); });
window.addEventListener('unhandledrejection', (e) => showErrorBoundary(e.reason && (e.reason.stack || e.reason.message) || e.reason));
$('nfHomeBtn').addEventListener('click', () => go('study'));
$('errHomeBtn').addEventListener('click', () => { $('errBoundary').hidden = true; go('study'); });
$('errReloadBtn').addEventListener('click', () => location.reload());

// ---------- Quota ----------
function renderQuota(remaining, premium) {
  $('quotaPill').textContent = premium ? '⭐ PASS' : `${remaining} left`;
  $('quotaPill').classList.toggle('low', !premium && remaining <= 1);
}
function renderBoost() {
  if (!ME) return;
  $('boostRemaining').textContent = ME.is_premium ? '∞' : ME.remaining;
  $('boostUsed').textContent = ME.used;
  $('boostBonus').textContent = `+${ME.bonus}`;
  $('boostReset').textContent = ME.is_premium ? 'Study Pass active — enjoy unlimited actions!' : `Free actions reset in ${fmtCountdown(ME.reset_in_ms)}.`;
  $('premiumBadge').hidden = !ME.is_premium;
  $('starsBtn').hidden = ME.is_premium;
  $('passDesc').textContent = ME.is_premium ? `Unlimited until ${ME.premium_until ? ME.premium_until.slice(0, 10) : ''}.` : `Unlimited AI actions for ${ME.pass_days} days.`;
  $('starsBtn').textContent = `⭐ Get Study Pass — ${ME.stars_price} Stars`;
  $('adBonusLabel').textContent = `+${ME.ad_bonus}`;
  $('refBonusLabel').textContent = `+${ME.referral_bonus}`;
  $('refLink').value = ME.referral_link || '';
  $('refCount').textContent = ME.referrals || 0;
}

// ---------- Load ----------
async function load() {
  if (DEMO) return demoMode();
  const me = await api('/api/me', { initData: initData() });
  if (!me.ok) { $('matList').textContent = 'Open inside Telegram to use Kika.'; return; }
  ME = me; renderQuota(me.remaining, me.is_premium);
  if (me.is_admin) $('adminTab').hidden = false;
  loadMaterials();
}

// ---------- Materials: list ----------
async function loadMaterials() {
  const data = await api('/api/materials', { initData: initData() });
  const box = $('matList');
  if (!data.ok || !data.materials || !data.materials.length) {
    box.innerHTML = emptyState('materials');
    wireEmpty(box);
    return;
  }
  MATERIALS = data.materials;
  box.innerHTML = data.materials.map((m) => `
    <div class="card mat-card" data-id="${m.id}">
      <div class="mat-row">
        <span class="mat-ic">${m.source === 'pdf' ? '📄' : '✍️'}</span>
        <div><b>${esc(m.title)}</b><br><span class="muted" style="margin:0">${fmtDate(m.created_at)} · ${m.source === 'pdf' ? 'PDF' : 'pasted'}</span></div>
        <span class="chev">›</span>
      </div>
    </div>`).join('');
  box.querySelectorAll('.mat-card').forEach((c) => c.addEventListener('click', () => openMaterial(Number(c.dataset.id))));
}

// ---------- Materials: add (paste) ----------
$('addMatBtn').addEventListener('click', async () => {
  const title = $('matTitle').value.trim();
  const text = $('matText').value.trim();
  if (text.length < 150) { $('matStatus').textContent = `Please paste at least 150 characters (you have ${text.length}).`; return; }
  $('addMatBtn').disabled = true; $('matStatus').textContent = 'Saving…';
  if (DEMO) {
    hap('success'); toast('Material saved (preview)');
    $('matTitle').value = ''; $('matText').value = '';
    MATERIALS.unshift({ id: Date.now(), title: title || 'My notes', source: 'paste', created_at: new Date().toISOString() });
    renderMaterialsLocal(); $('addMatBtn').disabled = false; return;
  }
  const data = await api('/api/materials', { initData: initData(), title, text });
  if (data.ok) { hap('success'); toast('Material saved ✓'); $('matStatus').textContent = ''; $('matTitle').value = ''; $('matText').value = ''; loadMaterials(); }
  else if (data.error === 'too_short') $('matStatus').textContent = `Please paste at least ${data.min} characters.`;
  else $('matStatus').textContent = 'Could not save. Try again.';
  $('addMatBtn').disabled = false;
});
function renderMaterialsLocal() {
  const box = $('matList');
  box.innerHTML = MATERIALS.map((m) => `<div class="card mat-card" style="margin:0 16px 14px"><div class="mat-row"><span class="mat-ic">${m.source === 'pdf' ? '📄' : '✍️'}</span><div><b>${esc(m.title)}</b><br><span class="muted" style="margin:0">${fmtDate(m.created_at)}</span></div><span class="chev">›</span></div></div>`).join('');
  box.querySelectorAll('.mat-card').forEach((c) => c.addEventListener('click', () => openMaterial(Number(c.dataset.id))));
}

// ---------- Material detail ----------
async function openMaterial(id) {
  if (DEMO) { demoDetail(); return; }
  const data = await api(`/api/materials?id=${id}`, { initData: initData() });
  if (!data.ok) return;
  currentMaterial = data.material;
  currentItems = data.items || [];
  renderDetail();
  showView('detail');
}
function renderDetail() {
  $('detailTitle').textContent = currentMaterial.title;
  $('detailText').textContent = currentMaterial.content.slice(0, 2000) + (currentMaterial.content.length > 2000 ? '…' : '');
  $('itemList').innerHTML = currentItems.length
    ? currentItems.map((it) => `<div class="wd-item item-row" data-id="${it.id}" data-type="${it.type}"><div><b>${MODE_META[it.type] ? MODE_META[it.type].t : it.type}</b><br><span class="muted" style="margin:0">${fmtDate(it.created_at)}</span></div><span class="chev">›</span></div>`).join('')
    : emptyState('items');
  if (!currentItems.length) wireEmpty($('itemList'));
  $('itemList').querySelectorAll('.item-row').forEach((r) => r.addEventListener('click', () => openItem(Number(r.dataset.id), r.dataset.type)));
}

// ---------- Generate (quiz / summary / simple) ----------
document.querySelectorAll('.gen-btn').forEach((b) => b.addEventListener('click', async () => {
  const mode = b.dataset.mode;
  if (!currentMaterial) return;
  document.querySelectorAll('.gen-btn').forEach((x) => (x.disabled = true));
  $('genStatus').textContent = '🪄 Working… (this can take a few seconds)';
  tap('medium');

  if (DEMO) { demoGenerate(mode); return; }

  const data = await api('/api/generate', { initData: initData(), material_id: currentMaterial.id, mode });
  document.querySelectorAll('.gen-btn').forEach((x) => (x.disabled = false));

  if (data.ok) {
    hap('success'); toast(`${MODE_META[mode].ic} ${MODE_META[mode].t} ready`);
    ME.remaining = data.remaining; renderQuota(ME.remaining, ME.is_premium);
    currentItem = { id: data.item_id, type: mode, content: data.content };
    openMaterial(currentMaterial.id); // refresh items list
    renderItem();
  } else if (data.error === 'quota') {
    $('genStatus').innerHTML = '😖 Out of free actions — reset in ' + fmtCountdown(data.reset_in_ms) + '.<br>Get more instantly in the <b>⚡ BOOST</b> tab (ad, Stars or invite).';
  } else if (data.error === 'ai_error') {
    $('genStatus').textContent = '⚠️ The AI hiccuped — try again (you were not charged).';
  } else {
    $('genStatus').textContent = '⚠️ Something went wrong. Try again.';
  }
}));

// ---------- Item rendering ----------
function openItem(id, type) {
  if (DEMO) { renderItem(); return; }
  // items list only carries ids — fetch item content directly
  $('itemTitle').textContent = (MODE_META[type] || { t: type }).t;
  $('itemBody').innerHTML = '<div class="sk-stack"><div class="sk sk-line"></div><div class="sk sk-line w90"></div><div class="sk sk-line w70"></div><div class="sk sk-line w50"></div></div>';
  showView('item');
  api(`/api/item?id=${id}`, { initData: initData() }).then((data) => {
    if (!data.ok) { $('itemBody').innerHTML = '<div class="muted">⚠️ Could not load this item.</div>'; return; }
    currentItem = { id, type: data.item.type, content: data.item.content };
    renderItem();
  });
}
function renderItem() {
  const meta = MODE_META[currentItem.type] || { t: currentItem.type };
  $('itemTitle').textContent = meta.t;
  const body = $('itemBody');
  if (currentItem.type === 'quiz') {
    let qs;
    try { qs = JSON.parse(currentItem.content).questions; } catch (e) { qs = null; }
    if (!qs) { body.innerHTML = '<div class="muted">⚠️ Quiz failed to load. Try generating again.</div>'; showView('item'); return; }
    quiz = { qs, i: 0, score: 0, answered: false };
    renderQuizIntro(qs.length);
  } else {
    body.innerHTML = `<div class="ai-text">${esc(currentItem.content)}</div>`;
  }
  showView('item');
}
function renderQuizIntro(n) {
  $('itemBody').innerHTML = `
    <div class="card-h">Ready?</div>
    <div class="muted">${n} questions · tap an answer · instant scoring</div>
    <button class="btn-grad" id="quizStart">▶ Start quiz</button>`;
  $('quizStart').addEventListener('click', renderQuestion);
}
function renderQuestion() {
  const { qs, i } = quiz;
  const q = qs[i];
  $('itemBody').innerHTML = `
    <div class="q-count">Question ${i + 1} / ${qs.length}</div>
    <div class="q-text">${esc(q.q)}</div>
    ${q.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join('')}
    <div id="qFeedback" class="muted"></div>`;
  $('itemBody').querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => answerQuiz(Number(b.dataset.k))));
}
function answerQuiz(k) {
  if (quiz.answered) return;
  quiz.answered = true;
  const { qs, i } = quiz;
  const correct = qs[i].answer;
  const buttons = $('itemBody').querySelectorAll('.opt');
  buttons[correct].classList.add('correct');
  if (k === correct) { quiz.score++; hap('success'); $('qFeedback').textContent = '✅ Correct!'; }
  else { buttons[k].classList.add('wrong'); hap('error'); $('qFeedback').textContent = '❌ Not quite — the correct answer is highlighted.'; }
  const next = document.createElement('button');
  next.className = 'btn-grad';
  next.textContent = i + 1 < qs.length ? 'Next question →' : 'See my score 🏁';
  next.addEventListener('click', () => {
    quiz.i++; quiz.answered = false;
    quiz.i < quiz.qs.length ? renderQuestion() : renderQuizResult();
  });
  $('itemBody').appendChild(next);
}
function renderQuizResult() {
  const pct = Math.round((quiz.score / quiz.qs.length) * 100);
  $('itemBody').innerHTML = `
    <div class="score-hero">${quiz.score}<span>/${quiz.qs.length}</span></div>
    <div class="muted" style="text-align:center;margin:0 0 10px">${pct >= 80 ? '🏆 Excellent — you know this!' : pct >= 50 ? '💪 Good — review the misses and try again.' : '📖 Keep studying — generate the summary and retry.'}</div>
    <button class="btn-grad" id="quizRetry">↻ Retake quiz</button>`;
  $('quizRetry').addEventListener('click', () => { quiz.i = 0; quiz.score = 0; quiz.answered = false; renderQuestion(); });
  hap(pct >= 50 ? 'success' : 'warning');
}

// ---------- Boost: ad / stars / referral ----------
$('adBtn').addEventListener('click', async () => {
  $('adBtn').disabled = true; $('adStatus').textContent = 'Loading ad…';
  const ok = await showRewardedAd();
  if (!ok) { $('adStatus').textContent = 'Ad skipped or unavailable.'; $('adBtn').disabled = false; return; }
  if (DEMO) { hap('success'); toast('+2 actions added 🎉'); ME.remaining += 2; ME.bonus += 2; renderQuota(ME.remaining, false); $('adBtn').disabled = false; return; }
  const data = await api('/api/bonus', { initData: initData() });
  if (data.ok) { hap('success'); toast(`+${data.gained} actions added 🎉`); ME.remaining = data.remaining; ME.bonus = data.bonus; renderQuota(ME.remaining, ME.is_premium); $('adStatus').textContent = ''; }
  else if (data.error === 'cooldown') $('adStatus').textContent = 'Ad ready again in ' + fmtCountdown(data.retry_in_ms);
  else $('adStatus').textContent = 'Try again later.';
  $('adBtn').disabled = false;
});
$('starsBtn').addEventListener('click', async () => {
  $('starsBtn').disabled = true; $('starsStatus').textContent = 'Opening invoice…';
  if (DEMO) { toast('Preview mode — purchases work on the live app', 'info'); $('starsBtn').disabled = false; return; }
  const data = await api('/api/stars', { initData: initData() });
  if (data.ok) { toast('Check the bot chat to pay with Stars ⭐', 'info'); $('starsStatus').textContent = ''; }
  else if (data.error === 'already_premium') $('starsStatus').textContent = 'You already have an active pass ⭐';
  else $('starsStatus').textContent = 'Could not create invoice. Try again.';
  $('starsBtn').disabled = false;
});
$('copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('refLink').value); $('copyBtn').textContent = 'Copied!'; hap('success'); toast('Invite link copied'); setTimeout(() => ($('copyBtn').textContent = 'Copy'), 1500); }
  catch { $('refLink').select(); document.execCommand('copy'); }
});

// ---------- Admin ----------
async function loadAdmin() {
  const data = await api('/api/admin', { initData: initData() });
  const box = $('adminList');
  if (!data.ok) { box.textContent = 'Admin only.'; return; }
  box.innerHTML = data.top_users.length
    ? data.top_users.map((u, i) => `<div class="wd-item"><div><b>${esc(u.first_name || u.username || 'Anon')}</b> ${u.premium_until && new Date(u.premium_until) > new Date() ? '⭐' : ''}<br><span class="muted" style="margin:0">${u.total_actions || 0} AI actions</span></div><span class="badge paid">#${i + 1}</span></div>`).join('')
    : '<div class="muted">No users yet.</div>';
}

// ---------- DEMO mode ----------
function demoMode() {
  ME = { remaining: 4, used: 1, bonus: 0, free_daily: 5, is_premium: false, reset_in_ms: 3600000, ad_bonus: 2, referral_bonus: 3, referrals: 2, referral_link: 'https://t.me/KikaStudyBot?start=ref123', stars_price: 300, pass_days: 30 };
  renderQuota(ME.remaining, false);
  MATERIALS = [
    { id: 1, title: 'Biology — Photosynthesis', source: 'pdf', created_at: new Date().toISOString() },
    { id: 2, title: 'Economics — Demand & Supply', source: 'paste', created_at: new Date(Date.now() - 86400000).toISOString() },
  ];
  renderMaterialsLocal();
}
function demoDetail() {
  currentMaterial = { id: 1, title: 'Biology — Photosynthesis', content: 'Photosynthesis is the process by which green plants use sunlight, water and carbon dioxide to make glucose (food) and oxygen. It happens in the chloroplasts, which contain chlorophyll — the green pigment that captures light energy. The equation: 6CO2 + 6H2O + light → C6H12O6 + 6O2. It has two stages: the light-dependent reactions (in the thylakoid membranes) produce ATP and NADPH and split water to release oxygen; the Calvin cycle (light-independent, in the stroma) uses that ATP and NADPH to fix carbon dioxide into glucose. Factors that affect the rate: light intensity, carbon dioxide concentration, and temperature.' };
  currentItems = [];
  renderDetail();
  showView('detail');
}
function demoGenerate(mode) {
  document.querySelectorAll('.gen-btn').forEach((x) => (x.disabled = false));
  hap('success'); toast(`${MODE_META[mode].ic} ${MODE_META[mode].t} ready (preview)`);
  ME.remaining = Math.max(0, ME.remaining - 1); renderQuota(ME.remaining, false);
  if (mode === 'quiz') {
    currentItem = { type: 'quiz', content: JSON.stringify({ questions: [
      { q: 'Where does photosynthesis happen in a plant cell?', options: ['Nucleus', 'Chloroplast', 'Mitochondria', 'Cell wall'], answer: 1 },
      { q: 'Which pigment captures light energy?', options: ['Haemoglobin', 'Melanin', 'Chlorophyll', 'Keratin'], answer: 2 },
      { q: 'What gas is released as a by-product?', options: ['Carbon dioxide', 'Nitrogen', 'Hydrogen', 'Oxygen'], answer: 3 },
    ] }) };
  } else if (mode === 'summary') {
    currentItem = { type: 'summary', content: 'PHOTOSYNTHESIS — KEY POINTS\n\n• Definition: green plants make glucose (food) from sunlight, water and CO2; oxygen is released.\n• Location: chloroplasts, which contain chlorophyll (the green light-capturing pigment).\n• Equation: 6CO2 + 6H2O + light → C6H12O6 + 6O2.\n• Stage 1 (light-dependent, thylakoid membranes): makes ATP + NADPH, splits water → oxygen.\n• Stage 2 (Calvin cycle, stroma): uses ATP + NADPH to fix CO2 into glucose.\n• Rate depends on: light intensity, CO2 concentration, temperature.' };
  } else {
    currentItem = { type: 'simple', content: 'Think of a leaf as a tiny solar-powered kitchen ☀️🍳.\n\nThe plant captures sunlight (like a solar panel), drinks water from its roots, and breathes in carbon dioxide from the air. Inside special green rooms in its cells (chloroplasts), it mixes these ingredients to cook its own food — a sugar called glucose. While cooking, it releases oxygen as "kitchen exhaust" — which is exactly the air we breathe!\n\nSo every time you take a breath, thank a plant. 🌱' };
  }
  currentItem.id = 'demo';
  renderItem();
}

// ---------- Theme (light / dark) ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  const btn = $('themeBtn'); if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
  try { localStorage.setItem('kika-theme', t); } catch (e) {}
  try { if (tg && tg.setBackgroundColor) tg.setBackgroundColor(t === 'dark' ? '#0B1120' : '#F6F4EE'); } catch (e) {} // blend Telegram chrome
}
(function initTheme() {
  let t = 'light';
  try { t = localStorage.getItem('kika-theme') || 'light'; } catch (e) {}
  applyTheme(t);
})();
$('themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

// ---------- Boot ----------
initAds();
load();
handleRoute(); // route the initial URL (deep links work; unknown → 404)
