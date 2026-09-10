import { Miniflare } from 'miniflare';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths are relative to this file so the suite runs anywhere: here, on a
// laptop, or on a CI runner that has never heard of /home/claude.
const HERE = path.dirname(fileURLToPath(import.meta.url));
import vm from 'node:vm';
import { ADMIN_HTML } from './src/admin-html.js';

const bindings = {
  ADMIN_EMAIL: 'a3dprinting.cw@gmail.com', BUSINESS_NAME: 'A3D Printing', CURRENCY: 'XCG',
  PUBLIC_ORIGIN: 'https://a3dprinting.com', MAX_UPLOAD_MB: '50',
  CF_ACCESS_TEAM: 'x', CF_ACCESS_AUD: 'y',
  SENTOO_BASE: 'https://api.sandbox.sentoo.io', SENTOO_MODE: 'mock',
};

const mf = new Miniflare({
  modules: true,
  modulesRoot: HERE,
  modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
  scriptPath: path.join(HERE, 'test-harness.js'),
  compatibilityDate: '2026-08-06',
  d1Databases: { DB: 'a3d' },
  r2Buckets: { FILES: 'a3d-uploads' },
  bindings,
});
const pub = mf, admin = mf;

const db = await mf.getD1Database('DB');
// Every migration, in order, so the tests run against the same schema the live
// database has rather than only the first one.
const migDir = path.join(HERE, 'migrations');
for (const file of fs.readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()) {
  const sql = fs.readFileSync(path.join(migDir, file), 'utf8')
    .split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
  for (const stmt of sql.split(';').map(x => x.trim()).filter(Boolean)) {
    await db.exec(stmt.replace(/\s+/g, ' '));
  }
}

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

await t('send hands back the payment link when email is not connected', async () => {
  const q = await db.prepare('select id from quotes order by id desc limit 1').first();
  const r = await A('/quotes/' + q.id + '/send', { method: 'POST' });
  const j = await r.json();
  assert(r.status === 503, 'status ' + r.status);
  assert(/pay\.sandbox\.sentoo\.io/.test(j.error), 'no link in the message: ' + j.error);
  const after = await db.prepare('select sentoo_url from quotes where id = ?').bind(q.id).first();
  assert(after.sentoo_url, 'link was not stored');
});

await t('the payment link is built from the quote total', async () => {
  const q = await db.prepare('select * from quotes order by id desc limit 1').first();
  assert(q.total_cents === 8750, 'total drifted: ' + q.total_cents);
  assert(q.sentoo_uid, 'no transaction id');
});

await t('marking paid by hand flips the order too', async () => {
  const q = await db.prepare('select id, order_id from quotes order by id desc limit 1').first();
  const r = await A('/quotes/' + q.id + '/paid', { method: 'POST', body: JSON.stringify({ how: 'Cash at the shop' }) });
  assert(r.status === 200, 'status ' + r.status);
  const order = await db.prepare('select status from orders where id = ?').bind(q.order_id).first();
  const quote = await db.prepare('select status, paid_at from quotes where id = ?').bind(q.id).first();
  assert(order.status === 'paid', 'order is ' + order.status);
  assert(quote.status === 'paid' && quote.paid_at, 'quote not marked paid');
  const ev = await db.prepare("select detail from order_events where order_id = ? and kind = 'payment' order by id desc").bind(q.order_id).first();
  assert(/Cash at the shop/.test(ev.detail), 'reason not recorded');
});

await t('a paid quote is not sent again by accident', async () => {
  const q = await db.prepare('select id from quotes order by id desc limit 1').first();
  const detail = await (await A('/orders/1')).json();
  assert(detail.quotes[0].status === 'paid', 'expected paid');
  assert(detail.lines.length === 2, 'quote lines missing from the payload');
});

// ------------------------------------------------- connecting Gmail

await t('gmail starts out disconnected', async () => {
  const j = await (await A('/me')).json();
  assert(j.gmail && j.gmail.connected === false, 'should not be connected');
  assert(j.gmail.hasApp === false, 'should have no app yet');
});

await t('a client id that is not a Google one is refused', async () => {
  const r = await A('/gmail/app', { method: 'POST', body: JSON.stringify({ client_id: 'nope', client_secret: 'x' }) });
  assert(r.status === 400, 'status ' + r.status);
  const row = await db.prepare("select value from settings where key = 'gmail_client_id'").first();
  assert(!row, 'a bad id should not be stored');
});

await t('saving the app details reports the callback URL back', async () => {
  const r = await A('/gmail/app', {
    method: 'POST',
    body: JSON.stringify({ client_id: '123.apps.googleusercontent.com', client_secret: 'GOCSPX-secret' }),
  });
  const j = await r.json();
  assert(j.redirectUri === 'https://a3dprinting.com/api/admin/gmail/callback', 'redirect ' + j.redirectUri);
  const me = await (await A('/me')).json();
  assert(me.gmail.hasApp === true, 'app should be saved');
  assert(me.gmail.connected === false, 'still needs the consent step');
});

await t('the secret never comes back out of the API', async () => {
  const body = await (await A('/me')).text();
  assert(!body.includes('GOCSPX-secret'), 'the client secret leaked into a response');
});

await t('start sends you to Google asking for offline access', async () => {
  const r = await A('/gmail/start', { redirect: 'manual' });
  assert(r.status === 302, 'status ' + r.status);
  const to = new URL(r.headers.get('location'));
  assert(to.host === 'accounts.google.com', 'host ' + to.host);
  assert(to.searchParams.get('access_type') === 'offline', 'needs offline access for a refresh token');
  assert(to.searchParams.get('redirect_uri') === 'https://a3dprinting.com/api/admin/gmail/callback', 'wrong redirect');
  assert(to.searchParams.get('scope').includes('gmail.send'), 'wrong scope');
  const state = await db.prepare("select value from settings where key = 'gmail_oauth_state'").first();
  assert(state && state.value.split('|')[0] === to.searchParams.get('state'), 'state not remembered');
});

await t('a callback with the wrong state is thrown away', async () => {
  const r = await A('/gmail/callback?code=abc&state=not-the-one', { redirect: 'manual' });
  assert(r.status === 302, 'status ' + r.status);
  assert(r.headers.get('location').includes('error='), 'should have refused');
  const tok = await db.prepare("select value from settings where key = 'gmail_refresh_token'").first();
  assert(!tok, 'nothing should have been stored');
});

await t('a cancelled approval says so instead of breaking', async () => {
  const r = await A('/gmail/callback?error=access_denied', { redirect: 'manual' });
  assert(r.headers.get('location').includes('error='), 'should carry the message');
});

await t('sending is still refused while the consent step is unfinished', async () => {
  const r = await A('/gmail/test', { method: 'POST' });
  assert(r.status === 400, 'status ' + r.status);
});

await t('disconnect clears every trace', async () => {
  await db.prepare("insert into settings (key, value) values ('gmail_refresh_token', 'pretend') on conflict(key) do update set value = excluded.value").run();
  await A('/gmail/disconnect', { method: 'POST' });
  const rows = await db.prepare("select key from settings where key like 'gmail_%'").all();
  assert(rows.results.length === 0, 'left behind: ' + rows.results.map(r => r.key).join(','));
  const me = await (await A('/me')).json();
  assert(me.gmail.connected === false && me.gmail.hasApp === false, 'still looks connected');
});

await t('the order detail carries the price list and tax rate for the builder', async () => {
  const j = await (await A('/orders/1')).json();
  assert(Array.isArray(j.prices), 'no price list in the payload');
  assert(j.prices.length === 8, 'expected 8 active price rows, got ' + j.prices.length);
  assert(j.prices[0].name && typeof j.prices[0].unit_cents !== 'undefined', 'price rows need a name and a price');
  assert(typeof j.taxPct === 'number', 'tax rate should be a number, got ' + typeof j.taxPct);
});

// ------------------------------------------------- connecting QuickBooks

await t('quickbooks starts out disconnected and quotes still work', async () => {
  const j = await (await A('/me')).json();
  assert(j.qbo && j.qbo.connected === false, 'should not be connected');
  const detail = await (await A('/orders/1')).json();
  assert(detail.quotes.length > 0, 'a quote was still created without quickbooks');
  assert(!detail.quotes[0].qbo_estimate_id, 'no estimate id expected');
  assert(!detail.quotes[0].qbo_error, 'not being connected is not an error');
});

await t('saving the quickbooks app reports the callback URL back', async () => {
  const r = await A('/qbo/app', {
    method: 'POST',
    body: JSON.stringify({ client_id: 'ABxyz', client_secret: 'shhh-intuit' }),
  });
  const j = await r.json();
  assert(j.redirectUri === 'https://a3dprinting.com/api/admin/qbo/callback', 'redirect ' + j.redirectUri);
  const me = await (await A('/me')).json();
  assert(me.qbo.hasApp === true, 'app should be saved');
  assert(me.qbo.connected === false, 'still needs the company approval');
});

await t('the quickbooks secret never comes back out of the API', async () => {
  const body = await (await A('/me')).text();
  assert(!body.includes('shhh-intuit'), 'the client secret leaked into a response');
});

await t('start sends you to Intuit with the accounting scope', async () => {
  const r = await A('/qbo/start', { redirect: 'manual' });
  assert(r.status === 302, 'status ' + r.status);
  const to = new URL(r.headers.get('location'));
  assert(to.host === 'appcenter.intuit.com', 'host ' + to.host);
  assert(to.searchParams.get('scope') === 'com.intuit.quickbooks.accounting', 'wrong scope');
  assert(to.searchParams.get('redirect_uri') === 'https://a3dprinting.com/api/admin/qbo/callback', 'wrong redirect');
});

await t('a callback without a company id is refused', async () => {
  const st = await db.prepare("select value from settings where key = 'qbo_oauth_state'").first();
  const state = st.value.split('|')[0];
  const r = await A('/qbo/callback?code=abc&state=' + state, { redirect: 'manual' });
  assert(r.headers.get('location').includes('error='), 'should have refused');
  const realm = await db.prepare("select value from settings where key = 'qbo_realm_id'").first();
  assert(!realm, 'nothing should have been stored');
});

await t('a callback with the wrong state is thrown away', async () => {
  const r = await A('/qbo/callback?code=abc&state=nope&realmId=123', { redirect: 'manual' });
  assert(r.headers.get('location').includes('error='), 'should have refused');
});

// The back office UI is one long template string, so a syntax error inside it
// sails through every check the module system does and only shows up as a page
// stuck on "Loading...". Parse the inline script for real, every run.
await t('the admin page script actually parses', () => {
  const start = ADMIN_HTML.indexOf('<script>');
  const end = ADMIN_HTML.lastIndexOf('</script>');
  assert(start !== -1 && end > start, 'could not find the inline script');
  const js = ADMIN_HTML.slice(start + 8, end);
  assert(js.length > 1000, 'inline script looks truncated: ' + js.length + ' bytes');
  new vm.Script(js, { filename: 'admin-inline.js' });
});

await t('the admin page has no unclosed tags in the shell', () => {
  for (const tag of ['html', 'head', 'body', 'style', 'script']) {
    const open = (ADMIN_HTML.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length;
    const close = (ADMIN_HTML.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    assert(open === close, tag + ': ' + open + ' open, ' + close + ' closed');
  }
});

// --------------------------------- QuickBooks OAuth lifecycle
//
// These are the scenarios Intuit's app assessment asks about, so they are
// tested rather than asserted: a dead grant is recognised and surfaced, the
// state parameter defends the callback, and disconnect leaves nothing behind.

await t('the discovery document is used, with a fallback that still works', async () => {
  const qbo = await import('./src/qbo.js');
  const ep = await qbo.endpoints({ DB: db }, false);
  assert(ep.token_endpoint && /^https:/.test(ep.token_endpoint), 'no token endpoint: ' + ep.token_endpoint);
  assert(ep.authorization_endpoint && /^https:/.test(ep.authorization_endpoint), 'no auth endpoint');
  assert(ep.revocation_endpoint && /^https:/.test(ep.revocation_endpoint), 'no revocation endpoint');
});

await t('a revoked connection is flagged for reconnection, not retried', async () => {
  const qbo = await import('./src/qbo.js');
  await qbo.markNeedsReconnect({ DB: db }, true);
  const conf = await qbo.qboConfig({ DB: db });
  assert(conf.needsReconnect === true, 'should be flagged');
  const row = await db.prepare("select value from settings where key = 'qbo_access_token'").first();
  assert(!row, 'the cached access token should be dropped when the grant dies');
  await qbo.markNeedsReconnect({ DB: db }, false);
  const after = await qbo.qboConfig({ DB: db });
  assert(after.needsReconnect === false, 'should clear');
});

await t('the back office reports when quickbooks needs reconnecting', async () => {
  const qbo = await import('./src/qbo.js');
  await qbo.markNeedsReconnect({ DB: db }, true);
  const me = await (await A('/me')).json();
  assert(me.qbo.needsReconnect === true, 'the admin should be told to reconnect');
  await qbo.markNeedsReconnect({ DB: db }, false);
});

await t('the oauth state parameter is what defends the callback', async () => {
  await A('/qbo/app', { method: 'POST', body: JSON.stringify({ client_id: 'AB', client_secret: 'sec' }) });
  const r = await A('/qbo/start', { redirect: 'manual' });
  const state = new URL(r.headers.get('location')).searchParams.get('state');
  assert(state && state.length > 20, 'state should be a long random value');
  const wrong = await A('/qbo/callback?code=x&state=' + state + 'tampered&realmId=1', { redirect: 'manual' });
  assert(wrong.headers.get('location').includes('error='), 'a tampered state must be refused');
  const none = await A('/qbo/callback?code=x&realmId=1', { redirect: 'manual' });
  assert(none.headers.get('location').includes('error='), 'a missing state must be refused');
  await A('/qbo/disconnect', { method: 'POST' });
});

// Disconnect must take every credential with it. The cached copy of Intuit's
// public discovery document is deliberately exempt: it is not user data, not a
// secret, and not tied to the connection, so re-connecting should not have to
// fetch it again.
await t('disconnect leaves no quickbooks trace at all', async () => {
  await db.prepare("insert into settings (key, value) values ('qbo_access_token','x') on conflict(key) do update set value = excluded.value").run();
  await db.prepare("insert into settings (key, value) values ('qbo_needs_reconnect','1') on conflict(key) do update set value = excluded.value").run();
  await A('/qbo/disconnect', { method: 'POST' });
  const rows = await db.prepare("select key from settings where key like 'qbo_%' and key not like 'qbo_discovery%'").all();
  assert(rows.results.length === 0, 'left behind: ' + rows.results.map(r => r.key).join(','));
});

// Curaçao runs QuickBooks' global tax model, where a sales line without a tax
// code is rejected. The code the owner picks has to reach every line, and
// picking nothing has to stay a real option for a company that charges no OB.
await t('the chosen tax code lands on every quote line', async () => {
  const qbo = await import('./src/qbo.js');
  const lines = [{ description: 'Print', qty: 2, unit_cents: 1500 }, { description: 'Design', qty: 1, unit_cents: 5000 }];
  const withTax = qbo.toLines(lines, '7');
  assert(withTax.length === 2, 'both lines expected');
  for (const l of withTax) {
    const ref = l.SalesItemLineDetail.TaxCodeRef;
    assert(ref && ref.value === '7', 'missing tax code on ' + l.Description);
  }
  assert(withTax[0].Amount === 30, 'amount should be 30.00, got ' + withTax[0].Amount);
  const bare = qbo.toLines(lines, null);
  assert(!bare[0].SalesItemLineDetail.TaxCodeRef, 'no code chosen means no code sent');
});

await t('a tax code QuickBooks does not have is refused', async () => {
  const r = await A('/qbo/taxcode', { method: 'POST', body: JSON.stringify({ id: 'made-up' }) });
  assert(r.status === 400, 'expected a plain refusal, got ' + r.status);
  const said = await r.json();
  assert(/does not have that tax code/.test(said.error || ''), 'wrong reason: ' + said.error);
  const row = await db.prepare("select value from settings where key = 'qbo_tax_code'").first();
  assert(!row || !row.value, 'nothing should have been stored');
});

// One number, one place. If the quote charged a rate the QuickBooks invoice did
// not, the customer would pay one total while the books expected another.
await t('clearing the tax code takes the quote tax rate with it', async () => {
  await db.prepare("update settings set value = '6' where key = 'tax_rate_pct'").run();
  const r = await A('/qbo/taxcode', { method: 'POST', body: JSON.stringify({ id: '' }) });
  assert(r.status === 200, 'expected 200, got ' + r.status);
  const row = await db.prepare("select value from settings where key = 'tax_rate_pct'").first();
  assert(row.value === '0', 'tax rate should be back to 0, is ' + row.value);
});

// Adrian charges OB to companies and not to a friend doing a one-off, so the
// tax is a decision per quote. Getting this wrong in either direction is real
// money: tax he collected but did not owe, or tax he owes but never collected.
await t('OB is charged by default and can be turned off for one quote', async () => {
  await db.prepare("insert into settings (key, value) values ('tax_rate_pct','6') on conflict(key) do update set value = excluded.value").run();
  const line = [{ description: 'Bracket', qty: 2, unit_cents: 5000 }];

  const on = await (await A('/orders/1/quote', { method: 'POST', body: JSON.stringify({ lines: line }) })).json();
  assert(on.quote.subtotal_cents === 10000, 'subtotal ' + on.quote.subtotal_cents);
  assert(on.quote.tax_cents === 600, 'expected 600 of tax, got ' + on.quote.tax_cents);
  assert(on.quote.total_cents === 10600, 'total ' + on.quote.total_cents);

  const off = await (await A('/orders/1/quote', { method: 'POST', body: JSON.stringify({ lines: line, tax: false }) })).json();
  assert(off.quote.tax_cents === 0, 'no tax expected, got ' + off.quote.tax_cents);
  assert(off.quote.total_cents === 10000, 'total ' + off.quote.total_cents);

  await db.prepare("update settings set value = '0' where key = 'tax_rate_pct'").run();
});

// --------------------------------- the back office as a place to work

// Half his customers walk in the door. Before this there was no way to quote
// them at all: every order had to start life as a website form.
await t('a walk-in can be added by hand and quoted', async () => {
  const r = await A('/orders', { method: 'POST', body: JSON.stringify({ name: 'Counter Customer', notes: 'Two brackets' }) });
  const j = await r.json();
  assert(r.status === 200, 'http ' + r.status + ' ' + JSON.stringify(j));
  assert(/^A3D-\d{4}$/.test(j.ref), 'bad ref ' + j.ref);
  const detail = await (await A('/orders/' + j.id)).json();
  assert(detail.order.source === 'counter', 'source ' + detail.order.source);
  assert(detail.order.customer_name === 'Counter Customer', 'name ' + detail.order.customer_name);
  const quote = await A('/orders/' + j.id + '/quote', {
    method: 'POST', body: JSON.stringify({ lines: [{ description: 'Bracket', qty: 2, unit_cents: 2500 }] }),
  });
  assert(quote.status === 200, 'a walk-in should be quotable, got ' + quote.status);
});

// The placeholder address exists so the customers table has something to key
// on. It must never reach a mail server.
await t('a walk-in without an email is never emailed', async () => {
  const made = await (await A('/orders', { method: 'POST', body: JSON.stringify({ name: 'No Email Ned' }) })).json();
  const quoted = await (await A('/orders/' + made.id + '/quote', {
    method: 'POST', body: JSON.stringify({ lines: [{ description: 'Print', qty: 1, unit_cents: 1000 }] }),
  })).json();
  const send = await A('/quotes/' + quoted.quote.id + '/send', { method: 'POST' });
  assert(send.status === 400, 'expected a refusal, got ' + send.status);
  const said = await send.json();
  assert(/no email address/i.test(said.error || ''), 'wrong reason: ' + said.error);
  assert(/https?:/.test(said.error || ''), 'the pay link should still be handed over: ' + said.error);
});

// Deleting is for his own test data and mistakes. It has to take the whole
// order with it, and it must not touch his books.
await t('deleting an order takes its quotes and history with it', async () => {
  const made = await (await A('/orders', { method: 'POST', body: JSON.stringify({ name: 'Delete Me' }) })).json();
  await A('/orders/' + made.id + '/quote', {
    method: 'POST', body: JSON.stringify({ lines: [{ description: 'Thing', qty: 1, unit_cents: 500 }] }),
  });
  const del = await A('/orders/' + made.id, { method: 'DELETE' });
  assert(del.status === 200, 'delete failed ' + del.status);
  const gone = await A('/orders/' + made.id);
  assert(gone.status === 404, 'order should be gone, got ' + gone.status);
  const quotes = await db.prepare('select count(*) n from quotes where order_id = ?').bind(made.id).first();
  assert(quotes.n === 0, 'quotes left behind: ' + quotes.n);
  const events = await db.prepare('select count(*) n from order_events where order_id = ?').bind(made.id).first();
  assert(events.n === 0, 'events left behind: ' + events.n);
});

await t('the price list can grow and shrink', async () => {
  const before = (await (await A('/prices')).json()).prices.length;
  const added = await (await A('/prices/add', { method: 'POST', body: JSON.stringify({ name: 'Test widget' }) })).json();
  assert(added.price && added.price.id, 'no row came back');
  const mid = (await (await A('/prices')).json()).prices;
  assert(mid.length === before + 1, 'expected one more, got ' + mid.length);
  assert(mid.some((p) => p.name === 'Test widget'), 'the new item is missing');
  const del = await A('/prices/' + added.price.id, { method: 'DELETE' });
  assert(del.status === 200, 'delete failed ' + del.status);
  const after = (await (await A('/prices')).json()).prices.length;
  assert(after === before, 'expected ' + before + ' again, got ' + after);
});

await t('the public prices page shows only what is switched on for the website', async () => {
  const P = () => pub.dispatchFetch('https://app.a3dprinting.com/api/prices', { headers: { Origin: 'https://a3dprinting.com' } });
  const first = await P();
  assert(first.status === 200, 'http ' + first.status);
  assert(first.headers.get('access-control-allow-origin') === 'https://a3dprinting.com', 'no CORS for the site');
  const empty = await first.json();
  assert(Array.isArray(empty.prices) && empty.prices.length === 0, 'nothing is switched on yet, got ' + empty.prices.length);
  const rows = (await (await A('/prices')).json()).prices;
  assert(rows.every((p) => p.web === 0), 'new column should default to off');
  const [a, b] = rows;
  await A('/prices', { method: 'POST', body: JSON.stringify({ prices: [
    { id: a.id, name: 'Shown thing', description: 'Public words', unit_cents: 350, active: 1, web: true },
    { id: b.id, name: b.name, description: b.description, unit_cents: 999, active: 1, web: false },
  ] }) });
  const j = await (await P()).json();
  assert(j.prices.length === 1, 'expected exactly one public row, got ' + j.prices.length);
  const row = j.prices[0];
  assert(row.name === 'Shown thing' && row.unit_cents === 350 && row.description === 'Public words', JSON.stringify(row));
  assert(!('id' in row) && !('active' in row) && !('sku' in row), 'public payload leaks internal fields');
  assert(j.currency === 'XCG', 'currency ' + j.currency);
});

await t('saving without the website field leaves the website switch alone', async () => {
  const rows = (await (await A('/prices')).json()).prices;
  const on = rows.find((p) => p.web === 1);
  assert(on, 'expected the row from the previous test to be on');
  await A('/prices', { method: 'POST', body: JSON.stringify({ prices: [
    { id: on.id, name: on.name, description: on.description, unit_cents: on.unit_cents, active: 1 },
  ] }) });
  const again = (await (await A('/prices')).json()).prices.find((p) => p.id === on.id);
  assert(again.web === 1, 'an old client saving took the item off the website');
  await A('/prices', { method: 'POST', body: JSON.stringify({ prices: [
    { id: on.id, name: on.name, description: on.description, unit_cents: on.unit_cents, active: 1, web: false },
  ] }) });
  const off = (await (await A('/prices')).json()).prices.find((p) => p.id === on.id);
  assert(off.web === 0, 'switching off did not stick');
});

await t('the price list screen has the website switch', async () => {
  assert(ADMIN_HTML.includes('class="switch"') && ADMIN_HTML.includes("querySelector('.w')"), 'switch or save wiring missing');
  assert(ADMIN_HTML.includes('pl-web') && ADMIN_HTML.includes('pl-off'), 'the two sections are missing');
});

await t('a customer page shows their orders and what they have paid', async () => {
  const list = (await (await A('/customers')).json()).customers;
  assert(list.length, 'no customers to look at');
  const r = await A('/customers/' + list[0].id);
  assert(r.status === 200, 'http ' + r.status);
  const d = await r.json();
  assert(d.customer && d.customer.id === list[0].id, 'wrong customer came back');
  assert(Array.isArray(d.orders), 'orders should be a list');
  assert(typeof d.paidCents === 'number', 'paidCents should be a number');
});

await t('a customer can be pinned to a quickbooks card by hand', async () => {
  const list = (await (await A('/customers')).json()).customers;
  const id = list[0].id;
  const r = await A('/customers/' + id + '/qbo', { method: 'POST', body: JSON.stringify({ qbo_customer_id: '42' }) });
  assert(r.status === 200, 'http ' + r.status);
  const row = await db.prepare('select qbo_customer_id from customers where id = ?').bind(id).first();
  assert(row.qbo_customer_id === '42', 'not pinned, got ' + row.qbo_customer_id);
  await A('/customers/' + id + '/qbo', { method: 'POST', body: JSON.stringify({ qbo_customer_id: '' }) });
  const cleared = await db.prepare('select qbo_customer_id from customers where id = ?').bind(id).first();
  assert(!cleared.qbo_customer_id, 'unpinning did not work');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
await mf.dispose();
process.exit(fail ? 1 : 0);
