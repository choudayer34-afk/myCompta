// Évolution mensuelle et comparaison de périodes (aucun accès à Firebase ni au DOM).
import { repartitionDepenses } from "./bilancalc.js";
import { detailCategorie, bornesMois, moisDecale } from "./budget.js";

// Dépenses nettes des `nb` mois se terminant par `moisFin` (« AAAA-MM »), du plus ancien au plus récent.
// categorieId : limite à une catégorie et ses sous-catégories (le net peut alors être négatif s'il y a plus de remboursements).
export function evolutionMensuelle({ categories, operations, comptes, comptesIds = [], moisFin, nb = 12, categorieId = null }) {
  const res = [];
  for (let i = nb - 1; i >= 0; i--) {
    const mois = moisDecale(moisFin, -i);
    const [debut, fin] = bornesMois(mois);
    const realise = categorieId
      ? detailCategorie({ categories, operations, comptes, comptesIds, mois, categorieId }).total
      : repartitionDepenses({ categories, operations, comptes, comptesIds, debut, fin }).total;
    res.push({ mois, realise });
  }
  return res;
}

export function statsEvolution(serie) {
  const total = serie.reduce((s, x) => s + x.realise, 0);
  const moyenne = serie.length ? Math.round(total / serie.length) : 0;
  const max = serie.reduce((m, x) => (x.realise > m.realise ? x : m), serie[0] || { mois: "", realise: 0 });
  return { total, moyenne, max };
}

// Compare deux périodes [debut, fin] poste par poste (catégories principales). Écart = B − A.
// Retourne { lignes: [{ categorieId, a, b, ecart, pct }] (plus fort écart absolu d'abord), totalA, totalB, ecart, pct }
export function comparerPeriodes({ categories, operations, comptes, comptesIds = [], a, b }) {
  const ra = repartitionDepenses({ categories, operations, comptes, comptesIds, debut: a[0], fin: a[1] });
  const rb = repartitionDepenses({ categories, operations, comptes, comptesIds, debut: b[0], fin: b[1] });
  const vals = new Map();
  for (const p of ra.postes) vals.set(p.categorieId, { a: p.realise, b: 0 });
  for (const p of rb.postes) vals.set(p.categorieId, { a: (vals.get(p.categorieId) || { a: 0 }).a, b: p.realise });
  const pct = (x, y) => (x > 0 ? Math.round(((y - x) / x) * 1000) / 10 : null);
  const lignes = [...vals].map(([categorieId, v]) => ({ categorieId, a: v.a, b: v.b, ecart: v.b - v.a, pct: pct(v.a, v.b) }))
    .sort((x, y) => Math.abs(y.ecart) - Math.abs(x.ecart) || y.b - x.b);
  return { lignes, totalA: ra.total, totalB: rb.total, ecart: rb.total - ra.total, pct: pct(ra.total, rb.total) };
}
