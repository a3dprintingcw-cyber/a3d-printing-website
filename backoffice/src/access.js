// Verifies the Cloudflare Access identity on every admin request.
//
// Access sits in front of /admin and /api/admin/*, so in practice a request
// only reaches the Worker after Cloudflare has already authenticated it. We
// verify the signed assertion anyway: if the Access application is ever
// removed or misconfigured, the Worker must fail closed rather than serve the
// back office to the open internet.

const keyCache = { at: 0, keys: null };

async function fetchKeys(team) {
  const now = Date.now();
  if (keyCache.keys && now - keyCache.at < 3600_000) return keyCache.keys;
  const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('access: cannot fetch signing keys');
  const jwks = await res.json();
  keyCache.keys = jwks.keys || [];
  keyCache.at = now;
  return keyCache.keys;
}

function b64urlToBytes(s) {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeJson(part) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part)));
}

/**
 * Returns the verified email, or null when the request is not authenticated.
 */
export async function identify(request, env) {
  const team = env.CF_ACCESS_TEAM;
  const aud = env.CF_ACCESS_AUD;
  if (!team || team.startsWith('REPLACE') || !aud || aud.startsWith('REPLACE')) {
    // Not wired up yet. Refuse rather than guess.
    return null;
  }

  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  const cookie = (request.headers.get('Cookie') || '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('CF_Authorization='));
  const token = header || (cookie ? cookie.slice('CF_Authorization='.length) : null);
  if (!token) return null;

  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;

  let head, payload;
  try {
    head = decodeJson(h);
    payload = decodeJson(p);
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return null;
  if (payload.iss !== `https://${team}.cloudflareaccess.com`) return null;

  const keys = await fetchKeys(team);
  const jwk = keys.find((k) => k.kid === head.kid);
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(s),
    new TextEncoder().encode(`${h}.${p}`),
  );
  if (!ok) return null;

  const email = (payload.email || '').toLowerCase();
  const allowed = (env.ADMIN_EMAIL || '').toLowerCase();
  if (allowed && email !== allowed) return null;
  return email;
}
