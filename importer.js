// ===== Kouverte Shop — importatore prodotti da link AliExpress =====
// Incolli il link → tira giù NOME + FOTO (galleria) + link fornitore, in automatico.
// L'origine NON viene mai mostrata al cliente: il prodotto diventa una TUA scheda,
// con il TUO prezzo e il TUO brand. Il "supplierUrl" resta solo nel pannello admin.
//
// Nota tecnica: AliExpress carica il PREZZO via JavaScript (non leggibile lato server),
// quindi il prezzo di vendita lo imposti tu (è il tuo ricarico). Per alcuni articoli
// AliExpress nasconde anche nome/foto agli scraper: in quel caso usa un altro link
// o l'API ufficiale (credenziali) per un import garantito.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function metaContent(html, prop) {
  const tag = (html.match(new RegExp('<meta[^>]*' + prop.replace(/:/g, '\\:') + '[^>]*>', 'i')) || [])[0];
  if (!tag) return null;
  const c = tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i);
  return c ? c[1].trim() : null;
}

// Ripulisce il titolo dal "rumore" tipico delle inserzioni cinesi
function cleanTitle(t) {
  if (!t) return '';
  let s = t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#?[a-z0-9]+;/gi, ' ');
  s = s.replace(/\b(free shipping|hot sale|big sale|clearance|new\s*20\d\d|20\d\d\s*new|drop[\s-]?shipping|wholesale|aliexpress|high quality|top quality|fashion|luxury brand)\b/gi, ' ');
  s = s.replace(/[|/\\]+/g, ' ').replace(/[,，]\s*/g, ', ').replace(/\s{2,}/g, ' ').trim();
  // rimuove parole ripetute (le inserzioni ripetono keyword per la SEO)
  const seen = new Set(), words = [];
  for (const w of s.split(' ')) {
    const k = w.toLowerCase().replace(/[^a-zàèéìòù0-9]/gi, '');
    if (k.length > 2 && seen.has(k)) continue;
    if (k.length > 2) seen.add(k);
    words.push(w);
  }
  s = words.join(' ').replace(/^[\s,.-]+/, '').trim();
  if (s.length > 75) s = s.slice(0, 75).replace(/\s\S*$/, '') + '…';
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function normUrl(url) {
  const m = (url || '').match(/\/item\/(\d+)\.html/);
  return m ? ('https://it.aliexpress.com/item/' + m[1] + '.html') : url;
}

// Raccoglie le immagini prodotto dalla CDN AliExpress, ripulite a piena risoluzione
function collectImages(html, ogImage) {
  const raw = html.match(/https?:\/\/ae\d+\.alicdn\.com\/kf\/[A-Za-z0-9_.\/-]+\.(?:jpg|jpeg|png|webp)/gi) || [];
  const byId = new Map();
  // asset UI ricorrenti su ogni pagina (non sono foto prodotto)
  const JUNK = new Set(['S6d426a8dcf3b480bb7d1e83ab6666db10']);
  const add = (u) => {
    if (!u) return;
    // l'id immagine è 'S' + run alfanumerico (anche con lettera finale, NON solo hex);
    // si ferma al primo '/', '.' o suffisso taglia (_80x80) → URL canonico a piena risoluzione
    const idm = u.match(/\/kf\/(S[A-Za-z0-9]{12,})/);
    if (!idm) return;                                  // scarta loghi/placeholder senza id-immagine
    const id = idm[1];
    if (JUNK.has(id)) return;
    if (!byId.has(id)) byId.set(id, 'https://ae01.alicdn.com/kf/' + id + '.jpg');
  };
  add(ogImage);
  raw.forEach(add);
  return [...byId.values()].slice(0, 8);
}

async function importFromAliExpress(url) {
  if (!/aliexpress|\/item\/\d+/.test(url || '')) {
    return { ok: false, error: 'Incolla un link prodotto AliExpress valido (…/item/NUMERO.html)' };
  }
  const target = normUrl(url);
  let html;
  try {
    const r = await fetch(target, { headers: { 'User-Agent': UA, 'Accept-Language': 'it-IT,it;q=0.9', 'Accept': 'text/html' }, redirect: 'follow' });
    html = await r.text();
  } catch (e) {
    return { ok: false, error: 'Impossibile raggiungere AliExpress: ' + e.message, supplierUrl: target };
  }
  const rawTitle = metaContent(html, 'og:title') || (html.match(/<title>([^<]+)<\/title>/i) || [])[1] || '';
  const name = cleanTitle(rawTitle);
  const ogImage = metaContent(html, 'og:image');
  const images = collectImages(html, ogImage);
  if (!name && !images.length) {
    return {
      ok: false, supplierUrl: target,
      error: 'AliExpress non ha esposto i dati di questo articolo (capita su alcuni prodotti). Prova un altro link oppure inserisci nome e foto a mano. Per import sempre garantito serve l’API ufficiale (credenziali).'
    };
  }
  return {
    ok: true,
    product: { name, image: images[0] || '', images, description: '', supplierUrl: target },
    note: 'Imposta tu il prezzo di vendita (il tuo ricarico). Controlla foto e nome prima di salvare.'
  };
}

module.exports = { importFromAliExpress, cleanTitle };
