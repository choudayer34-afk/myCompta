// Bilan : répartition des dépenses par catégorie sur une période (aucun accès à Firebase ni au DOM).
import { partCompte } from "./calc.js";

// Période « mois », « annee » ou libre, autour d'une date de référence « AAAA-MM-JJ ».
export function bornesPeriode(mode, ref) {
  const a = +ref.slice(0, 4), m = +ref.slice(5, 7);
  const p2 = (n) => String(n).padStart(2, "0");
  if (mode === "annee") return [`${a}-01-01`, `${a}-12-31`];
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return [`${a}-${p2(m)}-01`, `${a}-${p2(m)}-${p2(dernier)}`];
}

// Dépenses nettes (remboursements déduits) par catégorie principale, hors virements et opérations annulées,
// au prorata de la part de chaque compte. Les catégories dont le net est négatif ou nul ne figurent pas dans la répartition.
// Retourne { total, postes: [{ categorieId (principale ou null), realise, enfants: [{ categorieId, realise }] }] (décroissant), recettes }
export function repartitionDepenses({ categories, operations, comptes, comptesIds = [], debut, fin }) {
  const suivis = new Map(comptes.filter((c) => (comptesIds.length ? comptesIds.includes(c.id) : !c.archive)).map((c) => [c.id, c]));
  const parId = new Map(categories.map((c) => [c.id, c]));
  const racine = (id) => { let c = parId.get(id); if (!c) return id || null; while (c.parentId && parId.get(c.parentId)) c = parId.get(c.parentId); return c.id; };
  const net = new Map(), sous = new Map();
  let recettes = 0;
  for (const o of operations) {
    if (!suivis.has(o.compteId) || o.date < debut || o.date > fin || o.statut === "annule" || o.virementId || o.nature === "virement") continue;
    const v = -Math.round(o.montant * partCompte(suivis.get(o.compteId)) / 100);
    const r = o.categorieId ? racine(o.categorieId) : null;
    net.set(r, (net.get(r) || 0) + v);
    if (!sous.has(r)) sous.set(r, new Map());
    const s = sous.get(r); const cle = o.categorieId || null;
    s.set(cle, (s.get(cle) || 0) + v);
  }
  const postes = [];
  for (const [r, v] of net) {
    if (v > 0) postes.push({ categorieId: r, realise: v, enfants: [...sous.get(r)].filter(([, x]) => x > 0).map(([c, x]) => ({ categorieId: c, realise: x })).sort((a, b) => b.realise - a.realise) });
    else recettes -= v;
  }
  postes.sort((a, b) => b.realise - a.realise);
  return { total: postes.reduce((s, p) => s + p.realise, 0), postes, recettes };
}

// Regroupe au-delà de `max` postes dans « Autres » (catégorie « autres »).
export function pourPart(postes, max = 7) {
  if (postes.length <= max + 1) return postes.map((p) => ({ ...p }));
  const tete = postes.slice(0, max).map((p) => ({ ...p }));
  const reste = postes.slice(max);
  tete.push({ categorieId: "__autres__", realise: reste.reduce((s, p) => s + p.realise, 0), nb: reste.length, enfants: [] });
  return tete;
}
