import { identify } from './access.js';
import { alertAdmin, newOrderAlert } from './email.js';
import { createPayment, fetchStatus, isMock } from './sentoo.js';
import { sendMail, quoteEmail, isConfigured as gmailReady, gmailConfig, exchangeCode, GMAIL_SCOPES } from './gmail.js';
import { getSetting, setSetting } from './settings.js';
import * as qbo from './qbo.js';
import { ADMIN_HTML } from './admin-html.js';

const ALLOWED_EXT = ['stl', 'obj', '3mf', 'step', 'stp', 'png', 'jpg', 'jpeg', 'pdf', 'webp'];
const STATUSES = ['new', 'quoted', 'approved', 'printing', 'ready', 'delivered', 'paid', 'closed', 'lost'];

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });

const bad = (msg, status = 400) => json({ error: msg }, status);

function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.PUBLIC_ORIGIN;
  return {
    'Access-Control-Allow-Origin': origin === allowed ? origin : allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
  };
}

async function visitorHash(request, env) {
  // Daily rotating, salted hash of IP + user agent. Enough to count people
  // once per day, useless for identifying anyone, and it expires by itself.
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';
  const day = new Date().toISOString().slice(0, 10);
  const data = new TextEncoder().encode(`${day}|${ip}|${ua}|${env.PUBLIC_ORIGIN}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function ext(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

async function upsertCustomer(env, { name, email, phone, company }) {
  const clean = (email || '').trim().toLowerCase();
  const found = await env.DB.prepare('SELECT * FROM customers WHERE email = ?').bind(clean).first();
  if (found) {
    await env.DB.prepare(
      'UPDATE customers SET name = COALESCE(NULLIF(?, \'\'), name), phone = COALESCE(NULLIF(?, \'\'), phone) WHERE id = ?',
    ).bind(name || '', phone || '', found.id).run();
    return { ...found, name: name || found.name, phone: phone || found.phone };
  }
  const res = await env.DB.prepare(
    'INSERT INTO customers (name, email, phone, company) VALUES (?, ?, ?, ?) RETURNING *',
  ).bind(name || '(no name)', clean, phone || null, company || null).first();
  return res;
}

// ---------------------------------------------------------------- public API

async function handleQuoteRequest(request, env, ctx) {
  const type = request.headers.get('content-type') || '';
  let fields = {};
  let file = null;

  if (type.includes('multipart/form-data')) {
    const form = await request.formData();
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') fields[k] = v;
      else if (!file && v.size > 0) file = v;
    }
  } else {
    fields = await request.json().catch(() => ({}));
  }

  const email = (fields.email || '').trim();
  if (!fields.name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return bad('A name and a valid email address are required.');
  }
  if (fields.company_website) return json({ ok: true, ref: 'ignored' }); // honeypot

  const mode = fields.mode === 'dev' ? 'dev' : 'print';
  const maxBytes = Number(env.MAX_UPLOAD_MB || 50) * 1024 * 1024;
  if (file) {
    if (file.size > maxBytes) return bad(`That file is over ${env.MAX_UPLOAD_MB}MB. Send it on WhatsApp instead.`);
    if (!ALLOWED_EXT.includes(ext(file.name))) return bad('That file type is not accepted.');
  }

  const customer = await upsertCustomer(env, fields);
  const order = await env.DB.prepare(
    `INSERT INTO orders (ref, customer_id, mode, material, colour, quantity, project_type, timeline, notes, source)
     VALUES ('pending', ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(
    customer.id,
    mode,
    fields.material || null,
    fields.color || fields.colour || null,
    fields.quantity || null,
    fields.project_type || null,
    fields.timeline || null,
    fields.notes || fields.description || null,
    fields.source || 'website',
  ).first();

  const ref = `A3D-${String(order.id).padStart(4, '0')}`;
  await env.DB.prepare('UPDATE orders SET ref = ? WHERE id = ?').bind(ref, order.id).run();
  order.ref = ref;

  const files = [];
  if (file) {
    const key = `orders/${ref}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
    await env.FILES.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });
    const row = await env.DB.prepare(
      'INSERT INTO order_files (order_id, r2_key, filename, bytes, content_type) VALUES (?, ?, ?, ?, ?) RETURNING *',
    ).bind(order.id, key, file.name, file.size, file.type || null).first();
    files.push(row);
  }

  await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
    .bind(order.id, 'status', 'Request received from the website').run();

  ctx.waitUntil(alertAdmin(env, `New request ${ref} from ${customer.name}`, newOrderAlert(order, customer, files)));

  return json({ ok: true, ref });
}

async function handleBeacon(request, env) {
  const body = await request.json().catch(() => ({}));
  const path = (body.path || '/').slice(0, 200);
  if (path.startsWith('/admin')) return json({ ok: true });
  const day = new Date().toISOString().slice(0, 10);
  let referrer = (body.referrer || '').slice(0, 200);
  try {
    if (referrer && new URL(referrer).hostname === new URL(env.PUBLIC_ORIGIN).hostname) referrer = '';
  } catch { referrer = ''; }
  await env.DB.prepare(
    'INSERT INTO events (day, path, referrer, country, visitor, mode) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(day, path, referrer || null, request.cf?.country || null, await visitorHash(request, env), body.mode || null).run();
  return json({ ok: true });
}


// Applies a Sentoo status to a quote exactly once. Used by both the webhook
// and the safety-net poller, so a missed callback can never leave an order
// sitting unpaid in the back office while the money is in the bank.
// ------------------------------------------------------------- QuickBooks
//
// Both helpers swallow their own failures on purpose. QuickBooks being down is
// an accounting inconvenience; it is never a reason to lose a customer's quote
// or to fail to notice that they paid. The error is written to the quote row so
// it shows up in the back office instead of disappearing into a log.

async function noteQboError(env, quoteId, err) {
  console.log('qbo error on quote', quoteId, err.message);
  // When the grant itself is gone, say the one useful thing rather than
  // repeating Intuit's wording at someone who cannot act on it.
  const dead = /revoked or has expired/.test(err.message);
  const detail = dead
    ? 'QuickBooks needs reconnecting. Open Settings and connect it again, then press Send once more.'
    : String(err.message).slice(0, 300);
  await env.DB.prepare('UPDATE quotes SET qbo_error = ? WHERE id = ?')
    .bind(detail, quoteId).run().catch(() => {});
}

/** Creates the QuickBooks estimate for a freshly built quote. */
async function syncEstimate(env, quoteId) {
  if (!(await qbo.isConfigured(env))) return null;
  const quote = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
  if (!quote || quote.qbo_estimate_id) return quote ? quote.qbo_estimate_id : null;
  try {
    const conf = await qbo.qboConfig(env);
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(quote.order_id).first();
    const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(order.customer_id).first();
    let qboCustomerId = customer.qbo_customer_id;
    if (!qboCustomerId) {
      qboCustomerId = await qbo.findOrCreateCustomer(env, conf, {
        name: customer.name, email: customer.email, phone: customer.phone,
      });
      await env.DB.prepare('UPDATE customers SET qbo_customer_id = ? WHERE id = ?')
        .bind(qboCustomerId, customer.id).run();
    }
    const lines = (await env.DB.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position')
      .bind(quoteId).all()).results;
    const est = await qbo.createEstimate(env, conf, {
      customerId: qboCustomerId,
      lines: lines.map((l) => ({ description: l.description, qty: l.qty, unit_cents: l.unit_cents })),
      ref: order.ref,
      validUntil: quote.valid_until,
      currency: conf.currency || null,
      customerEmail: customer.email,
    });
    await env.DB.prepare('UPDATE quotes SET qbo_estimate_id = ?, qbo_estimate_no = ?, qbo_error = NULL WHERE id = ?')
      .bind(est.id, est.number, quoteId).run();
    await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
      .bind(quote.order_id, 'quickbooks', 'Estimate ' + est.number + ' created').run();
    return est.id;
  } catch (err) {
    await noteQboError(env, quoteId, err);
    return null;
  }
}

/** Turns the estimate into a paid invoice once the money has actually landed. */
async function syncInvoice(env, quoteId, how) {
  if (!(await qbo.isConfigured(env))) return;
  const quote = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
  if (!quote || quote.qbo_invoice_id) return;
  try {
    const conf = await qbo.qboConfig(env);
    let estimateId = quote.qbo_estimate_id;
    if (!estimateId) estimateId = await syncEstimate(env, quoteId);
    if (!estimateId) return;
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(quote.order_id).first();
    const customer = await env.DB.prepare('SELECT * FROM customers WHERE id = ?').bind(order.customer_id).first();
    const inv = await qbo.invoiceFromEstimate(env, conf, estimateId);
    await env.DB.prepare('UPDATE quotes SET qbo_invoice_id = ?, qbo_invoice_no = ? WHERE id = ?')
      .bind(inv.id, inv.number, quoteId).run();
    // The amount comes off the invoice QuickBooks just built, not off our
    // cents, so no rounding gap can leave a balance of one cent open forever.
    await qbo.recordPayment(env, conf, {
      customerId: customer.qbo_customer_id,
      invoiceId: inv.id,
      amount: inv.total,
      currency: conf.currency || null,
      note: how || 'Paid online',
    });
    await env.DB.prepare('UPDATE quotes SET qbo_error = NULL WHERE id = ?').bind(quoteId).run();
    await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
      .bind(quote.order_id, 'quickbooks', 'Invoice ' + inv.number + ' created and marked paid').run();
  } catch (err) {
    await noteQboError(env, quoteId, err);
  }
}

async function applyPaymentStatus(env, quote, status) {
  if (quote.sentoo_status === status) return false;
  const paid = status === 'success' || status === 'paid';
  await env.DB.prepare(
    `UPDATE quotes SET sentoo_status = ?, status = CASE WHEN ? THEN 'paid' ELSE status END,
     paid_at = CASE WHEN ? THEN datetime('now') ELSE paid_at END WHERE id = ?`,
  ).bind(status, paid ? 1 : 0, paid ? 1 : 0, quote.id).run();
  if (paid) {
    await env.DB.prepare("UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?")
      .bind(quote.order_id).run();
  }
  await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
    .bind(quote.order_id, 'payment', 'Sentoo status: ' + status).run();
  if (paid) await syncInvoice(env, quote.id, 'Paid online through Sentoo');
  return paid;
}

async function handleSentooWebhook(request, env) {
  // Sentoo sends the transaction id and nothing else. Fetch the real status,
  // apply it once, and always answer 200 so they stop retrying.
  let uid = null;
  try {
    const body = await request.json();
    uid = body.transaction_id || body.transaction || body.uid || null;
  } catch {
    const form = await request.formData().catch(() => null);
    uid = form?.get('transaction_id') || null;
  }
  if (!uid) return json({ ok: true, note: 'no transaction id' });

  const quote = await env.DB.prepare('SELECT * FROM quotes WHERE sentoo_uid = ?').bind(uid).first();
  if (!quote) return json({ ok: true, note: 'unknown transaction' });

  let status;
  try {
    ({ status } = await fetchStatus(env, uid));
  } catch (err) {
    // Sentoo unreachable: 500 makes them retry with backoff, which is what we want.
    return json({ error: err.message }, 500);
  }

  await applyPaymentStatus(env, quote, status);
  return json({ ok: true, status });
}

// ----------------------------------------------------------------- admin API

export async function adminRoutes(request, env, url, email) {
  const p = url.pathname.replace(/^\/api\/admin/, '');
  const method = request.method;

  if (p === '/me') {
    const g = await gmailConfig(env);
    const qc = await qbo.qboConfig(env);
    return json({
      email,
      sentoo: isMock(env) ? 'mock' : 'live',
      gmail: { connected: Boolean(g.clientId && g.clientSecret && g.refreshToken), hasApp: Boolean(g.clientId && g.clientSecret), account: g.account },
      qbo: {
        connected: Boolean(qc.clientId && qc.clientSecret && qc.refreshToken && qc.realmId),
        hasApp: Boolean(qc.clientId && qc.clientSecret),
        company: qc.company, currency: qc.currency, sandbox: qc.sandbox,
        needsReconnect: qc.needsReconnect,
      },
    });
  }

  // --- connecting Gmail, all of it from inside the back office ----------
  // The client id and secret are written straight to settings and never read
  // back out. The consent step happens in Adrian's own browser, and Google
  // hands the refresh token to this Worker, so nothing sensitive is ever shown
  // on screen or pasted into a chat.

  if (p === '/gmail/app' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const id = String(body.client_id || '').trim();
    const secret = String(body.client_secret || '').trim();
    if (!id || !secret) return bad('Both the client id and the client secret are needed.');
    if (!/\.apps\.googleusercontent\.com$/.test(id)) {
      return bad('That does not look like a Google client id. It ends in .apps.googleusercontent.com');
    }
    await setSetting(env, 'gmail_client_id', id);
    await setSetting(env, 'gmail_client_secret', secret);
    return json({ ok: true, redirectUri: url.origin + '/api/admin/gmail/callback' });
  }

  if (p === '/gmail/start' && method === 'GET') {
    const conf = await gmailConfig(env);
    if (!conf.clientId || !conf.clientSecret) return bad('Save the client id and secret first.');
    const state = crypto.randomUUID();
    await setSetting(env, 'gmail_oauth_state', state + '|' + Date.now());
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    auth.searchParams.set('client_id', conf.clientId);
    auth.searchParams.set('redirect_uri', url.origin + '/api/admin/gmail/callback');
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', GMAIL_SCOPES);
    auth.searchParams.set('access_type', 'offline');
    auth.searchParams.set('prompt', 'consent');
    auth.searchParams.set('login_hint', env.ADMIN_EMAIL || '');
    auth.searchParams.set('state', state);
    return Response.redirect(auth.toString(), 302);
  }

  if (p === '/gmail/callback' && method === 'GET') {
    const done = (msg, ok) => Response.redirect(url.origin + '/admin#/settings?' +
      (ok ? 'connected=gmail' : 'error=' + encodeURIComponent(msg)), 302);
    const err = url.searchParams.get('error');
    if (err) return done(err === 'access_denied' ? 'You cancelled the Google approval.' : err, false);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const saved = await getSetting(env, 'gmail_oauth_state');
    await setSetting(env, 'gmail_oauth_state', null);
    if (!code || !saved || saved.split('|')[0] !== state) return done('That approval link was stale. Try Connect again.', false);
    if (Date.now() - Number(saved.split('|')[1] || 0) > 15 * 60 * 1000) return done('That approval took too long. Try Connect again.', false);
    const conf = await gmailConfig(env);
    try {
      const res = await exchangeCode(conf.clientId, conf.clientSecret, code, url.origin + '/api/admin/gmail/callback');
      await setSetting(env, 'gmail_refresh_token', res.refreshToken);
      if (res.account) await setSetting(env, 'gmail_email', res.account);
    } catch (e) {
      return done(e.message, false);
    }
    return done('', true);
  }

  if (p === '/gmail/test' && method === 'POST') {
    if (!(await gmailReady(env))) return bad('Gmail is not connected yet.');
    const conf = await gmailConfig(env);
    try {
      await sendMail(env, {
        to: env.ADMIN_EMAIL,
        subject: env.BUSINESS_NAME + ' back office: mail is working',
        text: 'This is the test message from the back office. Quotes will go out from ' +
          (conf.account || env.ADMIN_EMAIL) + ' and land in that Sent folder.',
        html: '<p>This is the test message from the back office.</p><p>Quotes will go out from <b>' +
          (conf.account || env.ADMIN_EMAIL) + '</b> and land in that Sent folder.</p>',
      });
    } catch (e) {
      return bad('Google refused the send: ' + e.message, 502);
    }
    return json({ ok: true, sentTo: env.ADMIN_EMAIL });
  }

  // --- connecting QuickBooks, same shape as Gmail ------------------------

  if (p === '/qbo/app' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const id = String(body.client_id || '').trim();
    const secret = String(body.client_secret || '').trim();
    if (!id || !secret) return bad('Both the client id and the client secret are needed.');
    await setSetting(env, 'qbo_client_id', id);
    await setSetting(env, 'qbo_client_secret', secret);
    await setSetting(env, 'qbo_sandbox', body.sandbox ? '1' : null);
    return json({ ok: true, redirectUri: url.origin + '/api/admin/qbo/callback' });
  }

  if (p === '/qbo/start' && method === 'GET') {
    const conf = await qbo.qboConfig(env);
    if (!conf.clientId || !conf.clientSecret) return bad('Save the client id and secret first.');
    const state = crypto.randomUUID();
    await setSetting(env, 'qbo_oauth_state', state + '|' + Date.now());
    const ep = await qbo.endpoints(env, conf.sandbox);
    const auth = new URL(ep.authorization_endpoint);
    auth.searchParams.set('client_id', conf.clientId);
    auth.searchParams.set('redirect_uri', url.origin + '/api/admin/qbo/callback');
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', qbo.QBO_SCOPES);
    auth.searchParams.set('state', state);
    return Response.redirect(auth.toString(), 302);
  }

  if (p === '/qbo/callback' && method === 'GET') {
    const done = (msg, ok) => Response.redirect(url.origin + '/admin#/settings?' +
      (ok ? 'connected=quickbooks' : 'error=' + encodeURIComponent(msg)), 302);
    const err = url.searchParams.get('error');
    if (err) return done(err === 'access_denied' ? 'You cancelled the QuickBooks approval.' : err, false);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const realmId = url.searchParams.get('realmId');
    const saved = await getSetting(env, 'qbo_oauth_state');
    await setSetting(env, 'qbo_oauth_state', null);
    if (!code || !saved || saved.split('|')[0] !== state) return done('That approval link was stale. Try Connect again.', false);
    if (!realmId) return done('QuickBooks did not say which company to use. Try Connect again.', false);
    const conf = await qbo.qboConfig(env);
    try {
      const res = await qbo.exchangeCode(env, conf, code, url.origin + '/api/admin/qbo/callback');
      await setSetting(env, 'qbo_refresh_token', res.refreshToken);
      await setSetting(env, 'qbo_realm_id', realmId);
      // Read the company back so the back office can show which one is wired
      // up, and so estimates are raised in the currency QuickBooks expects.
      const now = await qbo.qboConfig(env);
      const info = await qbo.companyInfo(env, now);
      await setSetting(env, 'qbo_company', info.name);
      await setSetting(env, 'qbo_currency', info.currency);
    } catch (e) {
      return done(e.message, false);
    }
    return done('', true);
  }

  if (p === '/qbo/disconnect' && method === 'POST') {
    // Tell Intuit we are done before forgetting our own copy, so the grant is
    // actually gone rather than merely forgotten on our side.
    const revoked = await qbo.revokeToken(env).catch(() => false);
    for (const k of ['qbo_client_id', 'qbo_client_secret', 'qbo_refresh_token', 'qbo_realm_id',
      'qbo_sandbox', 'qbo_company', 'qbo_currency', 'qbo_oauth_state',
      'qbo_access_token', 'qbo_access_expires', 'qbo_needs_reconnect']) {
      await setSetting(env, k, null);
    }
    return json({ ok: true, revoked });
  }

  if (p === '/gmail/disconnect' && method === 'POST') {
    for (const k of ['gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token', 'gmail_email', 'gmail_oauth_state']) {
      await setSetting(env, k, null);
    }
    return json({ ok: true });
  }

  if (p === '/stats' && method === 'GET') {
    const since = new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const [byStatus, recent, visits, topPages, referrers, series] = await Promise.all([
      env.DB.prepare('SELECT status, COUNT(*) n FROM orders GROUP BY status').all(),
      env.DB.prepare(
        `SELECT o.*, c.name customer_name FROM orders o JOIN customers c ON c.id = o.customer_id
         ORDER BY o.created_at DESC LIMIT 8`,
      ).all(),
      env.DB.prepare(
        'SELECT COUNT(*) views, COUNT(DISTINCT visitor) visitors FROM events WHERE day >= ?',
      ).bind(since).first(),
      env.DB.prepare(
        'SELECT path, COUNT(*) n FROM events WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 8',
      ).bind(since).all(),
      env.DB.prepare(
        `SELECT referrer, COUNT(*) n FROM events WHERE day >= ? AND referrer IS NOT NULL
         GROUP BY referrer ORDER BY n DESC LIMIT 8`,
      ).bind(since).all(),
      env.DB.prepare(
        `SELECT day, COUNT(DISTINCT visitor) visitors FROM events WHERE day >= ?
         GROUP BY day ORDER BY day`,
      ).bind(since).all(),
    ]);
    const requests = await env.DB.prepare(
      "SELECT COUNT(*) n FROM orders WHERE created_at >= datetime('now', '-30 days')",
    ).first();
    return json({
      byStatus: byStatus.results,
      recent: recent.results,
      visits,
      topPages: topPages.results,
      referrers: referrers.results,
      series: series.results,
      requests30: requests.n,
      conversion: visits.visitors ? +(100 * requests.n / visits.visitors).toFixed(1) : 0,
    });
  }

  if (p === '/orders' && method === 'GET') {
    const status = url.searchParams.get('status');
    const q = url.searchParams.get('q');
    let sql = `SELECT o.*, c.name customer_name, c.email customer_email,
               (SELECT COUNT(*) FROM order_files f WHERE f.order_id = o.id) files
               FROM orders o JOIN customers c ON c.id = o.customer_id WHERE 1=1`;
    const binds = [];
    if (status && status !== 'all') { sql += ' AND o.status = ?'; binds.push(status); }
    if (q) {
      sql += ' AND (o.ref LIKE ? OR c.name LIKE ? OR c.email LIKE ? OR o.notes LIKE ?)';
      binds.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY o.created_at DESC LIMIT 200';
    const rows = await env.DB.prepare(sql).bind(...binds).all();
    return json({ orders: rows.results });
  }

  const orderMatch = p.match(/^\/orders\/(\d+)$/);
  if (orderMatch && method === 'GET') {
    const id = Number(orderMatch[1]);
    const order = await env.DB.prepare(
      `SELECT o.*, c.name customer_name, c.email customer_email, c.phone customer_phone
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
    ).bind(id).first();
    if (!order) return bad('No such order', 404);
    const [files, events, quotes] = await Promise.all([
      env.DB.prepare('SELECT * FROM order_files WHERE order_id = ? ORDER BY id').bind(id).all(),
      env.DB.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC').bind(id).all(),
      env.DB.prepare('SELECT * FROM quotes WHERE order_id = ? ORDER BY id DESC').bind(id).all(),
    ]);
    const history = await env.DB.prepare(
      'SELECT id, ref, status, created_at FROM orders WHERE customer_id = ? AND id != ? ORDER BY id DESC LIMIT 10',
    ).bind(order.customer_id, id).all();
    const lines = quotes.results.length
      ? (await env.DB.prepare('SELECT * FROM quote_lines WHERE quote_id IN (SELECT id FROM quotes WHERE order_id = ?) ORDER BY quote_id, position').bind(id).all()).results
      : [];
    // The quote builder needs the price list and the tax rate so it can price a
    // line the moment it is picked, and show the same total the server will save.
    const priceList = await env.DB.prepare(
      'SELECT id, sku, name, description, unit_cents FROM price_list WHERE active = 1 ORDER BY position, id',
    ).all();
    const taxPct = Number((await env.DB.prepare("SELECT value FROM settings WHERE key = 'tax_rate_pct'").first())?.value || 0);
    return json({
      order, files: files.results, events: events.results, quotes: quotes.results,
      lines, history: history.results, gmail: await gmailReady(env),
      prices: priceList.results, taxPct,
    });
  }

  if (orderMatch && method === 'POST') {
    const id = Number(orderMatch[1]);
    const body = await request.json().catch(() => ({}));
    if (body.status) {
      if (!STATUSES.includes(body.status)) return bad('Unknown status');
      await env.DB.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(body.status, id).run();
      await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
        .bind(id, 'status', `Moved to ${body.status}`).run();
    }
    if (body.note) {
      await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
        .bind(id, 'note', String(body.note).slice(0, 2000)).run();
    }
    return json({ ok: true });
  }

  const fileMatch = p.match(/^\/files\/(\d+)$/);
  if (fileMatch && method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM order_files WHERE id = ?').bind(Number(fileMatch[1])).first();
    if (!row) return bad('No such file', 404);
    const obj = await env.FILES.get(row.r2_key);
    if (!obj) return bad('File missing from storage', 404);
    return new Response(obj.body, {
      headers: {
        'content-type': row.content_type || 'application/octet-stream',
        'content-disposition': `attachment; filename="${row.filename.replace(/"/g, '')}"`,
      },
    });
  }

  if (p === '/customers' && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT c.*, COUNT(o.id) orders, MAX(o.created_at) last_order
       FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
       GROUP BY c.id ORDER BY last_order DESC NULLS LAST LIMIT 200`,
    ).all();
    return json({ customers: rows.results });
  }

  if (p === '/prices' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM price_list ORDER BY position, id').all();
    return json({ prices: rows.results });
  }

  if (p === '/prices' && method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!Array.isArray(body.prices)) return bad('Expected a prices array');
    const stmts = body.prices.map((row) =>
      env.DB.prepare('UPDATE price_list SET name = ?, description = ?, unit_cents = ?, active = ? WHERE id = ?')
        .bind(row.name, row.description || null, row.unit_cents ?? null, row.active ? 1 : 0, row.id),
    );
    if (stmts.length) await env.DB.batch(stmts);
    return json({ ok: true });
  }

  const quoteMatch = p.match(/^\/orders\/(\d+)\/quote$/);
  if (quoteMatch && method === 'POST') {
    const orderId = Number(quoteMatch[1]);
    const body = await request.json().catch(() => ({}));
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (!lines.length) return bad('A quote needs at least one line');

    const order = await env.DB.prepare(
      `SELECT o.*, c.name customer_name, c.email customer_email FROM orders o
       JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
    ).bind(orderId).first();
    if (!order) return bad('No such order', 404);

    const subtotal = lines.reduce((sum, l) => sum + Math.round(l.qty * l.unit_cents), 0);
    const taxPct = Number((await env.DB.prepare("SELECT value FROM settings WHERE key = 'tax_rate_pct'").first())?.value || 0);
    const tax = Math.round((subtotal * taxPct) / 100);
    const total = subtotal + tax;
    const days = Number((await env.DB.prepare("SELECT value FROM settings WHERE key = 'quote_validity_days'").first())?.value || 14);
    const validUntil = new Date(Date.now() + days * 864e5).toISOString();

    const quote = await env.DB.prepare(
      `INSERT INTO quotes (order_id, currency, subtotal_cents, tax_cents, total_cents, valid_until, status)
       VALUES (?, ?, ?, ?, ?, ?, 'draft') RETURNING *`,
    ).bind(orderId, env.CURRENCY || 'XCG', subtotal, tax, total, validUntil).first();

    await env.DB.batch(lines.map((l, i) =>
      env.DB.prepare(
        'INSERT INTO quote_lines (quote_id, description, qty, unit_cents, line_cents, position) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(quote.id, l.description, l.qty, l.unit_cents, Math.round(l.qty * l.unit_cents), i),
    ));

    // The QuickBooks estimate is the customer-facing quotation, numbered by
    // QuickBooks so the number on the email matches the number in his books.
    await syncEstimate(env, quote.id);

    let payment = null;
    if (body.withPaymentLink !== false) {
      try {
        payment = await createPayment(env, {
          amountCents: total,
          description: `${env.BUSINESS_NAME} ${order.ref}`,
          returnUrl: `${env.PUBLIC_ORIGIN}/thanks?status=`,
          customerRef: order.ref,
          expiresAt: validUntil.replace('Z', '+00:00'),
        });
        await env.DB.prepare('UPDATE quotes SET sentoo_uid = ?, sentoo_url = ?, sentoo_status = ? WHERE id = ?')
          .bind(payment.uid, payment.url, payment.mock ? 'mock' : 'issued', quote.id).run();
      } catch (err) {
        payment = { error: err.message };
      }
    }

    await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
      .bind(orderId, 'note', `Quote drafted, total ${(total / 100).toFixed(2)} ${env.CURRENCY}`).run();
    await env.DB.prepare("UPDATE orders SET status = 'quoted', updated_at = datetime('now') WHERE id = ?")
      .bind(orderId).run();

    return json({ ok: true, quote, payment });
  }

  // --- send the quote to the customer -----------------------------------
  const sendMatch = p.match(/^\/quotes\/(\d+)\/send$/);
  if (sendMatch && method === 'POST') {
    const quoteId = Number(sendMatch[1]);
    const quote = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
    if (!quote) return bad('No such quote', 404);
    const order = await env.DB.prepare(
      `SELECT o.*, c.name customer_name, c.email customer_email FROM orders o
       JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`,
    ).bind(quote.order_id).first();
    const lines = (await env.DB.prepare('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position').bind(quoteId).all()).results;

    // The payment link is always built from the quote total, so the amount
    // the customer pays cannot drift from the amount that was quoted.
    let payUrl = quote.sentoo_url;
    if (!payUrl) {
      try {
        const payment = await createPayment(env, {
          amountCents: quote.total_cents,
          description: env.BUSINESS_NAME + ' ' + order.ref,
          returnUrl: env.PUBLIC_ORIGIN + '/thanks?status=',
          customerRef: order.ref,
          expiresAt: quote.valid_until ? String(quote.valid_until).replace('Z', '+00:00') : undefined,
        });
        payUrl = payment.url;
        await env.DB.prepare('UPDATE quotes SET sentoo_uid = ?, sentoo_url = ?, sentoo_status = ? WHERE id = ?')
          .bind(payment.uid, payment.url, payment.mock ? 'mock' : 'issued', quoteId).run();
      } catch (err) {
        return bad('The payment link could not be created: ' + err.message, 502);
      }
    }

    if (!(await gmailReady(env))) {
      return bad('Email is not connected yet. The payment link is ready: ' + payUrl, 503);
    }

    // Make sure the estimate exists before the email goes out, so the customer
    // sees the QuickBooks number and gets the QuickBooks PDF.
    const fresh = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
    let estimateId = fresh.qbo_estimate_id;
    if (!estimateId) estimateId = await syncEstimate(env, quoteId);
    const withNo = await env.DB.prepare('SELECT qbo_estimate_no FROM quotes WHERE id = ?').bind(quoteId).first();

    const body = quoteEmail({
      business: env.BUSINESS_NAME, order, customer: { name: order.customer_name }, quote,
      lines, payUrl, currency: quote.currency || env.CURRENCY || 'XCG',
      estimateNo: withNo && withNo.qbo_estimate_no,
    });

    const attachments = [];
    if (estimateId) {
      try {
        const conf = await qbo.qboConfig(env);
        const pdf = await qbo.estimatePdf(env, conf, estimateId);
        attachments.push({
          filename: 'Quote-' + ((withNo && withNo.qbo_estimate_no) || order.ref) + '.pdf',
          mimeType: 'application/pdf',
          bytes: pdf,
        });
      } catch (err) {
        // A missing PDF is not worth holding up the quote. The email still
        // carries the lines and the total in its own body.
        console.log('qbo pdf failed', err.message);
      }
    }

    try {
      await sendMail(env, {
        to: order.customer_email,
        subject: env.BUSINESS_NAME + ' quote ' + ((withNo && withNo.qbo_estimate_no) || order.ref),
        text: body.text,
        html: body.html,
        attachments,
      });
    } catch (err) {
      return bad('The quote could not be emailed: ' + err.message, 502);
    }

    await env.DB.prepare("UPDATE quotes SET status = 'sent', sent_at = datetime('now') WHERE id = ?").bind(quoteId).run();
    await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
      .bind(order.id, 'email', 'Quote emailed to ' + order.customer_email).run();
    await env.DB.prepare("UPDATE orders SET status = 'quoted', updated_at = datetime('now') WHERE id = ?")
      .bind(order.id).run();
    return json({ ok: true, payUrl });
  }

  // --- mark a quote paid by hand, for cash and bank transfers ------------
  const paidMatch = p.match(/^\/quotes\/(\d+)\/paid$/);
  if (paidMatch && method === 'POST') {
    const quoteId = Number(paidMatch[1]);
    const quote = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(quoteId).first();
    if (!quote) return bad('No such quote', 404);
    const how = (await request.json().catch(() => ({}))).how || 'marked paid by hand';
    await env.DB.prepare("UPDATE quotes SET status = 'paid', paid_at = datetime('now') WHERE id = ?").bind(quoteId).run();
    await env.DB.prepare("UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?").bind(quote.order_id).run();
    await env.DB.prepare('INSERT INTO order_events (order_id, kind, detail) VALUES (?, ?, ?)')
      .bind(quote.order_id, 'payment', how).run();
    await syncInvoice(env, quoteId, how);
    return json({ ok: true });
  }

  // --- ask Sentoo right now instead of waiting for the callback ---------
  const checkMatch = p.match(/^\/quotes\/(\d+)\/check$/);
  if (checkMatch && method === 'POST') {
    const quote = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(Number(checkMatch[1])).first();
    if (!quote || !quote.sentoo_uid) return bad('No payment to check', 404);
    try {
      const { status } = await fetchStatus(env, quote.sentoo_uid);
      const paid = await applyPaymentStatus(env, quote, status);
      return json({ ok: true, status, paid });
    } catch (err) {
      return bad('Sentoo did not answer: ' + err.message, 502);
    }
  }

  return bad('Unknown admin route', 404);
}

// -------------------------------------------------------------------- router

export default {
  // Runs on a cron. Sentoo's own docs warn that webhooks can be late, out of
  // order, or missing, so every few minutes we ask them about the payments we
  // are still waiting on. Whichever arrives first wins; applying a status
  // twice is a no-op.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const pending = await env.DB.prepare(
        `SELECT * FROM quotes
         WHERE sentoo_uid IS NOT NULL AND status != 'paid'
           AND (sentoo_status IS NULL OR sentoo_status NOT IN ('success', 'paid', 'expired', 'cancelled'))
           AND created_at >= datetime('now', '-30 days')
         LIMIT 25`,
      ).all();
      for (const quote of pending.results) {
        try {
          const { status } = await fetchStatus(env, quote.sentoo_uid);
          await applyPaymentStatus(env, quote, status);
        } catch (err) {
          console.log('poll failed for quote', quote.id, err.message);
        }
      }
    })());
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, request) });
    }

    try {
      // Public
      if (path === '/api/quote-request' && request.method === 'POST') {
        const res = await handleQuoteRequest(request, env, ctx);
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(env, request) } });
      }
      if (path === '/api/e' && request.method === 'POST') {
        const res = await handleBeacon(request, env);
        return new Response(res.body, { status: res.status, headers: { ...Object.fromEntries(res.headers), ...corsHeaders(env, request) } });
      }
      if (path === '/api/webhooks/sentoo' && request.method === 'POST') {
        return handleSentooWebhook(request, env);
      }
      if (path === '/api/health') {
        return json({ ok: true, mode: isMock(env) ? 'sentoo mock' : 'sentoo live' });
      }

      // Admin
      if (path === '/admin' || path === '/admin/' || path.startsWith('/admin/')) {
        const who = await identify(request, env);
        if (!who) return new Response('Not authorised.', { status: 403 });
        return new Response(ADMIN_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (path.startsWith('/api/admin/')) {
        const who = await identify(request, env);
        if (!who) return json({ error: 'Not authorised' }, 403);
        return adminRoutes(request, env, url, who);
      }

      if (path === '/' || path === '') {
        return Response.redirect(new URL('/admin', request.url).toString(), 302);
      }
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.log('worker error', err.stack || err.message);
      return json({ error: 'Something broke on our side.' }, 500);
    }
  },
};
