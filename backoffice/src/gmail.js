// Sending from a3dprinting.cw@gmail.com through the Gmail API.
//
// Adrian approves access once in Google, we keep the refresh token as a
// Worker secret, and from then on every quote goes out from his real address
// and lands in his real Sent folder. Nothing is stored by us except the token.

import { getSettings } from './settings.js';

export const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Where the connection details come from. The back office writes them to the
 * settings table when Adrian connects Gmail; Worker secrets still win if they
 * are set, so a deploy can override a bad row without a database edit.
 */
export async function gmailConfig(env) {
  const s = await getSettings(env, ['gmail_client_id', 'gmail_client_secret', 'gmail_refresh_token', 'gmail_email'])
    .catch(() => ({}));
  return {
    clientId: env.GMAIL_CLIENT_ID || s.gmail_client_id || '',
    clientSecret: env.GMAIL_CLIENT_SECRET || s.gmail_client_secret || '',
    refreshToken: env.GMAIL_REFRESH_TOKEN || s.gmail_refresh_token || '',
    account: s.gmail_email || env.ADMIN_EMAIL || '',
  };
}

/** Trades the long lived refresh token for an hour long access token. */
export async function accessToken(env, conf) {
  const c = conf || (await gmailConfig(env));
  const body = new URLSearchParams({
    client_id: c.clientId,
    client_secret: c.clientSecret,
    refresh_token: c.refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error('gmail: could not refresh the token, ' + (json.error_description || json.error || res.status));
  }
  return json.access_token;
}

/**
 * Swaps the one time code from the consent screen for a refresh token.
 * Returns the refresh token and, when Google tells us, which account approved.
 */
export async function exchangeCode(clientId, clientSecret, code, redirectUri) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description || json.error || ('token exchange failed, ' + res.status));
  if (!json.refresh_token) {
    throw new Error('Google did not send a refresh token. Remove the old access for this app at myaccount.google.com/permissions and connect again.');
  }
  let account = '';
  try {
    const claims = JSON.parse(atob(String(json.id_token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    account = claims.email || '';
  } catch (e) { /* the address is a nicety, not a requirement */ }
  return { refreshToken: json.refresh_token, account };
}

export async function isConfigured(env) {
  const c = await gmailConfig(env);
  return Boolean(c.clientId && c.clientSecret && c.refreshToken);
}

// Base64url without padding, working on bytes so accents survive.
function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encodeHeader(text) {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7E]*$/.test(text) ? text : '=?UTF-8?B?' + b64url(text).replace(/-/g, '+').replace(/_/g, '/') + '?=';
}

/**
 * Sends a multipart alternative message and returns the Gmail message id.
 */
export async function sendMail(env, { to, subject, text, html, replyTo }) {
  const conf = await gmailConfig(env);
  if (!conf.clientId || !conf.clientSecret || !conf.refreshToken) throw new Error('gmail: not connected yet');
  const token = await accessToken(env, conf);
  const from = conf.account || env.ADMIN_EMAIL;
  const boundary = 'a3d' + Math.random().toString(16).slice(2);

  const raw = [
    'From: ' + encodeHeader(env.BUSINESS_NAME) + ' <' + from + '>',
    'To: ' + to,
    replyTo ? 'Reply-To: ' + replyTo : null,
    'Subject: ' + encodeHeader(subject),
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    '',
    '--' + boundary,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
    '',
    '--' + boundary,
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
    '',
    '--' + boundary + '--',
    '',
  ].filter((l) => l !== null).join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64url(raw) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('gmail: send failed, ' + (json.error?.message || res.status));
  return json.id;
}

/**
 * The quote email. Plain text first because that is what half of Curaçao
 * reads it on, HTML for everyone else.
 */
export function quoteEmail({ business, order, customer, quote, lines, payUrl, currency }) {
  const money = (cents) => currency + ' ' + (cents / 100).toFixed(2);
  const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const textLines = [
    'Hi ' + customer.name + ',',
    '',
    'Thanks for your request. Here is the quote for ' + order.ref + ':',
    '',
    ...lines.map((l) => '  ' + l.qty + ' x ' + l.description + '   ' + money(l.line_cents)),
    '',
    quote.tax_cents ? '  Subtotal ' + money(quote.subtotal_cents) : null,
    quote.tax_cents ? '  Tax      ' + money(quote.tax_cents) : null,
    '  Total    ' + money(quote.total_cents),
    '',
    payUrl ? 'To approve it, pay here: ' + payUrl : 'Reply to this email to approve it.',
    payUrl ? 'We start printing as soon as the payment comes through.' : null,
    validUntil ? 'This quote is valid until ' + validUntil + '.' : null,
    '',
    'Any questions, just reply to this email or send a WhatsApp.',
    '',
    business,
    'Curaçao',
  ].filter(Boolean);

  const rows = lines.map((l) =>
    '<tr><td style="padding:6px 0">' + l.qty + ' &times; ' + escapeHtml(l.description) +
    '</td><td style="padding:6px 0;text-align:right">' + money(l.line_cents) + '</td></tr>').join('');

  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#14161a">',
    '<p>Hi ' + escapeHtml(customer.name) + ',</p>',
    '<p>Thanks for your request. Here is the quote for <b>' + escapeHtml(order.ref) + '</b>:</p>',
    '<table style="width:100%;border-collapse:collapse;font-size:15px">' + rows,
    quote.tax_cents ? '<tr><td style="padding:6px 0;border-top:1px solid #e3e7ef">Subtotal</td><td style="padding:6px 0;border-top:1px solid #e3e7ef;text-align:right">' + money(quote.subtotal_cents) + '</td></tr>' : '',
    quote.tax_cents ? '<tr><td style="padding:6px 0">Tax</td><td style="padding:6px 0;text-align:right">' + money(quote.tax_cents) + '</td></tr>' : '',
    '<tr><td style="padding:10px 0;border-top:2px solid #14161a"><b>Total</b></td><td style="padding:10px 0;border-top:2px solid #14161a;text-align:right"><b>' + money(quote.total_cents) + '</b></td></tr>',
    '</table>',
    payUrl
      ? '<p style="margin:26px 0"><a href="' + payUrl + '" style="background:#1e5fd6;color:#fff;text-decoration:none;padding:13px 24px;border-radius:999px;font-weight:600;display:inline-block">Pay ' + money(quote.total_cents) + '</a></p><p style="color:#4a4f58;font-size:14px">We start printing as soon as the payment comes through.</p>'
      : '<p>Reply to this email to approve it.</p>',
    validUntil ? '<p style="color:#4a4f58;font-size:13.5px">This quote is valid until ' + validUntil + '.</p>' : '',
    '<p style="color:#4a4f58;font-size:13.5px">Any questions, just reply to this email or send a WhatsApp.</p>',
    '<p style="font-size:13.5px">' + escapeHtml(business) + '<br>Curaçao</p>',
    '</div>',
  ].join('');

  return { text: textLines.join('\n'), html };
}

function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
