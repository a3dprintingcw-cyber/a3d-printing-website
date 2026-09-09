import { Miniflare } from 'miniflare';
import fs from 'node:fs';

const mf = new Miniflare({
  modules: true,
  modulesRoot: '/home/claude/backoffice/src',
  modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
  scriptPath: '/home/claude/backoffice/src/index.js',
  compatibilityDate: '2026-08-06',
  d1Databases: { DB: 'a3d' },
  r2Buckets: { FILES: 'a3d-uploads' },
  bindings: {
    ADMIN_EMAIL: 'a3dprinting.cw@gmail.com',
    BUSINESS_NAME: 'A3D Printing',
    CURRENCY: 'XCG',
    PUBLIC_ORIGIN: 'https://a3dprinting.com',
    MAX_UPLOAD_MB: '50',
    CF_ACCESS_TEAM: 'REPLACE_WITH_TEAM_NAME',
    CF_ACCESS_AUD: 'REPLACE_WITH_APPLICATION_AUD',
    SENTOO_BASE: 'https://api.sandbox.sentoo.io',
    SENTOO_MODE: 'mock',
  },
});

const db = await mf.getD1Database('DB');
const sql = fs.readFileSync('/home/claude/backoffice/migrations/0001_init.sql', 'utf8');
const noComments = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
for (const stmt of noComments.split(';').map(s => s.trim()).filter(Boolean)) {
  await db.exec(stmt.replace(/\s+/g, ' '));
}
console.log('schema loaded');


// dispatchFetch does not serialise a FormData object for us, so build the
// multipart body by hand exactly as a browser would.
function multipart(fields, file) {
  const boundary = '----a3dtest' + Math.random().toString(16).slice(2);
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += '--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n';
  }
  if (file) {
    body += '--' + boundary + '\r\nContent-Disposition: form-data; name="attachment"; filename="' + file.name +
      '"\r\nContent-Type: ' + file.type + '\r\n\r\n' + file.content + '\r\n';
  }
  body += '--' + boundary + '--\r\n';
  return { headers: { 'content-type': 'multipart/form-data; boundary=' + boundary }, body, method: 'POST' };
}

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok  ', name); pass++; }
  catch (e) { console.log('  FAIL', name, '::', e.message); fail++; }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

await t('health responds', async () => {
  const r = await mf.dispatchFetch('https://a3dprinting.com/api/health');
  const j = await r.json();
  assert(r.status === 200 && j.ok, 'bad health');
  assert(j.mode.includes('mock'), 'expected mock mode');
});

await t('quote request with a file creates an order', async () => {
  const req = multipart(
    { name: 'Test Person', email: 'Test@Example.com ', phone: '+5999 5401708', material: 'PETG', quantity: '25', notes: 'Bracket, needs to be strong' },
    { name: 'bracket.stl', type: 'model/stl', content: 'x'.repeat(2048) });
  const r = await mf.dispatchFetch('https://a3dprinting.com/api/quote-request', req);
  const j = await r.json();
  assert(r.status === 200, 'status ' + r.status + ' ' + JSON.stringify(j));
  assert(j.ref === 'A3D-0001', 'ref was ' + j.ref);
});

await t('the file landed in R2 and the row points at it', async () => {
  const row = await db.prepare('select * from order_files').first();
  assert(row, 'no file row');
  const bucket = await mf.getR2Bucket('FILES');
  const obj = await bucket.get(row.r2_key);
  assert(obj, 'object missing from R2');
  assert(row.bytes === 2048, 'wrong size ' + row.bytes);
});

await t('email is normalised and the customer is reused', async () => {
  const r = await mf.dispatchFetch('https://a3dprinting.com/api/quote-request',
    multipart({ name: 'Test Person', email: 'test@example.com', notes: 'second job' }));
  const j = await r.json();
  assert(j.ref === 'A3D-0002', 'ref ' + j.ref);
  const n = await db.prepare('select count(*) c from customers').first();
  assert(n.c === 1, 'expected one customer, got ' + n.c);
});

await t('junk submissions are rejected', async () => {
  const r = await mf.dispatchFetch('https://a3dprinting.com/api/quote-request', multipart({ name: 'No Email' }));
  assert(r.status === 400, 'status ' + r.status);
});

await t('honeypot submissions are swallowed', async () => {
  const r = await mf.dispatchFetch('https://a3dprinting.com/api/quote-request',
    multipart({ name: 'Bot', email: 'bot@spam.com', company_website: 'http://spam' }));
  const j = await r.json();
  assert(j.ref === 'ignored', 'honeypot leaked: ' + JSON.stringify(j));
});

await t('forbidden file types are refused', async () => {
  const r = await mf.dispatchFetch('https://a3dprinting.com/api/quote-request',
    multipart({ name: 'X', email: 'x@y.com' }, { name: 'payload.exe', type: 'application/x-msdownload', content: 'MZ' }));
  assert(r.status === 400, 'status ' + r.status);
});

await t('analytics beacon records a visit and skips admin paths', async () => {
  await mf.dispatchFetch('https://a3dprinting.com/api/e', { method: 'POST', body: JSON.stringify({ path: '/', referrer: 'https://google.com/' }) });
  await mf.dispatchFetch('https://a3dprinting.com/api/e', { method: 'POST', body: JSON.stringify({ path: '/admin/secret' }) });
  const rows = await db.prepare('select path, referrer from events').all();
  assert(rows.results.length === 1, 'expected 1 event, got ' + rows.results.length);
  assert(rows.results[0].referrer === 'https://google.com/', 'referrer lost');
});

await t('own-site referrers are not counted as sources', async () => {
  await mf.dispatchFetch('https://a3dprinting.com/api/e', { method: 'POST', body: JSON.stringify({ path: '/prices.html', referrer: 'https://a3dprinting.com/' }) });
  const row = await db.prepare("select referrer from events where path = '/prices.html'").first();
  assert(row.referrer === null, 'self referrer stored: ' + row.referrer);
});

await t('admin is refused without an Access identity', async () => {
  const r = await mf.dispatchFetch('https://a3dprinting.com/admin');
  assert(r.status === 403, 'status ' + r.status);
  const r2 = await mf.dispatchFetch('https://a3dprinting.com/api/admin/orders');
  assert(r2.status === 403, 'api status ' + r2.status);
});

await t('sentoo webhook shrugs off unknown ids', async () => {
  const r = await mf.dispatchFetch('https://a3dprinting.com/api/webhooks/sentoo', {
    method: 'POST', body: JSON.stringify({ transaction_id: 'nope' }),
  });
  assert(r.status === 200, 'status ' + r.status);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await mf.dispose();
process.exit(fail ? 1 : 0);
