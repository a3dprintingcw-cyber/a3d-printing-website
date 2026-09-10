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
  /* min-width:0, because a grid item defaults to min-width:auto and will grow
     to fit the widest table inside it, which defeats every .scroll box and
     drags the whole page sideways on a phone. */
  main { padding:26px 30px 60px; max-width:1100px; min-width:0; }
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
  /* minmax(0,...) so a wide table inside scrolls in its own box instead of
     stretching the column and the page with it. */
  .grid2 { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:22px; align-items:start; }
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
  /* A table with six columns cannot be squeezed into a phone, so it is not
     asked to. Every table sits in its own scroller and the page itself never
     scrolls sideways, which is what makes a back office feel broken on a
     phone more than anything else. */
  .scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; margin:0 0 4px; }
  .scroll table { min-width:520px; }
  @media (max-width:820px) {
    body { overflow-x:hidden; }
    /* auto 1fr, or the grid splits the screen and the top bar grows into a
       half-empty panel that pushes the actual work below the fold. */
    .layout { grid-template-columns:minmax(0,1fr); grid-template-rows:auto 1fr; }
    .side { position:sticky; top:0; z-index:20; padding:10px 12px 8px;
            border-right:none; border-bottom:1px solid var(--border);
            background:var(--paper-soft); }
    .brand { font-size:15px; margin:0 0 8px; }
    .nav { display:flex; gap:6px; overflow-x:auto; padding-bottom:2px; scrollbar-width:none; }
    .nav::-webkit-scrollbar { display:none; }
    .nav a { padding:7px 13px; font-size:13.5px; white-space:nowrap; }
    .side .who { margin-top:8px; font-size:11px; }
    .grid2 { grid-template-columns:minmax(0,1fr); }
    main { padding:16px 14px 60px; }
    h1 { font-size:20px; }
    .card { padding:14px 15px; }
    .kv { grid-template-columns:92px 1fr; }
    button { padding:10px 14px; }
    .tiles { grid-template-columns:1fr 1fr; gap:10px; }
    .tile { padding:12px 14px; }
    .tile b { font-size:22px; }
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
  /* The website switch. A real checkbox underneath, so it keeps keyboard
     focus and a screen reader still hears "checkbox, checked". */
  .switch { position:relative; display:inline-block; width:42px; height:24px; cursor:pointer; }
  .switch input { position:absolute; opacity:0; width:100%; height:100%; margin:0; cursor:pointer; }
  .switch span { position:absolute; inset:0; border-radius:999px; background:var(--border); transition:background .15s; pointer-events:none; }
  .switch span::after { content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%;
    background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.25); transition:transform .15s; }
  .switch input:checked + span { background:var(--ok); }
  .switch input:checked + span::after { transform:translateX(18px); }
  .switch input:focus-visible + span { outline:2px solid var(--blue); outline-offset:2px; }
  /* On a phone the price list stops being a table: each item is a small card
     with the name and description on top and price, website switch, quotes and
     remove on one line, so the switch is always under a thumb and never off
     the right edge of the screen. */
  @media (max-width:820px) {
    .scroll table.pl { min-width:0; }
    table.pl, table.pl tbody, table.pl tr, table.pl td { display:block; width:100%; }
    table.pl tr:first-child { display:none; }
    table.pl tr[hidden] { display:none; }
    table.pl tr[data-id] { display:grid; grid-template-columns:minmax(0,1fr) auto auto auto; gap:8px 12px;
      align-items:center; padding:12px 14px; border-top:1px solid var(--border); }
    table.pl tr[data-id]:nth-child(2) { border-top:none; }
    table.pl td { padding:0; border:none; width:auto; }
    table.pl td:nth-child(1), table.pl td:nth-child(2) { grid-column:1 / -1; }
    table.pl td input[type=text], table.pl td input[type=number] { width:100%; }
    table.pl td[data-l] { display:flex; flex-direction:column; align-items:center; gap:3px; }
    table.pl td[data-l]::before { content:attr(data-l); font-size:10.5px; text-transform:uppercase;
      letter-spacing:.05em; color:var(--ink-soft); }
  }
  .savebar { position:sticky; bottom:0; margin-top:14px; padding:12px 0; background:var(--paper); }
  .form label { display:block; margin:10px 0; font-size:13px; color:var(--ink-soft); }
  .form label.check { display:flex; align-items:center; gap:8px; margin-top:14px; }
  .form label.check input { display:inline-block; width:auto; margin:0; }
  .form input { display:block; width:100%; max-width:520px; margin-top:4px; padding:9px 11px;
    border-radius:9px; border:1px solid var(--border); background:var(--paper); color:var(--ink); font-size:14px; }
  .danger { color:var(--bad); border-color:var(--bad); background:transparent; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap; }
  .linkish { color:var(--blue); text-decoration:none; font-weight:600; }
  .linkish:hover { text-decoration:underline; }
  .empty { border:1px dashed var(--border); border-radius:var(--radius); padding:28px 20px;
    text-align:center; color:var(--ink-soft); font-size:14px; }
  .empty b { display:block; color:var(--ink); font-size:15px; margin-bottom:4px; }
  .stack { display:grid; gap:8px; }
  .picked { font-size:13px; color:var(--ink-soft); margin-top:6px; }
  .hit { display:flex; justify-content:space-between; gap:10px; align-items:center;
    padding:7px 10px; border:1px solid var(--border); border-radius:9px; font-size:13px; }
  dialog { border:1px solid var(--border); border-radius:var(--radius); background:var(--card);
    color:var(--ink); padding:20px; width:min(440px,92vw); }
  dialog::backdrop { background:rgba(0,0,0,.5); }
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
// Every table goes through here so none of them can push the page sideways.
function wrap(tableHtml) {
  return '<div class="scroll">' + tableHtml + '</div>';
}
function empty(title, line) {
  return '<div class="empty"><b>' + esc(title) + '</b>' + esc(line || '') + '</div>';
}

function setNav(route) {
  var r = String(route).split('?')[0];
  if (r === 'order') r = 'orders';
  if (r === 'customer') r = 'customers';
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
    var html = '<div class="head"><div><h1>Dashboard</h1>' +
      '<p class="sub">Jobs are all time. Visitors are the last 30 days.</p></div>' +
      '<button class="primary" onclick="newOrder()">New order</button></div>' +
      '<div class="tiles">' +
      '<div class="tile"><b>' + (counts.new || 0) + '</b><span>new requests waiting</span></div>' +
      '<div class="tile"><b>' + open + '</b><span>open jobs</span></div>' +
      '<div class="tile"><b>' + (s.visits.visitors || 0) + '</b><span>website visitors</span></div>' +
      '<div class="tile"><b>' + s.conversion + '%</b><span>visitors who asked for a quote</span></div>' +
      '</div>';

    html += '<h2>Pipeline</h2><div class="scroll"><table><tr>';
    ['new', 'quoted', 'approved', 'printing', 'ready', 'delivered', 'paid'].forEach(function (st) {
      html += '<th>' + st + '</th>';
    });
    html += '</tr><tr>';
    ['new', 'quoted', 'approved', 'printing', 'ready', 'delivered', 'paid'].forEach(function (st) {
      html += '<td><b>' + (counts[st] || 0) + '</b></td>';
    });
    html += '</tr></table></div>';

    html += '<h2>Latest requests</h2><div class="scroll"><table><tr><th>Ref</th><th>Customer</th><th>Status</th><th>When</th></tr>';
    s.recent.forEach(function (o) {
      html += '<tr class="row" onclick="location.hash=\'#/order/' + o.id + '\'"><td><b>' + esc(o.ref) +
        '</b></td><td>' + esc(o.customer_name) + '</td><td>' + pill(o.status) + '</td><td class="muted">' +
        ago(o.created_at) + '</td></tr>';
    });
    if (!s.recent.length) html += '<tr><td colspan="4" class="muted">Nothing yet.</td></tr>';
    html += '</table></div>';

    html += '<div class="grid2"><div><h2>Most visited pages</h2><div class="scroll"><table><tr><th>Page</th><th class="right">Views</th></tr>';
    s.topPages.forEach(function (p) {
      html += '<tr><td>' + esc(p.path) + '</td><td class="right">' + p.n + '</td></tr>';
    });
    if (!s.topPages.length) html += '<tr><td colspan="2" class="muted">No traffic recorded yet.</td></tr>';
    html += '</table></div></div><div><h2>Where they came from</h2><div class="scroll"><table><tr><th>Source</th><th class="right">Visits</th></tr>';
    s.referrers.forEach(function (r) {
      var host = r.referrer;
      try { host = new URL(r.referrer).hostname; } catch (e) {}
      html += '<tr><td>' + esc(host) + '</td><td class="right">' + r.n + '</td></tr>';
    });
    if (!s.referrers.length) html += '<tr><td colspan="2" class="muted">Direct visits only so far.</td></tr>';
    html += '</table></div></div></div>';

    view.innerHTML = html;
  }).catch(showError);
}

// ---------------------------------------------------------------- orders
function orders() {
  var status = sessionStorage.getItem('a3d.status') || 'all';
  var q = sessionStorage.getItem('a3d.q') || '';
  api('/orders?status=' + encodeURIComponent(status) + '&q=' + encodeURIComponent(q)).then(function (d) {
    var opts = ['all', 'new', 'quoted', 'approved', 'printing', 'ready', 'delivered', 'paid', 'closed', 'lost'];
    var html = '<div class="head"><h1>Orders</h1>' +
      '<button class="primary" onclick="newOrder()">New order</button></div>' +
      '<div class="bar"><select id="st" onchange="applyFilter()">';
    opts.forEach(function (o) {
      html += '<option value="' + o + '"' + (o === status ? ' selected' : '') + '>' + o + '</option>';
    });
    // Enter searches, because nobody hunts for a Filter button on a phone.
    html += '</select><input type="text" id="q" placeholder="Search name, email, reference" value="' + esc(q) +
      '" onkeydown="if(event.key===\'Enter\')applyFilter()">' +
      '<button class="primary" onclick="applyFilter()">Search</button>' +
      ((q || status !== 'all') ? '<button class="ghost" onclick="clearFilter()">Clear</button>' : '') + '</div>';

    if (!d.orders.length) {
      html += empty(q || status !== 'all' ? 'Nothing matches that' : 'No orders yet',
        q || status !== 'all' ? 'Try a wider search, or clear the filter.'
          : 'They arrive from the website form, or you can add one by hand.');
      view.innerHTML = html;
      return;
    }

    html += '<div class="scroll"><table><tr><th>Ref</th><th>Customer</th><th>Wants</th><th>Files</th><th>Status</th><th>When</th></tr>';
    d.orders.forEach(function (o) {
      var wants = o.mode === 'dev' ? (o.project_type || 'Project') : ((o.material || 'Print') + (o.quantity ? ' x' + o.quantity : ''));
      html += '<tr class="row" onclick="location.hash=\'#/order/' + o.id + '\'">' +
        '<td><b>' + esc(o.ref) + '</b></td><td>' + esc(o.customer_name) + '<div class="muted">' +
        esc(shownEmail(o.customer_email)) + '</div></td><td>' + esc(wants) + '</td><td>' + (o.files || 0) + '</td><td>' +
        pill(o.status) + '</td><td class="muted">' + ago(o.created_at) + '</td></tr>';
    });
    html += '</table></div>';
    if (d.orders.length >= 200) html += '<p class="muted">Showing the newest 200. Narrow it with the search box.</p>';
    view.innerHTML = html;
  }).catch(showError);
}
// Walk-ins are stored with a placeholder address so the customer list can key
// on something. It is not an address anybody should ever see or write to.
function shownEmail(email) {
  var e = String(email || '');
  return /@a3d\.local$/i.test(e) ? 'no email' : e;
}
function hasEmail(email) {
  return !!String(email || '') && !/@a3d\.local$/i.test(String(email));
}
function applyFilter() {
  sessionStorage.setItem('a3d.status', document.getElementById('st').value);
  sessionStorage.setItem('a3d.q', document.getElementById('q').value);
  orders();
}
function clearFilter() {
  sessionStorage.removeItem('a3d.status');
  sessionStorage.removeItem('a3d.q');
  orders();
}

// ------------------------------------------------------------- new order
// The counter case: someone walks in, so there is no website form to wait for.
function newOrder() {
  var name = prompt('Customer name');
  if (name === null) return;
  name = name.trim();
  if (!name) { alert('A name is needed.'); return; }
  var email = prompt('Email address (leave empty for a walk-in)', '');
  if (email === null) return;
  var what = prompt('What are they after? (this becomes the note)', '');
  if (what === null) return;
  api('/orders', { method: 'POST', body: JSON.stringify({ name: name, email: email.trim(), notes: what }) })
    .then(function (r) { location.hash = '#/order/' + r.id; })
    .catch(function (e) { alert(e.message); });
}

// ----------------------------------------------------------- order detail
var current = null;
function orderDetail(id) {
  api('/orders/' + id).then(function (d) {
    current = d;
    var o = d.order;
    var html = '<div class="head"><div><h1>' + esc(o.ref) + ' ' + pill(o.status) + '</h1>' +
      '<p class="sub">' + esc(o.customer_name) + ' &middot; ' + ago(o.created_at) +
      (o.source === 'counter' ? ' &middot; added by hand' : '') + '</p></div>' +
      '<button class="danger" onclick="deleteOrder(' + o.id + ',\'' + esc(o.ref) + '\')">Delete order</button></div>' +
      '<div class="grid2"><div>';

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
      html += '<div class="scroll"><table>';
      d.files.forEach(function (f) {
        html += '<tr><td><a class="linkish" href="/api/admin/files/' + f.id + '">' + esc(f.filename) + '</a></td>' +
          '<td class="right muted">' + (f.bytes > 1048576 ? (f.bytes / 1048576).toFixed(1) + ' MB' : Math.round(f.bytes / 1024) + ' KB') + '</td></tr>';
      });
      html += '</table></div>';
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
          html += '<div class="scroll"><table style="margin-top:10px">';
          qlines.forEach(function (l) {
            html += '<tr><td>' + l.qty + ' &times; ' + esc(l.description) + '</td><td class="right">' + money(l.line_cents) + '</td></tr>';
          });
          html += '</table></div>';
        }
        // Showing the split matters now that OB is on some quotes and not
        // others: at a glance he can see which kind of quote this was.
        html += '<div class="qsum" style="margin-top:10px">' +
          '<div class="qrow"><span>Subtotal</span><b>' + money(qt.subtotal_cents) + '</b></div>' +
          '<div class="qrow"><span>OB</span><b>' + (qt.tax_cents ? money(qt.tax_cents) : 'not charged') + '</b></div>' +
          '<div class="qrow total"><span>Total</span><b>' + money(qt.total_cents) + '</b></div></div>';
        if (qt.sentoo_url) {
          html += '<div class="bar" style="margin-top:10px;margin-bottom:0">' +
            '<a class="linkish" href="' + esc(qt.sentoo_url) + '" target="_blank" rel="noopener">Open pay link</a>' +
            '<button class="ghost small" onclick="copyValue(this,\'' + esc(qt.sentoo_url) + '\')">Copy link</button>' +
            (qt.sentoo_status === 'mock' ? '<span class="muted">sandbox, not real money</span>' : '') + '</div>';
        }
        if (qt.paid_at) {
          html += '<div class="muted" style="margin-top:6px;color:var(--ok)">Paid ' + ago(qt.paid_at) + '</div>';
        }
        html += '<div class="bar" style="margin-top:12px">';
        if (qt.status !== 'paid') {
          html += hasEmail(o.customer_email)
            ? '<button class="primary" onclick="sendQuote(' + qt.id + ',' + o.id + ')">' +
              (qt.status === 'sent' ? 'Send again' : 'Send to customer') + '</button>'
            : '<button class="primary" disabled title="This customer has no email address">Send to customer</button>';
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
        if (d.gmail === false && hasEmail(o.customer_email)) {
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
      '<dt>Name</dt><dd><a class="linkish" href="#/customer/' + o.customer_id + '">' + esc(o.customer_name) + '</a></dd>' +
      '<dt>Email</dt><dd>' + (hasEmail(o.customer_email)
        ? '<a class="linkish" href="mailto:' + esc(o.customer_email) + '">' + esc(o.customer_email) + '</a>'
        : '<span class="muted">no email</span>') + '</dd>' +
      '<dt>Phone</dt><dd>' + (o.customer_phone
        ? '<a class="linkish" href="https://wa.me/' + esc(String(o.customer_phone).replace(/[^0-9]/g, '')) + '">' + esc(o.customer_phone) + '</a>'
        : '-') + '</dd></dl>';
    // Which card in his real books this order will land on. Left to itself the
    // matching is good but not psychic, so he can pin it by hand.
    html += '<div class="picked" id="qbolink"></div>';
    if (d.history.length) {
      html += '<p class="muted" style="margin-bottom:4px;margin-top:12px">Earlier orders</p>';
      d.history.forEach(function (h) {
        html += '<div class="muted"><a class="linkish" href="#/order/' + h.id + '">' + esc(h.ref) + '</a> ' + esc(h.status) + '</div>';
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
    showQboLink(o);
  }).catch(showError);
}

function showQboLink(o) {
  var box = document.getElementById('qbolink');
  if (!box) return;
  var pinned = o.customer_qbo_id;
  box.innerHTML = (pinned
    ? 'QuickBooks customer <b>#' + esc(pinned) + '</b>. '
    : 'QuickBooks customer is matched on email, then name, when the quote is made. ') +
    '<button class="ghost small" onclick="pickQboCustomer(' + o.customer_id + ',\'' +
    esc(String(o.customer_name).replace(/'/g, '')) + '\')">' + (pinned ? 'Change' : 'Pin one') + '</button>';
}

// Searches his real QuickBooks and pins the chosen card to this customer, so
// Papagayo the hotel and Papagayo the second card he made by accident stop
// being two histories.
function pickQboCustomer(customerId, suggested) {
  var term = prompt('Search your QuickBooks customers', suggested || '');
  if (term === null) return;
  api('/qbo/customers?q=' + encodeURIComponent(term)).then(function (r) {
    var list = r.customers || [];
    if (!list.length) { alert('Nothing in QuickBooks matches that.'); return; }
    var msg = 'Which one?\n\n';
    list.forEach(function (c, i) { msg += (i + 1) + '. ' + c.name + (c.email ? '  (' + c.email + ')' : '') + '\n'; });
    msg += '\nType a number, or 0 to unpin.';
    var pick = prompt(msg, '1');
    if (pick === null) return;
    var n = Number(pick);
    var chosen = n === 0 ? '' : (list[n - 1] && list[n - 1].id);
    if (n !== 0 && !chosen) { alert('That was not one of the numbers.'); return; }
    api('/customers/' + customerId + '/qbo', { method: 'POST', body: JSON.stringify({ qbo_customer_id: chosen }) })
      .then(function () { route(); })
      .catch(function (e) { alert(e.message); });
  }).catch(function (e) { alert(e.message); });
}

function copyValue(btn, text) {
  navigator.clipboard.writeText(text).then(function () {
    var was = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(function () { btn.textContent = was; }, 1400);
  }, function () { prompt('Copy this', text); });
}

function deleteOrder(id, ref) {
  if (!confirm('Delete ' + ref + ' for good? Its quotes, files and history go with it.\n\n' +
    'Anything already in QuickBooks stays there, this only clears the back office.')) return;
  fetch('/api/admin/orders/' + id, { method: 'DELETE' }).then(function (r) {
    if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Could not delete it'); });
    location.hash = '#/orders';
  }).catch(function (e) { alert(e.message); });
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
  return api('/customers').then(function (d) {
    var html = '<h1>Customers</h1><p class="sub">Everyone who has ever asked for something.</p>';
    if (!d.customers.length) {
      view.innerHTML = html + empty('No customers yet', 'The first website enquiry creates one.');
      return;
    }
    html += '<div class="scroll"><table><tr><th>Name</th><th>Email</th><th>Phone</th><th class="right">Orders</th><th>Last order</th><th style="width:40px"></th></tr>';
    d.customers.forEach(function (c) {
      html += '<tr class="row" onclick="location.hash=\'#/customer/' + c.id + '\'"><td><b>' + esc(c.name) + '</b></td><td>' +
        esc(shownEmail(c.email)) + '</td><td>' + esc(c.phone || '-') +
        '</td><td class="right">' + c.orders + '</td><td class="muted">' + (c.last_order ? ago(c.last_order) : '-') + '</td>' +
        '<td><button class="ghost" title="Delete this customer" onclick="event.stopPropagation();deleteCustomer(' + c.id + ')">&times;</button></td></tr>';
    });
    html += '</table></div>';
    view.innerHTML = html;
  }).catch(showError);
}

// One customer, everything they have ever ordered, and what they have paid.
// The old list was a dead end: their name was there and led nowhere.
function customerDetail(id) {
  api('/customers/' + id).then(function (d) {
    var c = d.customer;
    var html = '<h1>' + esc(c.name) + '</h1><p class="sub">Customer since ' + esc(String(c.created_at || '').slice(0, 10)) + '</p>';
    html += '<div class="grid2"><div><h2 style="margin-top:0">Orders</h2>';
    if (d.orders.length) {
      html += '<div class="scroll"><table><tr><th>Ref</th><th>Wants</th><th>Status</th><th>When</th></tr>';
      d.orders.forEach(function (o) {
        html += '<tr class="row" onclick="location.hash=\'#/order/' + o.id + '\'"><td><b>' + esc(o.ref) + '</b></td><td>' +
          esc((o.material || 'Print') + (o.quantity ? ' x' + o.quantity : '')) + '</td><td>' + pill(o.status) +
          '</td><td class="muted">' + ago(o.created_at) + '</td></tr>';
      });
      html += '</table></div>';
    } else {
      html += empty('Nothing ordered yet', '');
    }
    html += '</div><div><div class="card"><h2 style="margin-top:0">Details</h2><dl class="kv">' +
      '<dt>Email</dt><dd>' + (hasEmail(c.email)
        ? '<a class="linkish" href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>'
        : '<span class="muted">no email</span>') + '</dd>' +
      '<dt>Phone</dt><dd>' + (c.phone
        ? '<a class="linkish" href="https://wa.me/' + esc(String(c.phone).replace(/[^0-9]/g, '')) + '">' + esc(c.phone) + '</a>'
        : '-') + '</dd>' +
      '<dt>Company</dt><dd>' + esc(c.company || '-') + '</dd>' +
      '<dt>Paid so far</dt><dd><b>' + money(d.paidCents) + '</b></dd></dl>' +
      '<div class="bar" style="margin:16px 0 0"><button class="danger" onclick="deleteCustomer(' + c.id + ')">Delete customer</button></div>' +
      '</div></div></div>';
    view.innerHTML = html;
  }).catch(showError);
}

// Looks the customer up first so the confirmation can say exactly what goes:
// how many orders, and a louder warning if any of them were actually paid.
function deleteCustomer(id) {
  api('/customers/' + id).then(function (d) {
    var c = d.customer, n = d.orders.length;
    var msg = 'Delete ' + c.name + ' for good?';
    if (n) msg += '\n\nTheir ' + n + (n === 1 ? ' order goes' : ' orders go') + ' too, with all quotes, files and history.';
    if (d.paidCents > 0) msg += '\n\nCareful: this customer has paid ' + money(d.paidCents) + '. That payment record disappears from the back office.';
    msg += '\n\nAnything already in QuickBooks stays there.';
    if (!confirm(msg)) return;
    return fetch('/api/admin/customers/' + id, { method: 'DELETE' }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Could not delete them'); });
      // Back to the list without a hashchange, so the list renders once and
      // the confirmation banner lands on it instead of on the page just left.
      if (location.hash !== '#/customers') { history.pushState(null, '', '#/customers'); setNav('customers'); }
      return customers().then(function () { flashOnce(c.name + ' deleted.'); });
    });
  }).catch(function (e) { alert(e.message); });
}

// ---------------------------------------------------------------- prices
// Two tables, one screen: what the public Prices page is showing right now,
// and everything else. Flipping an item's website switch moves its row across
// straight away so the split always matches the switches, and nothing reaches
// the site until Save.
function priceRow(p) {
  return '<tr data-id="' + p.id + '"><td><input type="text" class="n" aria-label="Item" value="' + esc(p.name) + '"></td>' +
    '<td><input type="text" class="ds" aria-label="Description" placeholder="Description" value="' + esc(p.description || '') + '"></td>' +
    '<td><input type="number" class="u" aria-label="Price" step="0.01" min="0" value="' + (p.unit_cents === null ? '' : (p.unit_cents / 100).toFixed(2)) + '"></td>' +
    '<td data-l="Website"><label class="switch" title="Show this item and its price on the website">' +
      '<input type="checkbox" class="w" onchange="moveWebRow(this)"' + (p.web ? ' checked' : '') + '><span></span></label></td>' +
    '<td data-l="Quotes"><input type="checkbox" class="a" title="Offer this item in the quote builder"' + (p.active ? ' checked' : '') + '></td>' +
    '<td><button class="ghost" title="Remove this item" onclick="deletePrice(' + p.id + ',\'' +
    esc(String(p.name).replace(/'/g, '')) + '\')">&times;</button></td></tr>';
}
function priceTable(id, rows, emptyText) {
  return '<div class="scroll"><table class="pl" id="' + id + '"><tr><th>Item</th><th>Description</th>' +
    '<th style="width:130px">Price (' + CUR + ')</th><th style="width:90px">Website</th><th style="width:70px">Quotes</th><th style="width:40px"></th></tr>' +
    rows.map(priceRow).join('') +
    '<tr class="none"' + (rows.length ? ' hidden' : '') + '><td colspan="6" class="muted">' + emptyText + '</td></tr>' +
    '</table></div>';
}
function prices() {
  api('/prices').then(function (d) {
    var html = '<div class="head"><div><h1>Price list</h1>' +
      '<p class="sub">Switch an item on under Website and it shows with its price on a3dprinting.com/prices after you save. ' +
      'Quotes decides what the quote builder offers. An empty price shows as "on request".</p></div>' +
      '<button onclick="addPrice()">Add item</button></div>';
    if (!d.prices.length) {
      view.innerHTML = html + empty('No items yet', 'Add the things you quote over and over, so a quote is two taps.');
      return;
    }
    var on = d.prices.filter(function (p) { return p.web; });
    var off = d.prices.filter(function (p) { return !p.web; });
    html += '<h2>On the website <span class="muted" id="webcount">(' + on.length + ')</span></h2>' +
      priceTable('pl-web', on, 'Nothing is on the website yet. Switch an item on below and save.');
    html += '<h2>Not on the website <span class="muted" id="offcount">(' + off.length + ')</span></h2>' +
      priceTable('pl-off', off, 'Every item is on the website.');
    html += '<div class="bar savebar"><button class="primary" onclick="savePrices()">Save prices</button>' +
      '<span class="muted" id="plstate">Saved changes reach the website within a minute.</span></div>';
    view.innerHTML = html;
  }).catch(showError);
}
function moveWebRow(box) {
  var tr = box.closest('tr');
  var target = document.getElementById(box.checked ? 'pl-web' : 'pl-off');
  var tbody = target.tBodies[0] || target;
  var none = tbody.querySelector('tr.none');
  tbody.insertBefore(tr, none);
  ['pl-web', 'pl-off'].forEach(function (id) {
    var t = document.getElementById(id);
    var n = t.querySelectorAll('tr[data-id]').length;
    t.querySelector('tr.none').hidden = n > 0;
    document.getElementById(id === 'pl-web' ? 'webcount' : 'offcount').textContent = '(' + n + ')';
  });
  var st = document.getElementById('plstate');
  if (st) { st.textContent = 'Unsaved changes. Press Save prices to update the website.'; st.style.color = 'var(--warn)'; }
}
function savePrices() {
  var rows = document.querySelectorAll('table.pl tr[data-id]');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var u = rows[i].querySelector('.u').value;
    out.push({
      id: Number(rows[i].getAttribute('data-id')),
      name: rows[i].querySelector('.n').value,
      description: rows[i].querySelector('.ds').value,
      unit_cents: u === '' ? null : Math.round(parseFloat(u) * 100),
      active: rows[i].querySelector('.a').checked,
      web: rows[i].querySelector('.w').checked,
    });
  }
  api('/prices', { method: 'POST', body: JSON.stringify({ prices: out }) })
    .then(function () {
      flashOnce('Price list saved. The website picks it up within a minute.');
      var st = document.getElementById('plstate');
      if (st) { st.textContent = 'Saved changes reach the website within a minute.'; st.style.color = ''; }
    }).catch(showError);
}
function addPrice() {
  var name = prompt('What is the item called?');
  if (name === null) return;
  if (!name.trim()) return;
  api('/prices/add', { method: 'POST', body: JSON.stringify({ name: name.trim() }) })
    .then(function () { prices(); }).catch(showError);
}
function deletePrice(id, name) {
  if (!confirm('Remove "' + name + '" from the price list? Quotes already made keep their lines.')) return;
  fetch('/api/admin/prices/' + id, { method: 'DELETE' }).then(function (r) {
    if (!r.ok) throw new Error('Could not remove it');
    prices();
  }).catch(function (e) { alert(e.message); });
}

// A quiet banner beats an alert box you have to dismiss on a phone.
function flashOnce(msg) {
  var el = document.createElement('div');
  el.className = 'flash ok';
  el.textContent = msg;
  view.insertBefore(el, view.firstChild);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2600);
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
  if (parts[0] === 'customer' && parts[1]) return customerDetail(Number(parts[1]));
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
