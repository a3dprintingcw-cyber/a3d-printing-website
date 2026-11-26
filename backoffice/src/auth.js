// Sign-in for the back office with a PIN, the same idea as Volcano's kitchen.
//
//   - Adrian sets the PIN himself in Settings. Only a salted PBKDF2 hash is
//     kept (settings key "admin_pin"), never the PIN.
//   - A correct PIN gives the device a signed cookie for 30 days, so a phone
//     or laptop stays signed in. Changing the PIN signs every device out.
//   - Wrong PINs are counted per network: 5 wrong in 15 minutes locks that
//     network out for 15 minutes. On top of that, 20 wrong across everyone in
//     an hour locks sign-in for all, so nobody can spread guesses over many
//     networks. A 6 digit PIN at that pace takes years to guess.
//   - The signing secret is made by the server on first use and kept in D1,
//     so nothing has to be typed into the Cloudflare dashboard.
//   - Cloudflare Access is still accepted while it exists, so the switch over
//     never locks anyone out. Remove the Access application once the PIN works.

import { getSetting, setSetting } from './settings.js';

export const COOKIE = 'a3d_session';
const SESSION_DAYS = 30;
const ITERATIONS = 100000; // the most Workers' PBKDF2 allows
const PER_NETWORK = { max: 5, windowSec: 15 * 60 };
const EVERYONE = { max: 20, windowSec: 60 * 60 };

const enc = (s) => new TextEncoder().encode(s);
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

let tablesReady = false;
export async function ensureTables(env) {
  if (tablesReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS login_attempts (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push_devices (endpoint TEXT PRIMARY KEY, label TEXT, created_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS push_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, title TEXT, body TEXT, url TEXT, created_at INTEGER NOT NULL)'),
  ]);
  tablesReady = true;
}

async function secret(env) {
  let s = await getSetting(env, 'session_secret');
  if (!s) {
    s = b64url(crypto.getRandomValues(new Uint8Array(32)));
    // First writer wins if two requests race here.
    await env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind('session_secret', s).run();
    s = await getSetting(env, 'session_secret');
  }
  return s;
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', enc(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', k, enc(data)));
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hashPin(pin, salt, iterations = ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', enc(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc(salt), iterations }, key, 256);
  return hex(bits);
}

export function validPin(pin) {
  return /^\d{6,12}$/.test(String(pin || ''));
}

export async function pinConfigured(env) {
  return Boolean(await getSetting(env, 'admin_pin'));
}

/** Saves a new PIN. Every device that was signed in has to sign in again. */
export async function setPin(env, pin) {
  if (!validPin(pin)) throw new Error('Use 6 to 12 digits.');
  if (/^(\d)\1+$/.test(pin) || '0123456789012'.includes(pin) || '9876543210987'.includes(pin)) {
    throw new Error('Pick a PIN that is not all the same digit or a simple run like 123456.');
  }
  const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const version = b64url(crypto.getRandomValues(new Uint8Array(6)));
  await setSetting(env, 'admin_pin', JSON.stringify({ salt, hash: await hashPin(pin, salt), iterations: ITERATIONS, version }));
}

async function pinRecord(env) {
  const raw = await getSetting(env, 'admin_pin');
  return raw ? JSON.parse(raw) : null;
}

// ---------- sessions ----------

function readCookie(request, name) {
  const part = (request.headers.get('Cookie') || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(name + '='));
  return part ? part.slice(name.length + 1) : '';
}

export function sessionCookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function signSession(env, version, expires) {
  return `${expires}.${await hmac(await secret(env), `a3d-admin:${version}:${expires}`)}`;
}

/** True when the request carries a valid, unexpired PIN session. */
export async function pinSession(request, env) {
  const value = readCookie(request, COOKIE);
  if (!value) return false;
  const [expires, sig] = value.split('.');
  if (!expires || !sig || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const rec = await pinRecord(env);
  if (!rec) return false;
  const expected = await signSession(env, rec.version, expires);
  return sameString(value, expected);
}

// ---------- wrong PIN counting ----------

async function networkBucket(env, request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  return 'ip:' + (await hmac(await secret(env), 'ip:' + ip)).slice(0, 22);
}

async function readBucket(env, bucket, windowSec, now) {
  const row = await env.DB.prepare('SELECT count, window_start FROM login_attempts WHERE bucket = ?').bind(bucket).first();
  if (!row || now - row.window_start >= windowSec) return 0;
  return row.count;
}

async function bumpBucket(env, bucket, windowSec, now) {
  const row = await env.DB.prepare('SELECT count, window_start FROM login_attempts WHERE bucket = ?').bind(bucket).first();
  if (!row || now - row.window_start >= windowSec) {
    await env.DB.prepare('INSERT OR REPLACE INTO login_attempts (bucket, count, window_start) VALUES (?, 1, ?)').bind(bucket, now).run();
  } else {
    await env.DB.prepare('UPDATE login_attempts SET count = count + 1 WHERE bucket = ?').bind(bucket).run();
  }
}

export class LoginError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** Checks a PIN. Returns the Set-Cookie header value on success, throws LoginError otherwise. */
export async function login(request, env, pin) {
  await ensureTables(env);
  const rec = await pinRecord(env);
  if (!rec) throw new LoginError('No PIN has been set yet.', 409);
  const now = Math.floor(Date.now() / 1000);
  const mine = await networkBucket(env, request);
  if ((await readBucket(env, mine, PER_NETWORK.windowSec, now)) >= PER_NETWORK.max ||
      (await readBucket(env, 'all', EVERYONE.windowSec, now)) >= EVERYONE.max) {
    throw new LoginError('Too many wrong PINs. Wait 15 minutes and try again.', 429);
  }
  const ok = validPin(pin) && sameString(await hashPin(String(pin), rec.salt, rec.iterations || ITERATIONS), rec.hash);
  if (!ok) {
    await bumpBucket(env, mine, PER_NETWORK.windowSec, now);
    await bumpBucket(env, 'all', EVERYONE.windowSec, now);
    throw new LoginError('That PIN is not right.', 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE bucket = ?').bind(mine).run();
  return issueSession(env);
}

/** A fresh 30 day session for the current PIN, as a Set-Cookie value. */
export async function issueSession(env) {
  const rec = await pinRecord(env);
  if (!rec) return null;
  const maxAge = SESSION_DAYS * 24 * 3600;
  return sessionCookie(await signSession(env, rec.version, Math.floor(Date.now() / 1000) + maxAge), maxAge);
}

// ---------- the sign-in page ----------

export const LOGIN_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>A3D back office</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="https://a3dprinting.com/assets/img/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="A3D Office">
<meta name="theme-color" content="#0d0f13">
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0d0f13;color:#f2f4f8;font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
main{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
.box{width:100%;max-width:340px;text-align:center}
img{width:150px;margin-bottom:28px}
h1{font-size:20px;margin:0 0 22px;font-weight:700}
input{width:100%;font-size:28px;letter-spacing:.4em;text-align:center;padding:14px;border-radius:14px;border:1px solid #2b313c;background:#171a21;color:#fff;outline:none}
input:focus{border-color:#4d84ff}
button{width:100%;margin-top:14px;padding:15px;border:0;border-radius:14px;background:#4d84ff;color:#fff;font-size:17px;font-weight:700}
button:disabled{opacity:.6}
.err{color:#ff8a8a;min-height:22px;margin-top:12px;font-size:14px}
.muted{color:#8a93a3;font-size:13px;margin-top:22px}
</style></head>
<body><main><div class="box">
<img src="https://a3dprinting.com/assets/img/logo-dark.png" alt="A3D Printing">
<h1>Back office</h1>
<form id="f">
<input id="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]*" maxlength="12" placeholder="PIN" autofocus required>
<button id="b" type="submit">Sign in</button>
<div class="err" id="e" role="alert"></div>
</form>
<p class="muted" id="m"></p>
</div></main>
<script>
fetch('/api/auth/session').then(function(r){return r.json()}).then(function(s){
  if(!s.configured){document.getElementById('m').textContent='No PIN is set yet. Sign in the old way and set one under Settings.';}
});
document.getElementById('f').addEventListener('submit',function(ev){
  ev.preventDefault();var b=document.getElementById('b'),e=document.getElementById('e');b.disabled=true;e.textContent='';
  fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:document.getElementById('pin').value})})
  .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Sign in failed');})})
  .then(function(){location.reload()})
  .catch(function(x){e.textContent=x.message;b.disabled=false;document.getElementById('pin').select();});
});
</script></body></html>`;
