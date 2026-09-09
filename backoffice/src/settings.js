// Small key/value settings, stored in D1.
//
// Connection details for Gmail, QuickBooks and Sentoo live here rather than in
// Worker secrets, so Adrian can connect them himself from the back office
// without a deploy and without anyone typing a secret into a chat window. The
// table sits inside his own database, behind the same Access login as the rest
// of the admin, and secrets are never sent back to the browser: the API only
// ever answers "connected" or "not connected".

export async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export async function getSettings(env, keys) {
  const marks = keys.map(() => '?').join(',');
  const rows = await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${marks})`)
    .bind(...keys).all();
  const out = {};
  for (const r of rows.results) out[r.key] = r.value;
  return out;
}

export async function setSetting(env, key, value) {
  if (value === null || value === undefined || value === '') {
    await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
    return;
  }
  await env.DB.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).bind(key, String(value)).run();
}
