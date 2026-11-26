// Instant phone notifications through ntfy (https://ntfy.sh).
//
// Adrian installs the free ntfy app and subscribes to a private topic. The
// topic name is the only "password", so it is long and random, it is made in
// the back office and kept in the settings table, never in this public repo.
// Like the email alert this is best effort: a failed push never loses an order.

import { getSetting, setSetting } from './settings.js';

const SERVER = 'https://ntfy.sh';

export async function ntfyTopic(env) {
  if (env.NTFY_TOPIC) return env.NTFY_TOPIC;
  return (await getSetting(env, 'ntfy_topic').catch(() => '')) || '';
}

/** Makes a fresh private topic, e.g. a3d-k3x9q2m7v1p8z4w6. */
export async function createTopic(env) {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let s = 'a3d-';
  for (const b of bytes) s += abc[b % abc.length];
  await setSetting(env, 'ntfy_topic', s);
  return s;
}

export async function clearTopic(env) {
  await setSetting(env, 'ntfy_topic', '');
}

/** Sends one push. Returns true when ntfy accepted it. */
export async function push(env, { title, message, click, tags = 'printer', priority = 'high' }, topicOverride) {
  const topic = topicOverride || (await ntfyTopic(env));
  if (!topic) return false;
  try {
    const headers = { Title: asciiHeader(title), Priority: priority, Tags: tags };
    if (click) headers.Click = click;
    const res = await fetch(`${SERVER}/${encodeURIComponent(topic)}`, { method: 'POST', headers, body: message });
    if (!res.ok) console.log('ntfy: refused', res.status);
    return res.ok;
  } catch (err) {
    console.log('ntfy: failed', err.message);
    return false;
  }
}

// HTTP headers must be plain ASCII; the message body can carry anything.
function asciiHeader(s) {
  return String(s || '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').slice(0, 200);
}

export function newOrderPush(order, customer, files) {
  const what = order.mode === 'dev'
    ? (order.project_type || 'Web / app project')
    : [order.quantity ? `${order.quantity}x` : '', order.material || '', order.colour || ''].filter(Boolean).join(' ') || '3D print';
  return {
    title: `New order ${order.ref}`,
    message: `${customer.name}${customer.company ? ' (' + customer.company + ')' : ''}\n${what}\n` +
      (files.length ? `${files.length} file(s) attached` : 'No files'),
    click: `https://app.a3dprinting.com/admin#/order/${order.id}`,
    tags: 'printer,bell',
  };
}
