import { euros } from "./format.js";
import { h } from "./ui.js";
import { categoriesTriees } from "./store.js";
import { pourPart } from "./bilancalc.js";

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, ...enfants) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  enfants.forEach((c) => c && e.append(c));
  return e;
};
export const NB_COULEURS = 8;

// Camembert : une part par poste, du plus gros au plus petit, à partir de midi dans le sens horaire.
export function camembert(parts, total, choisi, surChoix, libelle) {
  const R = 100, C = 110;
  const enfants = [];
  let angle = -Math.PI / 2;
  parts.forEach((p, i) => {
    const fraction = p.realise / total;
    const classe = "part c" + (p.categorieId === "__autres__" ? "x" : i % NB_COULEURS);
    const actif = choisi === p.categorieId;
    let forme;
    if (fraction >= 0.9999) forme = svg("circle", { cx: C, cy: C, r: R });
    else {
      const a2 = angle + fraction * 2 * Math.PI, grand = fraction > 0.5 ? 1 : 0;
      const x1 = C + R * Math.cos(angle), y1 = C + R * Math.sin(angle), x2 = C + R * Math.cos(a2), y2 = C + R * Math.sin(a2);
      forme = svg("path", { d: `M${C},${C} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${grand} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z` });
    }
    forme.setAttribute("class", classe + (actif ? " actif" : ""));
    forme.setAttribute("tabindex", "0");
    forme.setAttribute("role", "button");
    forme.setAttribute("aria-label", `${libelle(p)} : ${euros(p.realise)}, ${Math.round(fraction * 100)} %`);
    forme.addEventListener("click", () => surChoix(actif ? null : p.categorieId));
    enfants.push(forme);
    angle += fraction * 2 * Math.PI;
  });
  return svg("svg", { viewBox: "0 0 220 220", class: "camembert", role: "group", "aria-label": "Répartition des dépenses par poste" }, ...enfants);
}


const libelleCategorie = (id) => {
  if (id === "__autres__") return "Autres";
  if (!id) return "Sans catégorie";
  const c = categoriesTriees(true).find((x) => x.id === id);
  return c ? (c.icone ? c.icone + " " : "") + c.libelle : "Catégorie supprimée";
};

// Bloc autonome : camembert + légende (du plus gros au plus petit, montants consolidés avec les sous-catégories, « Sans catégorie » inclus).
// r = résultat de repartitionDepenses / repartitionOperations ; notes = lignes d'information complémentaires.
export function blocRepartition(r, { titre = "Répartition par catégorie", notes = [] } = {}) {
  let choisi = null;
  const ouverts = new Set();
  const boite = h("div", { class: "carte bilan-haut" });
  function dessiner() {
    if (!r.total) { boite.replaceChildren(h("h3", {}, titre), h("p", { class: "note" }, "Aucune dépense à répartir."), ...notes.map((n) => h("p", { class: "note" }, n))); return; }
    const parts = pourPart(r.postes, NB_COULEURS - 1);
    const nom = (p) => (p.categorieId === "__autres__" ? `Autres (${p.nb} postes)` : libelleCategorie(p.categorieId));
    const pct = (v) => (v / r.total * 100 >= 1 ? Math.round(v / r.total * 100) : Math.round(v / r.total * 1000) / 10) + " %";
    const cible = parts.find((p) => p.categorieId === choisi);
    const legende = parts.map((p, i) => {
      const ouvrable = p.categorieId !== "__autres__" && p.enfants.length > 1;
      const ouvert = ouverts.has(p.categorieId);
      const ligne = h("button", { type: "button", class: "ligne-bilan" + (choisi === p.categorieId ? " choisi" : ""),
        onclick: () => { choisi = choisi === p.categorieId ? null : p.categorieId; if (ouvrable) { if (ouverts.has(p.categorieId)) ouverts.delete(p.categorieId); else ouverts.add(p.categorieId); } dessiner(); } },
        h("span", { class: "pastille-bilan c" + (p.categorieId === "__autres__" ? "x" : i % NB_COULEURS), "aria-hidden": "true" }),
        h("span", { class: "nom-bilan" }, nom(p), ouvrable ? h("small", {}, ouvert ? " ▴" : " ▾") : null),
        h("span", { class: "val-bilan" }, h("strong", {}, euros(p.realise)), h("small", {}, pct(p.realise))));
      const sous = ouvrable && ouvert ? p.enfants.map((x) => h("div", { class: "ligne-sous" }, h("span", {}, x.categorieId === p.categorieId ? "Directement dans cette catégorie" : libelleCategorie(x.categorieId)), h("span", {}, euros(x.realise)))) : [];
      return h("div", {}, ligne, ...sous);
    });
    boite.replaceChildren(
      h("h3", {}, titre),
      h("div", { class: "ligne-synthese" }, h("span", {}, "Total des dépenses"), h("strong", {}, euros(r.total))),
      camembert(parts, r.total, choisi, (id) => { choisi = id; dessiner(); }, nom),
      h("p", { class: "centre-bilan" }, cible ? `${nom(cible)} : ${euros(cible.realise)} (${pct(cible.realise)})` : "Touchez une part pour la mettre en avant."),
      ...legende,
      ...notes.map((n) => h("p", { class: "note" }, n)));
  }
  dessiner();
  return boite;
}
