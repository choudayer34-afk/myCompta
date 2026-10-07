// Écran « Recherche » : opérations de tous les comptes.
import { etat, pret, comparerComptes } from "./store.js";
import { euros, aujourdhui } from "./format.js";
import { h } from "./ui.js";
import { formOperation } from "./formoperation.js";
import { rechercher, libelleCategorie } from "./recherche.js";

const PAGE = 100;

export function monter(conteneur) {
  let limite = PAGE;
  const iTexte = h("input", { type: "search", class: "recherche", placeholder: "Nom, montant, catégorie, compte, date…", autocomplete: "off", "aria-label": "Rechercher" });
  const iCompte = h("select", { "aria-label": "Compte" });
  const resume = h("p", { class: "note" });
  const liste = h("div", {});
  conteneur.replaceChildren(h("h2", {}, "Recherche"), h("div", { class: "barre outils-detail" }, iTexte, iCompte), resume, liste);

  const jourTitre = (iso) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  };
  function remplirComptes() {
    const comptes = etat.comptes.filter((c) => !c.archive).sort(comparerComptes);
    if (iCompte.options.length === comptes.length + 1) return;
    const courant = iCompte.value;
    iCompte.replaceChildren(h("option", { value: "" }, "Tous les comptes"), ...comptes.map((c) => h("option", { value: c.id }, c.nom)));
    iCompte.value = courant;
  }
  function maj() {
    remplirComptes();
    if (!pret()) { resume.textContent = "Chargement…"; return; }
    const r = rechercher({ operations: etat.operations, comptes: etat.comptes, categories: etat.categories, texte: iTexte.value, compteId: iCompte.value });
    if (!iTexte.value.trim()) { resume.textContent = "Saisis un ou plusieurs mots : tous doivent se retrouver dans l'opération."; liste.replaceChildren(); return; }
    resume.textContent = r.nb ? `${r.nb} résultat(s) · total ${euros(r.total)}` : "Aucun résultat.";
    const nomCompte = new Map(etat.comptes.map((c) => [c.id, c.nom]));
    const cats = new Map(etat.categories.map((c) => [c.id, c]));
    const iconeDe = (cat) => (cat && (cat.icone || (cat.parentId && cats.get(cat.parentId) && cats.get(cat.parentId).icone))) || "";
    const noeuds = [];
    let jour = null, carte = null;
    for (const o of r.lignes.slice(0, limite)) {
      if (o.date !== jour) { jour = o.date; noeuds.push(h("h3", { class: "groupe" }, jourTitre(jour))); carte = h("div", { class: "carte-jour" }); noeuds.push(carte); }
      const cat = cats.get(o.categorieId);
      const virement = o.virementId;
      const etiquette = (virement ? "Virement" : libelleCategorie(o.categorieId, etat.categories) || "Sans catégorie");
      carte.append(h("div", { class: "op-ligne" + (o.statut === "annule" ? " annule" : "") },
        h("span", { class: "op-icone", style: cat && cat.couleur ? `background:${cat.couleur}26` : null },
          h("span", { class: "glyphe" }, iconeDe(cat) || (virement ? "⇄" : "•")),
          o.statut === "pointe" ? h("span", { class: "coche" }, "✓") : null),
        h("button", { type: "button", class: "op-corps", onclick: () => formOperation({ compteId: o.compteId, op: etat.operations.find((x) => x.id === o.id) }) },
          h("span", { class: "op-texte" }, h("span", { class: "op-nom" }, o.nom), h("small", { class: "op-cat" }, `${nomCompte.get(o.compteId) || "?"} · ${etiquette}`)),
          h("span", { class: "montant op-montant " + (o.montant < 0 ? "neg" : "pos") }, euros(o.montant)))));
    }
    if (r.nb > limite) noeuds.push(h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => { limite += PAGE; maj(); } }, `Afficher plus (${r.nb - limite} restants)`)));
    liste.replaceChildren(...noeuds);
  }
  iTexte.addEventListener("input", () => { limite = PAGE; maj(); });
  iCompte.addEventListener("change", () => { limite = PAGE; maj(); });
  maj();
  setTimeout(() => iTexte.focus(), 50);
  return { maj() { remplirComptes(); if (iTexte.value.trim()) { /* garde la saisie et le focus */ const y = window.scrollY; maj(); window.scrollTo(0, y); } } };
}
