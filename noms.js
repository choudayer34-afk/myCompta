// Noms d'opérations, recherche « contient » et association nom → catégorie (aucun accès à Firebase ni au DOM).
import { sansAccent } from "./format.js";

export const normaliser = (t) => sansAccent(t).replace(/\s+/g, " ").trim();

// Identifiant stable (16 caractères hexadécimaux) d'un nom : insensible à la casse, aux accents et aux espaces en trop.
export function cleNom(nom) {
  const s = normaliser(nom);
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

// Noms déjà utilisés (opérations et échéances), les plus fréquents d'abord : [{ nom, nb }].
// L'orthographe retenue est celle de l'occurrence la plus récente.
export function nomsConnus(operations, planifiees = []) {
  const groupes = new Map();
  const voir = (nom, date) => {
    const cle = normaliser(nom);
    if (!cle) return;
    const g = groupes.get(cle);
    if (!g) groupes.set(cle, { nom: String(nom).trim(), nb: 1, date: date || "" });
    else { g.nb++; if ((date || "") >= g.date) { g.nom = String(nom).trim(); g.date = date || ""; } }
  };
  // Les transferts entre comptes n'entrent pas dans la liste
  for (const o of operations) if (!o.virementId && o.nature !== "virement") voir(o.nom, o.date);
  for (const p of planifiees) if (!p.virementCompteId && p.nature !== "virement") voir(p.nom, "");
  return [...groupes.values()].sort((x, y) => y.nb - x.nb || x.nom.localeCompare(y.nom, "fr")).map(({ nom, nb }) => ({ nom, nb }));
}

// Filtre « contient » : tous les mots saisis doivent apparaître (sans accent, sans casse).
// Les libellés qui commencent par la saisie passent en premier. Sans saisie : les premiers éléments.
export function filtrerContient(elements, texte, libelle = (x) => x, limite = 50, ordreInitial = false) {
  const q = normaliser(texte);
  if (!q) return elements.slice(0, limite);
  const mots = q.split(" ");
  const trouves = [];
  for (const e of elements) {
    const l = normaliser(libelle(e));
    if (mots.every((m) => l.includes(m))) trouves.push({ e, debut: l.startsWith(q) ? 0 : 1 });
  }
  if (!ordreInitial) trouves.sort((x, y) => x.debut - y.debut);
  return trouves.slice(0, limite).map((t) => t.e);
}

// Association enregistrée pour ce nom (document { id, nom, categorieId }) ou null.
export function associationPour(associations, nom) {
  const id = cleNom(nom);
  return (associations || []).find((a) => a.id === id) || null;
}
