// Graphiques du bilan Duo : recettes et dépenses, reste de chaque mois avec tendance, composition des dépenses.
import { h } from "./ui.js";
import { euros } from "./format.js";

const SVG = "http://www.w3.org/2000/svg";
const s = (tag, attrs = {}, ...enfants) => {
  const e = document.createElementNS(SVG, tag);
  for (const [cle, v] of Object.entries(attrs)) e.setAttribute(cle, v);
  enfants.forEach((c) => c != null && e.append(c));
  return e;
};
const MOIS = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];
const moisCourt = (ym) => MOIS[+ym.slice(5, 7) - 1];
const moisLong = (ym) => `${MOIS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const k = (c) => { const e = Math.abs(c) / 100; return (c < 0 ? "-" : "") + (e >= 1000 ? (e / 1000).toFixed(e >= 10000 ? 0 : 1).replace(".", ",") + " k" : Math.round(e)); };

function graduations(min, max, n = 4) {
  const brut = (max - min) / n || 1;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= brut) || 10 * p;
  const t = [];
  for (let v = Math.floor(min / pas) * pas; ; v += pas) { t.push(v); if (v >= max - pas * 0.001) break; }
  return t;
}

const L = 340, H = 200, gauche = 38, droite = 10, haut = 12, bas = 168;

// Cadre commun : axe vertical, repère zéro, libellés des mois. `valeurs` sert à calculer l'échelle.
function cadre(serie, valeurs) {
  const ticks = graduations(Math.min(0, ...valeurs), Math.max(0, ...valeurs));
  const vmin = ticks[0], vmax = ticks[ticks.length - 1] || 1;
  const n = serie.length;
  const pas = (L - gauche - droite) / n;
  const x = (i) => gauche + pas * (i + 0.5);
  const y = (v) => bas - ((v - vmin) / (vmax - vmin || 1)) * (bas - haut);
  const noeuds = [];
  for (const t of ticks) {
    noeuds.push(s("line", { x1: gauche, x2: L - droite, y1: y(t), y2: y(t), class: t === 0 ? "zero" : "grille" }));
    const lab = s("text", { x: gauche - 5, y: y(t) + 3, "text-anchor": "end", class: "lib-proj" }); lab.textContent = k(t); noeuds.push(lab);
  }
  const pasLib = Math.ceil(n / 7);
  serie.forEach((p, i) => { if (i % pasLib === 0 || i === n - 1) { const t = s("text", { x: x(i), y: bas + 15, "text-anchor": "middle", class: "lib-proj" }); t.textContent = moisCourt(p.mois); noeuds.push(t); } });
  return { x, y, pas, noeuds };
}

// Zone sensible : survol ou toucher -> repère vertical + texte d'info.
function interactif(svg, serie, c, info, aria) {
  const repere = s("g", {});
  const zone = s("rect", { x: gauche, y: 0, width: L - gauche - droite, height: H, fill: "transparent", style: "touch-action:pan-y" });
  svg.append(repere, zone);
  const montrer = (i) => {
    repere.replaceChildren(s("line", { x1: c.x(i), x2: c.x(i), y1: haut, y2: bas, class: "croix" }));
    info(i);
  };
  const depuis = (e) => { const r = svg.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * L; return Math.max(0, Math.min(serie.length - 1, Math.floor((px - gauche) / c.pas))); };
  zone.addEventListener("pointermove", (e) => montrer(depuis(e)));
  zone.addEventListener("pointerdown", (e) => montrer(depuis(e)));
  svg.setAttribute("aria-label", aria);
  montrer(serie.length - 1);
}

const legende = (items) => h("div", { class: "legende-duo" }, ...items.map(([cls, txt, tirets]) => h("span", {}, h("i", { class: `pastille-duo ${cls}${tirets ? " tirets" : ""}` }), txt)));

// Lignes : recettes et dépenses.
export function lignesRecettesDepenses(serie) {
  const c = cadre(serie, serie.flatMap((p) => [p.recettes, p.depenses]));
  const tr = (cle) => serie.map((p, i) => `${i ? "L" : "M"}${c.x(i).toFixed(1)},${c.y(p[cle]).toFixed(1)}`).join(" ");
  const svg = s("svg", { viewBox: `0 0 ${L} ${H}`, class: "proj", role: "img" }, ...c.noeuds,
    s("path", { d: tr("recettes"), class: "l-duo-rec" }), s("path", { d: tr("depenses"), class: "l-duo-dep" }));
  const info = h("div", { class: "tip-proj" });
  interactif(svg, serie, c, (i) => {
    const p = serie[i];
    svg.querySelectorAll(".pt-duo").forEach((e) => e.remove());
    svg.insertBefore(s("circle", { cx: c.x(i), cy: c.y(p.recettes), r: 4, class: "pt-duo-rec pt-duo" }), svg.lastChild);
    svg.insertBefore(s("circle", { cx: c.x(i), cy: c.y(p.depenses), r: 4, class: "pt-duo-dep pt-duo" }), svg.lastChild);
    info.textContent = `${moisLong(p.mois)} : recettes ${euros(p.recettes)} · dépenses ${euros(p.depenses)}`;
  }, "Recettes et dépenses par mois");
  return h("div", {}, legende([["duo-rec", "Recettes"], ["duo-dep", "Dépenses"]]), svg, info);
}

// Barres : reste de chaque mois (recettes − dépenses), avec droite de tendance.
export function barresReste(serie, tend) {
  const c = cadre(serie, [...serie.map((p) => p.restant), tend.debut, tend.fin]);
  const lg = Math.min(18, c.pas * 0.6);
  const barres = serie.map((p, i) => {
    const y0 = c.y(0), y1 = c.y(p.restant), top = Math.min(y0, y1), hauteur = Math.max(1, Math.abs(y0 - y1));
    return s("rect", { x: c.x(i) - lg / 2, y: top, width: lg, height: hauteur, rx: 3, class: p.restant < 0 ? "b-duo-neg" : "b-duo-pos", opacity: p.reel ? 1 : 0.45 });
  });
  const ligne = s("path", { d: `M${c.x(0).toFixed(1)},${c.y(tend.debut).toFixed(1)} L${c.x(serie.length - 1).toFixed(1)},${c.y(tend.fin).toFixed(1)}`, class: "l-duo-tend" });
  const svg = s("svg", { viewBox: `0 0 ${L} ${H}`, class: "proj", role: "img" }, ...c.noeuds, ...barres, ligne);
  const info = h("div", { class: "tip-proj" });
  interactif(svg, serie, c, (i) => {
    const p = serie[i];
    info.textContent = `${moisLong(p.mois)} : reste ${euros(p.restant)}${p.reel ? "" : " (aucune dépense saisie ce mois-ci)"}`;
  }, "Reste de chaque mois et tendance");
  return h("div", {}, legende([["duo-pos", "Reste positif"], ["duo-neg", "Reste négatif"], ["duo-tend", "Tendance", true]]), svg, info);
}

// Barres empilées : provision, dépenses partagées, dépenses personnelles.
export function barresComposition(serie) {
  const c = cadre(serie, [...serie.map((p) => p.depenses)]);
  const lg = Math.min(18, c.pas * 0.6);
  const couches = [["provision", "c-duo-prov"], ["partages", "c-duo-part"], ["perso", "c-duo-perso"]];
  const rects = [];
  serie.forEach((p, i) => {
    let cumul = 0;
    for (const [cle, cls] of couches) {
      const v = p[cle]; if (v <= 0) continue;
      const yb = c.y(cumul), yh = c.y(cumul + v);
      rects.push(s("rect", { x: c.x(i) - lg / 2, y: yh, width: lg, height: Math.max(1, yb - yh - 1), class: cls }));
      cumul += v;
    }
  });
  const svg = s("svg", { viewBox: `0 0 ${L} ${H}`, class: "proj", role: "img" }, ...c.noeuds, ...rects);
  const info = h("div", { class: "tip-proj" });
  interactif(svg, serie, c, (i) => {
    const p = serie[i];
    info.textContent = `${moisLong(p.mois)} : provision ${euros(p.provision)} · partagées ${euros(p.partages)} · personnelles ${euros(p.perso)}`;
  }, "Composition des dépenses par mois");
  return h("div", {}, legende([["duo-prov", "Provision"], ["duo-part", "Partagées"], ["duo-perso", "Personnelles"]]), svg, info);
}

// Tableau équivalent aux graphiques.
export function tableauSerie(serie) {
  const t = h("table", {}, h("tr", {}, ...["Mois", "Recettes", "Dépenses", "Reste"].map((x) => h("th", {}, x))),
    ...serie.slice().reverse().map((p) => h("tr", {}, h("td", {}, moisLong(p.mois)), h("td", {}, euros(p.recettes)), h("td", {}, euros(p.depenses)), h("td", {}, euros(p.restant)))));
  return h("details", { class: "tableau-proj" }, h("summary", {}, "Voir en tableau"), t);
}
