# 🛍️ Kouverte Shop — negozio online (rivendita)

Negozio per vendere prodotti (telefonia, accessori, ecc.): **aggiungi un prodotto col tuo prezzo → il cliente paga → tu ordini dal fornitore e spedisci.** Pagamenti con carta tramite **Stripe** (sicuro, i soldi arrivano sul tuo conto).

## 🚀 Pubblica online (1 click)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Jokernpl/kouverte-shop)

1. Clicca il pulsante qui sopra (oppure render.com → **New +** → **Blueprint** → scegli `Jokernpl/kouverte-shop`).
2. Accedi a Render (registrazione gratis): **questo passo lo fai tu**, è il tuo account.
3. Render legge `render.yaml` da solo. Le variabili sono **tutte opzionali**: lascia vuoto → **Apply/Deploy**.
4. In ~2 minuti sei online su `https://kouverte-shop.onrender.com`, già pieno di prodotti.

Extra (più avanti, da Settings → Environment): `STRIPE_SECRET_KEY` per incassare con carta · `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN` per salvare ordini/prodotti per sempre · `ADMIN_PASSWORD` (vuoto = `admin123`).

## ▶️ Avvio sul tuo PC
1. Apri il terminale nella cartella `kouverte shop`
2. Prima volta: `npm install`
3. Avvia: `npm start`
4. Negozio: **http://localhost:8095** · Gestione: **http://localhost:8095/admin.html**

## 🔐 Pannello admin
- Vai su `/admin.html`, password di default **`admin123`** (CAMBIALA, vedi sotto).
- Da qui: **aggiungi/modifica/elimina prodotti** e **vedi gli ordini** (con nome, indirizzo, email del cliente e **margine** = vendita − costo fornitore).
- Notifica in tempo reale ad ogni nuovo ordine 🔔.

## 💳 Attivare i pagamenti con carta (Stripe)
Senza configurazione il sito funziona in modalità **"raccolta ordini"** (l'ordine arriva, il pagamento lo concordi tu). Per incassare con carta:
1. Crea un account gratuito su **stripe.com** (serve a te, io non tocco i tuoi dati).
2. Prendi la tua **Secret key** (`sk_live_...` o `sk_test_...`).
3. Impostala come variabile d'ambiente **`STRIPE_SECRET_KEY`** (su Render: Settings → Environment).
4. Riavvia: ora al checkout il cliente paga su pagina sicura Stripe e l'ordine si segna **Pagato** in automatico.

## ⚙️ Variabili d'ambiente
| Variabile | A cosa serve | Default |
|---|---|---|
| `ADMIN_PASSWORD` | password del pannello admin | `admin123` |
| `SHOP_NAME` | nome del negozio mostrato | `Kouverte Elettronica` |
| `STRIPE_SECRET_KEY` | attiva i pagamenti con carta | (vuoto = raccolta ordini) |
| `CURRENCY` | valuta | `eur` |
| `UPSTASH_REDIS_REST_URL` | persistenza durevole: ordini/prodotti sopravvivono ai redeploy | (vuoto = solo file) |
| `UPSTASH_REDIS_REST_TOKEN` | token Upstash REST (vedi sopra) | (vuoto = solo file) |
| `SHOP_REDIS_KEY` | chiave Redis dove sono salvati i dati | `kouverte:shop:db` |

## ⚠️ Note importanti
- **Render free**: disco effimero → `data.json` (prodotti/ordini) si azzera ad ogni riavvio/redeploy. Per uso reale serve un DB durevole (es. Postgres/Redis) — è il prossimo passo.
- **Fornitura**: il sito funziona con qualsiasi fornitore. ⚠️ Comprare su Amazon per rivendere viola le regole di Amazon: meglio grossisti/distributori veri.
- I 4 prodotti iniziali sono **esempi**: cancellali dal pannello e metti i tuoi.

## 🛠️ Stack
Node + Express + Socket.io + Stripe + DB JSON su file. Stesso stile di Kouverte → deploy su Render.

## 🗺️ Prossimi passi
DB durevole · upload foto prodotto · spese di spedizione/zone · coupon · email di conferma ordine · dominio dedicato.
