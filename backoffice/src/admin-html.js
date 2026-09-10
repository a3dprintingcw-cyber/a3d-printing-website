// The back office UI. One file, no build step, no framework, served by the
// Worker at /admin. It talks to /api/admin/* and inherits the look of the
// public site so it does not feel like a different product.
//
// Written with String.raw so the HTML can be pasted as-is; note that the
// inline script deliberately avoids backticks for the same reason.

export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A3D back office</title>
<link rel="icon" type="image/png" href="/assets/img/favicon-32.png">
<style>
  :root {
    --blue:#1e5fd6; --blue-dark:#133f96; --blue-light:#eaf0fe;
    --ink:#14161a; --ink-soft:#4a4f58; --paper:#ffffff; --paper-soft:#f4f6fb;
    --card:#fff; --border:#e3e7ef; --ok:#17a34a; --warn:#b8770b; --bad:#dc2626;
    --radius:14px; color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --blue:#4d84ff; --blue-dark:#83a9ff; --blue-light:#17233f;
      --ink:#f2f4f8; --ink-soft:#b7bec9; --paper:#0d0f13; --paper-soft:#14171d;
      --card:#171a21; --border:#262b34; color-scheme: dark;
    }
  }
  * { box-sizing:border-box; }
  body { margin:0; font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         background:var(--paper); color:var(--ink); -webkit-font-smoothing:antialiased; }
  a { color:inherit; }
  .layout { display:grid; grid-template-columns:220px 1fr; min-height:100vh; }
  .side { border-right:1px solid var(--border); background:var(--paper-soft); padding:22px 16px; }
  .brand { font-weight:800; letter-spacing:-.02em; font-size:18px; margin-bottom:22px; }
  .brand span { color:var(--blue); }
  .nav a { display:block; padding:10px 12px; border-radius:10px; text-decoration:none;
           font-weight:600; font-size:14.5px; color:var(--ink-soft); }
  .nav a:hover { background:var(--card); color:var(--ink); }
  .nav a.on { background:var(--blue); color:#fff; }
  .side .who { margin-top:26px; font-size:12px; color:var(--ink-soft); line-height:1.5; }
  main { padding:26px 30px 60px; max-width:1100px; }
  h1 { font-size:24px; margin:0 0 4px; letter-spacing:-.01em; }
  h2 { font-size:17px; margin:28px 0 12px; }
  .sub { color:var(--ink-soft); font-size:14px; margin:0 0 22px; }
  .tiles { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:14px; }
  .tile { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:16px 18px; }
  .tile b { display:block; font-size:26px; letter-spacing:-.02em; }
  .tile span { font-size:12.5px; color:var(--ink-soft); }
  table { width:100%; border-collapse:collapse; font-size:14px; background:var(--card);
          border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
  th { text-align:left; font-size:11.5px; text-transform:uppercase; letter-spacing:.05em;
       color:var(--ink-soft); background:var(--paper-soft); padding:10px 14px; }
  td { padding:11px 14px; border-top:1px solid var(--border); }
  tr.row:hover td { background:var(--paper-soft); cursor:pointer; }
  .pill { display:inline-block; font-size:11.5px; font-weight:700; padding:3px 9px; border-radius:999px;
          background:var(--blue-light); color:var(--blue); text-transform:capitalize; }
  .pill.new { background:#fde68a33; color:var(--warn); }
  .pill.paid, .pill.closed, .pill.delivered { background:#17a34a22; color:var(--ok); }
  .pill.lost { background:#dc262622; color:var(--bad); }
  .bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:14px; }
  input, select, textarea, button { font:inherit; }
  input[type=text], input[type=number], select, textarea {
    padding:9px 11px; border:1px solid var(--border); border-radius:9px;
    background:var(--paper); color:var(--ink); }
  textarea { width:100%; min-height:70px; resize:vertical; }
  button { padding:9px 15px; border-radius:999px; border:1px solid var(--border);
           background:var(--card); color:var(--ink); font-weight:600; cursor:pointer; }
  button.primary { background:var(--blue); border-color:transparent; color:#fff; }
  button.ghost { background:transparent; }
  button:hover { filter:brightness(1.05); }
  .grid2 { display:grid; grid-template-columns:1.4fr 1fr; gap:22px; align-items:start; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:18px 20px; }
  .kv { display:grid; grid-template-columns:110px 1fr; gap:6px 12px; font-size:14px; }
  .kv dt { color:var(--ink-soft); }
  .kv dd { margin:0; }
  .timeline li { font-size:13.5px; color:var(--ink-soft); margin-bottom:8px; list-style:none; }
  .timeline { padding:0; margin:0; }
  .muted { color:var(--ink-soft); font-size:13px; }
  .lines td { padding:6px 8px; }
  .lines input[type=text] { width:100%; }
  .right { text-align:right; }
  .flash { padding:10px 14px; border-radius:10px; background:var(--blue-light); color:var(--blue);
           font-size:13.5px; margin-bottom:14px; }
  @media (max-width:820px) {
    .layout { grid-template-columns:1fr; }
    .side { border-right:none; border-bottom:1px solid var(--border); }
    .nav { display:flex; gap:6px; flex-wrap:wrap; }
    .grid2 { grid-template-columns:1fr; }
    main { padding:20px; }
  }
  .lines thead th { text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.06em;
    color:var(--ink-soft); font-weight:600; padding:0 8px 6px; }
  .lines td { padding:4px 8px; vertical-align:middle; }
  .lines select.pick { width:100%; margin-bottom:5px; padding:6px 8px; border-radius:8px;
    border:1px solid var(--border); background:var(--paper); color:var(--ink-soft); font-size:13px; }
  .lines .lt { font-variant-numeric:tabular-nums; color:var(--ink); }
  .qsum { margin-top:12px; padding-top:12px; border-top:1px solid var(--border); max-width:340px; margin-left:auto; }
  .obline { display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; flex-wrap:wrap; }
  .obline input { width:auto; margin:0; }
  .qrow { display:flex; justify-content:space-between; gap:20px; padding:3px 0; color:var(--ink-soft); font-size:14px; }
  .qrow b { color:var(--ink); font-variant-numeric:tabular-nums; }
  .qrow.total { border-top:1px solid var(--border); margin-top:6px; padding-top:8px; font-size:17px; color:var(--ink); }
  .qwarn { margin-top:10px; font-size:13px; line-height:1.5; color:var(--warn); }
  .flash.ok { background:#0f3a24; border-color:#1c6b41; color:#b8f0d0; }
  .steps { margin:12px 0 16px; padding-left:20px; line-height:1.9; }
  .steps code.copy { background:var(--card); padding:3px 8px; border-radius:6px; font-size:13px; }
  .steps code.copy.copied { outline:2px solid var(--blue); }
  button.small { padding:4px 10px; font-size:13px; }
  label.inline { display:flex; align-items:center; gap:10px; margin:14px 0 6px; font-size:13px; color:var(--ink-soft); }
  label.inline select { padding:8px 10px; border-radius:9px; border:1px solid var(--border);
    background:var(--paper); color:var(--ink); font-size:14px; }
  #view .card + .card { margin-top:16px; }
  .form label { display:block; margin:10px 0; font-size:13px; color:var(--ink-soft); }
  .form label.check { display:flex; align-items:center; gap:8px; margin-top:14px; }
  .form label.check input { display:inline-block; width:auto; margin:0; }
  .form input { display:block; width:100%; max-width:520px; margin-top:4px; padding:9px 11px;
    border-radius:9px; border:1px solid var(--border); background:var(--paper); color:var(--ink); font-size:14px; }
</style>
</head>
<body>
<div class="layout">
  <aside class="side">
    <div class="brand">A3D <span>back office</span></div>
    <nav class="nav" id="nav">
      <a href="#/" data-route="">Dashboard</a>
      <a href="#/orders" data-route="orders">Orders</a>
      <a href="#/customers" data-route="customers">Customers</a>
      <a href="#/prices" data-route="prices">Prices</a>
      <a href="#/settings" data-route="settings">Settings</a>
    </nav>
    <div class="who" id="who"></div>
  </aside>
  <main id="view"><p class="muted">Loading...</p></main>
</div>

<script>
var view = document.getElementById('view');
var CUR = 'XCG';

function api(path, opts) {
  return fetch('/api/admin' + path, Object.assign({ headers: { 'content-type': 'application/json' } }, opts || {}))
    .then(function (r) {
      if (r.status === 403) throw new Error('Your session expired. Reload the page to sign in again.');
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Request failed'); });
      return r.json();
    });
}
function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function money(cents) {
  if (cents === null || cents === undefined) return '-';
  return CUR + ' ' + (cents / 100).toFixed(2);
}
function ago(iso) {
  if (!iso) return '';
  var d = new Date(iso.replace(' ', 'T') + 'Z');
  var mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return mins + 'm ago';
  if (mins < 1440) return Math.round(mins / 60) + 'h ago';
  return Math.round(mins / 1440) + 'd ago';
}
function pill(status) {
  return '<span class="pill ' + esc(status) + '">' + esc(status) + '</span>';
}

function setNav(route) {
  var r = String(route).split('?')[0];
  var links = document.querySelectorAll('#nav a');
  for (var i = 0; i < links.length; i++) {
    links[i].className = links[i].getAttribute('data-route') === r ? 'on' : '';
  }
}

// ------------------------------------------------------------- dashboard
function dashboard() {
  api('/stats').then(function (s) {
    var counts = {};
    s.byStatus.forEach(function (r) { counts[r.status] = r.n; });
    var open = (counts.new || 0) + (counts.quoted || 0) + (counts.approved || 0) + (counts.printing || 0);
    var html = '<h1>Dashboard</h1><p class="sub">Last 30 days.</p><div class="tiles">' +
      '<div class="tile"><b>' + (counts.new || 0) + '</b><span>new requests waiting</span></div>' +
      '<div class="tile"><b>' + open + '</b><span>open jobs</span></div>' +
      '<div class="tile"><b>' + (s.visits.visitors || 0) + '</b><span>website visitors</span></div>' +
      '<div class="tile"><b>' + s.conversion + '%</b><span>visitors who asked for a quote</span></div>' +
      '</div>';

    html += '<h2>Pipeline</h2><table><tr>';
    ['new', 'quoted', 'approved', 'printing', 'ready', 'delivered', 'paid'].forEach(function (st) {
      html += '<th>' + st + '</th>';
    });
    html += '</tr><tr>';
    ['new', 'quoted', 'approved', 'printing', 'ready', 'delivered', 'paid'].forEach(function (st) {
      html += '<td><b>' + (counts[st] || 0) + '</b></td>';
    });
    html += '</tr></table>';

    html += '<h2>Latest requests</h2><table><tr><th>Ref</th><th>Customer</th><th>Status</th><th>When</th></tr>';
    s.recent.forEach(function (o) {
      html += '<tr class="row" onclick="location.hash=\'#/order/' + o.id + '\'"><td><b>' + esc(o.ref) +
        '</b></td><td>' + esc(o.customer_name) + '</td><td>' + pill(o.status) + '</td><td class="muted">' +
        ago(o.created_at) + '</td></tr>';
    });
    if (!s.recent.length) html += '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>';
    html += '</table>';

    html += '<div class="grid2"><div><h2>Most visited pages</h2><table><tr><th>Page</th><th class="right">Views</th></tr>';
    s.topPages.forEach(function (p) {
      html += '<tr><td>' + esc(p.path) + '</td><td class="right">' + p.n + '</td></tr>';
    });
    if (!s.topPages.length) html += '<tr><td colspan="2" class="muted">No traffic recorded yet.</td></tr>';
    html += '</table></div><div><h2>Where they came from</h2><table><tr><th>Source</th><th class="right">Visits</th></tr>';
    s.referrers.forEach(function (r) {
      var host = r.referrer;
      try { host = new URL(r.referrer).hostname; } catch (e) {}
      html += '<tr><td>' + esc(host) + '</td><td class="right">' + r.n + '</td></tr>';
    });
    if (!s.referrers.length) html += '<tr><td colspan="2" class="muted">Direct visits only so far.</td></tr>';
    html += '</table></div></div>';

    view.innerHTML = html;
  }).catch(showError);
}

// ---------------------------------------------------------------- orders
function orders() {
  var status = sessionStorage.getItem('a3d.status') || 'all';
  var q = sessionStorage.getItem('a3d.q') || '';
  api('/orders?status=' + encodeURIComponent(status) + '&q=' + encodeURIComponent(q)).then(function (d) {
    var opts = ['all', 'new', 'quoted', 'approved', 'printing', 'ready', 'delivered', 'paid', 'closed', 'lost'];
    var html = '<h1>Orders</h1><div class="bar"><select id="st">';
    opts.forEach(function (o) {
      html += '<option value="' + o + '"' + (o === status ? ' selected' : '') + '>' + o + '</option>';
    });
    html += '</select><input type="text" id="q" placeholder="Search name, email, reference" value="' + esc(q) + '">' +
      '<button class="primary" onclick="applyFilter()">Filter</button></div>';
    html += '<table><tr><th>Ref</th><th>Customer</th><th>Wants</th><th>Files</th><th>Status</th><th>When</th></tr>';
    d.orders.forEach(function (o) {
      var wants = o.mode === 'dev' ? (o.project_type || 'Project') : ((o.material || 'Print') + (o.quantity ? ' x' + o.quantity : ''));
      html += '<tr class="row" onclick="location.hash=\'#/order/' + o.id + '\'">' +
        '<td><b>' + esc(o.ref) + '</b></td><td>' + esc(o.customer_name) + '<div class="muted">' +
        esc(o.customer_email) + '</div></td><td>' + esc(wants) + '</td><td>' + (o.files || 0) + '</td><td>' +
        pill(o.status) + '</td><td class="muted">' + ago(o.created_at) + '</td></tr>';
    });
    if (!d.orders.length) html += '<tr><td colspan="6" class="muted">No orders match.</td></tr>';
    html += '</table>';
    view.innerHTML = html;
  }).catch(showError);
}
function applyFilter() {
  sessionStorage.setItem('a3d.status', document.getElementById('st').value);
  sessionStorage.setItem('a3d.q', document.getElementById('q').value);
  orders();
}

// ----------------------------------------------------------- order detail
var current = null;
function orderDetail(id) {
  api('/orders/' + id).then(function (d) {
    current = d;
    var o = d.order;
    var html = '<h1>' + esc(o.ref) + ' ' + pill(o.status) + '</h1><p class="sub">' +
      esc(o.customer_name) + ' &middot; ' + ago(o.created_at) + '</p><div class="grid2"><div>';

    html += '<div class="card"><h2 style="margin-top:0">The request</h2><dl class="kv">';
    if (o.mode === 'dev') {
      html += '<dt>Project</dt><dd>' + esc(o.project_type || '-') + '</dd>' +
        '<dt>Timeline</dt><dd>' + esc(o.timeline || '-') + '</dd>';
    } else {
      html += '<dt>Material</dt><dd>' + esc(o.material || '-') + '</dd>' +
        '<dt>Quantity</dt><dd>' + esc(o.quantity || '-') + '</dd>' +
        '<dt>Colour</dt><dd>' + esc(o.colour || '-') + '</dd>';
    }
    html += '<dt>Notes</dt><dd>' + esc(o.notes || '-') + '</dd></dl>';

    html += '<h2>Files</h2>';
    if (d.files.length) {
      html += '<table>';
      d.files.forEach(function (f) {
        html += '<tr><td><a href="/api/admin/files/' + f.id + '">' + esc(f.filename) + '</a></td>' +
          '<td class="right muted">' + (f.bytes > 1048576 ? (f.bytes / 1048576).toFixed(1) + ' MB' : Math.round(f.bytes / 1024) + ' KB') + '</td></tr>';
      });
      html += '</table>';
    } else {
      html += '<p class="muted">No files uploaded with this request.</p>';
    }

    html += '<h2>Quotes</h2>';
    if (d.quotes.length) {
      d.quotes.forEach(function (qt) {
        var qlines = (d.lines || []).filter(function (l) { return l.quote_id === qt.id; });
        html += '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center">' +
          '<b style="font-size:19px">' + money(qt.total_cents) + '</b> ' + pill(qt.status) + '</div>';
        if (qlines.length) {
          html += '<table style="margin-top:10px">';
          qlines.forEach(function (l) {
            html += '<tr><td>' + l.qty + ' &times; ' + esc(l.description) + '</td><td class="right">' + money(l.line_cents) + '</td></tr>';
          });
          html += '</table>';
        }
        if (qt.sentoo_url) {
          html += '<div class="muted" style="margin-top:8px">Pay link: <a href="' + esc(qt.sentoo_url) +
            '" target="_blank" rel="noopener">' + esc(qt.sentoo_url) + '</a>' +
            (qt.sentoo_status === 'mock' ? ' <em>(sandbox placeholder)</em>' : '') + '</div>';
        }
        if (qt.paid_at) {
          html += '<div class="muted" style="margin-top:6px;color:var(--ok)">Paid ' + ago(qt.paid_at) + '</div>';
        }
        html += '<div class="bar" style="margin-top:12px">';
        if (qt.status !== 'paid') {
          html += '<button class="primary" onclick="sendQuote(' + qt.id + ',' + o.id + ')">' +
            (qt.status === 'sent' ? 'Send again' : 'Send to customer') + '</button>';
          if (qt.sentoo_uid) html += '<button onclick="checkPayment(' + qt.id + ',' + o.id + ')">Check payment</button>';
          html += '<button onclick="markPaid(' + qt.id + ',' + o.id + ')">Mark paid by hand</button>';
        }
        html += '</div>';
        if (qt.qbo_estimate_no || qt.qbo_invoice_no) {
          html += '<div class="muted">QuickBooks: quotation ' + esc(qt.qbo_estimate_no || '-') +
            (qt.qbo_invoice_no ? ', invoice ' + esc(qt.qbo_invoice_no) + ' (paid)' : '') + '</div>';
        }
        if (qt.qbo_error) {
          html += '<div class="muted" style="color:var(--warn)">QuickBooks did not accept this one: ' +
            esc(qt.qbo_error) + '</div>';
        }
        if (d.gmail === false) {
          html += '<div class="muted">Email is not connected yet, so Send will hand you the payment link instead.</div>';
        }
        html += '</div>';
      });
    }
    PRICES = d.prices || [];
    TAX_PCT = d.taxPct || 0;
    html += '<div class="card"><h2 style="margin-top:0">Build a quote</h2>' +
      '<table class="lines" id="lines"><thead><tr><th>Item</th><th style="width:78px">Qty</th>' +
      '<th style="width:120px">Price each</th><th style="width:120px;text-align:right">Line</th><th style="width:34px"></th>' +
      '</tr></thead><tbody></tbody></table>' +
      '<div class="bar" style="margin-top:10px"><button onclick="addLine()">Add line</button></div>' +
      (TAX_PCT
        ? '<label class="obline"><input type="checkbox" id="qob" checked onchange="recalc()"> ' +
          'Charge OB ' + TAX_PCT + '%<span class="muted"> (untick it for a private customer you do not bill tax to)</span></label>'
        : '') +
      '<div id="qsum" class="qsum"></div>' +
      '<div class="bar" style="margin-top:14px">' +
      '<button class="primary" onclick="saveQuote(' + o.id + ')">Create quote and payment link</button></div></div>';

    html += '</div><div>';
    html += '<div class="card"><h2 style="margin-top:0">Customer</h2><dl class="kv">' +
      '<dt>Name</dt><dd>' + esc(o.customer_name) + '</dd>' +
      '<dt>Email</dt><dd><a href="mailto:' + esc(o.customer_email) + '">' + esc(o.customer_email) + '</a></dd>' +
      '<dt>Phone</dt><dd>' + (o.customer_phone ? '<a href="https://wa.me/' + esc(String(o.customer_phone).replace(/[^0-9]/g, '')) + '">' + esc(o.customer_phone) + '</a>' : '-') + '</dd></dl>';
    if (d.history.length) {
      html += '<p class="muted" style="margin-bottom:4px">Earlier orders</p>';
      d.history.forEach(function (h) {
        html += '<div class="muted"><a href="#/order/' + h.id + '">' + esc(h.ref) + '</a> ' + esc(h.status) + '</div>';
      });
    }
    html += '</div>';

    html += '<div class="card" style="margin-top:18px"><h2 style="margin-top:0">Move it along</h2><div class="bar">';
    ['new', 'quoted', 'approved', 'printing', 'ready', 'delivered', 'paid', 'closed', 'lost'].forEach(function (st) {
      html += '<button ' + (st === o.status ? 'class="primary"' : '') + ' onclick="setStatus(' + o.id + ',\'' + st + '\')">' + st + '</button>';
    });
    html += '</div><textarea id="note" placeholder="Add a note for yourself"></textarea>' +
      '<div class="bar" style="margin-top:8px"><button onclick="addNote(' + o.id + ')">Save note</button></div></div>';

    html += '<div class="card" style="margin-top:18px"><h2 style="margin-top:0">History</h2><ul class="timeline">';
    d.events.forEach(function (e) {
      html += '<li><b>' + esc(e.kind) + '</b> ' + esc(e.detail || '') + ' <span class="muted">' + ago(e.created_at) + '</span></li>';
    });
    html += '</ul></div></div></div>';

    view.innerHTML = html;
    addLine();
  }).catch(showError);
}

var PRICES = [];
var TAX_PCT = 0;

function addLine() {
  var t = document.querySelector('#lines tbody');
  if (!t) return;
  var row = t.insertRow(-1);
  var opts = '<option value="">From the price list...</option>';
  PRICES.forEach(function (p, i) {
    opts += '<option value="' + i + '">' + esc(p.name) + (p.unit_cents ? ' (' + money(p.unit_cents) + ')' : '') + '</option>';
  });
  row.innerHTML =
    '<td>' + (PRICES.length ? '<select class="pick" onchange="fillLine(this)">' + opts + '</select>' : '') +
      '<input type="text" class="d" placeholder="What are we making" oninput="recalc()"></td>' +
    '<td><input type="number" class="q" value="1" min="0" step="1" oninput="recalc()"></td>' +
    '<td><input type="number" class="u" placeholder="' + CUR + '" min="0" step="0.01" oninput="recalc()"></td>' +
    '<td class="lt" style="text-align:right">-</td>' +
    '<td><button class="ghost" title="Remove this line" onclick="this.closest(\'tr\').remove();recalc()">&times;</button></td>';
  recalc();
}

// Picking from the price list fills in the name and the price, and both stay
// editable afterwards. The list is a starting point, not a straitjacket.
function fillLine(sel) {
  var p = PRICES[Number(sel.value)];
  if (!p) return;
  var row = sel.closest('tr');
  row.querySelector('.d').value = p.name;
  if (p.unit_cents) row.querySelector('.u').value = (p.unit_cents / 100).toFixed(2);
  recalc();
}

// includeUnnamed is what the running total uses, so typing a price shows a
// number straight away instead of silently counting for nothing. Saving still
// insists on a name, because that is what the customer reads on the quote.
function readLines(includeUnnamed) {
  var rows = document.querySelectorAll('#lines tbody tr');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var d = rows[i].querySelector('.d').value.trim();
    var q = parseFloat(rows[i].querySelector('.q').value || '0');
    var raw = rows[i].querySelector('.u').value;
    var u = Math.round((parseFloat(raw || '0') || 0) * 100);
    var priced = raw !== '' && q > 0;
    if ((d || includeUnnamed) && priced) out.push({ description: d, qty: q, unit_cents: u, unnamed: !d, row: rows[i] });
  }
  return out;
}

function recalc() {
  var rows = document.querySelectorAll('#lines tbody tr');
  var all = readLines(true);
  var subtotal = 0, unnamed = 0;
  for (var i = 0; i < rows.length; i++) {
    var hit = null;
    for (var j = 0; j < all.length; j++) if (all[j].row === rows[i]) hit = all[j];
    var cell = rows[i].querySelector('.lt');
    if (hit) {
      var line = Math.round(hit.qty * hit.unit_cents);
      subtotal += line;
      if (hit.unnamed) unnamed++;
      if (cell) cell.textContent = money(line);
    } else if (cell) {
      cell.textContent = '-';
    }
  }
  var ob = document.getElementById('qob');
  var pct = (ob && !ob.checked) ? 0 : TAX_PCT;
  var tax = Math.round((subtotal * pct) / 100);
  var el = document.getElementById('qsum');
  if (!el) return;
  var html = '';
  if (pct) {
    html += '<div class="qrow"><span>Subtotal</span><b>' + money(subtotal) + '</b></div>' +
      '<div class="qrow"><span>OB ' + pct + '%</span><b>' + money(tax) + '</b></div>';
  } else if (TAX_PCT) {
    html += '<div class="qrow"><span>Subtotal</span><b>' + money(subtotal) + '</b></div>' +
      '<div class="qrow"><span>OB</span><b>not charged</b></div>';
  }
  html += '<div class="qrow total"><span>Total</span><b>' + money(subtotal + tax) + '</b></div>';
  if (unnamed) {
    html += '<div class="qwarn">' + unnamed + ' line' + (unnamed > 1 ? 's have' : ' has') +
      ' a price but no name. It is counted above, but give it a name before you create the quote so the customer knows what they are paying for.</div>';
  }
  el.innerHTML = html;
}
function saveQuote(id) {
  var all = readLines(true);
  var lines = all.filter(function (l) { return !l.unnamed; })
    .map(function (l) { return { description: l.description, qty: l.qty, unit_cents: l.unit_cents }; });
  if (!lines.length) { alert('Add at least one line with a name and a price.'); return; }
  if (all.length !== lines.length) {
    if (!confirm('Some lines have a price but no name and will be left out. Create the quote anyway?')) return;
  }
  var ob = document.getElementById('qob');
  var charging = !ob || ob.checked;
  if (TAX_PCT && !charging &&
      !confirm('This quote goes out with no OB on it. Only do that for a customer you are not required to charge. Carry on?')) return;
  api('/orders/' + id + '/quote', { method: 'POST', body: JSON.stringify({ lines: lines, tax: charging }) })
    .then(function (r) {
      var msg = 'Quote created for ' + money(r.quote.total_cents) + '.';
      if (r.payment && r.payment.error) msg += ' Payment link failed: ' + r.payment.error;
      else if (r.payment && r.payment.mock) msg += ' Sandbox payment link created.';
      alert(msg);
      orderDetail(id);
    }).catch(function (e) { alert(e.message); });
}
function sendQuote(quoteId, orderId) {
  if (!confirm('Email this quote to the customer with the payment link?')) return;
  api('/quotes/' + quoteId + '/send', { method: 'POST' })
    .then(function (r) { alert('Sent. Payment link: ' + r.payUrl); orderDetail(orderId); })
    .catch(function (e) { alert(e.message); });
}
function checkPayment(quoteId, orderId) {
  api('/quotes/' + quoteId + '/check', { method: 'POST' })
    .then(function (r) { alert('Sentoo says: ' + r.status + (r.paid ? '. Marked paid.' : '')); orderDetail(orderId); })
    .catch(function (e) { alert(e.message); });
}
function markPaid(quoteId, orderId) {
  var how = prompt('How was it paid?', 'Paid in cash at the shop');
  if (how === null) return;
  api('/quotes/' + quoteId + '/paid', { method: 'POST', body: JSON.stringify({ how: how }) })
    .then(function () { orderDetail(orderId); }).catch(showError);
}
function setStatus(id, st) {
  api('/orders/' + id, { method: 'POST', body: JSON.stringify({ status: st }) })
    .then(function () { orderDetail(id); }).catch(showError);
}
function addNote(id) {
  var note = document.getElementById('note').value.trim();
  if (!note) return;
  api('/orders/' + id, { method: 'POST', body: JSON.stringify({ note: note }) })
    .then(function () { orderDetail(id); }).catch(showError);
}

// ------------------------------------------------------------- customers
function customers() {
  api('/customers').then(function (d) {
    var html = '<h1>Customers</h1><table><tr><th>Name</th><th>Email</th><th>Phone</th><th class="right">Orders</th><th>Last order</th></tr>';
    d.customers.forEach(function (c) {
      html += '<tr><td>' + esc(c.name) + '</td><td>' + esc(c.email) + '</td><td>' + esc(c.phone || '-') +
        '</td><td class="right">' + c.orders + '</td><td class="muted">' + (c.last_order ? ago(c.last_order) : '-') + '</td></tr>';
    });
    if (!d.customers.length) html += '<tr><td colspan="5" class="muted">No customers yet.</td></tr>';
    html += '</table>';
    view.innerHTML = html;
  }).catch(showError);
}

// ---------------------------------------------------------------- prices
function prices() {
  api('/prices').then(function (d) {
    var html = '<h1>Price list</h1><p class="sub">These are the repeat items. Leave a price empty and the public page shows "on request".</p>' +
      '<table id="pl"><tr><th>Item</th><th>Description</th><th style="width:130px">Price (' + CUR + ')</th><th>Shown</th></tr>';
    d.prices.forEach(function (p) {
      html += '<tr data-id="' + p.id + '"><td><input type="text" class="n" value="' + esc(p.name) + '"></td>' +
        '<td><input type="text" class="ds" value="' + esc(p.description || '') + '"></td>' +
        '<td><input type="number" class="u" step="0.01" min="0" value="' + (p.unit_cents === null ? '' : (p.unit_cents / 100).toFixed(2)) + '"></td>' +
        '<td><input type="checkbox" class="a"' + (p.active ? ' checked' : '') + '></td></tr>';
    });
    html += '</table><div class="bar" style="margin-top:14px"><button class="primary" onclick="savePrices()">Save prices</button>' +
      '<span class="muted">The public prices page picks these up on the next publish.</span></div>';
    view.innerHTML = html;
  }).catch(showError);
}
function savePrices() {
  var rows = document.querySelectorAll('#pl tr[data-id]');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i].querySelector('.u').value;
    out.push({
      id: Number(rows[i].getAttribute('data-id')),
      name: rows[i].querySelector('.n').value,
      description: rows[i].querySelector('.ds').value,
      unit_cents: u === '' ? null : Math.round(parseFloat(u) * 100),
      active: rows[i].querySelector('.a').checked,
    });
  }
  api('/prices', { method: 'POST', body: JSON.stringify({ prices: out }) })
    .then(function () { alert('Saved.'); }).catch(showError);
}

// -------------------------------------------------------------- settings
function settings() {
  var flash = '';
  var q = location.hash.split('?')[1] || '';
  if (q.indexOf('connected=gmail') !== -1) flash = '<div class="flash ok">Gmail is connected. Send yourself a test below.</div>';
  if (q.indexOf('connected=quickbooks') !== -1) flash = '<div class="flash ok">QuickBooks is connected.</div>';
  var m = /error=([^&]*)/.exec(q);
  if (m) flash = '<div class="flash">' + esc(decodeURIComponent(m[1])) + '</div>';

  api('/me').then(function (me) {
    var g = me.gmail || {};
    var redirect = location.origin + '/api/admin/gmail/callback';
    var html = '<h1>Settings</h1><p class="sub">Connections the back office uses to do its job.</p>' + flash;

    html += '<div class="card"><h2>Email</h2>';
    if (g.connected) {
      html += '<p>Connected. Quotes go out from <b>' + esc(g.account || me.email) + '</b> and land in that Sent folder.</p>' +
        '<p><button class="primary" onclick="gmailTest()">Send me a test email</button> ' +
        '<button class="ghost" onclick="gmailDisconnect()">Disconnect</button></p>';
    } else {
      html += '<p class="muted">Not connected yet. Until it is, pressing Send on a quote saves the quote and hands you the payment link to paste yourself.</p>' +
        '<ol class="steps">' +
        '<li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Google Cloud credentials</a> and create an OAuth client of type <b>Web application</b>.</li>' +
        '<li>Add this exact redirect URI to it:<br><code class="copy" id="redir">' + esc(redirect) + '</code> ' +
        '<button class="ghost small" onclick="copyText(\'redir\')">Copy</button></li>' +
        '<li>Paste the client id and secret it gives you here, then press Connect.</li>' +
        '</ol>' +
        '<div class="form"><label>Client id<input id="gcid" placeholder="....apps.googleusercontent.com" autocomplete="off"></label>' +
        '<label>Client secret<input id="gcs" type="password" placeholder="GOCSPX-..." autocomplete="off"></label></div>' +
        '<p><button class="primary" onclick="gmailConnect()">Save and connect</button></p>';
      if (g.hasApp) html += '<p class="muted">A client id is already saved. <a href="/api/admin/gmail/start">Approve it with Google</a> if you did not finish last time.</p>';
    }
    html += '</div>';

    var qb = me.qbo || {};
    html += '<div class="card"><h2>Accounting</h2>';
    if (qb.needsReconnect) {
      html += '<p style="color:var(--warn)"><b>QuickBooks needs reconnecting.</b> The connection to ' +
        esc(qb.company || 'QuickBooks') + ' was revoked or has expired, so estimates and invoices are not being created.</p>' +
        '<p class="muted">Nothing has been lost. Reconnect and the quotes that failed can be sent again.</p>' +
        '<p><a href="/api/admin/qbo/start"><button class="primary">Reconnect QuickBooks</button></a> ' +
        '<button class="ghost" onclick="qboDisconnect()">Forget it instead</button></p>';
    } else if (qb.connected) {
      html += '<p>Connected to <b>' + esc(qb.company || 'QuickBooks') + '</b>' +
        (qb.currency ? ', books in ' + esc(qb.currency) : '') +
        (qb.sandbox ? ' <span style="color:var(--warn)">(sandbox company, not your real books)</span>' : '') + '.</p>' +
        '<p class="muted">Building a quote creates the estimate in QuickBooks and attaches its PDF to the email. ' +
        'When the payment lands, that estimate becomes an invoice with the payment recorded against it.</p>' +
        '<div id="qtax"><p class="muted">Checking how your books handle tax...</p></div>' +
        '<p><button class="ghost" onclick="qboDisconnect()">Disconnect</button></p>';
    } else {
      html += '<p class="muted">Not connected. Quotes and payments still work, they just do not reach your books by themselves.</p>' +
        '<ol class="steps">' +
        '<li>Open <a href="https://developer.intuit.com/app/developer/dashboard" target="_blank" rel="noopener">the Intuit developer dashboard</a> and create an app with the <b>Accounting</b> scope.</li>' +
        '<li>Add this exact redirect URI to it:<br><code class="copy" id="qredir">' + esc(location.origin + '/api/admin/qbo/callback') + '</code> ' +
        '<button class="ghost small" onclick="copyText(\'qredir\')">Copy</button></li>' +
        '<li>Paste the client id and secret here, then press Connect and pick your company.</li>' +
        '</ol>' +
        '<div class="form"><label>Client id<input id="qcid" autocomplete="off"></label>' +
        '<label>Client secret<input id="qcs" type="password" autocomplete="off"></label>' +
        '<label class="check"><input type="checkbox" id="qsand"> These are sandbox keys, not production</label></div>' +
        '<p><button class="primary" onclick="qboConnect()">Save and connect</button></p>';
      if (qb.hasApp) html += '<p class="muted">Keys are already saved. <a href="/api/admin/qbo/start">Pick your company</a> if you did not finish last time.</p>';
    }
    html += '</div>';

    html += '<div class="card"><h2>Payments</h2><p>' +
      (me.sentoo === 'mock'
        ? 'Sentoo is in sandbox mode. Quotes still get a payment link so the whole flow can be clicked through, it just is not real money yet.'
        : 'Sentoo is live.') +
      '</p><p class="muted">The webhook URL to give Sentoo is <code>' + esc(location.origin) + '/api/webhooks/sentoo</code>, and <code>' + esc(location.host) + '</code> has to be on their allowed return address list.</p></div>';

    view.innerHTML = html;
    if (qb.connected && !qb.needsReconnect) loadTaxCodes(qb);
  }).catch(showError);
}

/**
 * Tax is the one thing here nobody should guess at. QuickBooks is asked which
 * codes this company actually has, the owner picks the one that matches what
 * he is required to charge, and every estimate line carries it from then on.
 */
function loadTaxCodes(qb) {
  var box = document.getElementById('qtax');
  if (!box) return;
  api('/qbo/taxcodes').then(function (r) {
    var codes = r.codes || [];
    if (!codes.length) {
      box.innerHTML = '<p class="muted">Your books do not use tax codes, so quotes go out untaxed.</p>';
      return;
    }
    var h = '<label class="inline">Tax on every quote line ' +
      '<select id="qtaxsel" onchange="saveTaxCode()">' +
      '<option value="">No tax code</option>';
    for (var i = 0; i < codes.length; i++) {
      h += '<option value="' + esc(codes[i].id) + '"' +
        (String(r.chosen) === String(codes[i].id) ? ' selected' : '') + '>' + esc(codes[i].name) +
        (codes[i].pct ? ' (' + codes[i].pct + '%)' : '') + '</option>';
    }
    h += '</select></label>' +
      '<p class="muted">Pick the one that matches the OB you are required to charge. ' +
      'The same rate is added to the quote total here, so what the customer pays and what ' +
      'QuickBooks invoices are the same number. If A3D does not charge OB, leave it on <b>No tax code</b>.</p>';
    box.innerHTML = h;
  }).catch(function (e) {
    box.innerHTML = '<p class="muted">Could not read your tax codes: ' + esc(e.message) + '</p>';
  });
}

function saveTaxCode() {
  var sel = document.getElementById('qtaxsel');
  api('/qbo/taxcode', { method: 'POST', body: JSON.stringify({ id: sel.value }) })
    .then(function (r) {
      alert(r.chosen
        ? 'Quotes now add ' + (r.pct || 0) + '% ' + (r.name || 'tax') + ', matching QuickBooks.'
        : 'Quotes now go out with no tax.');
    })
    .catch(function (e) { alert(e.message); });
}

function copyText(id) {
  var el = document.getElementById(id);
  navigator.clipboard.writeText(el.textContent).then(function () { el.classList.add('copied'); });
}

function qboConnect() {
  var id = document.getElementById('qcid').value.trim();
  var secret = document.getElementById('qcs').value.trim();
  if (!id || !secret) return alert('Both fields are needed.');
  api('/qbo/app', {
    method: 'POST',
    body: JSON.stringify({ client_id: id, client_secret: secret, sandbox: document.getElementById('qsand').checked }),
  }).then(function () { location.href = '/api/admin/qbo/start'; })
    .catch(function (e) { alert(e.message); });
}

function qboDisconnect() {
  if (!confirm('Disconnect QuickBooks? Estimates and invoices will stop being created.')) return;
  api('/qbo/disconnect', { method: 'POST' }).then(settings).catch(showError);
}

function gmailConnect() {
  var id = document.getElementById('gcid').value.trim();
  var secret = document.getElementById('gcs').value.trim();
  if (!id || !secret) return alert('Both fields are needed.');
  api('/gmail/app', { method: 'POST', body: JSON.stringify({ client_id: id, client_secret: secret }) })
    .then(function () { location.href = '/api/admin/gmail/start'; })
    .catch(function (e) { alert(e.message); });
}

function gmailTest() {
  api('/gmail/test', { method: 'POST' })
    .then(function (r) { alert('Sent to ' + r.sentTo + '. Check your inbox.'); })
    .catch(function (e) { alert(e.message); });
}

function gmailDisconnect() {
  if (!confirm('Disconnect Gmail? Quotes will stop emailing themselves until you connect it again.')) return;
  api('/gmail/disconnect', { method: 'POST' }).then(settings).catch(showError);
}

function showError(err) {
  view.innerHTML = '<div class="flash">' + esc(err.message) + '</div>';
}

function route() {
  var h = location.hash.replace(/^#\/?/, '');
  var parts = h.split('/');
  setNav(parts[0] || '');
  if (parts[0] === 'orders') return orders();
  if (parts[0] === 'order' && parts[1]) return orderDetail(Number(parts[1]));
  if (parts[0] === 'customers') return customers();
  if (parts[0] === 'prices') return prices();
  if (parts[0].split('?')[0] === 'settings') return settings();
  return dashboard();
}
window.addEventListener('hashchange', route);

api('/me').then(function (me) {
  document.getElementById('who').innerHTML = 'Signed in as<br><b>' + esc(me.email) + '</b><br>' +
    (me.sentoo === 'mock' ? '<span style="color:var(--warn)">Sentoo in sandbox mode</span>' : 'Sentoo live');
  route();
}).catch(showError);
</script>
</body>
</html>`;
