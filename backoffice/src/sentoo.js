// Sentoo merchant API client.
//
// Notes that come straight from their binder and are easy to get wrong:
//   - amounts are in cents, minimum 100
//   - the description is capped at 50 characters and only the first 32 reach
//     the bank statement, with accents and emoji stripped
//   - the return URL hostname has to be allow-listed in the Sentoo portal
//   - the webhook carries the transaction id and NOTHING about the status,
//     so the status must always be fetched back from the API
//   - webhooks can arrive out of order, more than once, or not at all, so
//     every handler has to be idempotent and answer 200
//
// SENTOO_MODE=mock returns a believable fake so the whole quote flow can be
// clicked through before the real credentials exist.

function cleanDescription(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .slice(0, 50);
}

export function isMock(env) {
  return env.SENTOO_MODE === 'mock' || !env.SENTOO_MERCHANT || !env.SENTOO_SECRET;
}

export async function createPayment(env, { amountCents, description, returnUrl, customerRef, expiresAt }) {
  if (!Number.isInteger(amountCents) || amountCents < 100) {
    throw new Error('sentoo: amount must be a whole number of cents, at least 100');
  }

  if (isMock(env)) {
    const uid = crypto.randomUUID();
    return {
      mock: true,
      uid,
      url: `https://pay.sandbox.sentoo.io/p/${uid}`,
      qr: `https://pay.sandbox.sentoo.io/qr/${uid}`,
    };
  }

  const body = new URLSearchParams({
    sentoo_merchant: env.SENTOO_MERCHANT,
    sentoo_amount: String(amountCents),
    sentoo_currency: env.CURRENCY || 'XCG',
    sentoo_description: cleanDescription(description),
    sentoo_return_url: returnUrl,
  });
  if (customerRef) body.set('sentoo_customer', String(customerRef).slice(0, 50));
  if (expiresAt) body.set('sentoo_expires', expiresAt);

  const res = await fetch(`${env.SENTOO_BASE}/v1/payment/new`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'X-SENTOO-SECRET': env.SENTOO_SECRET,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new Error(`sentoo: create failed, ${msg}`);
  }
  return {
    mock: false,
    uid: json.success.message,
    url: json.success.data?.url,
    qr: json.success.data?.qr_code,
  };
}

export async function fetchStatus(env, transactionUid) {
  if (isMock(env)) return { status: 'pending', mock: true };
  const url = `${env.SENTOO_BASE}/v1/payment/status/${env.SENTOO_MERCHANT}/${transactionUid}`;
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'X-SENTOO-SECRET': env.SENTOO_SECRET },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`sentoo: status failed, HTTP ${res.status}`);
  const data = json?.success?.data || json?.data || json;
  return {
    status: (data.status || data.transaction_status || 'unknown').toLowerCase(),
    raw: data,
  };
}
