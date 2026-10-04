import { etat, pret } from "./store.js";
import { euros, aujourdhui, dateFr } from "./format.js";
import { h } from "./ui.js";
import { comptesSuivis, etiquette } from "./budgets.js";
import { repartitionDepenses, pourPart, bornesPeriode } from "./bilancalc.js";
import { camembert, NB_COULEURS } from "./camembert.js";

function decaler(mode, ref, n) {
  const a = +ref.slice(0, 4), m = +ref.slice(5, 7);
  const d = mode === "annee" ? new Date(Date.UTC(a + n, m - 1, 1)) : new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
function titrePeriode(mode, ref) {
  if (mode === "annee") return ref.slice(0, 4);
  const t = new Date(ref.slice(0, 7) + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function monter(conteneur, { mois = aujourdhui().slice(0, 7) } = {}) {
  let mode = "mois";
  let ref = mois + "-01";
  let debutLibre = aujourdhui().slice(0, 8) + "01", finLibre = aujourdhui();
  let choisi = null;       // poste mis en avant
  let ouverts = new Set(); // postes dépliés

  const modes = h("div", { class: "modes-bilan" }, [["mois", "Mois"], ["annee", "Année"], ["libre", "Période"]].map(([m, l]) =>
    h("button", { type: "button", class: "sec" + (mode === m ? " actif-filtre" : ""), "data-mode": m, onclick: () => { mode = m; choisi = null; ouverts.clear(); maj(); } }, l)));
  const titre = h("strong", { class: "mois-budget" });
  const nav = h("div", { class: "nav-mois" },
    h("button", { type: "button", class: "sec", "aria-label": "Période précédente", onclick: () => { ref = decaler(mode, ref, -1); choisi = null; maj(); } }, "‹"),
    titre,
    h("button", { type: "button", class: "sec", "aria-label": "Période suivante", onclick: () => { ref = decaler(mode, ref, 1); choisi = null; maj(); } }, "›"));
  const iDebut = h("input", { type: "date", value: debutLibre }), iFin = h("input", { type: "date", value: finLibre });
  const libre = h("div", { class: "deux" }, h("div", { class: "champ" }, h("label", {}, "Du"), iDebut), h("div", { class: "champ" }, h("label", {}, "Au"), iFin));
  iDebut.addEventListener("change", () => { debutLibre = iDebut.value; maj(); });
  iFin.addEventListener("change", () => { finLibre = iFin.value; maj(); });
  const corps = h("div", {});
  conteneur.replaceChildren(modes, nav, libre, corps);

  function maj() {
    modes.querySelectorAll("button").forEach((b) => b.classList.toggle("actif-filtre", b.dataset.mode === mode));
    nav.classList.toggle("cache", mode === "libre");
    libre.classList.toggle("cache", mode !== "libre");
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    let debut, fin;
    if (mode === "libre") { debut = debutLibre; fin = finLibre; titre.textContent = ""; }
    else { [debut, fin] = bornesPeriode(mode, ref); titre.textContent = titrePeriode(mode, ref); }
    if (!debut || !fin || debut > fin) { corps.replaceChildren(h("p", { class: "vide" }, "Choisissez une période valide.")); return; }
    const r = repartitionDepenses({ categories: etat.categories, operations: etat.operations, comptes: etat.comptes, comptesIds: comptesSuivis(), debut, fin });
    if (!r.total) { corps.replaceChildren(h("p", { class: "vide" }, "Aucune dépense sur cette période.")); return; }
    const parts = pourPart(r.postes, NB_COULEURS - 1);
    const nom = (p) => (p.categorieId === "__autres__" ? `Autres (${p.nb} postes)` : etiquette(p.categorieId));
    const pct = (v) => (v / r.total * 100 >= 1 ? Math.round(v / r.total * 100) : Math.round(v / r.total * 1000) / 10) + " %";
    const cible = parts.find((p) => p.categorieId === choisi);
    const legende = parts.map((p, i) => {
      const ouvrable = p.categorieId !== "__autres__" && p.enfants.length > 1;
      const ouvert = ouverts.has(p.categorieId);
      const ligne = h("button", { type: "button", class: "carte ligne-bilan" + (choisi === p.categorieId ? " choisi" : ""),
        onclick: () => { choisi = choisi === p.categorieId ? null : p.categorieId; if (ouvrable) { if (ouverts.has(p.categorieId)) ouverts.delete(p.categorieId); else ouverts.add(p.categorieId); } maj(); } },
        h("span", { class: "pastille-bilan c" + (p.categorieId === "__autres__" ? "x" : i % NB_COULEURS), "aria-hidden": "true" }),
        h("span", { class: "nom-bilan" }, nom(p), ouvrable ? h("small", {}, ouvert ? " ▴" : " ▾") : null),
        h("span", { class: "val-bilan" }, h("strong", {}, euros(p.realise)), h("small", {}, pct(p.realise))));
      const sous = ouvrable && ouvert ? p.enfants.map((x) => h("div", { class: "ligne-sous" }, h("span", {}, x.categorieId === p.categorieId ? "Directement dans cette catégorie" : etiquette(x.categorieId)), h("span", {}, euros(x.realise)))) : [];
      return h("div", {}, ligne, ...sous);
    });
    corps.replaceChildren(
      h("div", { class: "carte bilan-haut" },
        h("div", { class: "ligne-synthese" }, h("span", {}, `Dépenses · ${mode === "libre" ? `${dateFr(debut)} – ${dateFr(fin)}` : titrePeriode(mode, ref)}`), h("strong", {}, euros(r.total))),
        camembert(parts, r.total, choisi, (id) => { choisi = id; maj(); }, (p) => (p.categorieId === "__autres__" ? "Autres" : etiquette(p.categorieId))),
        h("p", { class: "centre-bilan" }, cible ? `${nom(cible)} : ${euros(cible.realise)} (${pct(cible.realise)})` : "Touchez une part pour la mettre en avant."),
        r.recettes ? h("p", { class: "note" }, `Les remboursements et recettes classés dans des catégories sans dépense nette (${euros(r.recettes)}) ne figurent pas dans le camembert.`) : null),
      ...legende);
  }
  maj();
  return { maj };
}
