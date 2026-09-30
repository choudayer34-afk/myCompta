// Analyse du texte lu sur un ticket de caisse ou de carte bancaire (aucun accès au DOM ni à Firebase).
import { analyserDate } from "./saisie.js";
import { normaliser } from "./noms.js";

// « 1 234,56 », « 12.50 », « 1.234,56 » -> centimes (2 décimales obligatoires)
function versCentimesTicket(s) {
  let t = s.replace(/\s/g, "");
  const m = t.match(/^(\d[\d.,]*?)[.,](\d{2})$/);
  if (!m) return null;
  const entier = m[1].replace(/[.,]/g, "");
  if (!/^\d+$/.test(entier)) return null;
  return parseInt(entier, 10) * 100 + parseInt(m[2], 10);
}

const RE_MONTANT = /(?<![\d.,])(\d{1,3}(?:[ .]\d{3})*|\d+)[.,]\d{2}(?![\d])/g;
const MOTS_TOTAL = /\b(total|a payer|net a payer|montant|cb|carte|paiement|payer|reglement|debit)\b/;
const MOTS_EXCLUS = /\b(tva|rendu|monnaie|sous ?total|remise|economie|espece|especes|ht|taxe|cumul|fidelite|points?)\b/;
const MOTS_NON_NOM = /(ticket|facture|tel|tél|telephone|siret|siren|www|http|adresse|merci|bienvenue|caisse|client|date|heure|n°|code|rue|avenue|boulevard|cedex|fax|tva|rcs)/i;

function montantsDeLigne(l) {
  const r = [];
  for (const m of l.matchAll(RE_MONTANT)) { const c = versCentimesTicket(m[0]); if (c !== null && c > 0) r.push(c); }
  return r;
}

// Retourne { montant (centimes, positif) | null, date (ISO), nom, commentaire, heure, carte }
export function analyserTicket(texte, aujourdhui) {
  const lignes = String(texte || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

  // Montant : priorité aux lignes « total / à payer / carte » ; sinon le montant le plus répété, sinon le plus grand
  const candidats = [];
  lignes.forEach((l, i) => {
    const n = normaliser(l);
    if (!MOTS_TOTAL.test(n) || MOTS_EXCLUS.test(n)) return;
    let ms = montantsDeLigne(l);
    if (!ms.length && lignes[i + 1] && !MOTS_EXCLUS.test(normaliser(lignes[i + 1]))) ms = montantsDeLigne(lignes[i + 1]);
    const poids = /\btotal\b|a payer/.test(n) ? 2 : 1;
    for (const c of ms) candidats.push({ c, poids });
  });
  let montant = null;
  const tous = lignes.flatMap(montantsDeLigne);
  if (candidats.length) {
    const score = new Map();
    for (const { c, poids } of candidats) score.set(c, (score.get(c) || 0) + poids);
    montant = [...score.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  } else if (tous.length) {
    const freq = new Map();
    for (const c of tous) freq.set(c, (freq.get(c) || 0) + 1);
    montant = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  }

  // Date : première date valide (jj/mm/aaaa, jj.mm.aa, jj-mm-aaaa), non postérieure à demain
  let date = null;
  for (const l of lignes) {
    for (const m of l.matchAll(/(?<!\d)(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/g)) {
      const d = analyserDate(m[0], aujourdhui);
      if (d && d <= aujourdhui.slice(0, 8) + String(Math.min(31, Number(aujourdhui.slice(8)) + 1)).padStart(2, "0")) { date = d; break; }
    }
    if (date) break;
  }

  // Commerçant : première ligne plausible parmi les premières
  let nom = "";
  for (const l of lignes.slice(0, 8)) {
    const lettres = (l.match(/[A-Za-zÀ-ÿ]/g) || []).length;
    if (lettres < 3 || lettres / l.length < 0.6 || MOTS_NON_NOM.test(l)) continue;
    nom = l.replace(/[^A-Za-zÀ-ÿ0-9&' \-]/g, " ").replace(/\s+/g, " ").trim();
    if (nom === nom.toUpperCase()) nom = nom.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (x, a, b) => a + b.toUpperCase());
    if (nom.length >= 3) break;
    nom = "";
  }

  // Autres éléments utiles pour le commentaire
  const texteComplet = lignes.join("\n");
  const heure = (texteComplet.match(/(?<!\d)([01]?\d|2[0-3])[:hH]([0-5]\d)(?!\d)/) || [])[0] || "";
  const carte = (texteComplet.match(/(?:\*{2,}|[xX]{3,}|#{2,})\s*(\d{4})/) || [])[1] || "";
  const numero = (texteComplet.match(/(?:ticket|facture|transaction|n°)\s*(?:n°|no|:|#)?\s*(\d{3,})/i) || [])[1] || "";
  const parts = ["Ticket scanné"];
  if (heure) parts.push(heure.replace(/[hH]/, ":"));
  if (carte) parts.push("CB ****" + carte);
  if (numero) parts.push("n° " + numero);
  return { montant, date: date || aujourdhui, dateTrouvee: !!date, nom, commentaire: parts.join(" · "), heure, carte, numero };
}
