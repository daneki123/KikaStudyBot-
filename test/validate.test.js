// Self-test: verify initData validation matches Telegram's algorithm.
const crypto = require('crypto');
const { validateInitData, parseQuiz } = require('../api/_lib');

const BOT_TOKEN = '123456:ABC-DEF__test-token';

function sign(fields) {
  const dcs = Object.entries(fields)
    .filter(([k]) => k !== 'hash')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  return crypto.createHmac('sha256', secret).update(dcs).digest('hex');
}
function buildInitData(userObj) {
  const fields = { query_id: 'AAH' + Math.random().toString(36).slice(2), user: JSON.stringify(userObj), auth_date: String(Math.floor(Date.now() / 1000)) };
  fields.hash = sign(fields);
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) sp.set(k, v);
  return sp.toString();
}

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ FAIL: ' + name); } };

// auth tests
const user = { id: 778899, first_name: 'Ada', username: 'ada' };
const valid = buildInitData(user);
check('valid initData returns user', validateInitData(valid, BOT_TOKEN).id === 778899);
check('tampered hash rejected', validateInitData(valid.slice(0, -4) + '0000', BOT_TOKEN) === null);
check('wrong bot token rejected', validateInitData(valid, '999:wrong') === null);

// quiz parser tests
const good = { questions: [{ q: 'Q1?', options: ['a', 'b', 'c', 'd'], answer: 0 }] };
check('quiz JSON parsed', Array.isArray(parseQuiz(JSON.stringify(good))) && parseQuiz(JSON.stringify(good)).length === 1);
check('quiz JSON with code fences parsed', Array.isArray(parseQuiz('```json\n' + JSON.stringify(good) + '\n```')));
check('garbage quiz returns null', parseQuiz('not json at all') === null);
check('quiz missing questions returns null', parseQuiz('{"foo":1}') === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
