// Analyse d'un export CSV d'iCompta. Aucun accès à Firebase ici : le module produit un plan d'écritures.
import { versCentimes, sansAccent } from "./format.js";

const p2 = (n) => String(n).padStart(2, "0");

export function decoder(buffer) {
  let txt;
  try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
  catch { txt = new TextDecoder("windows-1252").decode(buffer); }
  return txt.replace(/^﻿/, "");
}

export function parseCsv(txt) {
  const premiere = txt.split(/\r?\n/, 1)[0];
  const delim = [",", ";", "\t"].map((d) => [d, premiere.split(d).length - 1]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], cur = "", q = false;
  const fin = () => { row.push(cur); cur = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; };
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) {
      if (c === '"') { if (txt[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && txt[i + 1] === "\n") i++; fin(); }
    else cur += c;
  }
  if (cur !== "" || row.length) fin();
  return { delim, rows };
}

const norm = (s) => sansAccent(s).replace(/[^a-z]/g, "");
const COLONNES = {
  date: "date", type: "type", kind: "kind", info: "info", frequency: "frequency", description: "description",
  amount: "amount", taxes: "taxes", status: "status", concileddate: "conciled", comment: "comment",
  endingdate: "ending", account: "account"
};

// Transforme les lignes brutes en objets. Retourne { lignes, manquantes }.
export function lire(rows) {
  if (!rows.length) return { lignes: [], manquantes: ["Date", "Amount", "Account", "Description"] };
  const index = {};
  rows[0].forEach((titre, i) => { const k = COLONNES[norm(titre)]; if (k && index[k] === undefined) index[k] = i; });
  const manquantes = ["date", "description", "amount", "account"].filter((k) => index[k] === undefined);
  const val = (r, k) => (index[k] === undefined ? "" : (r[index[k]] || "").trim());
  const lignes = rows.slice(1).map((r, i) => ({
    n: i + 2,
    date: val(r, "date"), type: val(r, "type"), kind: val(r, "kind"), info: val(r, "info"),
    frequency: val(r, "frequency"), description: val(r, "description"), amount: val(r, "amount"),
    taxes: val(r, "taxes"), status: val(r, "status"), conciled: val(r, "conciled"),
    comment: val(r, "comment"), ending: val(r, "ending"), account: val(r, "account")
  }));
  return { lignes, manquantes };
}

export function parseDate(s, fmt) {
  const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const a = +m[1], b = +m[2];
  let y = +m[3];
  if (m[3].length === 2) y = y < 70 ? 2000 + y : 1900 + y;
  const mo = fmt === "MJA" ? a : b, d = fmt === "MJA" ? b : a;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return null;
  return `${y}-${p2(mo)}-${p2(d)}`;
}

export function detecterFormat(valeurs) {
  let jma = 0, mja = 0;
  for (const v of valeurs) {
    const m = String(v || "").match(/^(\d{1,2})\/(\d{1,2})\//);
    if (!m) continue;
    if (+m[1] > 12) jma++;
    if (+m[2] > 12) mja++;
  }
  return { format: jma > mja ? "JMA" : "MJA", certain: (jma > 0) !== (mja > 0), conflit: jma > 0 && mja > 0, jma, mja };
}

export function montantEnCentimes(texte) {
  let t = String(texte || "").replace(/[\s  €]/g, "");
  if (t.includes(",") && t.includes(".")) {
    const dec = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
    const mil = dec === "," ? "." : ",";
    t = t.split(mil).join("");
  }
  return versCentimes(t);
}

function cyrb53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const slug = (s) => sansAccent(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

function typeCompte(nom) {
  const n = sansAccent(nom);
  if (/assurance vie/.test(n)) return "assurance-vie";
  if (/livret|epargne|pel\b|cel\b|ldd|ldds/.test(n)) return "epargne";
  if (/plan|pea|placement|per\b|interess/.test(n)) return "placement";
  if (/pret|credit/.test(n)) return "credit";
  if (/espece|cash/.test(n)) return "especes";
  return "courant";
}

export function statutDepuis(brut) {
  const s = sansAccent(brut);
  if (/reconcil|point/.test(s)) return "pointe";
  if (/cancel|annul/.test(s)) return "annule";
  return "encours";
}

function natureDepuis(texte) {
  const s = sansAccent(texte);
  if (/carte|\bcb\b/.test(s)) return "carte";
  if (/cheque|chq/.test(s)) return "cheque";
  if (/prelev/.test(s)) return "prelevement";
  if (/virement/.test(s)) return "virement";
  if (/espece|cash/.test(s)) return "especes";
  return "autre";
}

const estUnique = (f) => { const s = sansAccent(f); return s === "" || s.includes("single"); };
const estVirement = (kind) => /transfer/i.test(kind);
const RE_VIREMENT = /^virement (?:de la|de l'|du|des|de|vers|au|a) (.+)$/;

// Construit le plan d'import. options : { formatDate: "MJA"|"JMA", typeVers: "categorie"|"nature"|"ignorer" }
// existant : { comptes: [...], categories: [...] } déjà présents dans l'application.
export function analyser(lignes, options, existant) {
  const { formatDate, typeVers } = options;
  const erreurs = [];
  const recurrentes = [];
  const kinds = new Map(), statuts = new Map();
  const inc = (m, k) => m.set(k, (m.get(k) || 0) + 1);

  // Comptes : clé = nom brut de l'export
  const bruts = [...new Set(lignes.map((l) => l.account).filter(Boolean))];
  const decoupe = (brut) => {
    const m = brut.match(/^(.*?)\s*\((\d{1,4}\/\d{1,2}\/\d{2,4})\)\s*$/);
    return m ? { base: m[1].trim() || brut, ouverture: parseDate(m[2], formatDate) } : { base: brut, ouverture: null };
  };
  const bases = bruts.map((b) => decoupe(b).base);
  const comptes = new Map();
  for (const brut of bruts) {
    const { base, ouverture } = decoupe(brut);
    const nom = bases.filter((x) => x === base).length > 1 ? brut : base;
    const deja = existant.comptes.find((c) => sansAccent(c.nom) === sansAccent(nom));
    comptes.set(brut, {
      brut, nom, id: deja ? deja.id : "ic-" + slug(nom), existe: !!deja,
      type: typeCompte(nom), dateOuverture: ouverture, nbOps: 0, solde: 0
    });
  }
  const parNom = new Map([...comptes.values()].map((c) => [sansAccent(c.nom), c]));
  const trouverCompte = (texte) => {
    const t = sansAccent(texte).trim();
    if (parNom.has(t)) return parNom.get(t);
    const cand = [...comptes.values()].filter((c) => sansAccent(c.nom).startsWith(t) || t.startsWith(sansAccent(c.nom)));
    return cand.length === 1 ? cand[0] : null;
  };

  // Catégories
  const categories = new Map();
  const categorieId = (nom) => {
    if (!nom) return null;
    const cle = sansAccent(nom);
    if (!categories.has(cle)) {
      const deja = existant.categories.find((c) => sansAccent(c.nom) === cle && !c.parentId);
      categories.set(cle, { nom, id: deja ? deja.id : "ic-" + slug(nom), existe: !!deja, nb: 0 });
    }
    const c = categories.get(cle); c.nb++; return c.id;
  };

  // Lignes valides (opérations simples)
  const ops = [];
  let ignoreesTaxes = 0;
  for (const l of lignes) {
    if (!l.account && !l.date && !l.amount) continue;
    if (!estUnique(l.frequency)) { recurrentes.push(l); continue; }
    const date = parseDate(l.date, formatDate);
    const montant = montantEnCentimes(l.amount);
    if (!l.account) { erreurs.push(`Ligne ${l.n} : compte manquant`); continue; }
    if (!date) { erreurs.push(`Ligne ${l.n} : date invalide « ${l.date} »`); continue; }
    if (montant === null) { erreurs.push(`Ligne ${l.n} : montant invalide « ${l.amount} »`); continue; }
    if (l.taxes && montantEnCentimes(l.taxes)) ignoreesTaxes++;
    inc(kinds, l.kind || "(vide)"); inc(statuts, l.status || "(vide)");
    ops.push({ l, date, montant, compte: comptes.get(l.account), virement: estVirement(l.kind) });
  }

  // Appariement des virements : ligne miroir sur le compte cité dans le libellé
  const index = new Map();
  const cle = (c, d, m) => `${c.brut}|${d}|${m}`;
  ops.forEach((o, i) => { if (o.virement) { const k = cle(o.compte, o.date, o.montant); if (!index.has(k)) index.set(k, []); index.get(k).push(i); } });
  const paire = new Map();
  ops.forEach((o, i) => {
    if (!o.virement || paire.has(i)) return;
    const m = sansAccent(o.l.description).match(RE_VIREMENT);
    const autre = m && trouverCompte(m[1]);
    if (!autre || autre.brut === o.compte.brut) return;
    const liste = index.get(cle(autre, o.date, -o.montant)) || [];
    const j = liste.find((x) => x !== i && !paire.has(x));
    if (j !== undefined) { paire.set(i, j); paire.set(j, i); }
  });

  // Identifiants stables : relancer l'import met à jour les mêmes documents
  const vus = new Map();
  ops.forEach((o, i) => {
    const base = [o.l.account, o.date, o.montant, o.l.description, o.l.kind, o.l.type].join("|");
    const n = (vus.get(base) || 0) + 1; vus.set(base, n);
    o.id = "i" + cyrb53(base + "#" + n).toString(36);
    o.i = i;
  });

  const ecritures = [];
  for (const c of comptes.values()) {
    ecritures.push(["comptes", c.id, {
      ...(c.existe ? {} : { nom: c.nom, type: c.type, dateOuverture: c.dateOuverture, soldeInitial: 0, couleur: "#0f766e", archive: false })
    }]);
  }
  let appariees = 0, sansContrepartie = 0;
  for (const o of ops) {
    const { l } = o;
    const statut = statutDepuis(l.status);
    const cat = typeVers === "categorie" ? categorieId(l.type) : null;
    const nature = o.virement ? "virement" : typeVers === "nature" ? natureDepuis(l.type) : "autre";
    let virementId = null;
    if (o.virement) {
      const autre = paire.get(o.i);
      if (autre !== undefined) { virementId = ops[Math.min(o.i, autre)].id; if (o.i < autre) appariees++; }
      else sansContrepartie++;
    }
    const datePointage = statut === "pointe" && l.conciled ? parseDate(l.conciled, formatDate) : null;
    ecritures.push(["operations", o.id, {
      nom: l.description || "(sans nom)", commentaire: l.comment || "", date: o.date, montant: o.montant,
      compteId: o.compte.id, nature, info: l.info || "", categorieId: cat, statut, datePointage,
      virementId, cree: o.i + 1
    }]);
    o.compte.nbOps++;
    if (statut !== "annule") o.compte.solde += o.montant;
  }
  for (const c of categories.values()) {
    if (!c.existe) ecritures.push(["categories", c.id, { nom: c.nom, parentId: null, couleur: "#2563eb" }]);
  }

  return {
    comptes: [...comptes.values()], categories: [...categories.values()], ecritures, erreurs,
    recurrentes, kinds, statuts, appariees, sansContrepartie, ignoreesTaxes, nbOps: ops.length
  };
}
