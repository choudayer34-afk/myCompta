// Corriger les opérations déjà créées par une échéance : supprimer, appliquer une modification, recaler les dates.
// Seules les opérations non pointées (statut « en cours ») sont concernées : une opération pointée n'est jamais touchée.
import { etat } from "./store.js";
import { h } from "./ui.js";
import { montantEcheance } from "./planning.js";
import { dateFr, aujourdhui } from "./format.js";

export const opsNonPointees = (planId) => (planId ? etat.operations.filter((o) => o.planifieeId === planId && o.statut === "encours") : []);
// Nombre d'opérations pour l'utilisateur : un virement (deux opérations liées) compte pour une.
export const compterOps = (ops) => ops.filter((o) => !o.virementId || o.virementId === o.id).length;

export function supprimerOps(l, ops) { for (const o of ops) l.del("operations", o.id); }

// Reporte nom, montant et catégorie de l'échéance (`planif` : données complètes avec id) sur ces opérations.
export function appliquerAuxOps(l, planif, ops) {
  for (const o of ops) {
    const mt = montantEcheance(planif, o.date);
    const champs = { nom: planif.nom };
    if (planif.virementCompteId) champs.montant = o.virementId === o.id ? -Math.abs(mt) : Math.abs(mt);   // 1re opération du virement = côté source
    else { champs.montant = mt; champs.categorieId = planif.categorieId || null; }
    l.set("operations", o.id, champs);
  }
}

// Supprime les opérations non pointées à partir de `depuis` ; l'appli les recrée seule avec la prochaine échéance enregistrée.
export function recaler(l, planId, depuis) {
  const ops = opsNonPointees(planId).filter((o) => o.date >= depuis);
  supprimerOps(l, ops);
  return ops;
}

// Bloc « Corriger aussi les opérations déjà créées » (formulaire de modification). Retourne { noeud, valeurs() } ; noeud est null s'il n'y a rien à corriger.
export function blocCorrections(planId) {
  const ops = opsNonPointees(planId);
  const nb = compterOps(ops);
  if (!nb) return { noeud: null, valeurs: () => ({ appliquer: false, recaler: false, depuis: "" }) };
  const premiere = ops.map((o) => o.date).sort()[0] || aujourdhui();
  const cAppliquer = h("input", { type: "checkbox" });
  const cRecaler = h("input", { type: "checkbox" });
  const iDepuis = h("input", { type: "date", value: premiere, "aria-label": "Recaler à partir du" });
  const noeud = h("details", { class: "corrections" }, h("summary", {}, `Corriger aussi les ${nb} opération(s) déjà créée(s) non pointée(s)`),
    h("label", { class: "case" }, cAppliquer, "Appliquer le montant, le nom et la catégorie à ces opérations"),
    h("label", { class: "case" }, cRecaler, "Recaler : supprimer ces opérations à partir du…"),
    iDepuis,
    h("p", { class: "note" }, "Recaler les recrée avec les dates de la prochaine échéance indiquée plus haut. Les opérations pointées ne sont jamais touchées."));
  return { noeud, valeurs: () => ({ appliquer: cAppliquer.checked, recaler: cRecaler.checked, depuis: iDepuis.value }) };
}

// Case « Supprimer aussi les opérations non pointées » (à côté du bouton Supprimer).
export function caseSuppression(planId) {
  const ops = opsNonPointees(planId);
  const nb = compterOps(ops);
  if (!nb) return { noeud: null, coche: () => false, ops, nb };
  const c = h("input", { type: "checkbox" });
  return { noeud: h("label", { class: "case" }, c, `Supprimer aussi les ${nb} opération(s) non pointée(s) déjà créée(s)`), coche: () => c.checked, ops, nb };
}
