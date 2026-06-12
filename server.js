// ===== KOUVERTE SHOP — negozio online (rivendita) con pagamento Stripe =====
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.set('trust proxy', true);

const PORT = process.env.PORT || 8095;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const SHOP_NAME = process.env.SHOP_NAME || 'Kouverte Elettronica';
const CURRENCY = (process.env.CURRENCY || 'eur').toLowerCase();
const fulfillment = require('./fulfillment'); // evasione/dropshipping (AliExpress)
const importer = require('./importer');       // import prodotti da link AliExpress

// --- Stripe (attivo solo se imposti STRIPE_SECRET_KEY) ---
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); console.log('💳 Stripe ATTIVO (pagamenti con carta)'); }
  catch (e) { console.warn('⚠️ Stripe non disponibile:', e.message); }
} else {
  console.log('ℹ️ Stripe non configurato → modalità "raccolta ordini" (nessun pagamento online). Imposta STRIPE_SECRET_KEY per attivare la carta.');
}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- DB: file JSON locale + backup DUREVOLE su Redis (Upstash REST) ----------
// ⚠️ Su Render free il disco è effimero: data.json si azzera a OGNI redeploy/riavvio,
// quindi prodotti e ORDINI dei clienti andrebbero persi. Per renderli permanenti
// imposta le variabili UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
// Puoi riusare le STESSE credenziali della chat Kouverte: qui uso una CHIAVE diversa
// (kouverte:shop:db) così i dati del negozio NON si mischiano con quelli della chat.
// Senza quelle variabili il negozio funziona come prima (solo file locale).
const DB_FILE = path.join(__dirname, 'data.json');
let db = { products: [], orders: [], reviews: [] };
function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const REDIS_URL    = (process.env.UPSTASH_REDIS_REST_URL   || '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
const REDIS_TOKEN  = (process.env.UPSTASH_REDIS_REST_TOKEN || '').trim().replace(/^["']|["']$/g, '');
const REDIS_KEY    = (process.env.SHOP_REDIS_KEY || 'kouverte:shop:db').trim();
const redisEnabled = !!(REDIS_URL && REDIS_TOKEN);

async function redisSet(obj) {
  if (!redisEnabled) return false;
  try {
    const r = await fetch(REDIS_URL + '/set/' + encodeURIComponent(REDIS_KEY), {
      method: 'POST', headers: { Authorization: 'Bearer ' + REDIS_TOKEN }, body: JSON.stringify(obj)
    });
    return r.ok;
  } catch (e) { console.error('[DB] Redis set error:', e.message); return false; }
}
async function redisGet() {
  if (!redisEnabled) return null;
  try {
    const r = await fetch(REDIS_URL + '/get/' + encodeURIComponent(REDIS_KEY), {
      headers: { Authorization: 'Bearer ' + REDIS_TOKEN }
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && typeof j.result === 'string' && j.result) return JSON.parse(j.result);
    return null;
  } catch (e) { console.error('[DB] Redis get error:', e.message); return null; }
}

async function load() {
  // 1) Redis è la fonte di verità: dopo un redeploy il file è vuoto ma Redis no.
  if (redisEnabled) {
    const fromRedis = await redisGet();
    if (fromRedis && (Array.isArray(fromRedis.products) || Array.isArray(fromRedis.orders))) {
      db = { products: fromRedis.products || [], orders: fromRedis.orders || [], reviews: fromRedis.reviews || [] };
      try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) {}
      console.log('[DB] ✅ Ripristinato da Redis: ' + db.products.length + ' prodotti · ' + db.orders.length + ' ordini');
      return;
    }
    console.log('[DB] Redis attivo ma vuoto → carico da file/seed e lo salvo su Redis');
  }
  // 2) File locale (o seed iniziale alla prima accensione)
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { db = { products: [], orders: [], reviews: [] }; seed(); }
  if (!db.products) db.products = [];
  if (!db.orders) db.orders = [];
  if (!db.reviews) db.reviews = [];
  // Se Redis è attivo ma era vuoto, salva subito lo stato così diventa durevole.
  if (redisEnabled) redisSet(db).then(ok => console.log(ok ? '[DB] ✅ Stato iniziale salvato su Redis' : '[DB] ⚠️ Salvataggio iniziale su Redis fallito'));
}

let fileT = null, redisT = null;
function save() {
  // copia locale veloce (utile in locale e come cache)
  clearTimeout(fileT);
  fileT = setTimeout(() => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.error('save err', e); } }, 150);
  // backup durevole su Redis — debounce 400ms così l'ULTIMO stato arriva sempre
  if (redisEnabled) {
    clearTimeout(redisT);
    redisT = setTimeout(() => { redisSet(db).then(ok => { if (!ok) console.warn('[DB] ⚠️ backup Redis non riuscito'); }); }, 400);
  }
}
function seed() {
  // Catalogo iniziale (prodotti reali importati — modificali o sostituiscili dal pannello)
  const ex = [
    { name: 'Cintura Uomo in Vera Pelle — Fibbia Automatica', price: 24.90, cost: 6.50, category: 'Moda',
      description: 'Cintura da uomo in vera pelle con fibbia automatica regolabile. Elegante e resistente, adatta a ogni occasione. Larghezza 3,5 cm, accorciabile su misura.',
      supplierUrl: 'https://it.aliexpress.com/item/1005005167379524.html',
      images: ['https://ae01.alicdn.com/kf/S06fcac1cfaeb467b94a00e5fadcceebb3.jpg', 'https://ae01.alicdn.com/kf/Sbf8be40921594b3d9143e504403386c6I.jpg', 'https://ae01.alicdn.com/kf/S98ab69e7fab24e6487df043a14e094eel.jpg', 'https://ae01.alicdn.com/kf/S7da80d421c2047aab0f642ea76b435a5U.jpg', 'https://ae01.alicdn.com/kf/Sc40414c08e6f449a8e55a17f2e8700efs.jpg', 'https://ae01.alicdn.com/kf/S7d6212feb2bd403a908e1b2b128f562bD.jpg'] },
    { name: 'Striscia LED RGB Wi-Fi — Controllo App & Musica', price: 18.90, cost: 5.00, category: 'Illuminazione',
      description: 'Striscia LED RGB controllabile da app e telecomando, sincronizzazione con la musica, milioni di colori. Adesiva e facile da installare per camera, TV e gaming.',
      supplierUrl: 'https://it.aliexpress.com/item/1005007136978825.html',
      images: ['https://ae01.alicdn.com/kf/Sf23beb46f3eb4b3998bfa23b2ece1321A.jpg', 'https://ae01.alicdn.com/kf/S00c6454664924de5abdb68d3b5735a2fn.jpg', 'https://ae01.alicdn.com/kf/Se249f0c11c064b2e9348ba2b80dfcebau.jpg', 'https://ae01.alicdn.com/kf/S9f4449cd091747a18169a2056f59ad19X.jpg', 'https://ae01.alicdn.com/kf/S39fd25947a6d4a63a954cd1ea8b2f9a5b.jpg', 'https://ae01.alicdn.com/kf/Sae155ce905804724b7e43e0d845f2799I.jpg'] },
    { name: 'Striscia LED COB RGB Impermeabile IP65', price: 22.90, cost: 6.50, category: 'Illuminazione',
      description: 'Striscia LED COB ad alta densità, luce uniforme senza puntini visibili. Impermeabile IP65, colori RGB regolabili. Ideale per interni ed esterni.',
      supplierUrl: 'https://it.aliexpress.com/item/1005008648637345.html',
      images: ['https://ae01.alicdn.com/kf/Sff5d7f3a2ae14a039b6d28ecedfe706ck.jpg', 'https://ae01.alicdn.com/kf/S1823e3dd50564dc99954f3287bcca2fcA.jpg', 'https://ae01.alicdn.com/kf/S42b9339902c54ec9ba0dbc543dc6c191H.jpg', 'https://ae01.alicdn.com/kf/S36d7d411fa484f96a9755ca95dbf49052.jpg', 'https://ae01.alicdn.com/kf/S4ce904abc84b4c83a7d5a2068c530a88J.jpg', 'https://ae01.alicdn.com/kf/S47aae5cb30714b4a9a46666a66f9c72c9.jpg'] },
    { name: 'Kit Strisce LED RGB con Telecomando', price: 13.90, cost: 3.50, category: 'Illuminazione',
      description: 'Kit completo di strisce LED RGB con telecomando: cambia colore e luminosità in un attimo. Perfette per decorare casa, scrivania o postazione gaming.',
      supplierUrl: 'https://it.aliexpress.com/item/1005007957128479.html',
      images: ['https://ae01.alicdn.com/kf/S6ebf42dca74341a2bb9b8cb79b7f552dV.jpg', 'https://ae01.alicdn.com/kf/S35385f999f6e4414a430fd09169e277dC.jpg', 'https://ae01.alicdn.com/kf/Sc28ad2a44afb4daba7660159aa989e8dC.jpg', 'https://ae01.alicdn.com/kf/Sa8c0a40bbafa454cb2ee89a20201c127l.jpg', 'https://ae01.alicdn.com/kf/S8de3a91b0902422d8e1a1512caa34e79c.jpg', 'https://ae01.alicdn.com/kf/S773c2a78e2294370b131b44e67b65a8aU.jpg'] },
    { name: 'Aspirapolvere Portatile Senza Fili per Auto', price: 29.90, cost: 9.00, category: 'Casa & Auto',
      description: 'Aspirapolvere portatile senza fili ad alta potenza per auto e casa. Compatto, ricaricabile via USB, con accessori per ogni superficie.',
      supplierUrl: 'https://it.aliexpress.com/item/1005005482688462.html',
      images: ['https://ae01.alicdn.com/kf/S41604c0c0b12483d98973f87475d3ca0H.jpg', 'https://ae01.alicdn.com/kf/Sa9f2aeba672c4d00b79dd8a86417e083e.jpg', 'https://ae01.alicdn.com/kf/S0eb9f165b7804048bcc77e0decdf097bS.jpg', 'https://ae01.alicdn.com/kf/S8bcdfe6f3b2e4d028a909944c220a2fe0.jpg', 'https://ae01.alicdn.com/kf/Sdfe0535723a94185a7d07f7f42eddae6H.jpg', 'https://ae01.alicdn.com/kf/Sa460bf2c62f14612a08121952b928419I.jpg'] }
  ];
  db.products = ex.map(p => ({ id: uid('p'), stock: null, ts: Date.now(), image: p.images[0], ...p }));
  // Recensioni iniziali (placeholder) — rimovibili dal pannello Recensioni
  const day = 86400000;
  const exRev = [
    [0, 'Luca M.', 5, 'Arrivata prima del previsto e imballata benissimo. Pelle vera, qualità ottima per il prezzo.', 9],
    [0, 'Giulia R.', 4, 'Bella cintura, fibbia comoda. Facile da accorciare alla misura giusta.', 4],
    [1, 'Marco B.', 5, 'Colori vivissimi e l’app funziona benissimo. La sincronizzazione con la musica è spettacolare.', 11],
    [1, 'Sara T.', 5, 'Installata in 5 minuti dietro la TV, effetto bellissimo. Consigliata!', 5],
    [2, 'Andrea P.', 5, 'Luce uniforme, non si vedono i puntini dei LED. Resiste bene all’umidità del bagno.', 7],
    [2, 'Elena V.', 4, 'Ottima qualità, molto luminosa e adesivo che tiene bene.', 3],
    [3, 'Davide C.', 5, 'Per il prezzo è un affare, telecomando comodo e tanti colori. Top.', 13],
    [3, 'Francesca L.', 4, 'Carine per la cameretta, mia figlia è felicissima. Spedizione nei tempi.', 6],
    [4, 'Roberto S.', 5, 'Aspira davvero forte per essere portatile. Perfetto per i sedili dell’auto.', 8],
    [4, 'Chiara D.', 5, 'Piccolo, ricaricabile e pratico. Ottimo per le briciole in macchina.', 2]
  ];
  db.reviews = exRev.map(([i, name, rating, text, d]) => ({
    id: uid('rev'), productId: db.products[i].id, name, rating, text, ts: Date.now() - d * day, demo: true
  }));
  save();
}

// Media voti di un prodotto (calcolata dalle recensioni)
function ratingOf(pid) {
  const rs = db.reviews.filter(r => r.productId === pid);
  if (!rs.length) return { avg: 0, count: 0 };
  return { avg: Math.round(rs.reduce((s, r) => s + r.rating, 0) / rs.length * 10) / 10, count: rs.length };
}

// ---------- API pubbliche ----------
app.get('/api/config', (req, res) => res.json({ shopName: SHOP_NAME, currency: CURRENCY, stripeEnabled: !!stripe }));
app.get('/api/health', (req, res) => res.json({ ok: true, products: db.products.length, orders: db.orders.length, reviews: db.reviews.length, stripe: !!stripe }));

app.get('/api/products', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase().trim();
  const cat = (req.query.cat || '').toString();
  let list = db.products.slice();
  if (cat) list = list.filter(p => p.category === cat);
  if (q) list = list.filter(p => (p.name + ' ' + p.description + ' ' + p.category).toLowerCase().includes(q));
  res.json({ products: list.map(p => ({ ...p, rating: ratingOf(p.id) })), categories: [...new Set(db.products.map(p => p.category).filter(Boolean))] });
});
app.get('/api/product/:id', (req, res) => {
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'non trovato' });
  res.json({ product: { ...p, rating: ratingOf(p.id) } });
});

// ---------- Recensioni ----------
app.get('/api/reviews/:productId', (req, res) => {
  const list = db.reviews.filter(r => r.productId === req.params.productId).sort((a, b) => b.ts - a.ts);
  res.json({
    reviews: list.map(r => ({ id: r.id, name: r.name, rating: r.rating, text: r.text, ts: r.ts })),
    rating: ratingOf(req.params.productId)
  });
});
// Anti-spam recensioni: throttle per IP + per prodotto/IP + dedup testo
const _revHits = new Map(); // ip -> [timestamps]
function reviewGate(req, productId, text) {
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const hits = (_revHits.get(ip) || []).filter(t => now - t < 86400000); // 24h
  if (hits.length >= 10) return 'Troppe recensioni da questo dispositivo. Riprova più tardi.';
  if (hits.filter(t => now - t < 60000).length >= 2) return 'Aspetta un attimo prima di lasciare un’altra recensione.';
  // 1 sola recensione per prodotto da stesso IP nelle ultime 24h
  const sameProd = db.reviews.filter(r => r.productId === productId && r.ip === ip && now - r.ts < 86400000);
  if (sameProd.length) return 'Hai già lasciato una recensione per questo prodotto.';
  // dedup testo identico (anti-bot)
  const norm = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (db.reviews.some(r => r.productId === productId && (r.text || '').toLowerCase().replace(/\s+/g, ' ').trim() === norm)) {
    return 'Recensione duplicata.';
  }
  hits.push(now); _revHits.set(ip, hits);
  return { ok: true, ip };
}
app.post('/api/review', (req, res) => {
  const b = req.body || {};
  const p = db.products.find(x => x.id === b.productId);
  if (!p) return res.status(404).json({ error: 'Prodotto non trovato' });
  const rating = parseInt(b.rating);
  const name = (b.name || '').toString().trim().slice(0, 60);
  const text = (b.text || '').toString().trim().slice(0, 600);
  if (!name || !text || !(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Compila nome, voto (1–5) e commento' });
  if (text.length < 10) return res.status(400).json({ error: 'Scrivi almeno qualche parola in più nel commento.' });
  const gate = reviewGate(req, p.id, text);
  if (gate !== true && !gate.ok) return res.status(429).json({ error: gate });
  const rev = { id: uid('rev'), productId: p.id, name, rating, text, ts: Date.now(), ip: gate.ip };
  db.reviews.push(rev);
  save();
  res.json({ ok: true, review: { id: rev.id, name: rev.name, rating: rev.rating, text: rev.text, ts: rev.ts } });
});

function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return proto + '://' + host;
}
function safeOrder(o) { return { id: o.id, items: o.items, customer: { name: o.customer.name }, total: o.total, status: o.status, ts: o.ts }; }

// Inoltro automatico al fornitore: parte SOLO con DROPSHIP_AUTO=1 + credenziali AliExpress.
// Senza credenziali è un no-op sicuro (non spende e non inoltra nulla).
async function maybeAutoFulfill(order) {
  const st = fulfillment.supplierStatus();
  if (!st.auto) return;
  order.fulfillment = order.fulfillment || { status: 'da_inoltrare' };
  try {
    const r = await fulfillment.placeSupplierOrder(order);
    if (r.ok) { order.fulfillment.status = 'inoltrato'; order.fulfillment.supplierOrderId = r.supplierOrderId || ''; order.fulfillment.error = ''; }
    else { order.fulfillment.error = r.message || ''; }
  } catch (e) { order.fulfillment.error = e.message; }
  save();
  io.to('admin').emit('order-updated', { id: order.id });
}

// ---------- Checkout ----------
app.post('/api/checkout', async (req, res) => {
  try {
    const body = req.body || {};
    const cart = Array.isArray(body.items) ? body.items : [];
    const c = body.customer || {};
    if (!cart.length) return res.status(400).json({ error: 'Carrello vuoto' });
    if (!c.name || !c.email || !c.address) return res.status(400).json({ error: 'Compila nome, email e indirizzo' });

    // Calcolo del totale SEMPRE dal prezzo nel DB (mai dal client)
    const items = [];
    for (const ci of cart) {
      const p = db.products.find(x => x.id === ci.id);
      if (!p) continue;
      const qty = Math.max(1, Math.min(99, parseInt(ci.qty) || 1));
      items.push({ id: p.id, name: p.name, price: p.price, cost: p.cost || 0, qty, supplierUrl: p.supplierUrl || '' });
    }
    if (!items.length) return res.status(400).json({ error: 'Prodotti non più disponibili' });
    const total = Math.round(items.reduce((s, it) => s + it.price * it.qty, 0) * 100) / 100;

    const order = {
      id: uid('ord'),
      items, total,
      customer: {
        name: (c.name || '').toString().slice(0, 120),
        email: (c.email || '').toString().slice(0, 160),
        phone: (c.phone || '').toString().slice(0, 40),
        address: (c.address || '').toString().slice(0, 240),
        city: (c.city || '').toString().slice(0, 80),
        zip: (c.zip || '').toString().slice(0, 20),
        note: (c.note || '').toString().slice(0, 500)
      },
      status: 'pending', fulfillment: { status: 'da_inoltrare' }, ts: Date.now()
    };
    db.orders.push(order);
    save();
    io.to('admin').emit('new-order', { id: order.id, total: order.total, name: order.customer.name });

    if (stripe) {
      const base = baseUrl(req);
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        locale: 'it',
        customer_email: order.customer.email,
        line_items: items.map(it => ({
          price_data: { currency: CURRENCY, product_data: { name: it.name }, unit_amount: Math.round(it.price * 100) },
          quantity: it.qty
        })),
        success_url: `${base}/success.html?order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/?canceled=1`,
        metadata: { orderId: order.id }
      });
      order.stripeSessionId = session.id;
      save();
      return res.json({ url: session.url });
    }
    // Modalità senza Stripe: ordine raccolto, pagamento gestito dal venditore
    return res.json({ demo: true, orderId: order.id });
  } catch (e) {
    console.error('checkout err', e);
    res.status(500).json({ error: 'Errore nel checkout: ' + e.message });
  }
});

app.get('/api/checkout/verify', async (req, res) => {
  const order = db.orders.find(o => o.id === req.query.order);
  if (!order) return res.json({ ok: false, error: 'Ordine non trovato' });
  if (stripe && req.query.session_id) {
    try {
      const s = await stripe.checkout.sessions.retrieve(req.query.session_id);
      if (s.payment_status === 'paid' && order.status === 'pending') { order.status = 'paid'; order.paidAt = Date.now(); save(); io.to('admin').emit('order-paid', { id: order.id }); maybeAutoFulfill(order); }
    } catch (e) { /* ignora */ }
  }
  res.json({ ok: true, demo: !stripe, order: safeOrder(order) });
});

// ---------- ADMIN ----------
function admin(req, res, next) {
  const pass = req.headers['x-admin-pass'] || (req.body && req.body.pass) || req.query.pass;
  if (pass !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Password errata' });
  next();
}
app.post('/api/admin/login', (req, res) => {
  if ((req.body && req.body.pass) === ADMIN_PASSWORD) return res.json({ ok: true });
  res.status(401).json({ error: 'Password errata' });
});
app.get('/api/admin/products', admin, (req, res) => res.json({ products: db.products }));
// Import prodotto da link AliExpress (nome + foto + link fornitore; prezzo lo imposti tu)
app.post('/api/admin/import', admin, async (req, res) => {
  try { res.json(await importer.importFromAliExpress((req.body && req.body.url) || '')); }
  catch (e) { res.status(500).json({ ok: false, error: 'Errore import: ' + e.message }); }
});
app.post('/api/admin/product', admin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !(parseFloat(b.price) >= 0)) return res.status(400).json({ error: 'Nome e prezzo obbligatori' });
  let p = b.id ? db.products.find(x => x.id === b.id) : null;
  if (!p) { p = { id: uid('p'), ts: Date.now() }; db.products.push(p); }
  p.name = b.name.toString().slice(0, 140);
  p.price = Math.max(0, parseFloat(b.price) || 0);
  p.cost = (b.cost === '' || b.cost == null) ? null : Math.max(0, parseFloat(b.cost) || 0);
  p.image = (b.image || '').toString().slice(0, 600);
  p.images = (Array.isArray(b.images) ? b.images : (b.images || '').toString().split(/[\n,]/))
    .map(s => s.toString().trim()).filter(Boolean).slice(0, 10);
  if (!p.image && p.images.length) p.image = p.images[0];
  if (p.image && !p.images.includes(p.image)) p.images.unshift(p.image);
  p.description = (b.description || '').toString().slice(0, 3000);
  p.category = (b.category || 'Generale').toString().slice(0, 60) || 'Generale';
  p.stock = (b.stock === '' || b.stock == null) ? null : Math.max(0, parseInt(b.stock) || 0);
  p.supplierUrl = (b.supplierUrl || '').toString().slice(0, 600); // link prodotto AliExpress (fornitore)
  save();
  res.json({ ok: true, product: p });
});
app.delete('/api/admin/product/:id', admin, (req, res) => {
  const n = db.products.length;
  db.products = db.products.filter(p => p.id !== req.params.id);
  db.reviews = db.reviews.filter(r => r.productId !== req.params.id); // via anche le sue recensioni
  save();
  res.json({ ok: true, removed: n - db.products.length });
});
app.get('/api/admin/reviews', admin, (req, res) => {
  const list = db.reviews.slice().sort((a, b) => b.ts - a.ts).map(r => ({
    ...r, productName: (db.products.find(p => p.id === r.productId) || {}).name || '(prodotto eliminato)'
  }));
  res.json({ reviews: list });
});
app.delete('/api/admin/review/:id', admin, (req, res) => {
  const n = db.reviews.length;
  db.reviews = db.reviews.filter(r => r.id !== req.params.id);
  save();
  res.json({ ok: true, removed: n - db.reviews.length });
});
app.get('/api/admin/orders', admin, (req, res) => {
  const orders = db.orders.slice().sort((a, b) => b.ts - a.ts);
  const revenue = db.orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const cost = db.orders.filter(o => o.status !== 'cancelled').reduce((s, o) => s + o.items.reduce((x, it) => x + (it.cost || 0) * it.qty, 0), 0);
  res.json({ orders, stats: { count: db.orders.length, revenue: Math.round(revenue * 100) / 100, margin: Math.round((revenue - cost) * 100) / 100 } });
});
app.post('/api/admin/order/:id', admin, (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'non trovato' });
  const b = req.body || {};
  const st = (b.status || '').toString();
  if (['pending', 'paid', 'shipped', 'cancelled'].includes(st)) o.status = st;
  if (b.fulfillStatus) {
    o.fulfillment = o.fulfillment || { status: 'da_inoltrare' };
    if (['da_inoltrare', 'inoltrato', 'pagato', 'spedito', 'errore'].includes(b.fulfillStatus)) o.fulfillment.status = b.fulfillStatus;
  }
  if (b.tracking != null) { o.fulfillment = o.fulfillment || { status: 'da_inoltrare' }; o.fulfillment.tracking = b.tracking.toString().slice(0, 120); }
  save();
  res.json({ ok: true, order: o });
});
// Stato del dropshipping automatico (per il banner nel pannello)
app.get('/api/admin/fulfillment', admin, (req, res) => res.json(fulfillment.supplierStatus()));
// Inoltro manuale al fornitore (bottone "Ordina dal fornitore" nel pannello)
app.post('/api/admin/order/:id/fulfill', admin, async (req, res) => {
  const o = db.orders.find(x => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'non trovato' });
  o.fulfillment = o.fulfillment || { status: 'da_inoltrare' };
  const r = await fulfillment.placeSupplierOrder(o);
  if (r.ok) { o.fulfillment.status = 'inoltrato'; o.fulfillment.supplierOrderId = r.supplierOrderId || ''; o.fulfillment.error = ''; }
  else { o.fulfillment.error = r.message || ''; }
  save();
  res.json({ ok: r.ok, reason: r.reason, message: r.message, order: o });
});

// ---------- Socket (notifica nuovi ordini all'admin) ----------
io.on('connection', (socket) => {
  socket.on('admin-auth', (pass) => { if (pass === ADMIN_PASSWORD) socket.join('admin'); });
});

load().then(() => {
  server.listen(PORT, () => {
    console.log(`🛍️  KOUVERTE SHOP · http://localhost:${PORT}`);
    console.log(`   prodotti: ${db.products.length} · ordini: ${db.orders.length} · admin pass: ${ADMIN_PASSWORD === 'admin123' ? 'admin123 (CAMBIALA!)' : '***'}`);
    console.log('   persistenza: ' + (redisEnabled ? 'Redis Upstash ✅ (durevole, sopravvive ai redeploy)' : 'solo file ⚠️ effimero su Render free → imposta UPSTASH_REDIS_REST_URL/TOKEN'));
  });
}).catch(e => { console.error('Avvio fallito:', e); process.exit(1); });
