/*
 * Fluxyn Flow Check widget. Embed a business's AI agent in any platform (an ERP, a PSP's online banking):
 *
 *   <script src="https://flowcheck.fluxyn.com/widget.js" data-key="fca_…" async></script>
 *
 * data-key  agent key issued by the CFO (Agents and budgets → Agent MCP); revoking it disables the widget
 * data-open "true" to start open
 * The agent can only pay through Flow Check: inside its Mandate it pays, over it the CFO approves, otherwise it is refused.
 */
(() => {
  const script = document.currentScript;
  const key = script?.dataset.key || new URLSearchParams(location.search).get('key');
  const api = (script?.dataset.api || new URL(script?.src || location.href).origin).replace(/\/$/, '');
  if (!key) return console.warn('[Flow Check] data-key is missing');

  const NAMES = { payables: 'Payables agent', marketing: 'Marketing agent' };
  const usd = (n) => `$${Number(n).toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const call = (path, body) => fetch(`${api}/api/widget/${encodeURIComponent(key)}/${path}`, body
    ? { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) }
    : undefined).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || r.statusText); return d; });

  const host = document.createElement('div');
  host.id = 'flowcheck-widget';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
    .fab { position: fixed; right: 20px; bottom: 20px; z-index: 2147483000; display: flex; align-items: center; gap: 8px; height: 48px; padding: 0 18px; border: 0; border-radius: 999px; background: #0B1A1F; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 10px 30px rgba(6,40,40,.3); }
    .fab i { width: 9px; height: 9px; border-radius: 50%; background: #14C9C0; box-shadow: 0 0 0 4px rgba(20,201,192,.25); }
    .panel { position: fixed; right: 20px; bottom: 80px; z-index: 2147483000; width: min(400px, calc(100vw - 32px)); height: min(620px, calc(100vh - 110px)); display: none; flex-direction: column; overflow: hidden; border-radius: 20px; background: #fff; color: #0B1A1F; border: 1px solid #DCE7E4; box-shadow: 0 24px 60px rgba(6,40,40,.25); }
    .panel.open { display: flex; }
    header { padding: 16px 18px 14px; background: #062828; color: #E2F7F3; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .brand { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: #78E6D2; font-family: ui-monospace, Menlo, monospace; }
    .title { margin-top: 4px; font-size: 17px; font-weight: 700; }
    .sub { margin-top: 2px; font-size: 12px; color: #9CC8C0; }
    .pill { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; }
    .ok { background: #DDF6EA; color: #11744A; } .warn { background: #FFF1D6; color: #8A5A00; } .no { background: #FCE3E5; color: #A3202C; }
    .x { border: 0; background: transparent; color: #9CC8C0; font-size: 20px; cursor: pointer; line-height: 1; }
    .meters { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
    .m span { display: flex; justify-content: space-between; font-size: 11px; color: #9CC8C0; white-space: nowrap; } .m em { font-style: normal; }
    .bar { margin-top: 4px; height: 5px; border-radius: 9px; background: rgba(255,255,255,.12); overflow: hidden; }
    .bar b { display: block; height: 100%; background: #14C9C0; }
    .log { flex: 1; overflow-y: auto; padding: 14px; background: #F3F8F6; display: flex; flex-direction: column; gap: 10px; }
    .msg { max-width: 88%; padding: 10px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.45; }
    .me { align-self: flex-end; background: #0B1A1F; color: #fff; border-bottom-right-radius: 4px; }
    .ag { align-self: flex-start; background: #fff; border: 1px solid #DCE7E4; border-bottom-left-radius: 4px; }
    .out { margin-top: 8px; display: grid; gap: 6px; }
    .o { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 9px; border-radius: 10px; background: #F3F8F6; font-size: 12px; }
    .o a { color: #06615E; font-weight: 600; text-decoration: none; }
    .muted { color: #5B6F72; font-size: 12px; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 0; background: #fff; }
    .chip { border: 1px solid #DCE7E4; background: #fff; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 600; cursor: pointer; color: #0B1A1F; }
    .chip:hover { border-color: #14C9C0; background: #E8F7F4; color: #06615E; }
    form { display: flex; gap: 8px; padding: 10px 14px 14px; background: #fff; }
    input { flex: 1; height: 40px; border: 1px solid #DCE7E4; border-radius: 999px; padding: 0 14px; font-size: 13.5px; outline: none; color: #0B1A1F; }
    input:focus { border-color: #14C9C0; box-shadow: 0 0 0 3px rgba(20,201,192,.2); }
    .send { width: 40px; height: 40px; border: 0; border-radius: 50%; background: #14C9C0; color: #062828; font-size: 18px; font-weight: 700; cursor: pointer; }
    .send:disabled { opacity: .5; }
    footer { padding: 0 14px 10px; background: #fff; font-size: 10.5px; color: #8A9B9D; text-align: center; }
  </style>
  <button class="fab" part="button"><i></i>Your agent · Flow Check</button>
  <section class="panel" role="dialog" aria-label="Flow Check agent">
    <header>
      <div class="row"><span class="brand">Fluxyn · Flow Check</span><button class="x" aria-label="Close">×</button></div>
      <div class="row"><div><div class="title">Loading…</div><div class="sub"></div></div><span class="kya"></span></div>
      <div class="meters"></div>
    </header>
    <div class="log"></div>
    <div class="chips"></div>
    <form><input placeholder="Ask your agent…" maxlength="500" /><button class="send" aria-label="Send">↑</button></form>
    <footer>Every payment is checked on the XRP Ledger · XRPL testnet</footer>
  </section>`;

  const $ = (s) => root.querySelector(s);
  const panel = $('.panel'), log = $('.log'), input = $('input'), send = $('.send');
  const toggle = (open) => panel.classList.toggle('open', open ?? !panel.classList.contains('open'));
  $('.fab').onclick = () => toggle();
  $('.x').onclick = () => toggle(false);

  const add = (cls, html) => { const d = document.createElement('div'); d.className = `msg ${cls}`; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  const meter = (label, used, limit) => `<div class="m"><span><em>${label}</em><em>${usd(used)} of ${usd(limit)}</em></span><div class="bar"><b style="width:${Math.min(100, (used / limit) * 100)}%"></b></div></div>`;

  async function loadSummary() {
    const s = await call('summary');
    $('.title').textContent = NAMES[s.agent] || 'Agent';
    $('.sub').textContent = `Acts for ${s.business}`;
    $('.kya').innerHTML = `<span class="pill ${s.authorized ? 'ok' : 'no'}">${s.authorized ? 'KYA · VERIFIED' : 'NOT AUTHORIZED'}</span>`;
    if (s.mandate && s.spent) {
      const l = s.mandate.limits;
      $('.meters').innerHTML = meter('This month', s.spent.month, l.monthly) + (l.quarterly ? meter('Quarter', s.spent.quarter || 0, l.quarterly) : meter('Today', s.spent.today, l.daily));
    }
    const chips = ["Pay this month's bills", 'What needs my approval?', 'How much budget is left?'];
    $('.chips').innerHTML = chips.map((c) => `<button class="chip">${esc(c)}</button>`).join('');
    root.querySelectorAll('.chip').forEach((b) => (b.onclick = () => ask(b.textContent)));
    if (!log.children.length) add('ag', `Hi. I pay ${esc(s.business)}'s bills, inside the Mandate the CFO signed. What should we do?`);
  }

  const STATUS = { PAID: ['ok', 'Paid'], PENDING_APPROVAL: ['warn', 'CFO approves'], REFUSED: ['no', 'Refused'] };
  function outcomes(steps) {
    const rows = steps.filter((s) => s.tool === 'pay_with_pass').map(({ output: o }) => {
      const [cls, label] = STATUS[o.status] || (o.decision === 'DENY' ? STATUS.REFUSED : ['warn', o.status || o.decision || '…']);
      const link = o.explorer ? ` · <a href="${esc(o.explorer)}" target="_blank" rel="noopener">ledger ↗</a>` : '';
      const note = o.simulated ? ' · simulated' : (o.failed && o.failed[0] && o.status !== 'PAID' ? ` · ${esc(o.failed[0].split(':')[0])}` : '');
      return `<div class="o"><span><b>${esc(o.bill || '')}</b> <span class="muted">${esc(o.rail || '')}${note}</span>${link}</span><span class="pill ${cls}">${label}</span></div>`;
    });
    return rows.length ? `<div class="out">${rows.join('')}</div>` : '';
  }

  async function ask(text) {
    text = String(text || '').trim();
    if (!text || send.disabled) return;
    input.value = '';
    add('me', esc(text));
    const wait = add('ag', '<span class="muted">Checking on the ledger…</span>');
    send.disabled = true;
    try {
      const r = await call('chat', { message: text });
      wait.innerHTML = esc(r.reply) + outcomes(r.steps || []);
      loadSummary().catch(() => {});
    } catch (e) {
      wait.innerHTML = `<span class="muted">${esc(e.message)}</span>`;
    } finally { send.disabled = false; log.scrollTop = log.scrollHeight; }
  }
  $('form').onsubmit = (e) => { e.preventDefault(); ask(input.value); };

  loadSummary().catch((e) => { $('.title').textContent = 'Agent unavailable'; $('.sub').textContent = e.message; });
  if (script?.dataset.open === 'true') toggle(true);
  window.FlowCheckWidget = { open: () => toggle(true), close: () => toggle(false), ask };
})();
