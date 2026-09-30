// Clôture de mois : rapprochement d'un compte avec son relevé (aucun accès à Firebase ni au DOM).
import { bornesMois, moisDecale } from "./budget.js";

// Date de fin proposée : fin du mois suivant la dernière clôture, sinon fin du mois précédent.
export function finProposee(compte, aujourdhui) {
  const ym = compte.derniereCloture ? moisDecale(compte.derniereCloture.slice(0, 7), 1) : moisDecale(aujourdhui.slice(0, 7), -1);
  return bornesMois(ym)[1];
}

// Base = solde initial + opérations déjà pointées datées au plus tard de `fin`.
// Candidates = opérations « en cours » datées au plus tard de `fin` (les plus anciennes d'abord).
export function preparerRapprochement(compte, operations, fin) {
  const propres = operations.filter((o) => o.compteId === compte.id && o.statut !== "annule" && o.date <= fin);
  const base = (compte.soldeInitial || 0) + propres.filter((o) => o.statut === "pointe").reduce((s, o) => s + o.montant, 0);
  const candidates = propres.filter((o) => o.statut !== "pointe").sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  return { base, candidates };
}

// selection : Set d'identifiants d'opérations à pointer. soldeReleve : centimes.
// ecart = solde du relevé − solde pointé projeté (0 = en accord).
export function evaluerRapprochement({ base, candidates }, selection, soldeReleve) {
  const choisies = candidates.filter((o) => selection.has(o.id));
  const projete = base + choisies.reduce((s, o) => s + o.montant, 0);
  const ecart = soldeReleve - projete;
  let indice = null;
  if (ecart !== 0) {
    // Une opération cochée en trop fausse l'écart de son montant ; une opération oubliée aussi.
    const enTrop = choisies.find((o) => o.montant === -ecart);
    const oubliee = candidates.find((o) => !selection.has(o.id) && o.montant === ecart);
    if (enTrop) indice = { type: "decocher", op: enTrop };
    else if (oubliee) indice = { type: "cocher", op: oubliee };
  }
  return { projete, ecart, nb: choisies.length, indice };
}
