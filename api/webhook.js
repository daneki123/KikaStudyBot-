// Kika bot webhook: /start + referral, PDF upload → material, Stars payments.
const { CFG, getUser, upsertUser, updateUser } = require('./_lib');
// direct require skips pdf-parse's debug harness (safe for serverless)
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${CFG.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return r.json();
}
async function downloadFile(fileId) {
  const info = await tg('getFile', { file_id: fileId });
  if (!info.ok) throw new Error('getFile failed');
  const url = `https://api.telegram.org/file/bot${CFG.BOT_TOKEN}/${info.result.file_path}`;
  const r = await fetch(url);
  return Buffer.from(await r.arrayBuffer());
}

module.exports = async (req, res) => {
  try {
    const update = req.body || {};

    // ---- Telegram Stars: pre-checkout (must be answered instantly) ----
    if (update.pre_checkout_query) {
      await tg('answerPreCheckoutQuery', { pre_checkout_query_id: update.pre_checkout_query.id, ok: true });
      return res.status(200).json({ ok: true });
    }

    // ---- Telegram Stars: payment success → activate Study Pass ----
    const pm = update.message && update.message.successful_payment;
    if (pm) {
      const uid = update.message.from.id;
      const until = new Date(Date.now() + CFG.PASS_DAYS * 24 * 3600 * 1000).toISOString();
      await upsertUser({ telegram_id: uid, premium_until: until });
      await updateUser(uid, { premium_until: until });
      await tg('sendMessage', {
        chat_id: uid,
        text: `🎉 Study Pass activated!\n\nYou now have UNLIMITED AI summaries, quizzes and simple explanations until ${until.slice(0, 10)}.\n\nOpen Kika and keep studying ⚡`,
        reply_markup: { inline_keyboard: [[{ text: '⚡ Open Kika', web_app: { url: CFG.WEBAPP_URL } }]] },
      });
      return res.status(200).json({ ok: true });
    }

    const msg = update.message;
    if (!msg || !msg.from) return res.status(200).json({ ok: true });
    const from = msg.from;
    const chatId = msg.chat.id;

    // ---- User sends a PDF → turn it into study material ----
    if (msg.document) {
      const doc = msg.document;
      if ((doc.mime_type || '') !== 'application/pdf') {
        await tg('sendMessage', { chat_id: chatId, text: '📕 Please send a PDF file — I turn PDFs into study material. (You can also paste text inside the app.)' });
        return res.status(200).json({ ok: true });
      }
      if (doc.file_size > 10 * 1024 * 1024) {
        await tg('sendMessage', { chat_id: chatId, text: '😅 That PDF is too big (over 10MB). Try splitting it or sending only the chapter you need.' });
        return res.status(200).json({ ok: true });
      }

      await tg('sendMessage', { chat_id: chatId, text: '📖 Reading your PDF…' });
      const buf = await downloadFile(doc.file_id);
      const parsed = await pdfParse(buf);
      const text = (parsed.text || '').replace(/\s+/g, ' ').trim().slice(0, CFG.MAX_MATERIAL_CHARS);
      if (text.length < CFG.MIN_MATERIAL_CHARS) {
        await tg('sendMessage', { chat_id: chatId, text: '😕 I couldn\'t find readable text in that PDF (it may be scanned images). Paste the text inside the app instead — or try another file.' });
        return res.status(200).json({ ok: true });
      }

      // make sure the user exists, then save the material
      const existing = await getUser(from.id);
      if (!existing || !existing.length) {
        await upsertUser({ telegram_id: from.id, username: from.username || null, first_name: from.first_name || null });
      }
      const title = (doc.file_name || 'PDF material').replace(/\.pdf$/i, '').slice(0, 80) || 'PDF material';
      const { sb } = require('./_lib');
      await sb('POST', 'materials', { body: { telegram_id: from.id, title, content: text, source: 'pdf' } });

      await tg('sendMessage', {
        chat_id: chatId,
        text: `✅ Added "${title}" (${parsed.numpages} pages read).\n\nOpen Kika to turn it into a quiz, summary, or a simple explanation ⚡`,
        reply_markup: { inline_keyboard: [[{ text: '⚡ Study this now', web_app: { url: CFG.WEBAPP_URL } }]] },
      });
      return res.status(200).json({ ok: true });
    }

    // ---- Text messages: invite to use the app ----
    if (!msg.text) return res.status(200).json({ ok: true });

    if (msg.text.startsWith('/start')) {
      const payload = msg.text.split(' ')[1] || '';
      const existing = await getUser(from.id);
      const isNew = !existing || !existing.length;
      if (isNew) {
        let referrerId = null;
        if (payload.startsWith('ref')) {
          const rid = parseInt(payload.slice(3), 10);
          if (rid && rid !== from.id) referrerId = rid;
        }
        await upsertUser({ telegram_id: from.id, username: from.username || null, first_name: from.first_name || null, referrer_id: referrerId });
      } else {
        await updateUser(from.id, { username: from.username || null, first_name: from.first_name || null });
      }

      await tg('setChatMenuButton', { chat_id: chatId, menu_button: { type: 'web_app', text: '⚡ Open Kika', web_app: { url: CFG.WEBAPP_URL } } });

      const refLink = `https://t.me/${CFG.BOT_USERNAME}?start=ref${from.id}`;
      const welcome = isNew
        ? `Welcome to Kika ⚡, ${from.first_name || 'friend'}!\n\nI turn your notes into study magic:\n📄 Send me a PDF here in chat, or paste text in the app\n🧠 Get AI quizzes, summaries & simple explanations\n\nYou get ${CFG.FREE_DAILY_ACTIONS} free AI actions every day.\n\nInvite friends for bonus actions 👇\n${refLink}`
        : `Welcome back to Kika ⚡!\n\nYour invite link:\n${refLink}`;
      await tg('sendMessage', { chat_id: chatId, text: welcome, reply_markup: { inline_keyboard: [[{ text: '⚡ Open Kika', web_app: { url: CFG.WEBAPP_URL } }]] } });
    } else {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'I read PDFs! 📄 Send me any study PDF and I\'ll turn it into quizzes and notes. For pasting text, open the app 👇',
        reply_markup: { inline_keyboard: [[{ text: '⚡ Open Kika', web_app: { url: CFG.WEBAPP_URL } }]] },
      });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('webhook error:', e && e.message);
    return res.status(200).json({ ok: true });
  }
};
