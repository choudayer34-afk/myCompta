import { etat, pret, lot } from "./store.js";
import { aujourdhui } from "./format.js";
import { h, modale } from "./ui.js";
import { calculerBudget, alertesBudget } from "./budget.js";
import { comptesEnRetard } from "./activite.js";

// Bandeau d'alerte et pastille sur l'onglet Budgets (mois en cours, comptes suivis).
let masque = "";   // alertes déjà fermées (jusqu'à ce qu'elles changent)

export function alertesDuMois() {
  if (!pret() || !etat.budgets.length) return [];
  const suivis = ((etat.reglages.find((r) => r.id === "budget") || {}).comptesIds || []).filter((i) => etat.comptes.some((c) => c.id === i));
  const r = calculerBudget({ categories: etat.categories, operations: etat.operations, planifiees: etat.planifiees, comptes: etat.comptes,
    budgets: etat.budgets, comptesIds: suivis, mois: aujourdhui().slice(0, 7), aujourdhui: aujourdhui() });
  return alertesBudget(r);
}

function nomCategorie(id) {
  const c = etat.categories.find((x) => x.id === id);
  return c ? (c.icone ? c.icone + " " : "") + c.nom : "Catégorie";
}

export function texteAlertes(alertes) {
  const d = alertes.filter((a) => a.niveau === "depasse"), p = alertes.filter((a) => a.niveau === "proche");
  const parties = [];
  if (d.length) parties.push(`Dépassé : ${d.map((a) => `${nomCategorie(a.categorieId)} (${a.pourcent} %)`).join(", ")}`);
  if (p.length) parties.push(`Proche du plafond : ${p.map((a) => `${nomCategorie(a.categorieId)} (${a.pourcent} %)`).join(", ")}`);
  return parties.join(" · ");
}

// bandeau : élément du bandeau ; onglet : lien « Budgets » ; surBudgets : l'écran Budgets est affiché
export function majAlertes(bandeau, onglet, surBudgets) {
  const a = alertesDuMois();
  const niveau = a.some((x) => x.niveau === "depasse") ? "rouge" : a.length ? "orange" : "";
  onglet.classList.toggle("alerte-rouge", niveau === "rouge");
  onglet.classList.toggle("alerte-orange", niveau === "orange");
  const signature = a.map((x) => x.categorieId + x.niveau).join("|");
  const afficher = a.length > 0 && !surBudgets && signature !== masque;
  bandeau.classList.toggle("cache", !afficher);
  bandeau.classList.toggle("rouge", niveau === "rouge");
  if (afficher) bandeau.replaceChildren(
    h("span", {}, texteAlertes(a)),
    h("span", { class: "rappel-actions" },
      h("a", { href: "#/budgets" }, "Voir"),
      h("button", { type: "button", class: "sec", "aria-label": "Masquer", onclick: () => { masque = signature; bandeau.classList.add("cache"); } }, "✕")));
  return a;
}

// Rappel de pointage : comptes ayant des opérations à pointer et aucun pointage depuis plus d'une semaine.
let masquePointage = "";
export function majPointage(bandeau, onglet) {
  const retard = pret() ? comptesEnRetard(etat.comptes, etat.operations, aujourdhui(), 7) : [];
  const signature = aujourdhui() + "|" + retard.map((x) => x.compte.id).join(",");
  const afficher = retard.length > 0 && signature !== masquePointage;
  bandeau.classList.toggle("cache", !afficher);
  if (afficher) bandeau.replaceChildren(
    h("span", {}, "À pointer depuis plus d'une semaine : " + retard.map((x) => `${x.compte.nom} (${x.dernierPointage ? `dernier pointage il y a ${x.depuis} j` : "jamais pointé"}, ${x.nb} à pointer)`).join(" · ")),
    h("span", { class: "rappel-actions" },
      h("a", { href: "#/comptes" }, "Voir"),
      h("button", { type: "button", class: "sec", "aria-label": "Masquer", onclick: () => { masquePointage = signature; bandeau.classList.add("cache"); } }, "✕")));
  return retard;
}

// Pastille chiffrée sur l'onglet Comptes : opérations « en cours » (à pointer) des comptes choisis.
// Sans choix enregistré : tous les comptes courants actifs.
export function comptesPastille() {
  const r = etat.reglages.find((x) => x.id === "pastille");
  const actifs = etat.comptes.filter((c) => !c.archive);
  if (!r || !Array.isArray(r.comptesIds)) return actifs.filter((c) => c.type === "courant").map((c) => c.id);
  return r.comptesIds.filter((i) => actifs.some((c) => c.id === i));
}
export const nombreAPointer = () => {
  const ids = new Set(comptesPastille());
  return etat.operations.filter((o) => ids.has(o.compteId) && o.statut === "encours").length;
};
export function majPastille(onglet, enRetard = false) {
  let badge = onglet.querySelector(".pastille");
  if (!badge) { badge = h("span", { class: "pastille cache", "aria-hidden": "true" }); onglet.append(badge); }
  const n = pret() ? nombreAPointer() : 0;
  badge.textContent = n > 99 ? "99+" : String(n);
  badge.classList.toggle("cache", n === 0);
  badge.classList.toggle("retard", n > 0 && enRetard);
  onglet.setAttribute("aria-label", n ? `Comptes, ${n} opération(s) à pointer` : "Comptes");
}

// Choix des comptes comptés dans la pastille
export function formPastille() {
  const choisis = new Set(comptesPastille());
  const actifs = etat.comptes.filter((c) => !c.archive);
  const cases = actifs.map((c) => {
    const i = h("input", { type: "checkbox", checked: choisis.has(c.id) || null });
    i.dataset.id = c.id;
    return h("label", { class: "case" }, i, c.nom);
  });
  const corps = h("div", {},
    h("p", { class: "note" }, "La pastille de l'onglet Comptes affiche le nombre d'opérations à pointer sur les comptes cochés. Aucun compte coché : pas de pastille."),
    ...cases,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Enregistrer"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Pastille des comptes à pointer", corps);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const ids = [...corps.querySelectorAll("input[type=checkbox]")].filter((i) => i.checked).map((i) => i.dataset.id);
    const l = lot(); l.set("reglages", "pastille", { comptesIds: ids }); l.envoyer();
    dialogue.close();
  });
}
