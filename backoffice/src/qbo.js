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

const TOKEN_URL = 'https://oauth2.platform.intuit.com/oauth2/v1/tokens/bearer';
export const QBO_SCOPES = 'com.intuit.quickbooks.accounting';

export async function qboConfig(env) {
  const s = await getSettings(env, [
    'qbo_client_id', 'qbo_client_secret', 'qbo_refresh_token',
    'qbo_realm_id', 'qbo_sandbox', 'qbo_company', 'qbo_currency',
  ]).catch(() => ({}));
  return {
    clientId: env.QBO_CLIENT_ID || s.qbo_client_id || '',
    clientSecret: env.QBO_CLIENT_SECRET || s.qbo_client_secret || '',
    refreshToken: env.QBO_REFRESH_TOKEN || s.qbo_refresh_token || '',
    realmId: s.qbo_realm_id || '',
    sandbox: s.qbo_sandbox === '1',
    company: s.qbo_company || '',
    currency: s.qbo_currency || '',
  };
}

export async function isConfigured(env) {
  const c = await qboConfig(env);
  return Boolean(c.clientId && c.clientSecret && c.refreshToken && c.realmId);
}

function basicAuth(id, secret) {
  return 'Basic ' + btoa(id + ':' + secret);
}

/**
 * Intuit hands back a fresh refresh token on every call and invalidates the
 * old one, so the new value is stored before we do anything else with it.
 */
export async function accessToken(env, conf) {
  const c = conf || (await qboConfig(env));
  if (!c.clientId || !c.clientSecret || !c.refreshToken) throw new Error('quickbooks: not connected yet');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: basicAuth(c.clientId, c.clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refreshToken }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error('quickbooks: could not refresh the token, ' + (json.error_description || json.error || res.status));
  }
  if (json.refresh_token && json.refresh_token !== c.refreshToken) {
    await setSetting(env, 'qbo_refresh_token', json.refresh_token);
  }
  return json.access_token;
}

export async function exchangeCode(clientId, clientSecret, code, redirectUri) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      authorization: basicAuth(clientId, clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.refresh_token) {
    throw new Error(json.error_description || json.error || ('token exchange failed, ' + res.status));
  }
  return { refreshToken: json.refresh_token };
}

function baseUrl(conf) {
  return conf.sandbox
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

/** One authenticated call against the Accounting API. */
async function api(env, conf, path, opts = {}) {
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
  if (opts.accept === 'application/pdf') {
    if (!res.ok) throw new Error('quickbooks: pdf ' + res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const f = json.Fault && json.Fault.Error && json.Fault.Error[0];
    throw new Error('quickbooks: ' + (f ? (f.Message + (f.Detail ? ' (' + f.Detail + ')' : '')) : res.status));
  }
  return json;
}

/** Escapes a value for the QuickBooks query language, which only knows single quotes. */
function q(value) {
  return String(value).replace(/'/g, "\\'");
}

export async function companyInfo(env, conf) {
  const j = await api(env, conf, '/companyinfo/' + conf.realmId);
  const c = j.CompanyInfo || {};
  return {
    name: c.CompanyName || '',
    country: c.Country || '',
    currency: (c.Currency && c.Currency.value) || '',
  };
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

function toLines(lines, currency) {
  return lines.map((l) => ({
    DetailType: 'SalesItemLineDetail',
    Description: l.description,
    Amount: Math.round(l.qty * l.unit_cents) / 100,
    SalesItemLineDetail: {
      Qty: l.qty,
      UnitPrice: l.unit_cents / 100,
    },
  }));
}

/**
 * The estimate is the customer-facing quotation. QuickBooks numbers it, so
 * the number on the email and the number in his books are the same one.
 */
export async function createEstimate(env, conf, { customerId, lines, ref, validUntil, currency, customerEmail }) {
  const body = {
    CustomerRef: { value: customerId },
    Line: toLines(lines, currency),
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
