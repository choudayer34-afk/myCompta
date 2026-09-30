// Sauvegarde et restauration : fabrication, lecture et plan de restauration (aucun accès à Firebase ni au DOM).
export const COLLECTIONS = ["comptes", "categories", "operations", "planifiees", "nomsCategories", "budgets", "reglages"];
const FORMAT = "compta-sauvegarde";

// Valeur sérialisable : les horodatages Firestore deviennent des millisecondes
function simple(v) {
  if (v && typeof v.toMillis === "function") return v.toMillis();
  if (Array.isArray(v)) return v.map(simple);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, simple(x)]));
  return v;
}
function document(d) { const { id, ...reste } = d; return { id, ...Object.fromEntries(Object.entries(reste).map(([k, v]) => [k, simple(v)])) }; }

export function construireSauvegarde(etat, maintenant = new Date()) {
  const donnees = {};
  for (const c of COLLECTIONS) donnees[c] = (etat[c] || []).map(document);
  return { format: FORMAT, version: 1, date: maintenant.toISOString(), nombres: Object.fromEntries(COLLECTIONS.map((c) => [c, donnees[c].length])), donnees };
}

// Lecture et contrôle d'un fichier de sauvegarde. Retourne { ok, erreur?, sauvegarde?, resume? }
export function lireSauvegarde(texte) {
  let s;
  try { s = JSON.parse(texte); } catch (_) { return { ok: false, erreur: "Ce fichier n'est pas une sauvegarde lisible (JSON invalide)." }; }
  if (!s || s.format !== FORMAT || !s.donnees) return { ok: false, erreur: "Ce fichier n'est pas une sauvegarde de cette application." };
  if (s.version !== 1) return { ok: false, erreur: "Version de sauvegarde non prise en charge : " + s.version };
  for (const c of COLLECTIONS) {
    const l = s.donnees[c] ?? [];
    if (!Array.isArray(l)) return { ok: false, erreur: "Données invalides : " + c };
    s.donnees[c] = l;
    for (const d of l) if (!d || typeof d.id !== "string" || !d.id || d.id.includes("/")) return { ok: false, erreur: "Document sans identifiant valide dans : " + c };
  }
  // Cohérence : chaque opération doit viser un compte présent dans la sauvegarde
  const comptes = new Set(s.donnees.comptes.map((c) => c.id));
  const orphelines = s.donnees.operations.filter((o) => !comptes.has(o.compteId)).length;
  const resume = { ...Object.fromEntries(COLLECTIONS.map((c) => [c, s.donnees[c].length])), orphelines, date: s.date || "" };
  return { ok: true, sauvegarde: s, resume };
}

// Écritures à faire pour restaurer. mode : « fusion » (ajoute et met à jour, ne supprime rien)
// ou « remplacement » (supprime aussi ce qui n'est pas dans la sauvegarde).
export function planRestauration(sauvegarde, etat, mode) {
  const ecritures = [], suppressions = [];
  for (const c of COLLECTIONS) {
    const ids = new Set();
    for (const d of sauvegarde.donnees[c]) { const { id, ...reste } = d; ids.add(id); ecritures.push([c, id, reste]); }
    if (mode === "remplacement") for (const e of etat[c] || []) if (!ids.has(e.id)) suppressions.push([c, e.id]);
  }
  return { ecritures, suppressions };
}

// Toutes les opérations au format CSV pour Excel : séparateur « ; », virgule décimale, BOM UTF-8.
export function csvOperations(etat) {
  const comptes = new Map(etat.comptes.map((c) => [c.id, c.nom]));
  const cats = new Map(etat.categories.map((c) => [c.id, c]));
  const libelle = (id) => { const c = cats.get(id); if (!c) return ""; const p = c.parentId && cats.get(c.parentId); return p ? `${p.nom} > ${c.nom}` : c.nom; };
  const cel = (v) => { const t = String(v ?? "").replace(/\r?\n/g, " "); return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const montant = (c) => (c / 100).toFixed(2).replace(".", ",");
  const ent = ["Compte", "Date", "Nom", "Montant", "Catégorie", "Nature", "Statut", "Date de pointage", "Info", "Commentaire", "À exporter", "Virement"];
  const lignes = [...etat.operations].sort((a, b) => (a.compteId === b.compteId ? 0 : (comptes.get(a.compteId) || "").localeCompare(comptes.get(b.compteId) || "", "fr")) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((o) => [comptes.get(o.compteId) || "", o.date, o.nom, montant(o.montant), libelle(o.categorieId), o.nature || "", o.statut || "", o.datePointage || "", o.info || "", o.commentaire || "", o.aExporter ? "oui" : "non", o.virementId ? "oui" : ""].map(cel).join(";"));
  return "﻿" + [ent.map(cel).join(";"), ...lignes].join("\r\n") + "\r\n";
}
