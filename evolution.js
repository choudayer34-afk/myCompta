import { etat, pret, categoriesTriees } from "./store.js";
import { euros, aujourdhui } from "./format.js";
import { h, selecteur } from "./ui.js";
import { comptesSuivis } from "./budgets.js";
import { moisDecale } from "./budget.js";
import { evolutionMensuelle, statsEvolution } from "./evolutioncalc.js";

const SVG = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...enfants) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  enfants.forEach((c) => c != null && e.append(c));
  return e;
};
const MOIS = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];
const moisCourt = (ym) => MOIS[+ym.slice(5, 7) - 1];
const moisLong = (ym) => { const t = new Date(ym + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
const k = (c) => { const e = Math.abs(c) / 100; return (c < 0 ? "-" : "") + (e >= 1000 ? (e / 1000).toFixed(e >= 10000 ? 0 : 1).replace(".", ",") + " k" : Math.round(e)); };

// Histogramme des 12 derniers mois : une seule série, barre du mois choisi mise en avant, moyenne en pointillés.
function histogramme(serie, moyenne, choisi, surChoix) {
  const L = 340, H = 190, bas = 160, haut = 18, gauche = 4, droite = 4;
  const max = Math.max(1, ...serie.map((x) => x.realise));
  const pas = (L - gauche - droite) / serie.length, larg = pas * 0.62;
  const y = (v) => bas - (Math.max(0, v) / max) * (bas - haut);
  const noeuds = [s("line", { x1: gauche, x2: L - droite, y1: bas, y2: bas, class: "axe" })];
  serie.forEach((x, i) => {
    const cx = gauche + pas * i + pas / 2, top = y(x.realise);
    const barre = s("rect", { x: cx - larg / 2, y: x.realise > 0 ? top : bas - 1, width: larg, height: Math.max(1, bas - (x.realise > 0 ? top : bas - 1)), rx: 3, class: "barre-evo" + (choisi === x.mois ? " actif" : "") });
    const zone = s("rect", { x: cx - pas / 2, y: 0, width: pas, height: H, fill: "transparent", tabindex: "0", role: "button",
      "aria-label": `${moisLong(x.mois)} : ${euros(x.realise)}` });
    zone.addEventListener("click", () => surChoix(choisi === x.mois ? null : x.mois));
    noeuds.push(barre, zone);
    const t = s("text", { x: cx, y: bas + 15, "text-anchor": "middle", class: "lib-evo" + (x.mois.endsWith("-01") || i === 0 ? " an" : "") });
    t.textContent = moisCourt(x.mois);
    noeuds.push(t);
    if (choisi === x.mois || i === serie.length - 1 && !choisi) {
      const v = s("text", { x: Math.min(Math.max(cx, 22), L - 22), y: Math.max(top - 5, 11), "text-anchor": "middle", class: "val-evo" });
      v.textContent = k(x.realise);
      noeuds.push(v);
    }
  });
  const ym = y(moyenne);
  noeuds.push(s("line", { x1: gauche, x2: L - droite, y1: ym, y2: ym, class: "moyenne-evo" }));
  return s("svg", { viewBox: `0 0 ${L} ${H}`, class: "histo", role: "group", "aria-label": "Dépenses des 12 derniers mois" }, ...noeuds);
}

export function monter(conteneur, { mois = aujourdhui().slice(0, 7) } = {}) {
  let fin = mois;
  let categorieId = "";
  let choisi = null;
  const titre = h("strong", { class: "mois-budget" });
  const nav = h("div", { class: "nav-mois" },
    h("button", { type: "button", class: "sec", "aria-label": "12 mois précédents", onclick: () => { fin = moisDecale(fin, -12); choisi = null; maj(); } }, "‹"),
    titre,
    h("button", { type: "button", class: "sec", "aria-label": "12 mois suivants", onclick: () => { fin = moisDecale(fin, 12); choisi = null; maj(); } }, "›"));
  const sCat = selecteur([["", "Toutes les dépenses"], ...categoriesTriees(true).map((c) => [c.id, (c.icone ? c.icone + " " : "") + c.libelle])], "", { "aria-label": "Catégorie" });
  sCat.addEventListener("change", () => { categorieId = sCat.value; choisi = null; maj(); });
  const corps = h("div", {});
  conteneur.replaceChildren(nav, h("div", { class: "champ" }, sCat), corps);

  function maj() {
    titre.textContent = `${moisCourt(moisDecale(fin, -11))} ${moisDecale(fin, -11).slice(0, 4)} – ${moisCourt(fin)} ${fin.slice(0, 4)}`;
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const serie = evolutionMensuelle({ categories: etat.categories, operations: etat.operations, comptes: etat.comptes, comptesIds: comptesSuivis(), moisFin: fin, categorieId: categorieId || null });
    const st = statsEvolution(serie);
    if (!serie.some((x) => x.realise)) { corps.replaceChildren(h("p", { class: "vide" }, "Aucune dépense sur ces 12 mois.")); return; }
    const cible = serie.find((x) => x.mois === choisi);
    corps.replaceChildren(
      h("div", { class: "carte bilan-haut" },
        h("div", { class: "ligne-synthese" }, h("span", {}, "Total sur 12 mois"), h("strong", {}, euros(st.total))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Moyenne mensuelle"), h("strong", {}, euros(st.moyenne))),
        histogramme(serie, st.moyenne, choisi, (m) => { choisi = m; maj(); }),
        h("p", { class: "centre-bilan" }, cible ? `${moisLong(cible.mois)} : ${euros(cible.realise)}` : `Mois le plus élevé : ${moisLong(st.max.mois)} (${euros(st.max.realise)}). Pointillés : moyenne.`)),
      ...[...serie].reverse().map((x) => {
        const ecart = x.realise - st.moyenne;
        return h("button", { type: "button", class: "carte ligne-hors" + (choisi === x.mois ? " choisi" : ""), onclick: () => { choisi = choisi === x.mois ? null : x.mois; maj(); } },
          h("span", {}, moisLong(x.mois)),
          h("span", { class: "val-bilan" }, h("strong", {}, euros(x.realise)),
            h("small", { class: ecart > 0 ? "neg" : "pos" }, `${ecart > 0 ? "▲" : ecart < 0 ? "▼" : "="} ${euros(Math.abs(ecart))} vs moyenne`)));
      }));
  }
  maj();
  return { maj };
}
