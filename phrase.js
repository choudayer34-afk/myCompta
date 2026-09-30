// Analyse d'une phrase dictée : « crée une dépense course à la date du 16 décembre, montant 53 euros 99 ».
// Aucun accès au DOM ni à Firebase.
const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
const p2 = (n) => String(n).padStart(2, "0");

// Minuscules sans accents, en conservant la même longueur (les positions restent valables dans le texte d'origine)
const CARTE = { à: "a", â: "a", ä: "a", é: "e", è: "e", ê: "e", ë: "e", î: "i", ï: "i", ô: "o", ö: "o", ù: "u", û: "u", ü: "u", ç: "c", "’": "'" };
const plat = (t) => [...t.toLowerCase()].map((c) => CARTE[c] || c).join("");

function dateIso(a, m, j) {
  if (!(a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && j >= 1 && j <= 31)) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCMonth() === m - 1 ? `${a}-${p2(m)}-${p2(j)}` : null;
}
function decalerJours(iso, n) {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

const MOTS_LIEN = new Set(["le", "la", "les", "l", "du", "de", "des", "d", "un", "une", "dont", "montant", "est", "a", "date", "pour", "au", "aux", "en", "sur", "compte", "et", "chez", "avec", "s", "il", "te", "plait", "stp", "merci", "cree", "creer", "ajoute", "ajouter", "enregistre", "enregistrer", "saisis", "saisir", "nouvelle", "nouveau", "moi", "fais", "faire", "mets", "mettre", "ca", "qui", "que", "s'il", "total", "somme", "prix", "coute", "couté", "coute", "d'un", "l'"]);

// Retourne { sens, nom, montant (centimes, positif) | null, date (ISO), dateTrouvee, compteId | null }
export function analyserPhrase(texte, aujourdhui, comptes = []) {
  const brut = String(texte || "").replace(/[«»“”"]/g, " ").replace(/\s+/g, " ").trim();
  let n = plat(brut);
  const coupes = []; // [debut, fin[

  // Sens
  const sens = /\b(recette|revenu|rentree|encaissement|remboursement|salaire|credit)\b/.test(n) ? 1 : -1;

  // Montant (le premier repéré)
  let montant = null;
  const essais = [
    [/(?<![\d,.])(\d+)\s*virgule\s*(\d{1,2})(?!\d)/, (m) => [m[1], m[2]]],
    [/(?<![\d,.])(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)[,.](\d{1,2})(?!\d)\s*(?:euros?|eur|€)?/, (m) => [m[1], m[2]]],
    [/(?<![\d,.])(\d{1,3}(?:[ \u00a0\u202f]\d{3})+|\d+)\s*(?:euros?|eur|€)\s*(?:et\s*)?(\d{1,2})?(?!\d)/, (m) => [m[1], m[2]]],
    [/montant\s*(?:est|de)?\s*(\d+)(?!\d)/, (m) => [m[1], null]]
  ];
  for (const [re, lire] of essais) {
    const m = re.exec(n);
    if (!m) continue;
    const [e, c] = lire(m);
    const euros = parseInt(e.replace(/\D/g, ""), 10);
    // « 12,5 » = 12,50 ; « 2 euros 5 » = 2,05
    const centimes = c ? (c.length === 1 && /[,.]/.test(m[0].charAt(e.length)) ? parseInt(c, 10) * 10 : parseInt(c, 10)) : 0;
    montant = euros * 100 + centimes;
    coupes.push([m.index, m.index + m[0].length]);
    break;
  }
  if (montant === 0) montant = null;

  // Date
  let date = null;
  const an = Number(aujourdhui.slice(0, 4));
  let m;
  if ((m = /\b(aujourd'hui|aujourdhui)\b/.exec(n))) { date = aujourdhui; coupes.push([m.index, m.index + m[0].length]); }
  else if ((m = /\bavant[- ]hier\b/.exec(n))) { date = decalerJours(aujourdhui, -2); coupes.push([m.index, m.index + m[0].length]); }
  else if ((m = /\bhier\b/.exec(n))) { date = decalerJours(aujourdhui, -1); coupes.push([m.index, m.index + m[0].length]); }
  else if ((m = /\bdemain\b/.exec(n))) { date = decalerJours(aujourdhui, 1); coupes.push([m.index, m.index + m[0].length]); }
  else if ((m = new RegExp(`\\b(\\d{1,2})\\s*(?:er)?\\s*(${Object.keys(MOIS).join("|")})(?:\\s*(\\d{4}))?\\b`).exec(n))) {
    date = dateIso(m[3] ? +m[3] : an, MOIS[m[2]], +m[1]); if (date) coupes.push([m.index, m.index + m[0].length]);
  } else {
    // jj/mm, jj.mm.aaaa… (hors du texte déjà reconnu comme montant)
    for (const x of n.matchAll(/(?<![\d,.])(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{4}|\d{2}))?(?![\d])/g)) {
      if (coupes.some(([a, b]) => x.index < b && x.index + x[0].length > a)) continue;
      const a = x[3] ? (x[3].length === 2 ? 2000 + +x[3] : +x[3]) : an;
      const d = dateIso(a, +x[2], +x[1]);
      if (d) { date = d; coupes.push([x.index, x.index + x[0].length]); break; }
    }
  }

  // Compte cité (« sur le compte Cic »)
  let compteId = null;
  for (const c of comptes.filter((x) => !x.archive)) {
    const nc = plat(c.nom).trim();
    if (nc.length < 3) continue;
    const i = n.indexOf(nc);
    if (i >= 0 && /(^|[^a-z0-9])/.test(n.charAt(i - 1) || " ") && !/[a-z0-9]/.test(n.charAt(i + nc.length) || " ")) { compteId = c.id; coupes.push([i, i + nc.length]); break; }
  }

  // Nom : ce qui suit le mot « dépense / recette… », privé du montant, de la date, du compte et des mots de liaison
  const typeRe = /\b(depense|recette|achat|paiement|revenu|rentree d'argent|encaissement|remboursement)\b/;
  const t = typeRe.exec(n);
  const debutNom = t ? t.index + t[0].length : 0;
  coupes.sort((a, b) => a[0] - b[0]);
  const morceaux = [];
  let curseur = debutNom;
  for (const [a, b] of coupes) {
    if (b <= curseur) continue;
    morceaux.push([curseur, Math.max(curseur, a)]);
    curseur = Math.max(curseur, b);
  }
  morceaux.push([curseur, n.length]);
  const nettoyer = ([a, b]) => {
    let mots = brut.slice(a, b).split(/\s+/).filter(Boolean);
    const lien = (w) => MOTS_LIEN.has(plat(w).replace(/[^a-z']/g, "").replace(/'$/, ""));
    while (mots.length && lien(mots[0])) mots.shift();
    while (mots.length && lien(mots[mots.length - 1])) mots.pop();
    return mots.join(" ").replace(/^[,;:.\-\s]+|[,;:.\-\s]+$/g, "");
  };
  let nom = "";
  for (const mo of morceaux) { nom = nettoyer(mo); if (nom) break; }
  if (!nom && t) nom = nettoyer([0, t.index]);
  if (nom) nom = nom.charAt(0).toUpperCase() + nom.slice(1);

  return { sens, nom, montant, date: date || aujourdhui, dateTrouvee: !!date, compteId };
}
