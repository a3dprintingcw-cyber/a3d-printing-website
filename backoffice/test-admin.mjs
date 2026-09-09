import { Miniflare } from 'miniflare';
import fs from 'node:fs';

const bindings = {
  ADMIN_EMAIL: 'a3dprinting.cw@gmail.com', BUSINESS_NAME: 'A3D Printing', CURRENCY: 'XCG',
  PUBLIC_ORIGIN: 'https://a3dprinting.com', MAX_UPLOAD_MB: '50',
  CF_ACCESS_TEAM: 'x', CF_ACCESS_AUD: 'y',
  SENTOO_BASE: 'https://api.sandbox.sentoo.io', SENTOO_MODE: 'mock',
};

const mf = new Miniflare({
  modules: true,
  modulesRoot: '/home/claude/backoffice',
  modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
  scriptPath: '/home/claude/backoffice/test-harness.js',
  compatibilityDate: '2026-08-06',
  d1Databases: { DB: 'a3d' },
  r2Buckets: { FILES: 'a3d-uploads' },
  bindings,
});
const pub = mf, admin = mf;

const db = await mf.getD1Database('DB');
const sql = fs.readFileSync('/home/claude/backoffice/migrations/0001_init.sql', 'utf8')
  .split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
for (const s of sql.split(';').map(x => x.trim()).filter(Boolean)) await db.exec(s.replace(/\s+/g, ' '));

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok  ', name); pass++; }
  catch (e) { console.log('  FAIL', name, '::', e.message); fail++; }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const A = (path, opts) => admin.dispatchFetch('https://a3dprinting.com/api/admin' + path, opts);

// seed through the public API so the data is realistic
function multipart(fields) {
  const b = '----t' + Math.random().toString(16).slice(2);
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += '--' + b + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + v + '\r\n';
  }
  body += '--' + b + '--\r\n';
  return { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=' + b }, body };
}
await pub.dispatchFetch('https://a3dprinting.com/api/quote-request',
  multipart({ name: 'Maria', email: 'maria@example.com', material: 'PLA', quantity: '3', notes: 'Two colour keychains' }));
await pub.dispatchFetch('https://a3dprinting.com/api/e', { method: 'POST', body: JSON.stringify({ path: '/' }) });

await t('admin sees the order in the list', async () => {
  const j = await (await A('/orders')).json();
  assert(j.orders.length === 1, 'orders ' + j.orders.length);
  assert(j.orders[0].customer_name === 'Maria', 'name ' + j.orders[0].customer_name);
});

await t('stats add up', async () => {
  const j = await (await A('/stats')).json();
  assert(j.requests30 === 1, 'requests ' + j.requests30);
  assert(j.visits.visitors === 1, 'visitors ' + j.visits.visitors);
  assert(j.byStatus.find(s => s.status === 'new').n === 1, 'pipeline wrong');
});

await t('order detail carries files, events and history', async () => {
  const j = await (await A('/orders/1')).json();
  assert(j.order.ref === 'A3D-0001', 'ref ' + j.order.ref);
  assert(Array.isArray(j.events) && j.events.length >= 1, 'no events');
});

await t('status moves are recorded', async () => {
  await A('/orders/1', { method: 'POST', body: JSON.stringify({ status: 'printing' }) });
  const j = await (await A('/orders/1')).json();
  assert(j.order.status === 'printing', 'status ' + j.order.status);
  assert(j.events.some(e => /printing/.test(e.detail || '')), 'no status event');
});

await t('a bogus status is rejected', async () => {
  const r = await A('/orders/1', { method: 'POST', body: JSON.stringify({ status: 'banana' }) });
  assert(r.status === 400, 'status ' + r.status);
});

await t('quote maths and the sandbox payment link', async () => {
  const r = await A('/orders/1/quote', {
    method: 'POST',
    body: JSON.stringify({ lines: [
      { description: 'Keychain, two colour', qty: 3, unit_cents: 1250 },
      { description: 'Design time', qty: 1, unit_cents: 5000 },
    ] }),
  });
  const j = await r.json();
  assert(r.status === 200, 'http ' + r.status + ' ' + JSON.stringify(j));
  assert(j.quote.subtotal_cents === 8750, 'subtotal ' + j.quote.subtotal_cents);
  assert(j.quote.total_cents === 8750, 'total ' + j.quote.total_cents);
  assert(j.payment && j.payment.mock && j.payment.url.includes('pay.sandbox.sentoo.io'), 'payment ' + JSON.stringify(j.payment));
  const detail = await (await A('/orders/1')).json();
  assert(detail.order.status === 'quoted', 'order should be quoted, is ' + detail.order.status);
  assert(detail.quotes[0].sentoo_url, 'payment url not stored');
});

await t('an empty quote is refused', async () => {
  const r = await A('/orders/1/quote', { method: 'POST', body: JSON.stringify({ lines: [] }) });
  assert(r.status === 400, 'status ' + r.status);
});

await t('prices load and save', async () => {
  const j = await (await A('/prices')).json();
  assert(j.prices.length === 8, 'prices ' + j.prices.length);
  const row = j.prices[0];
  const r = await A('/prices', {
    method: 'POST',
    body: JSON.stringify({ prices: [{ id: row.id, name: row.name, description: 'Updated', unit_cents: 1500, active: 1 }] }),
  });
  assert(r.status === 200, 'save http ' + r.status);
  const after = await (await A('/prices')).json();
  const updated = after.prices.find(p => p.id === row.id);
  assert(updated.unit_cents === 1500 && updated.description === 'Updated', 'price not saved');
});

await t('customers roll up their orders', async () => {
  const j = await (await A('/customers')).json();
  assert(j.customers.length === 1 && j.customers[0].orders === 1, JSON.stringify(j.customers));
});

await t('unknown admin routes 404', async () => {
  const r = await A('/nonsense');
  assert(r.status === 404, 'status ' + r.status);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await mf.dispose();
process.exit(fail ? 1 : 0);
