// ===== Kouverte Shop — storefront =====
let CFG = { shopName: 'Kouverte Elettronica', currency: 'eur', stripeEnabled: false };
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
  populateTicker();
  await loadProducts();
  const hc = $('#heroCount'); if (hc) hc.textContent = PRODUCTS.length || '—';
  renderCartCount();
  // success/cancel banners
  const u = new URLSearchParams(location.search);
  if (u.get('canceled')) toast('Pagamento annullato — il carrello è ancora qui');
}
function populateTicker() {
  const t = $('#tickerTrack'); if (!t) return;
  const items = ['🚚 Spedizione tracciata in tutta Italia', '🔒 Pagamenti sicuri e cifrati', '↩️ Reso facile entro 14 giorni', '🛡️ Garanzia 24 mesi', '⭐ Migliaia di clienti soddisfatti', '💜 Assistenza rapida via email'];
  const html = items.map(i => `<span>${i}</span>`).join('');
  t.innerHTML = html + html; // duplicato per scorrimento continuo
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
function pimg(p) { return (p.images && p.images.length ? p.images[0] : p.image) || ''; }
function renderGrid(list) {
  const g = $('#grid'); g.innerHTML = '';
  $('#empty').style.display = list.length ? 'none' : 'block';
  list.forEach((p, i) => {
    const sold = p.stock === 0;
    const img = pimg(p);
    const hot = (p.rating && p.rating.count >= 3) || i < 2;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.animationDelay = (i * 55) + 'ms';
    card.innerHTML = `
      <div class="thumb">
        ${hot ? '<span class="card-badge">🔥 Top</span>' : ''}
        <span class="card-ship">🚚 Spedizione gratis</span>
        ${img ? `<img src="${esc(img)}" loading="lazy" onerror="this.remove()">` : '📦'}
      </div>
      <div class="info">
        <div class="cat">${esc(p.category || '')}</div>
        <div class="name">${esc(p.name)}</div>
        ${p.rating && p.rating.count ? `<div class="rstars">${starsHtml(p.rating.avg)}<span>${num1(p.rating.avg)} (${p.rating.count})</span></div>` : ''}
        <div class="row">
          <span class="price">${money(p.price)}</span>
          ${sold ? '<span class="soldout">Esaurito</span>' : `<button class="add">+ Aggiungi</button>`}
        </div>
      </div>`;
    card.onclick = () => openProduct(p.id);
    const add = card.querySelector('.add');
    if (add) add.onclick = (e) => { e.stopPropagation(); addToCart(p.id); };
    g.appendChild(card);
  });
}
function esc(s) { return (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function starsHtml(avg) { const f = Math.round(avg || 0); return '<span class="stars">' + '★'.repeat(f) + '☆'.repeat(5 - f) + '</span>'; }
const num1 = n => (Math.round((n || 0) * 10) / 10).toFixed(1).replace('.', ',');

// ---- product modal ----
function setMainImg(url) {
  $('#pmImg').innerHTML = url ? `<img src="${esc(url)}" onerror="this.parentElement.textContent='📦'">` : '📦';
}
function openProduct(id) {
  const p = prod(id); if (!p) return;
  const imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
  setMainImg(imgs[0] || '');
  const gal = $('#pmGallery');
  if (imgs.length > 1) {
    gal.innerHTML = imgs.map((u, i) => `<div class="pm-thumb${i === 0 ? ' on' : ''}"><img src="${esc(u)}" loading="lazy" onerror="this.parentElement.remove()"></div>`).join('');
    gal.querySelectorAll('.pm-thumb').forEach((t, i) => t.onclick = () => {
      setMainImg(imgs[i]);
      gal.querySelectorAll('.pm-thumb').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
    });
  } else gal.innerHTML = '';
  $('#pmCat').textContent = p.category || '';
  $('#pmName').textContent = p.name;
  $('#pmPrice').textContent = money(p.price);
  $('#pmDesc').textContent = p.description || '';
  const btn = $('#pmAdd');
  btn.style.display = p.stock === 0 ? 'none' : 'block';
  btn.onclick = () => { addToCart(p.id); closeProduct(); };
  loadReviews(p.id);
  $('#pmodal').classList.add('on');
}
function closeProduct() { $('#pmodal').classList.remove('on'); }
$('#pmodal').onclick = closeProduct;

// ---- recensioni ----
let rvStars = 0, rvPid = null;
function renderStarPick() {
  $('#starPick').innerHTML = [1, 2, 3, 4, 5].map(i => `<button type="button" data-s="${i}" class="${i <= rvStars ? 'on' : ''}">★</button>`).join('');
  $('#starPick').querySelectorAll('button').forEach(b => b.onclick = () => { rvStars = +b.dataset.s; renderStarPick(); });
}
async function loadReviews(pid) {
  rvPid = pid; rvStars = 0; renderStarPick();
  $('#rv_name').value = ''; $('#rv_text').value = '';
  $('#revList').innerHTML = ''; $('#revSummary').textContent = ''; $('#pmStars').innerHTML = '';
  try {
    const d = await (await fetch('/api/reviews/' + encodeURIComponent(pid))).json();
    const list = d.reviews || [];
    const noun = n => n === 1 ? 'recensione' : 'recensioni';
    $('#pmStars').innerHTML = list.length ? `${starsHtml(d.rating.avg)}<span>${num1(d.rating.avg)} su 5 · ${list.length} ${noun(list.length)}</span>` : '';
    $('#revSummary').textContent = list.length ? `· media ${num1(d.rating.avg)}/5` : '· ancora nessuna: sii il primo!';
    $('#revList').innerHTML = list.slice(0, 25).map(r => `
      <div class="rev">
        <div class="rev-head"><b>${esc(r.name)}</b> ${starsHtml(r.rating)} <span class="rev-date">${new Date(r.ts).toLocaleDateString('it-IT')}</span></div>
        <div class="rev-text">${esc(r.text)}</div>
      </div>`).join('');
  } catch (e) {}
}
$('#rvSend').onclick = async () => {
  const name = $('#rv_name').value.trim(), text = $('#rv_text').value.trim();
  if (!rvStars) return toast('Scegli un voto da 1 a 5 stelle');
  if (!name || !text) return toast('Scrivi nome e commento');
  const btn = $('#rvSend'); btn.disabled = true;
  try {
    const r = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: rvPid, name, rating: rvStars, text }) });
    const d = await r.json();
    if (d.ok) { toast('Grazie per la recensione! ⭐'); await loadReviews(rvPid); await loadProducts(); }
    else toast(d.error || 'Errore');
  } catch (e) { toast('Errore di rete'); }
  btn.disabled = false;
};

// ---- pagine info (footer) ----
const INFO = {
  spedizioni: { t: '🚚 Spedizioni e consegna', b: 'Spedizione tracciata in tutta Italia: ricevi il codice di tracking via email appena il pacco parte.\n\nI tempi di consegna sono indicati su ogni prodotto: in genere 7–15 giorni lavorativi, perché spediamo direttamente dai magazzini dei nostri fornitori partner — è così che riusciamo a tenere i prezzi bassi.\n\nSe l’ordine tarda oltre i tempi indicati, scrivici: lo rintracciamo o ti rimborsiamo.' },
  resi: { t: '↩️ Resi e rimborsi', b: 'Hai 14 giorni dalla consegna per cambiare idea, come previsto dal diritto di recesso (D.lgs. 21/2014).\n\nContattaci indicando il numero d’ordine, rispedisci il prodotto integro e ricevi il rimborso completo con lo stesso metodo di pagamento entro 14 giorni dal reso.\n\nProdotto difettoso o danneggiato? Il reso è a carico nostro.' },
  garanzia: { t: '🛡️ Garanzia 24 mesi', b: 'Tutti i prodotti sono coperti dalla garanzia legale di conformità di 24 mesi prevista dal Codice del Consumo.\n\nSe un prodotto presenta un difetto, contattaci con foto e numero d’ordine: lo sostituiamo o ti rimborsiamo.' },
  pagamenti: { t: '🔒 Pagamenti sicuri', b: 'I pagamenti con carta avvengono su pagina protetta Stripe, lo stesso circuito usato dai grandi e-commerce: i dati della tua carta non passano e non vengono mai salvati sui nostri server.\n\nAccettiamo Visa, Mastercard, American Express. La connessione al sito è cifrata (SSL/HTTPS).' },
  chisiamo: { t: '🛍️ Chi siamo', b: 'Kouverte Elettronica è un negozio online italiano indipendente specializzato in telefonia e accessori.\n\nSelezioniamo i prodotti dai migliori fornitori e li proponiamo al giusto prezzo, con spedizione tracciata, reso facile e garanzia di 24 mesi.\n\nPer qualsiasi domanda rispondiamo via email, di solito entro 24 ore.' },
  privacy: { t: '🔐 Privacy', b: 'Usiamo i tuoi dati (nome, indirizzo, email, telefono) solo per evadere e spedire il tuo ordine.\n\nNon vendiamo né cediamo i dati a terzi per scopi pubblicitari. I pagamenti sono gestiti da Stripe: i dati della carta non transitano sui nostri server.\n\nPuoi chiedere in qualsiasi momento la modifica o cancellazione dei tuoi dati scrivendoci.' }
};
function openInfo(k) { const i = INFO[k]; if (!i) return; $('#imTitle').textContent = i.t; $('#imBody').textContent = i.b; $('#imodal').classList.add('on'); }
function closeInfo() { $('#imodal').classList.remove('on'); }
$('#imodal').onclick = closeInfo;

// ---- cart ----
function addToCart(id) {
  CART[id] = (CART[id] || 0) + 1; saveCart(); toast('Aggiunto al carrello ✓');
  const b = $('#cartBtn'); if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}
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
