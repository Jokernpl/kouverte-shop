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
const SHOP_NAME = process.env.SHOP_NAME || 'Il Mio Shop';
const CURRENCY = (process.env.CURRENCY || 'eur').toLowerCase();

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

// ---------- DB su file JSON ----------
const DB_FILE = path.join(__dirname, 'data.json');
let db = { products: [], orders: [] };
function uid(p) { return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function load() {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch (e) { db = { products: [], orders: [] }; seed(); }
  if (!db.products) db.products = [];
  if (!db.orders) db.orders = [];
}
let saveT = null;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.error('save err', e); } }, 150);
}
function seed() {
  // Prodotti di ESEMPIO (cancellali dal pannello e metti i tuoi)
  const ex = [
    { name: '(Esempio) Auricolari Bluetooth', price: 29.90, cost: 11.00, category: 'Telefonia', description: 'Auricolari wireless, custodia di ricarica, cancellazione del rumore. (Prodotto di esempio: modificalo o cancellalo)' },
    { name: '(Esempio) Power Bank 20000mAh', price: 24.90, cost: 9.50, category: 'Telefonia', description: 'Batteria portatile ad alta capacità, ricarica rapida USB-C. (Esempio)' },
    { name: '(Esempio) Cover trasparente iPhone', price: 9.90, cost: 1.80, category: 'Accessori', description: 'Custodia antiurto trasparente. (Esempio)' },
    { name: '(Esempio) Caricatore USB-C 65W', price: 19.90, cost: 6.00, category: 'Telefonia', description: 'Alimentatore rapido GaN, compatto. (Esempio)' }
  ];
  db.products = ex.map(p => ({ id: uid('p'), image: '', stock: null, ts: Date.now(), ...p }));
  save();
}

// ---------- API pubbliche ----------
app.get('/api/config', (req, res) => res.json({ shopName: SHOP_NAME, currency: CURRENCY, stripeEnabled: !!stripe }));
app.get('/api/health', (req, res) => res.json({ ok: true, products: db.products.length, orders: db.orders.length, stripe: !!stripe }));

app.get('/api/products', (req, res) => {
  const q = (req.query.q || '').toString().toLowerCase().trim();
  const cat = (req.query.cat || '').toString();
  let list = db.products.slice();
  if (cat) list = list.filter(p => p.category === cat);
  if (q) list = list.filter(p => (p.name + ' ' + p.description + ' ' + p.category).toLowerCase().includes(q));
  res.json({ products: list, categories: [...new Set(db.products.map(p => p.category).filter(Boolean))] });
});
app.get('/api/product/:id', (req, res) => {
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'non trovato' });
  res.json({ product: p });
});

function baseUrl(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return proto + '://' + host;
}
function safeOrder(o) { return { id: o.id, items: o.items, customer: { name: o.customer.name }, total: o.total, status: o.status, ts: o.ts }; }

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
      items.push({ id: p.id, name: p.name, price: p.price, cost: p.cost || 0, qty });
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
      status: 'pending', ts: Date.now()
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
      if (s.payment_status === 'paid' && order.status === 'pending') { order.status = 'paid'; order.paidAt = Date.now(); save(); io.to('admin').emit('order-paid', { id: order.id }); }
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
app.post('/api/admin/product', admin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !(parseFloat(b.price) >= 0)) return res.status(400).json({ error: 'Nome e prezzo obbligatori' });
  let p = b.id ? db.products.find(x => x.id === b.id) : null;
  if (!p) { p = { id: uid('p'), ts: Date.now() }; db.products.push(p); }
  p.name = b.name.toString().slice(0, 140);
  p.price = Math.max(0, parseFloat(b.price) || 0);
  p.cost = (b.cost === '' || b.cost == null) ? null : Math.max(0, parseFloat(b.cost) || 0);
  p.image = (b.image || '').toString().slice(0, 600);
  p.description = (b.description || '').toString().slice(0, 3000);
  p.category = (b.category || 'Generale').toString().slice(0, 60) || 'Generale';
  p.stock = (b.stock === '' || b.stock == null) ? null : Math.max(0, parseInt(b.stock) || 0);
  save();
  res.json({ ok: true, product: p });
});
app.delete('/api/admin/product/:id', admin, (req, res) => {
  const n = db.products.length;
  db.products = db.products.filter(p => p.id !== req.params.id);
  save();
  res.json({ ok: true, removed: n - db.products.length });
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
  const st = (req.body && req.body.status || '').toString();
  if (['pending', 'paid', 'shipped', 'cancelled'].includes(st)) { o.status = st; save(); }
  res.json({ ok: true, order: o });
});

// ---------- Socket (notifica nuovi ordini all'admin) ----------
io.on('connection', (socket) => {
  socket.on('admin-auth', (pass) => { if (pass === ADMIN_PASSWORD) socket.join('admin'); });
});

load();
server.listen(PORT, () => {
  console.log(`🛍️  KOUVERTE SHOP · http://localhost:${PORT}`);
  console.log(`   prodotti: ${db.products.length} · ordini: ${db.orders.length} · admin pass: ${ADMIN_PASSWORD === 'admin123' ? 'admin123 (CAMBIALA!)' : '***'}`);
});
