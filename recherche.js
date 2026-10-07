// Recherche dans les opérations de tous les comptes (aucun accès à Firebase ni au DOM).
import { sansAccent, euros, dateFr } from "./format.js";

export function libelleCategorie(categorieId, categories) {
  const parId = new Map(categories.map((c) => [c.id, c]));
  const c = parId.get(categorieId);
  if (!c) return "";
  const p = c.parentId && parId.get(c.parentId);
  return p ? `${p.nom} › ${c.nom}` : c.nom;
}

// Tous les mots saisis doivent apparaître (nom, commentaire, info, catégorie, compte, montant, date).
// Retourne { lignes (récentes d'abord), total (hors annulées), nb }
export function rechercher({ operations, comptes, categories, texte, compteId = "" }) {
  const q = sansAccent(texte).trim();
  if (!q) return { lignes: [], total: 0, nb: 0 };
  const nomCompte = new Map(comptes.map((c) => [c.id, c.nom]));
  const mots = q.split(/\s+/);
  const lignes = operations.filter((o) => {
    if (compteId && o.compteId !== compteId) return false;
    const cible = sansAccent([o.nom, o.commentaire, o.info, libelleCategorie(o.categorieId, categories), nomCompte.get(o.compteId), euros(o.montant), dateFr(o.date)].join(" "));
    return mots.every((m) => cible.includes(m));
  }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));
  return { lignes, total: lignes.filter((o) => o.statut !== "annule").reduce((s, o) => s + o.montant, 0), nb: lignes.length };
}
