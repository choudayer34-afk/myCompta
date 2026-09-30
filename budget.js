// Calculs des budgets (aucun accès à Firebase ni au DOM).
import { partCompte } from "./calc.js";
import { echeancesDues, estTerminee } from "./planning.js";

const p2 = (n) => String(n).padStart(2, "0");

// « 2026-09 » -> [« 2026-09-01 », « 2026-09-30 »]
export function bornesMois(ym) {
  const [a, m] = ym.split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return [`${a}-${p2(m)}-01`, `${a}-${p2(m)}-${p2(dernier)}`];
}
export function moisDecale(ym, n) {
  const [a, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}`;
}

// Identifiants de la catégorie et de toutes ses sous-catégories
export function avecDescendants(categories, id) {
  const r = new Set([id]);
  let ajout = true;
  while (ajout) {
    ajout = false;
    for (const c of categories) if (c.parentId && r.has(c.parentId) && !r.has(c.id)) { r.add(c.id); ajout = true; }
  }
  return r;
}

// budgets : [{ id (= categorieId), montant (centimes, plafond du mois) }]
// comptesIds : comptes suivis (vide = tous les comptes actifs)
// Le « réalisé » compte les dépenses nettes (les remboursements viennent en déduction), hors virements et opérations annulées,
// au prorata de la part de l'utilisateur dans chaque compte. Le « prévu » ajoute les échéances à venir du mois non encore créées.
export function calculerBudget({ categories, operations, planifiees, comptes, budgets, comptesIds = [], mois, aujourdhui }) {
  const [debut, fin] = bornesMois(mois);
  const suivis = new Map(comptes.filter((c) => (comptesIds.length ? comptesIds.includes(c.id) : !c.archive)).map((c) => [c.id, c]));
  const valeur = (montant, compteId) => -Math.round(montant * partCompte(suivis.get(compteId)) / 100);

  const reel = new Map(), prevu = new Map();   // categorieId|null -> centimes
  const ajouter = (m, cle, v) => m.set(cle, (m.get(cle) || 0) + v);
  for (const o of operations) {
    if (!suivis.has(o.compteId) || o.date < debut || o.date > fin || o.statut === "annule" || o.virementId || o.nature === "virement") continue;
    ajouter(reel, o.categorieId || null, valeur(o.montant, o.compteId));
  }
  for (const p of planifiees) {
    if (!suivis.has(p.compteId) || p.virementCompteId || p.nature === "virement" || estTerminee(p)) continue;
    const dates = echeancesDues(p, fin).dates.filter((d) => d >= debut && d > aujourdhui);
    if (dates.length) ajouter(prevu, p.categorieId || null, dates.length * valeur(p.montant, p.compteId));
  }

  const budgetees = new Set(budgets.map((b) => b.id));
  const somme = (m, ids) => { let s = 0; for (const id of ids) s += m.get(id) || 0; return s; };
  const couvertes = new Set();
  const lignes = budgets.map((b) => {
    const ids = avecDescendants(categories, b.id);
    ids.forEach((i) => couvertes.add(i));
    const realise = somme(reel, ids), prev = somme(prevu, ids);
    return { categorieId: b.id, budget: b.montant, realise, prevu: prev, reste: b.montant - realise, ratio: b.montant > 0 ? (realise + prev) / b.montant : 0 };
  }).sort((a, b) => b.ratio - a.ratio);

  // Total : uniquement les budgets qui ne sont pas inclus dans le budget d'une catégorie parente
  const ancetreBudgete = (id) => { const c = categories.find((x) => x.id === id); return !!(c && c.parentId && (budgetees.has(c.parentId) || ancetreBudgete(c.parentId))); };
  const racines = lignes.filter((l) => !ancetreBudgete(l.categorieId));
  const totalBudget = racines.reduce((s, l) => s + l.budget, 0);
  const totalRealise = racines.reduce((s, l) => s + l.realise, 0);
  const totalPrevu = racines.reduce((s, l) => s + l.prevu, 0);

  // Dépenses hors budget (catégories non couvertes), de la plus forte à la plus faible
  const hors = [];
  for (const [cle, v] of reel) if (!(cle && couvertes.has(cle)) && v !== 0) hors.push({ categorieId: cle, realise: v });
  hors.sort((a, b) => b.realise - a.realise);
  return { lignes, totalBudget, totalRealise, totalPrevu, hors, horsTotal: hors.reduce((s, x) => s + x.realise, 0) };
}
