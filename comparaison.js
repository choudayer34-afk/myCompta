import { etat, pret } from "./store.js";
import { euros, aujourdhui } from "./format.js";
import { h, champ, selecteur } from "./ui.js";
import { comptesSuivis, etiquette } from "./budgets.js";
import { bornesMois, moisDecale } from "./budget.js";
import { comparerPeriodes } from "./evolutioncalc.js";

const moisLong = (ym) => { const t = new Date(ym + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
const bornes = (mode, v) => (mode === "annee" ? [`${v}-01-01`, `${v}-12-31`] : bornesMois(v));
const libelle = (mode, v) => (mode === "annee" ? v : moisLong(v));
const pct = (p) => (p == null ? "nouveau" : `${p > 0 ? "+" : ""}${String(p).replace(".", ",")} %`);

export function monter(conteneur, { mois = aujourdhui().slice(0, 7) } = {}) {
  let mode = "mois";
  let a = moisDecale(mois, -1), b = mois;
  const modes = h("div", { class: "modes-bilan" }, [["mois", "Deux mois"], ["annee", "Deux années"]].map(([m, l]) =>
    h("button", { type: "button", class: "sec", "data-cmode": m, onclick: () => {
      mode = m; if (m === "annee") { b = aujourdhui().slice(0, 4); a = String(+b - 1); } else { b = mois; a = moisDecale(mois, -1); }
      construireChamps(); maj();
    } }, l)));
  const zoneChamps = h("div", { class: "deux" });
  const corps = h("div", {});
  conteneur.replaceChildren(modes, zoneChamps, corps);

  function construireChamps() {
    let iA, iB;
    if (mode === "annee") {
      const annees = [...new Set([...etat.operations.map((o) => o.date.slice(0, 4)), a, b])].sort().reverse();
      iA = selecteur(annees.map((x) => [x, x]), a); iB = selecteur(annees.map((x) => [x, x]), b);
    } else {
      iA = h("input", { type: "month", value: a }); iB = h("input", { type: "month", value: b });
    }
    iA.addEventListener("change", () => { if (iA.value) { a = iA.value; maj(); } });
    iB.addEventListener("change", () => { if (iB.value) { b = iB.value; maj(); } });
    zoneChamps.replaceChildren(champ("Référence (A)", iA), champ("Comparée (B)", iB));
  }

  function maj() {
    modes.querySelectorAll("button").forEach((x) => x.classList.toggle("actif-filtre", x.dataset.cmode === mode));
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const r = comparerPeriodes({ categories: etat.categories, operations: etat.operations, comptes: etat.comptes, comptesIds: comptesSuivis(), a: bornes(mode, a), b: bornes(mode, b) });
    if (!r.totalA && !r.totalB) { corps.replaceChildren(h("p", { class: "vide" }, "Aucune dépense sur ces deux périodes.")); return; }
    const fleche = (e) => (e > 0 ? "▲" : e < 0 ? "▼" : "=");
    const classe = (e) => (e > 0 ? "neg" : e < 0 ? "pos" : "");   // dépenses en hausse = rouge, en baisse = vert
    const max = Math.max(1, ...r.lignes.flatMap((l) => [l.a, l.b]));
    const largeur = (v) => `width:${Math.max(v ? 2 : 0, (v / max) * 100)}%`;
    corps.replaceChildren(
      h("div", { class: "carte bilan-haut" },
        h("div", { class: "ligne-synthese" }, h("span", {}, `A · ${libelle(mode, a)}`), h("strong", {}, euros(r.totalA))),
        h("div", { class: "ligne-synthese" }, h("span", {}, `B · ${libelle(mode, b)}`), h("strong", {}, euros(r.totalB))),
        h("p", { class: "reste-budget " + classe(r.ecart) }, `${fleche(r.ecart)} ${euros(Math.abs(r.ecart))} (${pct(r.pct)}) de B par rapport à A`)),
      ...r.lignes.map((l) => h("div", { class: "carte ligne-compar" },
        h("div", { class: "haut-budget" }, h("span", { class: "nom-budget" }, etiquette(l.categorieId)),
          h("span", { class: "montants-budget " + classe(l.ecart) }, `${fleche(l.ecart)} ${euros(Math.abs(l.ecart))} · ${pct(l.pct)}`)),
        h("div", { class: "paire" }, h("span", { class: "tag" }, "A"), h("div", { class: "piste" }, h("span", { class: "a", style: largeur(l.a) })), h("small", {}, euros(l.a))),
        h("div", { class: "paire" }, h("span", { class: "tag" }, "B"), h("div", { class: "piste" }, h("span", { class: "b", style: largeur(l.b) })), h("small", {}, euros(l.b))))));
  }
  construireChamps();
  maj();
  return { maj };
}
