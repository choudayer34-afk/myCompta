// Calculs purs (sans Firebase) : soldes et tri des opérations.
import { sansAccent } from "./format.js";
const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : typeof t === "number" ? t : 0);

// Tri chronologique : date, puis ordre de création, puis identifiant
export function cleTri(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const d = ms(a.cree) - ms(b.cree);
  if (d !== 0) return d;
  return a.id < b.id ? -1 : 1;
}

// Une opération annulée n'est pas comptée dans les soldes.
export function soldeCompte(compte, operations) {
  let s = compte.soldeInitial || 0;
  for (const o of operations) if (o.compteId === compte.id && o.statut !== "annule") s += o.montant;
  return s;
}

// Opérations du compte, de la plus ancienne à la plus récente, avec le solde après chacune.
export function lignesAvecSolde(compte, operations) {
  const liste = operations.filter((o) => o.compteId === compte.id).sort(cleTri);
  let s = compte.soldeInitial || 0;
  return liste.map((o) => {
    if (o.statut !== "annule") s += o.montant;
    return { ...o, solde: s };
  });
}

// Solde « pointé » : solde initial + opérations pointées uniquement.
export function soldePointe(compte, operations) {
  let s = compte.soldeInitial || 0;
  for (const o of operations) if (o.compteId === compte.id && o.statut === "pointe") s += o.montant;
  return s;
}

// Solde initial à enregistrer pour que le solde « en cours » du compte soit égal à `cibleEnCours`.
export function recalerSoldeInitial(compte, operations, cibleEnCours) {
  return cibleEnCours - (soldeCompte(compte, operations) - (compte.soldeInitial || 0));
}

// Habitudes de saisie d'un compte : les opérations (par nom) les plus fréquentes, pour la saisie rapide.
// Exclut les annulées, les virements, les opérations créées par une planification et les noms de `exclus`.
export function habitudes(compteId, operations, aujourdhui, exclus = new Set(), max = 5) {
  const d = new Date(aujourdhui + "T12:00:00");
  d.setFullYear(d.getFullYear() - 1);
  const limite = d.toISOString().slice(0, 10);
  const groupes = new Map();
  for (const o of operations) {
    if (o.compteId !== compteId || o.statut === "annule" || o.virementId || o.planifieeId || !o.montant) continue;
    const cle = sansAccent(o.nom).trim();
    if (!cle || exclus.has(cle)) continue;
    let g = groupes.get(cle);
    if (!g) { g = { nb: 0, recentes: 0, derniere: o }; groupes.set(cle, g); }
    g.nb++;
    if (o.date >= limite) g.recentes++;
    if (cleTri(o, g.derniere) > 0) g.derniere = o;
  }
  return [...groupes.values()]
    .filter((g) => g.nb >= 2)
    .sort((a, b) => b.recentes - a.recentes || b.nb - a.nb || cleTri(b.derniere, a.derniere))
    .slice(0, max)
    .map((g) => ({
      nom: g.derniere.nom, categorieId: g.derniere.categorieId || null, nature: g.derniere.nature || "autre",
      info: g.derniere.info || "", aExporter: !!g.derniere.aExporter, sens: g.derniere.montant > 0 ? 1 : -1, dernierMontant: g.derniere.montant, nb: g.nb
    }));
}

// Part de l'utilisateur dans un compte (compte joint : 50 %, etc.). Par défaut 100 %.
export const partCompte = (c) => (Number.isFinite(c.part) ? Math.min(100, Math.max(0, c.part)) : 100);

// Totaux des comptes actifs : « ma part » (comptes joints au prorata) et total brut.
export function totauxComptes(comptes, operations) {
  const t = { enCours: 0, pointe: 0, brutEnCours: 0, brutPointe: 0, partiels: [] };
  for (const c of comptes) {
    if (c.archive) continue;
    const ec = soldeCompte(c, operations), po = soldePointe(c, operations), part = partCompte(c);
    t.brutEnCours += ec; t.brutPointe += po;
    t.enCours += Math.round(ec * part / 100); t.pointe += Math.round(po * part / 100);
    if (part < 100) t.partiels.push({ nom: c.nom, part });
  }
  return t;
}

// Modification en masse : champ ∈ categorie | export | statut | nature | compte.
// Les virements liés ne changent ni de catégorie, ni de nature, ni de compte (ils sont comptés dans `ignorees`).
export function modificationsMasse(operations, champ, valeur, jour) {
  const ecritures = [];
  let ignorees = 0;
  for (const o of operations) {
    let d;
    if (champ === "export") d = { aExporter: valeur === true || valeur === "1" };
    else if (champ === "statut") d = { statut: valeur, datePointage: valeur === "pointe" ? (o.datePointage || jour) : null };
    else if (o.virementId) { ignorees++; continue; }
    else if (champ === "categorie") d = { categorieId: valeur || null };
    else if (champ === "nature") d = { nature: valeur };
    else if (champ === "compte") { if (o.compteId === valeur) { ignorees++; continue; } d = { compteId: valeur }; }
    else continue;
    ecritures.push(["operations", o.id, d]);
  }
  return { ecritures, ignorees };
}
