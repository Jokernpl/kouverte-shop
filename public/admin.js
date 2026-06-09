// ===== Kouverte Shop — admin =====
let PASS = sessionStorage.getItem('shop_admin_pass') || '';
let socket = null;
const $ = s => document.querySelector(s);
const money = n => '€' + (Math.round((n || 0) * 100) / 100).toFixed(2).replace('.', ',');
const esc = s => (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const OLABEL = { pending: 'Da pagare', paid: 'Pagato', shipped: 'Spedito', cancelled: 'Annullato' };
const FLABEL = { da_inoltrare: 'Da inoltrare', inoltrato: 'Inoltrato', pagato: 'Pagato AliExpress', spedito: 'Spedito', errore: 'Errore' };
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2000); }
function H() { return { 'Content-Type': 'application/json', 'x-admin-pass': PASS }; }

async function doLogin() {
  const pw = $('#pw').value;
  const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: pw }) });
  if (r.ok) { PASS = pw; sessionStorage.setItem('shop_admin_pass', pw); enter(); }
  else { $('#loginErr').style.display = 'block'; $('#loginErr').textContent = 'Password errata.'; }
}
function logout() { sessionStorage.removeItem('shop_admin_pass'); location.reload(); }
function enter() {
  $('#login').style.display = 'none';
  $('#dash').style.display = 'block';
  connectSocket();
  loadAll();
}
function connectSocket() {
  if (socket) return;
  socket = io();
  socket.on('connect', () => socket.emit('admin-auth', PASS));
  socket.on('new-order', (o) => { toast('🔔 Nuovo ordine! ' + money(o.total) + ' da ' + (o.name || '')); loadAll(); });
  socket.on('order-paid', () => loadAll());
}

function showTab(t) {
  $('#tabProd').classList.toggle('on', t === 'prod');
  $('#tabOrd').classList.toggle('on', t === 'ord');
  $('#viewProd').style.display = t === 'prod' ? 'block' : 'none';
  $('#viewOrd').style.display = t === 'ord' ? 'block' : 'none';
}

async function loadAll() { await Promise.all([loadProducts(), loadOrders()]); }

async function loadProducts() {
  const r = await fetch('/api/admin/products', { headers: H() });
  if (r.status === 401) return logout();
  const d = await r.json();
  const list = d.products || [];
  $('#prodCount').textContent = list.length;
  $('#catlist').innerHTML = [...new Set(list.map(p => p.category).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('');
  const box = $('#prodList');
  if (!list.length) { box.innerHTML = '<p class="mini">Nessun prodotto. Aggiungine uno qui sopra ☝️</p>'; return; }
  box.innerHTML = '';
  list.forEach(p => {
    const margin = (p.cost != null) ? (p.price - p.cost) : null;
    const row = document.createElement('div');
    row.className = 'prow';
    row.innerHTML = `
      <div class="t">${p.image ? `<img src="${esc(p.image)}" onerror="this.remove()">` : '📦'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600">${esc(p.name)}</div>
        <div class="mini">${esc(p.category || '')} · <b>${money(p.price)}</b>${margin != null ? ` · margine <b style="color:var(--ok)">${money(margin)}</b>` : ''}${p.stock != null ? ` · stock ${p.stock}` : ''}${p.supplierUrl ? ' · 🔗 fornitore' : ''}</div>
      </div>
      <button class="btn ghost small" data-edit>✏️</button>
      <button class="btn small danger" data-del>🗑</button>`;
    row.querySelector('[data-edit]').onclick = () => editProduct(p);
    row.querySelector('[data-del]').onclick = () => delProduct(p);
    box.appendChild(row);
  });
}
function editProduct(p) {
  $('#p_id').value = p.id; $('#p_name').value = p.name; $('#p_category').value = p.category || '';
  $('#p_price').value = p.price; $('#p_cost').value = p.cost != null ? p.cost : '';
  $('#p_stock').value = p.stock != null ? p.stock : ''; $('#p_image').value = p.image || ''; $('#p_description').value = p.description || '';
  $('#p_supplierUrl').value = p.supplierUrl || '';
  $('#formTitle').textContent = '✏️ Modifica prodotto'; $('#cancelEdit').style.display = 'inline-block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function resetForm() {
  ['p_id', 'p_name', 'p_category', 'p_price', 'p_cost', 'p_stock', 'p_image', 'p_description', 'p_supplierUrl'].forEach(i => $('#' + i).value = '');
  $('#formTitle').textContent = '➕ Aggiungi prodotto'; $('#cancelEdit').style.display = 'none'; $('#prodMsg').textContent = '';
}
async function saveProduct() {
  const body = {
    id: $('#p_id').value || undefined, name: $('#p_name').value.trim(), category: $('#p_category').value.trim(),
    price: $('#p_price').value, cost: $('#p_cost').value, stock: $('#p_stock').value,
    image: $('#p_image').value.trim(), description: $('#p_description').value.trim(),
    supplierUrl: $('#p_supplierUrl').value.trim()
  };
  if (!body.name || !(parseFloat(body.price) >= 0)) { $('#prodMsg').textContent = '⚠️ Nome e prezzo sono obbligatori.'; return; }
  const r = await fetch('/api/admin/product', { method: 'POST', headers: H(), body: JSON.stringify(body) });
  const d = await r.json();
  if (d.ok) { toast('Prodotto salvato ✓'); resetForm(); loadProducts(); }
  else toast(d.error || 'Errore');
}
async function delProduct(p) {
  if (!confirm('Eliminare "' + p.name + '"?')) return;
  const r = await fetch('/api/admin/product/' + p.id, { method: 'DELETE', headers: H() });
  if (r.ok) { toast('Eliminato'); loadProducts(); }
}

async function loadOrders() {
  const [r, fr] = await Promise.all([
    fetch('/api/admin/orders', { headers: H() }),
    fetch('/api/admin/fulfillment', { headers: H() })
  ]);
  if (r.status === 401) return logout();
  const d = await r.json();
  const drop = fr.ok ? await fr.json() : { configured: false, auto: false, needs: [] };
  const orders = d.orders || [], s = d.stats || {};
  $('#stats').innerHTML = `
    <div class="stat"><div class="k">Ordini</div><div class="v">${s.count || 0}</div></div>
    <div class="stat"><div class="k">Incasso</div><div class="v">${money(s.revenue)}</div></div>
    <div class="stat"><div class="k">Margine stimato</div><div class="v" style="color:var(--ok)">${money(s.margin)}</div></div>`;
  const pend = orders.filter(o => o.status === 'pending').length;
  $('#ordBadge').innerHTML = pend ? `<span class="tag pending" style="margin-left:4px">${pend}</span>` : '';
  const box = $('#ordList');
  const banner = drop.auto
    ? `<div class="panel" style="background:#dcfce7;border-color:#86efac;margin-bottom:12px"><b>🤖 Dropshipping automatico ATTIVO</b> <span class="mini">— gli ordini pagati vengono inoltrati ad AliExpress da soli, col tuo saldo.</span></div>`
    : `<div class="panel" style="background:#fef3c7;border-color:#fde68a;margin-bottom:12px"><b>🚚 Dropshipping: modalità manuale</b><div class="mini" style="margin-top:4px">L’inoltro automatico ad AliExpress non è attivo. Evadi a mano con “📦 Ordina dal fornitore”, oppure aggiungi le credenziali (${(drop.needs && drop.needs.length ? drop.needs : ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_ACCESS_TOKEN']).join(', ')}) + <b>DROPSHIP_AUTO=1</b> per renderlo automatico.</div></div>`;
  if (!orders.length) { box.innerHTML = banner + '<p class="mini">Ancora nessun ordine.</p>'; return; }
  box.innerHTML = banner;
  orders.forEach(o => {
    const c = o.customer || {};
    const f = o.fulfillment || { status: 'da_inoltrare' };
    const cost = o.items.reduce((x, it) => x + (it.cost || 0) * it.qty, 0);
    const margin = o.total - cost;
    const div = document.createElement('div');
    div.className = 'order';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <div><b>${money(o.total)}</b> <span class="tag ${o.status}">${OLABEL[o.status] || o.status}</span> <span class="mini">· margine ${money(margin)}</span></div>
        <div class="mini">${new Date(o.ts).toLocaleString('it-IT')}</div>
      </div>
      <div style="margin:8px 0;font-size:14px">${o.items.map(it => `${esc(it.name)} × ${it.qty}`).join('<br>')}</div>
      <div class="mini" style="background:var(--bg);border-radius:10px;padding:10px;line-height:1.6">
        👤 <b>${esc(c.name || '')}</b> · ✉️ ${esc(c.email || '')} · 📞 ${esc(c.phone || '-')}<br>
        📍 ${esc(c.address || '')} ${esc(c.city || '')} ${esc(c.zip || '')}${c.note ? '<br>📝 ' + esc(c.note) : ''}
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px">
        <span class="mini">Stato pagamento:</span>
        <select data-st>
          ${['pending', 'paid', 'shipped', 'cancelled'].map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${OLABEL[s]}</option>`).join('')}
        </select>
      </div>
      <div style="margin-top:10px;border-top:1px dashed var(--line);padding-top:10px">
        <div class="mini" style="margin-bottom:6px"><b>🚚 Fornitore (dropshipping)</b></div>
        <div style="font-size:13px;margin-bottom:8px">${o.items.map(it => it.supplierUrl ? `<a href="${esc(it.supplierUrl)}" target="_blank" rel="noopener" style="color:var(--brand);font-weight:600">↗ ordina “${esc(it.name)}” su AliExpress</a>` : `<span class="mini">${esc(it.name)} — ⚠️ nessun link fornitore</span>`).join('<br>')}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <button class="btn small" data-fulfill>📦 Ordina dal fornitore</button>
          <select data-fst>${['da_inoltrare', 'inoltrato', 'pagato', 'spedito', 'errore'].map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${FLABEL[s]}</option>`).join('')}</select>
          <input data-track placeholder="Tracking..." value="${esc(f.tracking || '')}" style="border:1px solid var(--line);border-radius:9px;padding:7px 10px;font-family:inherit;flex:1;min-width:110px">
        </div>
        ${f.error ? `<div class="mini" style="color:var(--bad);margin-top:6px">⚠️ ${esc(f.error)}</div>` : ''}
        ${f.supplierOrderId ? `<div class="mini" style="margin-top:6px">ID ordine fornitore: ${esc(f.supplierOrderId)}</div>` : ''}
      </div>`;
    div.querySelector('[data-st]').onchange = async (e) => {
      await fetch('/api/admin/order/' + o.id, { method: 'POST', headers: H(), body: JSON.stringify({ status: e.target.value }) });
      toast('Stato aggiornato'); loadOrders();
    };
    div.querySelector('[data-fst]').onchange = async (e) => {
      await fetch('/api/admin/order/' + o.id, { method: 'POST', headers: H(), body: JSON.stringify({ fulfillStatus: e.target.value }) });
      toast('Stato fornitore aggiornato'); loadOrders();
    };
    div.querySelector('[data-track]').onchange = async (e) => {
      await fetch('/api/admin/order/' + o.id, { method: 'POST', headers: H(), body: JSON.stringify({ tracking: e.target.value }) });
      toast('Tracking salvato');
    };
    div.querySelector('[data-fulfill]').onclick = async (e) => {
      const btn = e.target; btn.disabled = true; btn.textContent = 'Invio…';
      const rr = await fetch('/api/admin/order/' + o.id + '/fulfill', { method: 'POST', headers: H() });
      const dd = await rr.json().catch(() => ({}));
      toast(dd.message || (dd.ok ? 'Inoltrato al fornitore ✓' : 'Non inoltrato'));
      loadOrders();
    };
    box.appendChild(div);
  });
}

// auto-login if password saved
if (PASS) {
  fetch('/api/admin/products', { headers: H() }).then(r => { if (r.ok) enter(); else sessionStorage.removeItem('shop_admin_pass'); });
}
