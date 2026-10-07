// Écran « Économies » : confort ou essentiel, plus gros postes, hausses, abonnements.
import { etat, pret, lot } from "./store.js";
import { euros, aujourdhui, moisFr } from "./format.js";
import { h, modale, selecteur } from "./ui.js";
import { moisDecale } from "./budget.js";
import { comptesSuivis } from "./budgets.js";
import { analyseEconomies, detecterAbonnements, economieSiReduit, racines, usageSuggere, USAGES } from "./economies.js";

export function formClassement() {
  const cats = racines(etat.categories).filter((c) => !c.archive).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const selecteurs = cats.map((c) => {
    const s = selecteur(USAGES, c.usage || usageSuggere(c.nom));
    s.dataset.id = c.id; s.dataset.initial = c.usage || "";
    return h("div", { class: "ligne-classement" }, h("span", {}, `${c.icone || ""} ${c.nom}`.trim()), s);
  });
  const corps = h("div", {},
    h("p", { class: "note" }, "Essentielle : dépenses difficiles à éviter (logement, courses, santé…). Confort : dépenses sur lesquelles tu peux agir (sorties, loisirs, abonnements…). Les sous-catégories suivent leur catégorie. Les choix présélectionnés sont des propositions d'après le nom : vérifie-les."),
    ...selecteurs,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Enregistrer"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Classer mes catégories", corps);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const l = lot();
    for (const s of corps.querySelectorAll("select")) if (s.value !== s.dataset.initial) l.set("categories", s.dataset.id, { usage: s.value || null });
    l.envoyer(); dialogue.close();
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
  conteneur.replaceChildren(h("h2", {}, "Économies"), nav, corps);

  const nomCat = (id) => { const c = etat.categories.find((x) => x.id === id); return c ? `${c.icone || ""} ${c.nom}`.trim() : "Sans catégorie"; };

  function maj() {
    titre.textContent = moisFr(mois + "-01");
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const p = { categories: etat.categories, operations: etat.operations, comptes: etat.comptes, comptesIds: comptesSuivis() };
    const a = analyseEconomies({ ...p, mois });
    const ab = detecterAbonnements({ ...p, aujourdhui: aujourdhui(), planifiees: etat.planifiees });
    const noeuds = [];

    // Confort ou essentiel
    const pc = (v) => (a.total > 0 ? Math.max(0, (v / a.total) * 100) : 0);
    noeuds.push(h("div", { class: "carte" },
      h("div", { class: "ligne-synthese" }, h("span", {}, "Dépenses du mois"), h("strong", {}, euros(a.total))),
      a.total > 0 ? h("div", { class: "barre-usage", "aria-hidden": "true" },
        h("span", { class: "u-essentiel", style: `width:${pc(a.essentiel)}%` }), h("span", { class: "u-confort", style: `width:${pc(a.confort)}%` }), h("span", { class: "u-autre", style: `width:${pc(a.autre)}%` })) : null,
      h("div", { class: "legende-usage" },
        h("span", {}, h("i", { class: "u-essentiel" }), `Essentiel ${euros(a.essentiel)}`),
        h("span", {}, h("i", { class: "u-confort" }), `Confort ${euros(a.confort)}`),
        a.autre > 0 ? h("span", {}, h("i", { class: "u-autre" }), `Non classé ${euros(a.autre)}`) : null),
      a.partConfort != null ? h("p", { class: "note" }, `Le confort représente ${a.partConfort} % des dépenses` +
        (a.moyPart != null ? ` (moyenne des mois précédents : ${a.moyPart} %, soit ${euros(a.moyConfort)}).` : ".")) : h("p", { class: "note" }, "Aucune dépense ce mois-ci."),
      h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => pret() && formClassement() },
        a.nonClassees ? `Classer mes catégories (${a.nonClassees} à classer)` : "Classer mes catégories"))));

    // Plus gros postes de confort
    if (a.postesConfort.length) {
      noeuds.push(h("h3", { class: "groupe" }, "Plus gros postes de confort"));
      noeuds.push(h("div", { class: "carte-jour" }, a.postesConfort.map((l) => {
        const base = l.moyenne > 0 ? l.moyenne : l.realise;
        const eco = economieSiReduit(base);
        return h("div", { class: "ligne-eco" },
          h("div", { class: "eco-texte" }, h("strong", {}, nomCat(l.categorieId)),
            h("small", {}, l.moyenne > 0 ? `Moyenne des 3 derniers mois : ${euros(l.moyenne)} par mois` : "Pas d'historique : calcul sur le mois affiché"),
            h("small", { class: "eco-gain" }, `Économie si −20 % : ${euros(eco)} par mois (${euros(eco * 12)} par an)`)),
          h("span", { class: "montant", title: "Dépensé ce mois-ci" }, euros(l.realise)));
      })));
      noeuds.push(h("p", { class: "note" }, "Le montant à droite est ce que tu as dépensé dans le mois affiché. L'économie est calculée sur la moyenne des 3 derniers mois. Pour tester une autre réduction, utilise l'écran Projection."));
    }
    // Hausses
    if (a.hausses.length) {
      noeuds.push(h("h3", { class: "groupe" }, "En hausse par rapport à d'habitude"));
      noeuds.push(h("div", { class: "carte-jour" }, a.hausses.map((l) => h("div", { class: "ligne-eco" },
        h("div", { class: "eco-texte" }, h("strong", {}, nomCat(l.categorieId)), h("small", {}, `habituellement ${euros(l.moyenne)}`)),
        h("span", { class: "montant neg" }, `+${euros(l.ecart)}`)))));
    }
    // Abonnements
    noeuds.push(h("h3", { class: "groupe" }, "Abonnements"));
    if (!ab.liste.length) noeuds.push(h("p", { class: "note" }, "Aucun abonnement : ni dépense planifiée dans l'échéancier, ni dépense régulière détectée (même nom, même montant, au moins 3 mois de suite)."));
    else {
      noeuds.push(h("div", { class: "carte-jour" }, ab.liste.map((x) => h("div", { class: "ligne-eco" },
        h("div", { class: "eco-texte" }, h("strong", {}, x.nom),
          h("small", {}, x.source === "echeancier"
            ? `${euros(x.montantReel)} ${x.periode} · ${euros(x.annuel)} par an · échéancier`
            : `${euros(x.annuel)} par an` + (x.ancien ? ` · passé de ${euros(x.ancien)} à ${euros(x.mensuel)}` : ""))),
        h("span", { class: "montant" }, euros(x.mensuel) + "/mois")))));
      noeuds.push(h("p", { class: "note" }, `Tes abonnements coûtent ${euros(ab.mensuel)} par mois, soit ${euros(ab.annuel)} par an. Seul toi sais si tu utilises encore chacun d'eux.`));
    }
    corps.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
