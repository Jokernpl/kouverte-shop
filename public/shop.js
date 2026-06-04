// ===== Kouverte Shop — storefront =====
let CFG = { shopName: 'Il Mio Shop', currency: 'eur', stripeEnabled: false };
let PRODUCTS = [];
let CART = {};         // { productId: qty }
let curCat = '';
try { CART = JSON.parse(localStorage.getItem('shop_cart') || '{}'); } catch (e) { CART = {}; }

const $ = s => document.querySelector(s);
const money = n => '€' + (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
function saveCart() { localStorage.setItem('shop_cart', JSON.stringify(CART)); renderCartCount(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 1900); }
function prod(id) { return PRODUCTS.find(p => p.id === id); }

async function boot() {
  try { CFG = await (await fetch('/api/config')).json(); } catch (e) {}
  document.title = CFG.shopName;
  $('#shopName').textContent = CFG.shopName;
  $('.logo .dot') && ($('.logo .dot').textContent = '🛍️');
  await loadProducts();
  renderCartCount();
  // success/cancel banners
  const u = new URLSearchParams(location.search);
  if (u.get('canceled')) toast('Pagamento annullato — il carrello è ancora qui');
}
async function loadProducts() {
  try {
    const r = await fetch('/api/products' + (curCat ? '?cat=' + encodeURIComponent(curCat) : ''));
    const d = await r.json();
    PRODUCTS = d.products || [];
    renderCats(d.categories || []);
    renderGrid(PRODUCTS);
  } catch (e) { $('#empty').style.display = 'block'; }
}
function renderCats(cats) {
  const el = $('#cats');
  el.innerHTML = '';
  const mk = (label, val) => {
    const b = document.createElement('button');
    b.className = 'chip' + (curCat === val ? ' on' : '');
    b.textContent = label;
    b.onclick = () => { curCat = val; loadProducts(); };
    return b;
  };
  el.appendChild(mk('Tutto', ''));
  cats.forEach(c => el.appendChild(mk(c, c)));
}
function renderGrid(list) {
  const g = $('#grid'); g.innerHTML = '';
  $('#empty').style.display = list.length ? 'none' : 'block';
  list.forEach(p => {
    const sold = p.stock === 0;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="thumb">${p.image ? `<img src="${esc(p.image)}" onerror="this.remove()">` : '📦'}</div>
      <div class="info">
        <div class="cat">${esc(p.category || '')}</div>
        <div class="name">${esc(p.name)}</div>
        <div class="row">
          <span class="price">${money(p.price)}</span>
          ${sold ? '<span class="soldout">Esaurito</span>' : `<button class="add">+ Aggiungi</button>`}
        </div>
      </div>`;
    card.querySelector('.thumb').onclick = () => openProduct(p.id);
    card.querySelector('.name').onclick = () => openProduct(p.id);
    const add = card.querySelector('.add');
    if (add) add.onclick = (e) => { e.stopPropagation(); addToCart(p.id); };
    g.appendChild(card);
  });
}
function esc(s) { return (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---- product modal ----
function openProduct(id) {
  const p = prod(id); if (!p) return;
  $('#pmImg').innerHTML = p.image ? `<img src="${esc(p.image)}" onerror="this.parentElement.textContent='📦'">` : '📦';
  $('#pmCat').textContent = p.category || '';
  $('#pmName').textContent = p.name;
  $('#pmPrice').textContent = money(p.price);
  $('#pmDesc').textContent = p.description || '';
  const btn = $('#pmAdd');
  btn.style.display = p.stock === 0 ? 'none' : 'block';
  btn.onclick = () => { addToCart(p.id); closeProduct(); };
  $('#pmodal').classList.add('on');
}
function closeProduct() { $('#pmodal').classList.remove('on'); }
$('#pmodal').onclick = closeProduct;

// ---- cart ----
function addToCart(id) { CART[id] = (CART[id] || 0) + 1; saveCart(); toast('Aggiunto al carrello ✓'); }
function setQty(id, q) { if (q <= 0) delete CART[id]; else CART[id] = q; saveCart(); renderCart(); }
function cartList() { return Object.keys(CART).map(id => ({ p: prod(id), qty: CART[id] })).filter(x => x.p); }
function cartTotal() { return cartList().reduce((s, x) => s + x.p.price * x.qty, 0); }
function renderCartCount() { const n = Object.values(CART).reduce((a, b) => a + b, 0); $('#cartCount').textContent = n; }

function openCart() { showCartView(); renderCart(); $('#cartScrim').classList.add('on'); $('#cartDrawer').classList.add('on'); }
function closeCart() { $('#cartScrim').classList.remove('on'); $('#cartDrawer').classList.remove('on'); }
function showCartView() { $('#cartView').style.display = 'flex'; $('#checkoutView').style.display = 'none'; $('#drawerTitle').textContent = '🛒 Il tuo carrello'; }
function showCheckoutView() {
  if (!cartList().length) return toast('Il carrello è vuoto');
  $('#cartView').style.display = 'none'; $('#checkoutView').style.display = 'flex'; $('#drawerTitle').textContent = '🧾 Dati e pagamento';
  $('#coTotal').textContent = money(cartTotal());
  // pay button label depends on Stripe
  $('#payBtn').textContent = CFG.stripeEnabled ? ('Paga ' + money(cartTotal()) + ' con carta') : ('Invia ordine · ' + money(cartTotal()));
  $('#secureLine').style.display = CFG.stripeEnabled ? 'flex' : 'none';
  $('#payNote').textContent = CFG.stripeEnabled ? 'Verrai reindirizzato alla pagina sicura di Stripe.' : 'Il venditore ti contatterà per concordare il pagamento.';
}
function renderCart() {
  const box = $('#cartItems'); const items = cartList();
  if (!items.length) { box.innerHTML = `<div class="empty" style="padding:50px 0"><h3>Carrello vuoto</h3><p>Aggiungi qualche prodotto 🙂</p></div>`; $('#cartTotal').textContent = money(0); $('#toCheckout').disabled = true; return; }
  $('#toCheckout').disabled = false;
  box.innerHTML = '';
  items.forEach(({ p, qty }) => {
    const row = document.createElement('div');
    row.className = 'citem';
    row.innerHTML = `
      <div class="ci-thumb">${p.image ? `<img src="${esc(p.image)}" onerror="this.remove()">` : '📦'}</div>
      <div style="flex:1;min-width:0">
        <div class="ci-name">${esc(p.name)}</div>
        <div class="ci-price">${money(p.price)} · totale ${money(p.price * qty)}</div>
        <div class="qty"><button data-m="-1">−</button><span>${qty}</span><button data-m="1">+</button></div>
        <button class="rm">Rimuovi</button>
      </div>`;
    row.querySelectorAll('.qty button').forEach(b => b.onclick = () => setQty(p.id, qty + parseInt(b.dataset.m)));
    row.querySelector('.rm').onclick = () => setQty(p.id, 0);
    box.appendChild(row);
  });
  $('#cartTotal').textContent = money(cartTotal());
}
$('#toCheckout').onclick = showCheckoutView;

// ---- checkout ----
$('#payBtn').onclick = async function () {
  const btn = this;
  const customer = {
    name: $('#f_name').value.trim(), email: $('#f_email').value.trim(), phone: $('#f_phone').value.trim(),
    address: $('#f_address').value.trim(), city: $('#f_city').value.trim(), zip: $('#f_zip').value.trim(), note: $('#f_note').value.trim()
  };
  if (!customer.name || !customer.email || !customer.address) return toast('Compila nome, email e indirizzo');
  const items = cartList().map(x => ({ id: x.p.id, qty: x.qty }));
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Attendere…';
  try {
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, customer }) });
    const d = await r.json();
    if (d.url) { location.href = d.url; return; }              // Stripe
    if (d.demo && d.orderId) { CART = {}; saveCart(); location.href = '/success.html?order=' + d.orderId; return; }
    toast(d.error || 'Errore nel pagamento'); btn.disabled = false; btn.textContent = old;
  } catch (e) { toast('Errore di rete'); btn.disabled = false; btn.textContent = old; }
};

// search (debounced)
let st;
$('#q').addEventListener('input', e => {
  clearTimeout(st);
  st = setTimeout(async () => {
    const q = e.target.value.trim();
    const r = await fetch('/api/products?q=' + encodeURIComponent(q) + (curCat ? '&cat=' + encodeURIComponent(curCat) : ''));
    const d = await r.json(); renderGrid(d.products || []);
  }, 220);
});

boot();
