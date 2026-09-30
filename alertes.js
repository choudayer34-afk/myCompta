import { etat, pret } from "./store.js";
import { aujourdhui } from "./format.js";
import { h } from "./ui.js";
import { calculerBudget, alertesBudget } from "./budget.js";

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
