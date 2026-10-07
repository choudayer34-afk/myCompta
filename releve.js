// Relevé bancaire (CSV, OFX, QIF) et rapprochement avec les opérations saisies. Aucun accès à Firebase ni au DOM.
import { parseCsv, montantEnCentimes } from "./importcsv.js";
import { sansAccent } from "./format.js";

const p2 = (n) => String(n).padStart(2, "0");
function isoDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${p2(m)}-${p2(d)}` : null;
}
// jj/mm/aaaa, jj-mm-aa, jj.mm.aaaa, aaaa-mm-jj, aaaammjj
export function dateReleve(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{4})(\d{2})(\d{2})/); if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[\/.\-'](\d{1,2})[\/.\-'](\d{4}|\d{2})(?!\d)/);
  if (m) { let y = +m[3]; if (m[3].length === 2) y += y < 70 ? 2000 : 1900; return isoDate(y, +m[2], +m[1]); }
  return null;
}
const nettoyer = (s) => String(s || "").replace(/\s+/g, " ").trim();

function lireOfx(txt) {
  const lignes = [];
  for (const m of txt.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|$)/gi)) {
    const bloc = m[1];
    const get = (tag) => { const r = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(bloc); return r ? r[1].trim() : ""; };
    const date = dateReleve(get("DTPOSTED") || get("DTUSER"));
    const montant = montantEnCentimes(get("TRNAMT"));
    const nom = get("NAME"), memo = get("MEMO");
    const libelle = nettoyer(memo && memo !== nom ? `${nom} ${memo}` : nom || memo);
    if (date && montant !== null) lignes.push({ date, libelle, montant });
  }
  return lignes;
}

function lireQif(txt) {
  const lignes = [];
  let cur = {};
  const fin = () => {
    const date = dateReleve(cur.D), montant = montantEnCentimes(cur.T);
    if (date && montant !== null) lignes.push({ date, libelle: nettoyer(cur.P || cur.M), montant });
    cur = {};
  };
  for (const l of txt.split(/\r?\n/)) {
    if (!l) continue;
    if (l[0] === "^") { fin(); continue; }
    if (l[0] === "!") continue;
    cur[l[0]] = l.slice(1).trim();
  }
  if (cur.D) fin();
  return lignes;
}

function lireCsv(txt) {
  const { rows } = parseCsv(txt);
  const norm = (s) => sansAccent(s).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  // Ligne d'en-tête : la première qui contient un titre de date et un titre de montant (ou débit / crédit)
  let h = -1, idx = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const t = rows[i].map(norm);
    const date = t.findIndex((x) => /^date( d operation| operation| de comptabilisation| comptable)?$/.test(x)) >= 0 ? t.findIndex((x) => /^date( d operation| operation| de comptabilisation| comptable)?$/.test(x)) : t.findIndex((x) => x.startsWith("date"));
    const montant = t.findIndex((x) => /^(montant|amount|somme)/.test(x));
    const debit = t.findIndex((x) => /^debit/.test(x)), credit = t.findIndex((x) => /^credit/.test(x));
    if (date >= 0 && (montant >= 0 || (debit >= 0 && credit >= 0))) {
      const lib = t.findIndex((x) => /^(libelle|label|description|intitule|motif|detail|operation|designation)/.test(x));
      idx = { date, montant, debit, credit, lib };
      h = i; break;
    }
  }
  if (h < 0) return null;
  const lignes = [];
  for (const r of rows.slice(h + 1)) {
    const date = dateReleve(r[idx.date]);
    if (!date) continue;
    let montant = null;
    if (idx.montant >= 0 && nettoyer(r[idx.montant]) !== "") montant = montantEnCentimes(r[idx.montant]);
    else if (idx.debit >= 0) {
      const d = nettoyer(r[idx.debit]) !== "" ? montantEnCentimes(r[idx.debit]) : null;
      const c = nettoyer(r[idx.credit]) !== "" ? montantEnCentimes(r[idx.credit]) : null;
      if (d !== null) montant = -Math.abs(d); else if (c !== null) montant = Math.abs(c);
    }
    if (montant === null) continue;
    lignes.push({ date, libelle: nettoyer(idx.lib >= 0 ? r[idx.lib] : r.filter((_, i) => ![idx.date, idx.montant, idx.debit, idx.credit].includes(i)).join(" ")), montant });
  }
  return lignes;
}

// Retourne { format, lignes } ou { erreur }
export function lireReleve(texte, nomFichier = "") {
  const txt = String(texte || "").replace(/^﻿/, "");
  const ext = (nomFichier.match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  let format, lignes;
  if (/<OFX|<STMTTRN>/i.test(txt) || ext === "ofx" || ext === "qfx") { format = "OFX"; lignes = lireOfx(txt); }
  else if (/^!Type:/im.test(txt) || ext === "qif") { format = "QIF"; lignes = lireQif(txt); }
  else {
    format = "CSV"; lignes = lireCsv(txt);
    if (lignes === null) return { erreur: "Colonnes non reconnues : le fichier doit contenir au minimum une colonne de date et une colonne de montant (ou débit et crédit)." };
  }
  if (!lignes.length) return { erreur: "Aucune opération n'a pu être lue dans ce fichier." };
  return { format, lignes: lignes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) };
}

const JOUR = 86400000;
const ecartJours = (a, b) => Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / JOUR;
const mots = (s) => new Set(sansAccent(s).replace(/[^a-z]/g, " ").split(" ").filter((w) => w.length >= 3));
const proximite = (a, b) => { const A = mots(a), B = mots(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n; };

// Rapproche les lignes du relevé avec les opérations d'un compte.
// paires : ligne ↔ opération « en cours » à pointer ; dejaPointees : ligne déjà couverte par une opération pointée ;
// manquantes : lignes sans équivalent ; absentes : opérations en cours de la période absentes du relevé.
export function rapprocher({ lignes, operations, compteId, tolerance = 7 }) {
  const propres = operations.filter((o) => o.compteId === compteId && o.statut !== "annule");
  const libres = propres.filter((o) => o.statut !== "pointe");
  const pointees = propres.filter((o) => o.statut === "pointe");
  const pris = new Set();
  const trouver = (ligne, liste) => {
    let meilleur = null, score = null;
    for (const o of liste) {
      if (pris.has(o.id) || o.montant !== ligne.montant) continue;
      const e = ecartJours(o.date, ligne.date);
      if (e > tolerance) continue;
      const s = [e, -proximite(o.nom, ligne.libelle)];
      if (!score || s[0] < score[0] || (s[0] === score[0] && s[1] < score[1])) { meilleur = o; score = s; }
    }
    return meilleur;
  };
  const paires = [], dejaPointees = [], manquantes = [];
  for (const ligne of lignes) {
    const o = trouver(ligne, libres);
    if (o) { pris.add(o.id); paires.push({ ligne, operation: o }); continue; }
    const p = trouver(ligne, pointees);
    if (p) { pris.add(p.id); dejaPointees.push({ ligne, operation: p }); continue; }
    manquantes.push(ligne);
  }
  const debut = lignes[0].date, fin = lignes[lignes.length - 1].date;
  const absentes = libres.filter((o) => !pris.has(o.id) && o.date >= debut && o.date <= fin);
  return { paires, dejaPointees, manquantes, absentes };
}
