// ===== Kouverte Shop — storefront =====
let CFG = { shopName: 'Kouverte Elettronica', currency: 'eur', stripeEnabled: false };
let PRODUCTS = [];
let CATALOG = {};      // id -> prodotto (catalogo completo, non filtrato: serve al carrello)
let CART = {};         // { productId: qty }
let curCat = '';
let pmQty = 1;
try { CART = JSON.parse(localStorage.getItem('shop_cart') || '{}'); } catch (e) { CART = {}; }

const $ = s => document.querySelector(s);
const money = n => '€' + (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
// versione ridotta delle foto AliExpress per la griglia (più veloci); fallback alla full in caso di errore
function aeThumb(url, size) { return (url && /alicdn\.com\/.+\.(jpg|jpeg|png|webp)/i.test(url)) ? url + '_' + size + 'x' + size + 'q80.jpg' : url; }
// foto rotta: prima riprova con la versione full, poi mostra il placeholder
function imgErr(el) {
  if (el.dataset.full && el.src !== el.dataset.full) { el.src = el.dataset.full; return; }
  const m = el.dataset.err || 'remove';
  if (m === 'box') el.parentElement.textContent = '📦';
  else if (m === 'parent') el.parentElement.remove();
  else el.remove();
}
function saveCart() { localStorage.setItem('shop_cart', JSON.stringify(CART)); renderCartCount(); }
function toast(msg, isError) {
  const t = $('#toast'); t.textContent = msg;
  t.classList.toggle('toast-err', !!isError); t.classList.add('on');
  if (isError && navigator.vibrate) { try { navigator.vibrate([12, 6, 12]); } catch (e) {} }
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), isError ? 4500 : 3200);
}
function setPageTitle(t) { document.title = t ? (t + ' — Kouverte') : 'Kouverte — Tutto quello che cerchi, ai prezzi che sorprendono'; }
function prod(id) { return CATALOG[id] || PRODUCTS.find(p => p.id === id); }

async function boot() {
  try { CFG = await (await fetch('/api/config')).json(); } catch (e) {}
  setPageTitle('');
  populateTicker();
  await loadProducts();        // boot: nessun filtro → CATALOG completo
  pruneCart();                 // togli dal carrello eventuali prodotti non più in vendita
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
    PRODUCTS.forEach(p => { CATALOG[p.id] = p; });   // alimenta il catalogo completo (per il carrello)
    setPageTitle(curCat || '');
    renderCats(d.categories || []);
    renderGrid(PRODUCTS);
  } catch (e) {
    $('#empty').style.display = 'block';
    toast('Connessione lenta — ricarica la pagina', true);
  }
}
function pruneCart() {
  let changed = false;
  Object.keys(CART).forEach(k => { const i = k.indexOf('::'); const id = i < 0 ? k : k.slice(0, i); if (!CATALOG[id]) { delete CART[k]; changed = true; } });
  if (changed) saveCart();
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
    const low = (p.stock != null && p.stock > 0 && p.stock <= 10);
    const card = document.createElement('div');
    card.className = 'card' + (hot && !sold ? ' top-product' : '');
    card.style.animationDelay = (i * 55) + 'ms';
    card.innerHTML = `
      <div class="thumb">
        ${low ? `<span class="card-badge low">🔥 Solo ${p.stock} rimasti</span>` : (hot ? '<span class="card-badge">🔥 Top</span>' : '')}
        <span class="card-ship">🚚 Spedizione gratis</span>
        ${img ? `<img src="${esc(aeThumb(img, 320))}" data-full="${esc(img)}" data-err="box" loading="lazy" alt="${esc(p.name)}" onerror="imgErr(this)">` : '📦'}
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
    if (add) add.onclick = (e) => { e.stopPropagation(); if (p.sizes && p.sizes.length) openProduct(p.id); else addToCart(p.id); };
    g.appendChild(card);
  });
}
function esc(s) { return (s || '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function starsHtml(avg) { const f = Math.round(avg || 0); return '<span class="stars">' + '★'.repeat(f) + '☆'.repeat(5 - f) + '</span>'; }
const num1 = n => (Math.round((n || 0) * 10) / 10).toFixed(1).replace('.', ',');

// ---- product modal ----
let curMainImg = '', selectedSize = '';
function setMainImg(url) {
  curMainImg = url || '';
  $('#pmImg').innerHTML = url ? `<img src="${esc(url)}" alt="Foto prodotto" data-err="box" onerror="imgErr(this)">` : '📦';
}
function openProduct(id) {
  const p = prod(id); if (!p) return;
  const imgs = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
  setMainImg(imgs[0] || '');
  const gal = $('#pmGallery');
  if (imgs.length > 1) {
    gal.innerHTML = imgs.map((u, i) => `<div class="pm-thumb${i === 0 ? ' on' : ''}"><img src="${esc(u)}" data-err="parent" loading="lazy" alt="Foto ${i + 1}" onerror="imgErr(this)"></div>`).join('');
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
  // riquadro fiducia (solo info reali: niente conteggi vendite finti)
  const stockTxt = p.stock === 0 ? '<b style="color:var(--bad)">Esaurito</b>'
    : (p.stock != null && p.stock > 0 ? `<b>${p.stock} disponibili</b>` : '<b>Disponibile</b>');
  $('#pmTrust').innerHTML = `
    <div class="tr"><span class="ic">✅</span><span>Disponibilità: ${stockTxt}</span></div>
    <div class="tr"><span class="ic">🚚</span><span>Consegna stimata <b>7–15 giorni</b> · spedizione <b>gratuita</b></span></div>
    <div class="tr"><span class="ic">🛡️</span><span>Garanzia <b>24 mesi</b> · reso entro <b>14 giorni</b></span></div>
    <div class="tr"><span class="ic">🔒</span><span>Pagamento <b>sicuro</b> · tracking via email</span></div>`;
  pmQty = 1; renderPmQty();
  selectedSize = '';
  const sz = $('#pmSizes');
  if (p.sizes && p.sizes.length) {
    sz.style.display = 'block';
    sz.innerHTML = '<div class="sz-label">Taglia:</div><div class="sz-row">' + p.sizes.map(s => `<button class="sz" type="button" data-s="${esc(s)}">${esc(s)}</button>`).join('') + '</div>';
    sz.querySelectorAll('.sz').forEach(b => b.onclick = () => { selectedSize = b.dataset.s; sz.querySelectorAll('.sz').forEach(x => x.classList.remove('on')); b.classList.add('on'); });
  } else { sz.style.display = 'none'; sz.innerHTML = ''; }
  const btn = $('#pmAdd');
  const buyRow = btn.closest('.pm-buy');
  if (buyRow) buyRow.style.display = p.stock === 0 ? 'none' : 'flex';
  btn.onclick = () => {
    if (p.sizes && p.sizes.length && !selectedSize) return toast('Scegli prima la taglia', true);
    addToCart(p.id, selectedSize, pmQty); closeProduct();
  };
  loadReviews(p.id);
  const d = $('.pmodal .drawer'); if (d) d.scrollTop = 0;
  $('#pmodal').classList.add('on');
  try { history.pushState({ pm: 1 }, ''); } catch (e) {}
}
function realCloseProduct() { $('#pmodal').classList.remove('on'); }
function closeProduct() {
  closeLightbox();
  if (history.state && history.state.pm) history.back(); // il tasto "indietro" del telefono chiude la scheda, non esce dal sito
  else realCloseProduct();
}
$('#pmodal').onclick = closeProduct;
window.addEventListener('popstate', () => { realCloseProduct(); closeLightbox(); });

// ---- foto a schermo intero (zoom) ----
function openLightbox(url) { if (!url) return; $('#lbImg').src = url; $('#lightbox').classList.add('on'); }
function closeLightbox() { $('#lightbox').classList.remove('on'); }
$('#pmImg').onclick = () => openLightbox(curMainImg);
// selettore quantità nel modale + perks cliccabili (apre la pagina info)
function renderPmQty() { const e = $('#pmQty'); if (e) e.textContent = pmQty; }
if ($('#pmQtyMinus')) $('#pmQtyMinus').onclick = () => { pmQty = Math.max(1, pmQty - 1); renderPmQty(); };
if ($('#pmQtyPlus')) $('#pmQtyPlus').onclick = () => { pmQty = Math.min(99, pmQty + 1); renderPmQty(); };
document.querySelectorAll('.pm-perks span[data-info]').forEach(s => s.onclick = () => openInfo(s.dataset.info));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if ($('#lightbox').classList.contains('on')) return closeLightbox();
  if ($('#pmodal').classList.contains('on')) closeProduct();
  else if ($('#imodal').classList.contains('on')) closeInfo();
});

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
function cartKey(id, size) { return size ? id + '::' + size : id; }
function addToCart(id, size, qty) {
  qty = parseInt(qty, 10); if (isNaN(qty) || qty < 1) qty = 1; if (qty > 99) qty = 99;
  const k = cartKey(id, size);
  CART[k] = Math.min(99, (CART[k] || 0) + qty); saveCart();
  toast(qty > 1 ? ('Aggiunti ' + qty + ' al carrello ✓') : 'Aggiunto al carrello ✓');
  const b = $('#cartBtn'); if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
}
function setQty(key, q) {
  q = parseInt(q, 10);
  if (isNaN(q) || q <= 0) delete CART[key];
  else CART[key] = Math.min(99, q);
  saveCart(); renderCart();
}
function cartList() {
  return Object.keys(CART).map(k => { const i = k.indexOf('::'); const id = i < 0 ? k : k.slice(0, i); const size = i < 0 ? '' : k.slice(i + 2); return { key: k, p: prod(id), size, qty: CART[k] }; }).filter(x => x.p);
}
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
  items.forEach(({ p, qty, size, key }) => {
    const row = document.createElement('div');
    row.className = 'citem';
    row.innerHTML = `
      <div class="ci-thumb">${p.image ? `<img src="${esc(aeThumb(p.image, 130))}" data-full="${esc(p.image)}" data-err="box" alt="${esc(p.name)}" onerror="imgErr(this)">` : '📦'}</div>
      <div style="flex:1;min-width:0">
        <div class="ci-name">${esc(p.name)}${size ? ` · <b>Taglia ${esc(size)}</b>` : ''}</div>
        <div class="ci-price">${money(p.price)} · totale ${money(p.price * qty)}</div>
        <div class="qty"><button data-m="-1">−</button><span>${qty}</span><button data-m="1">+</button></div>
        <button class="rm">Rimuovi</button>
      </div>`;
    row.querySelectorAll('.qty button').forEach(b => b.onclick = () => setQty(key, qty + parseInt(b.dataset.m)));
    row.querySelector('.rm').onclick = () => setQty(key, 0);
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
  let bad = false;
  if (!customer.name) { markField('f_name', false); bad = true; }
  if (!emailOk(customer.email)) { markField('f_email', false); bad = true; }
  if (!customer.address) { markField('f_address', false); bad = true; }
  if (bad) return toast('Controlla i campi evidenziati in rosso', true);
  const items = cartList().map(x => ({ id: x.p.id, qty: Math.max(1, Math.min(99, x.qty)), size: x.size }));
  btn.disabled = true; const old = btn.textContent; btn.textContent = 'Attendere…';
  try {
    const r = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, customer }) });
    const d = await r.json();
    if (d.url) { location.href = d.url; return; }              // Stripe
    if (d.demo && d.orderId) { CART = {}; saveCart(); location.href = '/success.html?order=' + d.orderId; return; }
    toast(d.error || 'Errore nel pagamento'); btn.disabled = false; btn.textContent = old;
  } catch (e) { toast('Errore di rete'); btn.disabled = false; btn.textContent = old; }
};

// validazione campi checkout (in tempo reale)
function markField(id, ok) { const el = $('#' + id), f = el && el.closest('.field'); if (!f) return; f.classList.toggle('bad', !ok); f.classList.toggle('ok', ok); }
['f_name', 'f_email', 'f_address'].forEach(id => {
  const el = $('#' + id); if (!el) return;
  el.addEventListener('blur', () => { const v = el.value.trim(); if (v || id !== 'f_email') markField(id, id === 'f_email' ? emailOk(v) : !!v); });
  el.addEventListener('input', () => { const f = el.closest('.field'); if (f) f.classList.remove('bad'); });
});

// sincronizza il carrello tra più schede aperte
window.addEventListener('storage', e => {
  if (e.key !== 'shop_cart') return;
  try { CART = JSON.parse(e.newValue || '{}'); } catch (_) { CART = {}; }
  renderCartCount();
  if ($('#cartDrawer').classList.contains('on')) renderCart();
});

// search (debounced)
let st;
$('#q').addEventListener('input', e => {
  clearTimeout(st);
  st = setTimeout(async () => {
    const q = e.target.value.trim();
    const r = await fetch('/api/products?q=' + encodeURIComponent(q) + (curCat ? '&cat=' + encodeURIComponent(curCat) : ''));
    const d = await r.json(); PRODUCTS = d.products || []; renderGrid(PRODUCTS);
  }, 220);
});

boot();
