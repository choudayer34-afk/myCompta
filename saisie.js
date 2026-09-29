// Saisie en tableau : analyse des dates et des montants (aucun accès à Firebase ni au DOM).
import { versCentimes, sansAccent } from "./format.js";

const p2 = (n) => String(n).padStart(2, "0");

// Accepte 05/03/2026, 5.3.26, 0503 (année en cours), 050326, 05032026, 2026-03-05, 5/3 (année en cours).
export function analyserDate(texte, aujourdhui) {
  const s = String(texte || "").trim();
  if (!s) return null;
  const g = s.split(/\D+/).filter(Boolean);
  const anCourant = Number(aujourdhui.slice(0, 4));
  let j, m, a;
  if (g.length === 1) {
    const c = g[0];
    if (c.length === 4) { j = +c.slice(0, 2); m = +c.slice(2); a = anCourant; }
    else if (c.length === 6) { j = +c.slice(0, 2); m = +c.slice(2, 4); a = 2000 + +c.slice(4); }
    else if (c.length === 8) { j = +c.slice(0, 2); m = +c.slice(2, 4); a = +c.slice(4); }
    else return null;
  } else if (g.length === 2) { j = +g[0]; m = +g[1]; a = anCourant; }
  else if (g.length === 3) {
    if (g[0].length === 4) { a = +g[0]; m = +g[1]; j = +g[2]; }
    else { j = +g[0]; m = +g[1]; a = g[2].length <= 2 ? 2000 + +g[2] : +g[2]; }
  } else return null;
  if (!(a >= 1990 && a <= 2100 && m >= 1 && m <= 12 && j >= 1 && j <= 31)) return null;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCMonth() !== m - 1) return null;
  return `${a}-${p2(m)}-${p2(j)}`;
}

// Texte collé depuis un tableur : une opération par ligne, « date  montant » (tabulation, point-virgule ou espace).
export function analyserColle(texte) {
  const lignes = [];
  for (const brut of String(texte || "").split(/\r?\n/)) {
    const l = brut.trim();
    if (!l) continue;
    let champs = l.split(/[\t;]+/).map((x) => x.trim()).filter((x) => x !== "");
    if (champs.length < 2) {
      const m = l.match(/^(\S+)\s+(.+)$/);
      if (!m) continue;
      champs = [m[1], m[2]];
    }
    const [date, montant] = champs;
    if (!/\d/.test(date) || !/\d/.test(montant)) continue; // en-têtes ignorés
    lignes.push({ date, montant: montant.replace(/[\s  €]/g, "") });
  }
  return lignes;
}

// Transforme les lignes saisies : { valides: [{i, date, montant(centimes, absolu)}], invalides: [i], vides: [i] }
export function preparerLignes(lignes, aujourdhui) {
  const valides = [], invalides = [], vides = [];
  lignes.forEach((l, i) => {
    const d = String(l.date || "").trim(), m = String(l.montant || "").trim();
    if (!d && !m) { vides.push(i); return; }
    const date = analyserDate(d, aujourdhui), c = versCentimes(m);
    if (!date || c === null || c === 0) invalides.push(i);
    else valides.push({ i, date, montant: Math.abs(c) });
  });
  return { valides, invalides, vides };
}

// Lignes valides déjà présentes (même compte, même nom, même date, même montant absolu).
export function doublonsProbables(operations, compteId, nom, valides, sens) {
  const cle = (date, montant) => `${date}|${montant}`;
  const n = sansAccent(nom).trim();
  const existants = new Set(operations.filter((o) => o.compteId === compteId && o.statut !== "annule" && sansAccent(o.nom).trim() === n).map((o) => cle(o.date, o.montant)));
  return new Set(valides.filter((v) => existants.has(cle(v.date, sens * v.montant))).map((v) => v.i));
}
