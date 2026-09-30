// Suggestion de catégorie d'après le nom saisi (aucun accès à Firebase ni au DOM).
// Principe : les mots du nom sont comparés à ceux des opérations déjà classées (les mots rares comptent davantage)
// et à l'aide-mémoire de chaque catégorie (champ « memo »).
import { normaliser } from "./noms.js";

const MOTS_VIDES = new Set(["les", "des", "une", "pour", "par", "sur", "avec", "dans", "the", "cb", "carte", "paiement", "prelevement", "virement", "vir", "prlv", "achat"]);
export function mots(texte) {
  return [...new Set(normaliser(texte).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((m) => m.length >= 3 && !/\d/.test(m) && !MOTS_VIDES.has(m)))];
}

// Retourne [{ categorieId, score }] (meilleures d'abord), au plus `max`.
export function suggererCategories(nom, operations, categories, max = 3) {
  const requete = mots(nom);
  if (!requete.length) return [];
  const actives = new Map(categories.filter((c) => !c.archive).map((c) => [c.id, c]));
  // Corpus : chaque opération classée, et chaque aide-mémoire
  const docs = [];
  const vus = new Set();
  for (const o of operations) {
    if (!o.categorieId || !actives.has(o.categorieId) || o.virementId || o.nature === "virement" || o.statut === "annule") continue;
    const cle = o.categorieId + "|" + normaliser(o.nom);
    if (vus.has(cle)) { docs.find((d) => d.cle === cle).poids++; continue; }
    vus.add(cle);
    docs.push({ cle, categorieId: o.categorieId, m: new Set(mots(o.nom)), poids: 1 });
  }
  for (const c of actives.values()) if (c.memo) docs.push({ cle: "memo|" + c.id, categorieId: c.id, m: new Set([...mots(c.memo), ...mots(c.nom)]), poids: 2, memo: true });
  if (!docs.length) return [];
  const df = new Map();
  for (const d of docs) for (const m of d.m) df.set(m, (df.get(m) || 0) + 1);
  const idf = (m) => Math.log(1 + docs.length / (df.get(m) || 1));
  const totalReq = requete.reduce((s, m) => s + idf(m), 0);
  const scores = new Map();
  for (const d of docs) {
    const commun = requete.filter((m) => d.m.has(m)).reduce((s, m) => s + idf(m), 0);
    if (!commun) continue;
    const sim = commun / totalReq;
    scores.set(d.categorieId, (scores.get(d.categorieId) || 0) + sim * sim * Math.min(d.poids, 5));
  }
  return [...scores].map(([categorieId, score]) => ({ categorieId, score })).sort((a, b) => b.score - a.score).slice(0, max);
}
