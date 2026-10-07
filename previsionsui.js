// Écran « Projection » : capacité d'épargne, projection du solde, simulation, objectifs, rythme du mois.
import { etat, pret, lot } from "./store.js";
import { euros, dateFr, aujourdhui } from "./format.js";
import { h, selecteur } from "./ui.js";
import { comptesSuivis } from "./budgets.js";
import { projection, moyennesCategories, objectifsEpargne, rythmeDuMois } from "./previsions.js";
import { detecterAbonnements } from "./economies.js";

const SVG = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...enfants) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  enfants.forEach((c) => c != null && e.append(c));
  return e;
};
const MOIS = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];
const moisCourt = (ym) => MOIS[+ym.slice(5, 7) - 1];
const moisLong = (ym) => new Date(ym + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const k = (c) => { const e = Math.abs(c) / 100; return (c < 0 ? "-" : "") + (e >= 1000 ? (e / 1000).toFixed(e >= 10000 ? 0 : 1).replace(".", ",") + " k" : Math.round(e)); };

// Graduations « rondes » pour l'axe vertical
function graduations(min, max, n = 4) {
  const brut = (max - min) / n || 1;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= brut) || 10 * p;
  const debut = Math.floor(min / pas) * pas;
  const t = [];
  for (let v = debut; ; v += pas) { t.push(v); if (v >= max - pas * 0.001) break; }
  return t;
}

function graphique(points, avecScenario, surSurvol) {
  const L = 340, H = 210, gauche = 38, droite = 24, haut = 12, bas = 176;
  const series = ["prudent", "central", "favorable"].concat(avecScenario ? ["avec"] : []);
  const valeurs = points.flatMap((p) => series.map((c) => p[c]));
  const ticks = graduations(Math.min(0, ...valeurs), Math.max(0, ...valeurs));
  const vmin = ticks[0], vmax = ticks[ticks.length - 1] || 1;
  const x = (i) => gauche + (i / (points.length - 1)) * (L - gauche - droite);
  const y = (v) => bas - ((v - vmin) / (vmax - vmin || 1)) * (bas - haut);
  const ligne = (cle) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[cle]).toFixed(1)}`).join(" ");
  const bande = `${points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.favorable).toFixed(1)}`).join(" ")} ${[...points].reverse().map((p, j) => `L${x(points.length - 1 - j).toFixed(1)},${y(p.prudent).toFixed(1)}`).join(" ")} Z`;
  const noeuds = [];
  for (const t of ticks) {
    noeuds.push(s("line", { x1: gauche, x2: L - droite, y1: y(t), y2: y(t), class: t === 0 ? "zero" : "grille" }));
    const lab = s("text", { x: gauche - 5, y: y(t) + 3, "text-anchor": "end", class: "lib-proj" }); lab.textContent = k(t); noeuds.push(lab);
  }
  noeuds.push(s("path", { d: bande, class: "bande-proj" }), s("path", { d: ligne("prudent"), class: "l-prudent" }), s("path", { d: ligne("favorable"), class: "l-favorable" }), s("path", { d: ligne("central"), class: "l-central" }));
  if (avecScenario) noeuds.push(s("path", { d: ligne("avec"), class: "l-avec" }));
  const pasLib = Math.ceil(points.length / 7);
  points.forEach((p, i) => { if (i % pasLib === 0 || i === points.length - 1) { const t = s("text", { x: x(i), y: bas + 15, "text-anchor": "middle", class: "lib-proj" }); t.textContent = i === 0 ? "auj." : moisCourt(p.mois); noeuds.push(t); } });
  const repere = s("g", { class: "repere" });
  noeuds.push(repere);
  const svg = s("svg", { viewBox: `0 0 ${L} ${H}`, class: "proj", role: "img", "aria-label": "Projection du solde" }, ...noeuds);
  const zone = s("rect", { x: gauche, y: 0, width: L - gauche - droite, height: H, fill: "transparent", style: "touch-action:pan-y" });
  svg.append(zone);
  const montrer = (i) => {
    repere.replaceChildren(s("line", { x1: x(i), x2: x(i), y1: haut, y2: bas, class: "croix" }),
      ...series.map((c) => s("circle", { cx: x(i), cy: y(points[i][c]), r: 4, class: "pt-" + c })));
    surSurvol(i);
  };
  const depuis = (e) => { const r = svg.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * L; return Math.max(0, Math.min(points.length - 1, Math.round(((px - gauche) / (L - gauche - droite)) * (points.length - 1)))); };
  zone.addEventListener("pointermove", (e) => montrer(depuis(e)));
  zone.addEventListener("pointerdown", (e) => montrer(depuis(e)));
  montrer(points.length - 1);
  return svg;
}

export function monter(conteneur) {
  let horizon = 6, catId = "", pct = 20, aboNom = "";
  const corps = h("div", {});
  conteneur.replaceChildren(h("h2", {}, "Projection"), corps);
  const nomCat = (id) => { const c = etat.categories.find((x) => x.id === id); return c ? `${c.icone || ""} ${c.nom}`.trim() : "Sans catégorie"; };

  function maj() {
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const auj = aujourdhui();
    const actifs = etat.comptes.filter((c) => !c.archive);
    const mem = (etat.reglages.find((r) => r.id === "projection") || {}).comptesIds;
    let ids = (mem || comptesSuivis()).filter((i) => actifs.some((c) => c.id === i));
    if (!ids.length) ids = actifs.map((c) => c.id);
    const bascule = (id) => {
      const nv = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
      if (!nv.length) return;
      const l = lot(); l.set("reglages", "projection", { comptesIds: nv }); l.envoyer();
    };
    const base = { operations: etat.operations, comptes: etat.comptes, comptesIds: ids, planifiees: etat.planifiees };
    const noeuds = [h("div", { class: "rapide" }, h("span", { class: "rapide-titre" }, "Comptes :"),
      ...actifs.map((c) => h("button", { type: "button", class: "sec" + (ids.includes(c.id) ? " actif-filtre" : ""), onclick: () => bascule(c.id) }, c.nom)))];

    // Leviers « et si »
    const moyCat = moyennesCategories({ categories: etat.categories, operations: etat.operations, comptes: etat.comptes, comptesIds: ids, mois: auj.slice(0, 7) }).filter((m) => m.categorieId && m.moyenne > 0);
    const abos = detecterAbonnements({ ...base, aujourdhui: auj }).liste;
    const mc = moyCat.find((m) => m.categorieId === catId);
    const ab = abos.find((a) => a.nom === aboNom);
    const economie = (mc ? Math.round(mc.moyenne * pct / 100) : 0) + (ab ? ab.mensuel : 0);

    const p = projection({ ...base, aujourdhui: auj, horizon, economieMensuelle: economie });
    const bouton = (n) => h("button", { type: "button", class: "sec" + (horizon === n ? " actif-filtre" : ""), onclick: () => { horizon = n; maj(); } }, `${n} mois`);
    noeuds.push(h("div", { class: "modes-bilan" }, bouton(3), bouton(6), bouton(12)));

    if (p.insuffisant) {
      noeuds.push(h("div", { class: "carte" }, h("p", {}, "Rien à projeter : ni échéance dans l'échéancier, ni opération sur les mois précédents pour les comptes pris en compte.")));
    } else {
      // Capacité d'épargne
      noeuds.push(h("div", { class: "carte", "data-resume": `reste ${euros(p.echeancierRevenus - p.echeancierDepenses + p.moyNet)} / mois` }, h("h3", { class: "titre-carte" }, "Capacité d'épargne mensuelle"),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Échéancier : recettes"), h("strong", { class: "montant pos" }, euros(p.echeancierRevenus))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Échéancier : dépenses"), h("strong", { class: "montant neg" }, euros(-p.echeancierDepenses))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Hors échéancier (moyenne)"), h("strong", { class: "montant " + (p.moyNet < 0 ? "neg" : "pos") }, euros(p.moyNet))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Reste en moyenne"), h("strong", { class: "montant " + (p.echeancierRevenus - p.echeancierDepenses + p.moyNet < 0 ? "neg" : "pos") }, euros(p.echeancierRevenus - p.echeancierDepenses + p.moyNet))),
        h("p", { class: "note" }, `Échéancier : moyenne mensuelle des échéances prévues sur ${horizon} mois (salaire, loyer, abonnements…), hors virements. Hors échéancier : moyenne des ${p.nbMois || 0} dernier(s) mois complet(s) pour les dépenses et recettes qui ne viennent pas de l'échéancier.` + (p.nbMois < 2 ? " L'historique est court : la fourchette entre scénarios sera étroite." : ""))));

      // Échéances lues (diagnostic)
      noeuds.push(h("details", { class: "carte tableau-proj" }, h("summary", {}, `Échéances prises en compte (${p.lues.length}) et ignorées (${p.ignorees.length})`),
        p.lues.length ? h("ul", { class: "puces" }, p.lues.map((x) => h("li", {}, `${x.nom} : ${euros(x.montant)}, ${x.frequence}, prochaine le ${dateFr(x.prochaine)}`))) : h("p", { class: "note" }, "Aucune échéance prise en compte."),
        p.ignorees.length ? h("p", { class: "note" }, "Ignorées :") : null,
        p.ignorees.length ? h("ul", { class: "puces" }, p.ignorees.map((x) => h("li", {}, `${x.nom} (${euros(x.montant)}) : ${x.raison}`))) : null));

      // Projection
      const dernier = p.points[p.points.length - 1];
      const tip = h("p", { class: "tip-proj", "aria-live": "polite" });
      const svg = graphique(p.points, economie > 0, (i) => {
        const q = p.points[i];
        tip.replaceChildren(h("strong", {}, i === 0 ? "Aujourd'hui" : moisLong(q.mois)), ` : ${euros(q.central)} (prudent ${euros(q.prudent)}, favorable ${euros(q.favorable)})` + (economie > 0 ? ` · avec tes changements ${euros(q.avec)}` : ""));
      });
      const legende = h("div", { class: "legende-usage" },
        h("span", {}, h("i", { class: "sw-central" }), "Central"),
        h("span", {}, h("i", { class: "sw-prudent" }), "Prudent"),
        h("span", {}, h("i", { class: "sw-favorable" }), "Favorable"),
        economie > 0 ? h("span", {}, h("i", { class: "sw-avec" }), "Avec tes changements") : null);
      const tableau = h("details", { class: "tableau-proj" }, h("summary", {}, "Voir le tableau"),
        h("table", {}, h("thead", {}, h("tr", {}, ...["Fin de mois", "Central", "Prudent", "Favorable"].concat(economie > 0 ? ["Avec changements"] : []).map((t) => h("th", {}, t)))),
          h("tbody", {}, p.points.slice(1).map((q) => h("tr", {}, h("td", {}, moisLong(q.mois)), h("td", {}, euros(q.central)), h("td", {}, euros(q.prudent)), h("td", {}, euros(q.favorable)), economie > 0 ? h("td", {}, euros(q.avec)) : null)))));
      noeuds.push(h("div", { class: "carte", "data-resume": `${euros(dernier.central)} dans ${horizon} mois` }, h("h3", { class: "titre-carte" }, "Solde projeté"),
        h("p", {}, `Solde en cours aujourd'hui : ${euros(p.solde)}. Dans ${horizon} mois (${moisLong(dernier.mois)}) : environ `, h("strong", {}, euros(dernier.central)), ` (prudent ${euros(dernier.prudent)}, favorable ${euros(dernier.favorable)}).`),
        p.premierNegatif ? h("p", { class: "avert-proj" }, `Dans le scénario prudent, le solde passe sous zéro en ${moisLong(p.premierNegatif.mois)}.`) : null,
        svg, legende, tip, tableau,
        p.ponctuels.length ? h("p", { class: "note" }, "Échéances non mensuelles prévues : " + p.ponctuels.map((x) => `${x.nom} ${euros(x.montant)} (${dateFr(x.date)})`).join(" · ") + ".") : null,
        h("p", { class: "note" }, "Les échéances de l'échéancier sont lues à leurs dates. Pour le reste : central = flux moyen, prudent = mois le plus défavorable, favorable = mois le plus favorable. Une dépense exceptionnelle n'y est pas prévue.")));

      // Simulation
      const sCat = selecteur([["", "Aucune"], ...moyCat.map((m) => [m.categorieId, `${nomCat(m.categorieId)} (moy. ${euros(m.moyenne)}/mois)`])], catId, { "aria-label": "Catégorie à réduire" });
      sCat.addEventListener("change", () => { catId = sCat.value; maj(); });
      const sPct = selecteur([["10", "−10 %"], ["20", "−20 %"], ["30", "−30 %"], ["50", "−50 %"], ["100", "−100 % (supprimer)"]], String(pct), { "aria-label": "Réduction" });
      sPct.addEventListener("change", () => { pct = +sPct.value; maj(); });
      const sAbo = selecteur([["", "Aucun"], ...abos.map((a) => [a.nom, `${a.nom} (${euros(a.mensuel)}/mois)`])], aboNom, { "aria-label": "Abonnement à supprimer" });
      sAbo.addEventListener("change", () => { aboNom = sAbo.value; maj(); });
      noeuds.push(h("div", { class: "carte", "data-resume": economie > 0 ? `${euros(economie)} / mois économisés` : "aucune simulation" }, h("h3", { class: "titre-carte" }, "Et si… ?"),
        h("div", { class: "champ" }, h("label", {}, "Je réduis cette catégorie"), sCat),
        h("div", { class: "champ" }, h("label", {}, "De"), sPct),
        h("div", { class: "champ" }, h("label", {}, "Je supprime cet abonnement"), sAbo),
        economie > 0
          ? h("p", {}, "Économie : ", h("strong", {}, `${euros(economie)} par mois`), `, soit ${euros(economie * 12)} sur 12 mois. La courbe « Avec tes changements » s'ajoute au graphique.`)
          : h("p", { class: "note" }, "Choisis une catégorie ou un abonnement pour voir l'effet sur le solde projeté.")));
    }

    // Objectifs d'épargne
    const objs = objectifsEpargne({ operations: etat.operations, comptes: etat.comptes, aujourdhui: auj });
    if (objs.length) {
      noeuds.push(h("div", { class: "carte", "data-resume": `${objs.length} objectif(s)` }, h("h3", { class: "titre-carte" }, "Objectifs d'épargne"), ...objs.map((o) => {
        let texte;
        if (o.atteint) texte = "Objectif atteint.";
        else if (o.aucuneDonnee) texte = "Pas assez d'historique pour estimer la date d'atteinte.";
        else if (!o.finMois) texte = "Aucune progression au rythme des derniers mois.";
        else texte = `Au rythme actuel (${euros(o.rythme)} par mois), atteint en ${moisLong(o.finMois)}` + (o.objectifDate ? (o.enRetard ? `, après la date cible du ${dateFr(o.objectifDate)}.` : `, avant la date cible du ${dateFr(o.objectifDate)}.`) : ".");
        return h("div", { class: "bloc-objectif" }, h("strong", {}, o.nom), h("small", {}, `${euros(o.solde)} sur ${euros(o.objectif)} · reste ${euros(o.reste)}`), h("small", { class: o.enRetard ? "avert-proj" : "" }, texte));
      })));
    }

    // Rythme du mois
    const r = rythmeDuMois({ categories: etat.categories, operations: etat.operations, comptes: etat.comptes, comptesIds: ids, aujourdhui: auj });
    const lignesRythme = r.aucuneClasse
      ? [h("p", { class: "note" }, "Classe d'abord tes catégories en « essentielles » ou « confort » dans l'écran Économies : le rythme du mois porte sur les dépenses de confort."),
         h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => { location.hash = "#/economies"; } }, "Ouvrir Économies"))]
      : [h("p", {}, `Au ${r.jour} du mois, tu as dépensé `, h("strong", {}, euros(r.total.realise)), ` en confort pour ${euros(r.total.attendu)} attendus à cette date (moyenne mensuelle : ${euros(r.total.moyenne)}).`),
         r.alertes.length ? h("div", { class: "carte-jour" }, r.alertes.map((l) => h("div", { class: "ligne-eco" },
           h("div", { class: "eco-texte" }, h("strong", {}, nomCat(l.categorieId)), h("small", {}, `${euros(l.realise)} dépensés pour ${euros(l.attendu)} attendus`)),
           h("span", { class: "montant neg" }, `+${euros(l.ecart)}`)))) : h("p", { class: "note" }, "Aucune catégorie de confort ne dépasse nettement son rythme habituel.")];
    noeuds.push(h("div", { class: "carte" }, h("h3", { class: "titre-carte" }, "Rythme du mois"), ...lignesRythme));
    corps.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
