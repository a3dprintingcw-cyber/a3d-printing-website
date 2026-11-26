// A3D's own phone notifications (Web Push), the same way Volcano's kitchen does it.
//
//   1. In Settings, Adrian taps "Turn on notifications for this device". The
//      browser gives us an address (the "endpoint") at Apple, Google, Mozilla
//      or Microsoft. On iPhone this only works from the Home Screen app.
//   2. When an order comes in, we leave the message for that device in
//      push_outbox and call its endpoint, signed with our own key (VAPID).
//   3. The phone wakes our service worker (/sw.js), which asks this server
//      what to say and shows it.
// The call in step 2 carries nothing, so no order details pass through Apple
// or Google. The signing keys are made by the server and kept in D1.

import { getSetting } from './settings.js';
import { ensureTables } from './auth.js';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const text = (value) => new TextEncoder().encode(value);

// Only real push services may be called, so this can never be pointed elsewhere.
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.push\.apple\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/, /\.mozaws\.net$/];

export function validEndpoint(env, endpoint) {
  let url;
  try { url = new URL(String(endpoint)); } catch { return false; }
  if (env.PUSH_TEST_HOST && url.host === env.PUSH_TEST_HOST) return true; // local tests only
  return url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(url.hostname)) && String(endpoint).length < 1000;
}

export async function vapidKeys(env) {
  const read = async () => {
    const raw = await getSetting(env, 'vapid');
    return raw ? JSON.parse(raw) : null;
  };
  let keys = await read();
  if (keys) return keys;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const fresh = {
    publicKey: b64url(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(fresh)).run();
  return read();
}

async function vapidHeader(keys, endpoint) {
  const header = b64url(text(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(text(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:a3dprinting.cw@gmail.com',
  })));
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${keys.publicKey}`;
}

async function wake(env, keys, endpoint) {
  if (!validEndpoint(env, endpoint)) return 'gone';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { TTL: String(24 * 3600), Urgency: 'high', Authorization: await vapidHeader(keys, endpoint), 'Content-Length': '0' },
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    if (res.ok) return 'sent';
    console.log('push: service answered', res.status, new URL(endpoint).hostname);
  } catch (err) {
    console.log('push: failed', err.message);
  }
  return 'failed';
}

export async function addDevice(env, endpoint, label) {
  if (!validEndpoint(env, endpoint)) throw new Error('This browser gave an address we do not recognise.');
  await ensureTables(env);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_devices').first();
  if (count.n >= 10) throw new Error('Ten devices already get notifications. Turn one off first.');
  await env.DB.prepare('INSERT OR REPLACE INTO push_devices (endpoint, label, created_at) VALUES (?, ?, ?)')
    .bind(String(endpoint), String(label || '').slice(0, 80), Math.floor(Date.now() / 1000)).run();
}

export async function removeDevice(env, endpoint) {
  await ensureTables(env);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM push_devices WHERE endpoint = ?').bind(String(endpoint)),
    env.DB.prepare('DELETE FROM push_outbox WHERE endpoint = ?').bind(String(endpoint)),
  ]);
}

export async function deviceCount(env) {
  await ensureTables(env);
  return (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_devices').first()).n;
}

/** Sends one notification to every device. Returns how many were reached. */
export async function notifyDevices(env, { title, body, url }) {
  await ensureTables(env);
  const { results } = await env.DB.prepare('SELECT endpoint FROM push_devices').all();
  if (!results.length) return 0;
  const keys = await vapidKeys(env);
  const now = Math.floor(Date.now() / 1000);
  let sent = 0;
  for (const d of results) {
    await env.DB.prepare('INSERT INTO push_outbox (endpoint, title, body, url, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(d.endpoint, title, body, url || '/admin', now).run();
    const r = await wake(env, keys, d.endpoint);
    if (r === 'gone') await removeDevice(env, d.endpoint);
    if (r === 'sent') sent += 1;
  }
  // Messages nobody collected within two days are of no use any more.
  await env.DB.prepare('DELETE FROM push_outbox WHERE created_at < ?').bind(now - 2 * 24 * 3600).run();
  return sent;
}

/** The service worker asks what to show. It proves who it is with its own endpoint. */
export async function collectMessage(env, endpoint) {
  await ensureTables(env);
  const known = await env.DB.prepare('SELECT 1 FROM push_devices WHERE endpoint = ?').bind(String(endpoint || '')).first();
  if (!known) return null;
  const row = await env.DB.prepare('SELECT id, title, body, url FROM push_outbox WHERE endpoint = ? ORDER BY id LIMIT 1').bind(String(endpoint)).first();
  if (!row) return null;
  await env.DB.prepare('DELETE FROM push_outbox WHERE id = ?').bind(row.id).run();
  return { title: row.title, body: row.body, url: row.url };
}

// ---------- files the browser needs ----------

export const SERVICE_WORKER = `// A3D back office service worker: shows order notifications. Caches nothing.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (event) {
  event.waitUntil((async function () {
    var msg = { title: 'A3D Printing', body: 'Something new in the back office.', url: '/admin' };
    try {
      var sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        var r = await fetch('/api/push/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        if (r.ok) { var j = await r.json(); if (j && j.title) msg = j; }
      }
    } catch (e) {}
    await self.registration.showNotification(msg.title, {
      body: msg.body, icon: 'https://a3dprinting.com/assets/img/favicon-192.png', badge: 'https://a3dprinting.com/assets/img/favicon-192.png',
      tag: 'a3d-' + Date.now(), data: { url: msg.url || '/admin' }, vibrate: [200, 100, 200]
    });
  })());
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = new URL((event.notification.data && event.notification.data.url) || '/admin', self.location.origin).href;
  event.waitUntil((async function () {
    var wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < wins.length; i++) { if (wins[i].url.indexOf('/admin') !== -1) { await wins[i].focus(); return wins[i].navigate(url); } }
    return self.clients.openWindow(url);
  })());
});
`;

export const MANIFEST = JSON.stringify({
  name: 'A3D Back Office',
  short_name: 'A3D Office',
  start_url: '/admin',
  scope: '/',
  display: 'standalone',
  background_color: '#0d0f13',
  theme_color: '#0d0f13',
  icons: [
    { src: 'https://a3dprinting.com/assets/img/favicon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'https://a3dprinting.com/assets/img/favicon-512.png', sizes: '512x512', type: 'image/png' },
  ],
});
