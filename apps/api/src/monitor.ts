// The live monitor served at "/". Plain HTML and JS, no build step.
export const MONITOR_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fluxyn Flow Check</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
  :root { --bg:#070f12; --panel:#0d1a1f; --line:#1c2f35; --text:#e6f4f2; --muted:#8aa3a8; --teal:#14c9c0; --ok:#3ddc97; --warn:#f0c46b; --no:#ff6b6b; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 Manrope, system-ui, sans-serif; }
  header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 28px; border-bottom:1px solid var(--line); }
  .brand { font-weight:800; font-size:20px; letter-spacing:-.02em; } .brand span { color:var(--teal); }
  .tag { font:500 12px 'JetBrains Mono', monospace; color:var(--muted); }
  main { display:grid; grid-template-columns: minmax(320px, 1fr) minmax(360px, 1.3fr); gap:20px; padding:24px 28px; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; padding:16px; } header { padding:14px 16px; flex-wrap:wrap; } }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 20px; margin-bottom:20px; }
  h2 { margin:0 0 12px; font-size:13px; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); font-weight:700; }
  .check { display:flex; gap:10px; padding:6px 0; border-bottom:1px solid var(--line); font-size:14px; }
  .check:last-child { border-bottom:0; }
  .i { width:18px; flex:none; font-weight:800; } .ok { color:var(--ok); } .no { color:var(--no); } .warn { color:var(--warn); }
  .muted { color:var(--muted); font-size:13px; }
  .mono { font-family:'JetBrains Mono', monospace; font-size:12px; word-break:break-all; }
  .scenes { display:grid; gap:10px; }
  button { all:unset; cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:#0a1519; }
  button:hover { border-color:var(--teal); } button[disabled] { opacity:.5; cursor:wait; }
  button b { font-weight:700; } button small { color:var(--muted); display:block; font-size:12.5px; }
  .pill { font:600 11.5px 'JetBrains Mono', monospace; padding:3px 8px; border-radius:999px; white-space:nowrap; }
  .p-ok { background:rgba(61,220,151,.12); color:var(--ok); } .p-no { background:rgba(255,107,107,.12); color:var(--no); } .p-warn { background:rgba(240,196,107,.14); color:var(--warn); }
  #result { min-height:60px; }
  .ev { display:grid; grid-template-columns: 1fr auto; gap:4px 12px; padding:10px 0; border-bottom:1px solid var(--line); }
  .ev a { color:var(--teal); text-decoration:none; font-size:12.5px; }
  input { background:#0a1519; border:1px solid var(--line); color:var(--text); border-radius:8px; padding:6px 10px; font:inherit; width:160px; }
  a { color:var(--teal); }
</style>
</head>
<body>
<header>
  <div><div class="brand">Fluxyn <span>Flow Check</span></div><div class="tag">KYA anchored in KYB · XRPL testnet</div></div>
  <label class="muted">Demo token <input id="token" type="password" autocomplete="off"></label>
</header>
<main>
  <section>
    <div class="card"><h2>Know your agent</h2><div id="kya" class="muted">Checking the agent on the ledger…</div></div>
    <div class="card"><h2>Scenes</h2>
      <div class="scenes">
        <button data-s="1"><span><b>1 · Supplier with a Pass</b><small>1,200 RLUSD inside the Mandate</small></span><span class="pill p-ok">tesSUCCESS</span></button>
        <button data-s="2"><span><b>2 · Over the Mandate</b><small>6,000 RLUSD · the agent asks for approval</small></span><span class="pill p-warn">NEEDS_APPROVAL</span></button>
        <button data-s="2-approve"><span><b>2 · Approve as the business</b><small>Simulated: the business key signs on the server</small></span><span class="pill p-ok">tesSUCCESS</span></button>
        <button data-s="3a"><span><b>3a · Vendor without a Pass</b><small>Flow Check refuses before the ledger</small></span><span class="pill p-no">DENY</span></button>
        <button data-s="3b"><span><b>3b · Agent without KYA pays directly</b><small>Skips Flow Check · the validators refuse</small></span><span class="pill p-no">tecNO_PERMISSION</span></button>
      </div>
    </div>
    <div class="card"><h2>Result</h2><div id="result" class="muted">Run a scene.</div></div>
  </section>
  <section>
    <div class="card"><h2>Live on the ledger</h2><div id="events" class="muted">Loading…</div></div>
  </section>
</main>
<script>
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var tokenEl = document.getElementById('token');
  try { tokenEl.value = localStorage.getItem('fc-token') || ''; } catch (e) {}
  tokenEl.addEventListener('change', function () { try { localStorage.setItem('fc-token', tokenEl.value); } catch (e) {} });

  function checksHtml(list) {
    return list.map(function (c) {
      var cls = c.ok ? 'ok' : (c.effect === 'DENY' ? 'no' : 'warn');
      var icon = c.ok ? '✓' : (c.effect === 'DENY' ? '✗' : '!');
      return '<div class="check"><span class="i ' + cls + '">' + icon + '</span><span><b>' + esc(c.label) + '</b> <span class="muted">' + esc(c.detail) + '</span></span></div>';
    }).join('');
  }

  function loadKya() {
    fetch('/api/network').then(function (r) { return r.json(); }).then(function (net) {
      return fetch('/api/agent/' + net.agent).then(function (r) { return r.json(); }).then(function (a) {
        document.getElementById('kya').innerHTML =
          '<div style="margin-bottom:8px"><span class="pill ' + (a.authorized ? 'p-ok' : 'p-no') + '">' + (a.authorized ? 'AUTHORIZED' : 'NOT AUTHORIZED') + '</span></div>' +
          '<div class="muted">Agent <span class="mono">' + esc(a.agent) + '</span><br>acts for <span class="mono">' + esc(a.principal) + '</span></div>' +
          '<div style="margin-top:10px">' + checksHtml(a.checks) + '</div>';
      });
    }).catch(function () { document.getElementById('kya').textContent = 'Could not reach the ledger.'; });
  }

  function loadEvents() {
    fetch('/api/events').then(function (r) { return r.json(); }).then(function (list) {
      document.getElementById('events').innerHTML = list.slice(0, 25).map(function (e) {
        var good = e.result === 'tesSUCCESS';
        var who = esc(e.from) + (e.via ? ' <span class="muted">via ' + esc(e.via) + '</span>' : '') + (e.to ? ' → ' + esc(e.to) : '');
        return '<div class="ev"><div><b>' + esc(e.type) + '</b> ' + (e.amount ? esc(e.amount) : '') + '<div class="muted">' + who + '</div></div>' +
          '<div style="text-align:right"><span class="pill ' + (good ? 'p-ok' : 'p-no') + '">' + esc(e.result) + '</span><br><a href="' + esc(e.explorer) + '" target="_blank" rel="noopener">explorer ↗</a></div></div>';
      }).join('') || '<span class="muted">No transactions yet.</span>';
    }).catch(function () {});
  }

  document.querySelectorAll('button[data-s]').forEach(function (b) {
    b.addEventListener('click', function () {
      var res = document.getElementById('result');
      document.querySelectorAll('button[data-s]').forEach(function (x) { x.disabled = true; });
      res.innerHTML = '<span class="muted">Running on testnet…</span>';
      fetch('/api/demo/' + b.dataset.s, { method: 'POST', headers: { 'x-demo-token': tokenEl.value } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.error) { res.innerHTML = '<span class="no">' + esc(d.error) + '</span>'; return; }
          var status = d.status || d.decision;
          var cls = /PAID/.test(status) ? 'p-ok' : /PENDING/.test(status) ? 'p-warn' : 'p-no';
          var checks = (d.checks || (d.kya && d.kya.checks) || []);
          var shown = /PAID/.test(status) ? checks : checks.filter(function (c) { return !c.ok; });
          res.innerHTML = '<div><span class="pill ' + cls + '">' + esc(status) + '</span> ' + (d.engineResult ? '<span class="pill ' + (d.engineResult === 'tesSUCCESS' ? 'p-ok' : 'p-no') + '">' + esc(d.engineResult) + '</span>' : '') + '</div>' +
            (d.explorer ? '<div style="margin:8px 0"><a href="' + esc(d.explorer) + '" target="_blank" rel="noopener">View the transaction ↗</a></div>' : '') +
            '<div style="margin-top:8px">' + checksHtml(shown) + '</div>';
          loadEvents();
        })
        .catch(function (e) { res.innerHTML = '<span class="no">' + esc(e.message) + '</span>'; })
        .finally(function () { document.querySelectorAll('button[data-s]').forEach(function (x) { x.disabled = false; }); });
    });
  });

  loadKya(); loadEvents(); setInterval(loadEvents, 5000);
</script>
</body>
</html>`;
