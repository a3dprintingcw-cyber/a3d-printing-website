// QuickBooks Online.
//
// The quote Adrian builds in the back office becomes a real QuickBooks
// estimate, and once the customer pays it becomes a real QuickBooks invoice
// with the payment recorded against it. His books end up correct without him
// typing anything twice.
//
// Everything here is best effort by design. QuickBooks being down, or not
// connected yet, must never stop a quote going out or a payment being
// recognised, so callers catch and carry on.
//
// One Intuit quirk worth knowing: the refresh token rotates on every refresh
// and the old one dies. If we do not store the new one we lock ourselves out
// within the hour, so accessToken writes it back every single time.

import { getSettings, setSetting } from './settings.js';

export const QBO_SCOPES = 'com.intuit.quickbooks.accounting';

// Intuit publishes its OAuth endpoints in a discovery document and asks apps to
// read them from there rather than hardcode them, so a change on their side
// does not break every integration at once. We cache it for a day and fall back
// to the documented values if the fetch fails, because a discovery outage must
// not take the connection down with it.
const DISCOVERY = {
  production: 'https://developer.api.intuit.com/.well-known/openid_configuration/',
  sandbox: 'https://developer.api.intuit.com/.well-known/openid_sandbox_configuration/',
};
const FALLBACK = {
  authorization_endpoint: 'https://appcenter.intuit.com/connect/oauth2',
  token_endpoint: 'https://oauth2.platform.intuit.com/oauth2/v1/tokens/bearer',
  revocation_endpoint: 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
};
const DISCOVERY_TTL = 24 * 60 * 60 * 1000;

export async function endpoints(env, sandbox) {
  const key = sandbox ? 'qbo_discovery_sandbox' : 'qbo_discovery';
  try {
    const cached = await getSettings(env, [key, key + '_at']);
    if (cached[key] && Date.now() - Number(cached[key + '_at'] || 0) < DISCOVERY_TTL) {
      return { ...FALLBACK, ...JSON.parse(cached[key]) };
    }
  } catch (e) { /* a bad cache is not worth failing over */ }
  try {
    const res = await fetch(sandbox ? DISCOVERY.sandbox : DISCOVERY.production, { headers: { accept: 'application/json' } });
    if (res.ok) {
      const doc = await res.json();
      const keep = {
        authorization_endpoint: doc.authorization_endpoint,
        token_endpoint: doc.token_endpoint,
        revocation_endpoint: doc.revocation_endpoint,
        issuer: doc.issuer,
      };
      await setSetting(env, key, JSON.stringify(keep));
      await setSetting(env, key + '_at', String(Date.now()));
      return { ...FALLBACK, ...keep };
    }
  } catch (e) { /* fall through to the documented endpoints */ }
  return FALLBACK;
}

export async function qboConfig(env) {
  const s = await getSettings(env, [
    'qbo_client_id', 'qbo_client_secret', 'qbo_refresh_token',
    'qbo_realm_id', 'qbo_sandbox', 'qbo_company', 'qbo_currency',
    'qbo_access_token', 'qbo_access_expires', 'qbo_needs_reconnect',
    'qbo_tax_per_line', 'qbo_tax_code', 'qbo_tax_code_name',
  ]).catch(() => ({}));
  return {
    clientId: env.QBO_CLIENT_ID || s.qbo_client_id || '',
    clientSecret: env.QBO_CLIENT_SECRET || s.qbo_client_secret || '',
    refreshToken: env.QBO_REFRESH_TOKEN || s.qbo_refresh_token || '',
    realmId: s.qbo_realm_id || '',
    sandbox: s.qbo_sandbox === '1',
    company: s.qbo_company || '',
    currency: s.qbo_currency || '',
    taxPerLine: s.qbo_tax_per_line === '1',
    taxCode: s.qbo_tax_code || '',
    taxCodeName: s.qbo_tax_code_name || '',
    cachedToken: s.qbo_access_token || '',
    cachedExpires: Number(s.qbo_access_expires || 0),
    needsReconnect: s.qbo_needs_reconnect === '1',
  };
}

/**
 * Intuit tells us when the connection is dead rather than merely unlucky:
 * invalid_grant means the refresh token is spent or the user revoked us, and
 * no amount of retrying will fix it. We mark it, the back office says so, and
 * the owner reconnects. Everything else is left alone as a passing failure.
 */
function isDeadConnection(status, json) {
  const err = String((json && (json.error || json.error_description)) || '');
  return status === 400 && /invalid_grant/i.test(err);
}

export async function markNeedsReconnect(env, on) {
  await setSetting(env, 'qbo_needs_reconnect', on ? '1' : null);
  if (on) {
    await setSetting(env, 'qbo_access_token', null);
    await setSetting(env, 'qbo_access_expires', null);
  }
}

export async function isConfigured(env) {
  const c = await qboConfig(env);
  return Boolean(c.clientId && c.clientSecret && c.refreshToken && c.realmId);
}

function basicAuth(id, secret) {
  return 'Basic ' + btoa(id + ':' + secret);
}

/**
 * An Intuit access token is good for an hour, so it is kept and reused until
 * it is nearly spent rather than fetched again for every call. Their guidance
 * asks for exactly this, and it keeps us off their token endpoint.
 *
 * The refresh token is the part that needs care: Intuit issues a fresh one on
 * every refresh and kills the old one, so the new value is stored before we do
 * anything else with it.
 */
export async function accessToken(env, conf) {
  const c = conf || (await qboConfig(env));
  if (!c.clientId || !c.clientSecret || !c.refreshToken) throw new Error('quickbooks: not connected yet');

  // A minute of headroom, so a token cannot expire mid-request.
  if (c.cachedToken && c.cachedExpires > Date.now() + 60000) return c.cachedToken;

  const ep = await endpoints(env, c.sandbox);
  const res = await fetch(ep.token_endpoint, {
    method: 'POST',
    headers: {
      authorization: basicAuth(c.clientId, c.clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refreshToken }),
  });
  const tokenTid = res.headers.get('intuit_tid') || '';
  if (tokenTid) console.log('qbo token', res.status, 'intuit_tid=' + tokenTid);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    if (isDeadConnection(res.status, json)) {
      await markNeedsReconnect(env, true);
      throw new Error('quickbooks: the connection was revoked or has expired, reconnect it in Settings');
    }
    throw new Error('quickbooks: could not refresh the token, ' + (json.error_description || json.error || res.status) +
      (tokenTid ? ' [intuit_tid ' + tokenTid + ']' : ''));
  }
  if (json.refresh_token && json.refresh_token !== c.refreshToken) {
    await setSetting(env, 'qbo_refresh_token', json.refresh_token);
  }
  const ttl = Number(json.expires_in || 3600) * 1000;
  await setSetting(env, 'qbo_access_token', json.access_token);
  await setSetting(env, 'qbo_access_expires', String(Date.now() + ttl));
  // A refresh that works means whatever was wrong is over.
  if (c.needsReconnect) await markNeedsReconnect(env, false);
  return json.access_token;
}

export async function exchangeCode(env, { clientId, clientSecret, sandbox }, code, redirectUri) {
  const ep = await endpoints(env, sandbox);
  const res = await fetch(ep.token_endpoint, {
    method: 'POST',
    headers: {
      authorization: basicAuth(clientId, clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  const exTid = res.headers.get('intuit_tid') || '';
  if (exTid) console.log('qbo exchange', res.status, 'intuit_tid=' + exTid);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.refresh_token) {
    throw new Error((json.error_description || json.error || ('token exchange failed, ' + res.status)) +
      (exTid ? ' [intuit_tid ' + exTid + ']' : ''));
  }
  await markNeedsReconnect(env, false);
  return { refreshToken: json.refresh_token };
}

/**
 * Tells Intuit we are done with the grant when the owner disconnects, instead
 * of just forgetting it locally and leaving a live token on their side.
 * Best effort: if it fails we still forget our copy.
 */
export async function revokeToken(env, conf) {
  const c = conf || (await qboConfig(env));
  if (!c.clientId || !c.clientSecret || !c.refreshToken) return false;
  try {
    const ep = await endpoints(env, c.sandbox);
    const res = await fetch(ep.revocation_endpoint, {
      method: 'POST',
      headers: {
        authorization: basicAuth(c.clientId, c.clientSecret),
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({ token: c.refreshToken }),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

function baseUrl(conf) {
  return conf.sandbox
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

/**
 * One authenticated call against the Accounting API.
 *
 * A 401 means the access token we held is no longer accepted, usually because
 * it expired a moment ago. That is worth exactly one more go: throw the cached
 * token away, get a fresh one, and repeat the call. This is not a retry loop
 * against a failing login, it is the documented way to ride out an access
 * token expiring mid-flight, and it happens at most once per call.
 */
async function api(env, conf, path, opts = {}, isRetry = false) {
  const token = await accessToken(env, conf);
  const url = baseUrl(conf) + '/v3/company/' + conf.realmId + path +
    (path.includes('?') ? '&' : '?') + 'minorversion=75';
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: {
      authorization: 'Bearer ' + token,
      accept: opts.accept || 'application/json',
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  // Intuit stamps every response with a transaction id. Capturing it is what
  // makes a support ticket answerable, so it is logged for every call and
  // carried into the error text where the back office can show it.
  const tid = res.headers.get('intuit_tid') || '';
  if (tid) console.log('qbo', res.status, opts.method || 'GET', path.split('?')[0], 'intuit_tid=' + tid);

  if (res.status === 401 && !isRetry) {
    await setSetting(env, 'qbo_access_token', null);
    await setSetting(env, 'qbo_access_expires', null);
    return api(env, { ...conf, cachedToken: '', cachedExpires: 0 }, path, opts, true);
  }

  const ref = tid ? ' [intuit_tid ' + tid + ']' : '';

  if (opts.accept === 'application/pdf') {
    if (!res.ok) throw new Error('quickbooks: pdf ' + res.status + ref);
    return new Uint8Array(await res.arrayBuffer());
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      // Refused again with a token we just minted, so the grant itself is gone.
      await markNeedsReconnect(env, true);
      throw new Error('quickbooks: the connection was revoked or has expired, reconnect it in Settings');
    }
    const f = json.Fault && json.Fault.Error && json.Fault.Error[0];
    throw new Error('quickbooks: ' + (f ? (f.Message + (f.Detail ? ' (' + f.Detail + ')' : '')) : res.status) + ref);
  }
  return json;
}

/** Escapes a value for the QuickBooks query language, which only knows single quotes. */
function q(value) {
  return String(value).replace(/'/g, "\\'");
}

/**
 * CompanyInfo carries the name and the country but not the money. The home
 * currency, and whether this company is even allowed to raise a document in
 * anything else, live in Preferences, so both are read here. Getting this
 * wrong is not cosmetic: sending a CurrencyRef the company does not know is
 * rejected outright, and the estimate never gets made.
 */
export async function companyInfo(env, conf) {
  const j = await api(env, conf, '/companyinfo/' + conf.realmId);
  const c = j.CompanyInfo || {};
  const prefs = await preferences(env, conf).catch(() => ({}));
  return {
    name: c.CompanyName || '',
    country: c.Country || '',
    currency: prefs.currency || '',
    multiCurrency: !!prefs.multiCurrency,
    taxPerLine: !!prefs.taxPerLine,
  };
}

export async function preferences(env, conf) {
  const j = await api(env, conf, '/preferences');
  const p = (j.Preferences) || {};
  const cur = p.CurrencyPrefs || {};
  const tax = p.TaxPrefs || {};
  return {
    currency: (cur.HomeCurrency && cur.HomeCurrency.value) || '',
    multiCurrency: !!cur.MultiCurrencyEnabled,
    taxPerLine: !!tax.UsingSalesTax,
    defaultTaxCode: (tax.PartnerTaxEnabled && tax.TaxGroupCodeRef && tax.TaxGroupCodeRef.value) || '',
  };
}

/** The tax codes this company actually has, so the owner picks one instead of guessing. */
export async function taxCodes(env, conf) {
  const j = await api(env, conf, '/query?query=' + encodeURIComponent('select * from TaxCode maxresults 100'));
  const rows = (j.QueryResponse && j.QueryResponse.TaxCode) || [];
  return rows
    .filter((t) => t.Active !== false)
    .map((t) => ({ id: String(t.Id), name: t.Name || String(t.Id), taxable: t.Taxable !== false }));
}

/**
 * Matches on email first, because two people really can share a name, and
 * falls back to the display name. Creates the customer when neither hits.
 */
export async function findOrCreateCustomer(env, conf, { name, email, phone }) {
  if (email) {
    const byEmail = await api(env, conf,
      "/query?query=" + encodeURIComponent("select Id, DisplayName from Customer where PrimaryEmailAddr = '" + q(email) + "'"));
    const hit = byEmail.QueryResponse && byEmail.QueryResponse.Customer;
    if (hit && hit.length) return hit[0].Id;
  }
  const byName = await api(env, conf,
    "/query?query=" + encodeURIComponent("select Id, DisplayName from Customer where DisplayName = '" + q(name) + "'"));
  const hit = byName.QueryResponse && byName.QueryResponse.Customer;
  if (hit && hit.length) return hit[0].Id;

  const created = await api(env, conf, '/customer', {
    method: 'POST',
    body: {
      DisplayName: name,
      ...(email ? { PrimaryEmailAddr: { Address: email } } : {}),
      ...(phone ? { PrimaryPhone: { FreeFormNumber: phone } } : {}),
    },
  });
  return created.Customer.Id;
}

/**
 * Companies outside the US and Canada run QuickBooks' global tax model, where
 * every sales line has to name a tax code. Curaçao is one of them. When the
 * owner has picked a code we stamp it on each line; when he has not, the line
 * goes out bare and QuickBooks decides, which is fine for a company that does
 * not charge tax at all.
 */
export function toLines(lines, taxCode) {
  return lines.map((l) => ({
    DetailType: 'SalesItemLineDetail',
    Description: l.description,
    Amount: Math.round(l.qty * l.unit_cents) / 100,
    SalesItemLineDetail: {
      Qty: l.qty,
      UnitPrice: l.unit_cents / 100,
      ...(taxCode ? { TaxCodeRef: { value: taxCode } } : {}),
    },
  }));
}

/**
 * The estimate is the customer-facing quotation. QuickBooks numbers it, so
 * the number on the email and the number in his books are the same one.
 */
export async function createEstimate(env, conf, { customerId, lines, ref, validUntil, currency, customerEmail, taxCode }) {
  const body = {
    CustomerRef: { value: customerId },
    Line: toLines(lines, taxCode),
    CustomerMemo: { value: 'A3D reference ' + ref },
    ...(validUntil ? { ExpirationDate: String(validUntil).slice(0, 10) } : {}),
    ...(customerEmail ? { BillEmail: { Address: customerEmail } } : {}),
    ...(currency ? { CurrencyRef: { value: currency } } : {}),
  };
  const j = await api(env, conf, '/estimate', { method: 'POST', body });
  return { id: j.Estimate.Id, number: j.Estimate.DocNumber || j.Estimate.Id };
}

/** The estimate as QuickBooks would print it, for attaching to the email. */
export async function estimatePdf(env, conf, estimateId) {
  return api(env, conf, '/estimate/' + estimateId + '/pdf', { accept: 'application/pdf' });
}

export async function invoicePdf(env, conf, invoiceId) {
  return api(env, conf, '/invoice/' + invoiceId + '/pdf', { accept: 'application/pdf' });
}

/**
 * Turns the accepted estimate into an invoice, keeping QuickBooks' own link
 * between the two so the estimate shows as closed rather than dangling.
 */
export async function invoiceFromEstimate(env, conf, estimateId) {
  const got = await api(env, conf, '/estimate/' + estimateId);
  const est = got.Estimate;
  const body = {
    CustomerRef: est.CustomerRef,
    ...(est.CurrencyRef ? { CurrencyRef: est.CurrencyRef } : {}),
    ...(est.BillEmail ? { BillEmail: est.BillEmail } : {}),
    ...(est.CustomerMemo ? { CustomerMemo: est.CustomerMemo } : {}),
    Line: (est.Line || [])
      .filter((l) => l.DetailType === 'SalesItemLineDetail')
      .map((l) => ({
        DetailType: 'SalesItemLineDetail',
        Description: l.Description,
        Amount: l.Amount,
        SalesItemLineDetail: l.SalesItemLineDetail,
        LinkedTxn: [{ TxnId: estimateId, TxnType: 'Estimate' }],
      })),
    LinkedTxn: [{ TxnId: estimateId, TxnType: 'Estimate' }],
  };
  const j = await api(env, conf, '/invoice', { method: 'POST', body });
  return { id: j.Invoice.Id, number: j.Invoice.DocNumber || j.Invoice.Id, total: j.Invoice.TotalAmt };
}

/**
 * Records the money against the invoice so QuickBooks shows it paid rather
 * than outstanding. The amount comes from the invoice itself, not from us,
 * so rounding between cents and QuickBooks' decimals can never leave a
 * one cent balance hanging around forever.
 */
export async function recordPayment(env, conf, { customerId, invoiceId, amount, currency, note }) {
  const body = {
    CustomerRef: { value: customerId },
    TotalAmt: amount,
    ...(currency ? { CurrencyRef: { value: currency } } : {}),
    ...(note ? { PrivateNote: note } : {}),
    Line: [{
      Amount: amount,
      LinkedTxn: [{ TxnId: invoiceId, TxnType: 'Invoice' }],
    }],
  };
  const j = await api(env, conf, '/payment', { method: 'POST', body });
  return { id: j.Payment.Id };
}
