import { etat, pret, lot, categoriesTriees } from "./store.js";
import { euros, versCentimes, versSaisie, aujourdhui } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { calculerBudget, moisDecale } from "./budget.js";

const moisTexte = (ym) => {
  const t = new Date(ym + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const comptesSuivis = () => ((etat.reglages.find((r) => r.id === "budget") || {}).comptesIds || []).filter((i) => etat.comptes.some((c) => c.id === i));
const etiquette = (id) => {
  if (!id) return "Sans catégorie";
  const c = categoriesTriees(true).find((x) => x.id === id);
  return c ? (c.icone ? c.icone + " " : "") + c.libelle : "Catégorie supprimée";
};
const couleur = (ratio) => (ratio > 1 ? "rouge" : ratio > 0.8 ? "orange" : "vert");

function barre(l) {
  const base = Math.max(l.budget, l.realise + l.prevu, 1);
  const r = Math.max(0, Math.min(100, (l.realise / base) * 100));
  const p = Math.max(0, Math.min(100 - r, (l.prevu / base) * 100));
  return h("div", { class: "barre-budget " + couleur(l.ratio), role: "img", "aria-label": `${Math.round(l.ratio * 100)} % du budget` },
    h("span", { class: "reel", style: `width:${r}%` }), h("span", { class: "prevu", style: `width:${p}%` }));
}

function formBudget(categorieId = null) {
  const existant = categorieId && etat.budgets.find((b) => b.id === categorieId);
  const libres = categoriesTriees().filter((c) => !etat.budgets.some((b) => b.id === c.id));
  const iCat = categorieId ? null : selecteur([["", "— choisir une catégorie —"], ...libres.map((c) => [c.id, (c.icone ? c.icone + " " : "") + c.libelle])], "");
  const iMontant = h("input", { type: "text", inputmode: "decimal", required: true, placeholder: "0,00", autocomplete: "off", value: existant ? versSaisie(existant.montant) : "" });
  const erreur = h("p", { class: "erreur" });
  const corps = h("div", {},
    categorieId ? h("p", {}, h("strong", {}, etiquette(categorieId))) : champ("Catégorie", iCat),
    champ("Plafond mensuel (€)", iMontant),
    h("p", { class: "note" }, "Ce plafond s'applique chaque mois et inclut les sous-catégories."),
    erreur,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Enregistrer"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"),
      existant && h("button", { type: "button", class: "danger", onclick: () => {
        const l = lot(); l.del("budgets", categorieId); l.envoyer(); dialogue.close();
      } }, "Supprimer")));
  const { dialogue, formulaire } = modale(existant ? "Modifier le budget" : "Nouveau budget", corps);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = categorieId || iCat.value;
    const m = versCentimes(iMontant.value);
    if (!id) { erreur.textContent = "Choisissez une catégorie."; return; }
    if (m == null || m <= 0) { erreur.textContent = "Saisissez un montant supérieur à zéro."; return; }
    const l = lot(); l.set("budgets", id, { montant: Math.abs(m) }); l.envoyer();
    dialogue.close();
  });
}

function formComptes() {
  const suivis = new Set(comptesSuivis());
  const actifs = etat.comptes.filter((c) => !c.archive);
  const cases = actifs.map((c) => {
    const i = h("input", { type: "checkbox", checked: suivis.has(c.id) || null });
    i.dataset.id = c.id;
    return h("label", { class: "case" }, i, c.nom);
  });
  const corps = h("div", {},
    h("p", { class: "note" }, "Les dépenses de ces comptes comptent dans les budgets. Si aucun n'est coché, tous les comptes actifs sont suivis."),
    ...cases,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Enregistrer"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Comptes suivis", corps);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const ids = [...corps.querySelectorAll("input[type=checkbox]")].filter((i) => i.checked).map((i) => i.dataset.id);
    const l = lot(); l.set("reglages", "budget", { comptesIds: ids }); l.envoyer();
    dialogue.close();
  });
}

export function monter(conteneur) {
  let mois = aujourdhui().slice(0, 7);
  const titre = h("strong", { class: "mois-budget" });
  const nav = h("div", { class: "nav-mois" },
    h("button", { type: "button", class: "sec", "aria-label": "Mois précédent", onclick: () => { mois = moisDecale(mois, -1); maj(); } }, "‹"),
    titre,
    h("button", { type: "button", class: "sec", "aria-label": "Mois suivant", onclick: () => { mois = moisDecale(mois, 1); maj(); } }, "›"));
  const corps = h("div", {});
  conteneur.replaceChildren(h("div", { class: "entete-vue" }, h("strong", { class: "titre-vue" }, "Budgets"),
    h("button", { type: "button", class: "sec", onclick: () => pret() && formComptes() }, "Comptes suivis")), nav, corps);

  function maj() {
    titre.textContent = moisTexte(mois);
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const r = calculerBudget({ categories: etat.categories, operations: etat.operations, planifiees: etat.planifiees, comptes: etat.comptes,
      budgets: etat.budgets, comptesIds: comptesSuivis(), mois, aujourdhui: aujourdhui() });
    const noeuds = [];
    if (r.lignes.length) {
      const reste = r.totalBudget - r.totalRealise;
      const ratioTotal = r.totalBudget > 0 ? (r.totalRealise + r.totalPrevu) / r.totalBudget : 0;
      noeuds.push(h("div", { class: "carte synthese-budget" },
        h("div", { class: "ligne-synthese" }, h("span", {}, "Budget"), h("strong", {}, euros(r.totalBudget))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Dépensé"), h("strong", {}, euros(r.totalRealise))),
        r.totalPrevu ? h("div", { class: "ligne-synthese" }, h("span", {}, "Prévu (échéances à venir)"), h("strong", {}, euros(r.totalPrevu))) : null,
        barre({ budget: r.totalBudget, realise: r.totalRealise, prevu: r.totalPrevu, ratio: ratioTotal }),
        h("p", { class: "reste-budget " + (reste < 0 ? "neg" : "pos") }, reste < 0 ? `Dépassement ${euros(-reste)}` : `Reste ${euros(reste)}`)));
      for (const l of r.lignes) {
        const apres = l.budget - l.realise - l.prevu;
        noeuds.push(h("button", { type: "button", class: "carte ligne-budget", onclick: () => formBudget(l.categorieId) },
          h("div", { class: "haut-budget" }, h("span", { class: "nom-budget" }, etiquette(l.categorieId)), h("span", { class: "montants-budget" }, `${euros(l.realise)} / ${euros(l.budget)}`)),
          barre(l),
          h("small", { class: apres < 0 ? "neg" : "" },
            (l.reste < 0 ? `Dépassement ${euros(-l.reste)}` : `Reste ${euros(l.reste)}`) + (l.prevu ? ` · prévu ${euros(l.prevu)}` : ""))));
      }
    } else {
      noeuds.push(h("p", { class: "vide" }, "Aucun budget. Ajoutez un plafond mensuel pour une catégorie."));
    }
    noeuds.push(h("button", { type: "button", class: "ajout-budget", onclick: () => formBudget() }, "+ Ajouter une catégorie"));
    if (r.hors.length) {
      noeuds.push(h("h3", { class: "groupe" }, `Hors budget · ${euros(r.horsTotal)}`));
      for (const x of r.hors) {
        const cliquable = !!x.categorieId && etat.categories.some((c) => c.id === x.categorieId);
        noeuds.push(h(cliquable ? "button" : "div", { type: cliquable ? "button" : null, class: "carte ligne-hors", onclick: cliquable ? () => formBudget(x.categorieId) : null },
          h("span", {}, etiquette(x.categorieId)), h("strong", {}, euros(x.realise))));
      }
    }
    corps.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
