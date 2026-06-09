// ===== Kouverte Shop — evasione ordini / dropshipping =====
// Provider PLUGGABILE per inoltrare l'ordine al fornitore (es. AliExpress)
// con l'indirizzo del cliente, in automatico dopo il pagamento.
//
// SICUREZZA: senza credenziali NON viene speso né inoltrato nulla.
// L'ordine resta "da_inoltrare" e l'admin lo evade a mano (semi-automatico).
// L'inoltro automatico parte SOLO se imposti le credenziali del TUO account
// AliExpress (vedi variabili sotto) — i soldi escono dal TUO saldo, mai dal mio.

const AE_KEY    = (process.env.ALIEXPRESS_APP_KEY || '').trim();
const AE_SECRET = (process.env.ALIEXPRESS_APP_SECRET || '').trim();
const AE_TOKEN  = (process.env.ALIEXPRESS_ACCESS_TOKEN || '').trim();
// DROPSHIP_AUTO=1 → inoltra in automatico ad ogni ordine PAGATO (hands-off)
const AUTO_ON   = (process.env.DROPSHIP_AUTO || '').trim() === '1';

const aeConfigured = !!(AE_KEY && AE_SECRET && AE_TOKEN);

function supplierStatus() {
  return {
    provider: 'aliexpress',
    configured: aeConfigured,        // credenziali presenti?
    auto: AUTO_ON && aeConfigured,   // inoltro automatico attivo?
    // cosa manca per andare "full-auto"
    needs: aeConfigured ? [] : ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_ACCESS_TOKEN']
  };
}

// Tenta di piazzare l'ordine dal fornitore con l'indirizzo del cliente.
// Ritorna { ok, reason, message, supplierOrderId }. NON lancia eccezioni.
async function placeSupplierOrder(order) {
  if (!aeConfigured) {
    return {
      ok: false, reason: 'credenziali_mancanti',
      message: 'AliExpress non configurato: imposta ALIEXPRESS_APP_KEY / APP_SECRET / ACCESS_TOKEN per attivare l’inoltro automatico. Per ora evadi l’ordine a mano (link fornitore nel pannello).'
    };
  }
  // Ogni prodotto deve essere mappato a un link/SKU AliExpress
  const missing = (order.items || []).filter(it => !it.supplierUrl);
  if (missing.length) {
    return {
      ok: false, reason: 'mappatura_mancante',
      message: 'Manca il link AliExpress per: ' + missing.map(m => m.name).join(', ')
    };
  }
  // ---------------------------------------------------------------------------
  // QUI andrà la chiamata reale all'AliExpress Dropshipping API (ds.order.create):
  //   - firma TOP (app_key + app_secret + timestamp + sign)
  //   - POST https://api-sg.aliexpress.com/sync  con product_id/sku + qty
  //   - logistics_address = order.customer (nome, address, city, zip, phone)
  //   - il pagamento viene addebitato sul saldo/carta del TUO account AliExpress
  // Richiede: account dropshipper APPROVATO + metodo di pagamento caricato.
  // Finché non è implementata/abilitata, restiamo prudenti e non spendiamo:
  return {
    ok: false, reason: 'non_attivato',
    message: 'Credenziali presenti ma la chiamata AliExpress DS API non è ancora abilitata. Confermami l’attivazione e la collego.'
  };
}

module.exports = { placeSupplierOrder, supplierStatus, aeConfigured, AUTO_ON };
