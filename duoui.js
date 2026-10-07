// Écran « Duo » : gestion à deux (recettes, provision du compte commun, dépenses du mois, qui doit quoi).
import { etat, pret, lot } from "./store.js";
import { euros, aujourdhui, moisFr, versCentimes, versSaisie } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { moisDecale } from "./budget.js";
import { majResume } from "./repli.js";
import { lignesRecettesDepenses, barresReste, barresComposition, tableauSerie } from "./graphduo.js";
import { PARAMS_DEFAUT, bilanDuo, depensesPartagees, operationsPartagees, operationsRetirees, operationsManquantes, remboursementsPossibles, brutEnVigueur, vueBilan, evolution, serieDuo, tendance, recurrentesDuMois, montantsDepuisTexte, capaciteEmprunt, SEUIL_ENDETTEMENT } from "./duo.js";

const params = () => ({ ...PARAMS_DEFAUT, ...((etat.reglages.find((r) => r.id === "duo")) || {}) });
const docMois = (mois) => etat.reglages.find((r) => r.id === "duo_" + mois) || {};

const dateCourte = (iso) => { const [, m, j] = String(iso || "").split("-"); return j ? `${j}/${m}` : ""; };
const nomCat = (id) => { const c = etat.categories.find((x) => x.id === id); return c ? c.nom : ""; };
const nomCompte = (id) => { const c = etat.comptes.find((x) => x.id === id); return c ? c.nom : "Compte inconnu"; };
// Regroupe des opérations par compte : une ligne d'en-tête (compte, sous-total) puis ses opérations.
function parCompte(ops, ligne) {
  const groupes = new Map();
  for (const o of ops) { if (!groupes.has(o.compteId)) groupes.set(o.compteId, []); groupes.get(o.compteId).push(o); }
  const multi = groupes.size > 1;
  return [...groupes].sort((a, b) => nomCompte(a[0]).localeCompare(nomCompte(b[0]), "fr"))
    .flatMap(([id, l]) => [...(multi ? [{ entete: nomCompte(id), montant: l.reduce((s, o) => s - o.montant, 0) }] : []), ...l.map(ligne)]);
}
const ouverts = new Set();
const recherches = new Map();
const SYMBOLES = { Retirer: "✕", Remettre: "↺", Ajouter: "+", "Déduire": "+" };
// Liste dépliable avec recherche (nom ou prix) ; chaque ligne : [date, nom, montant, action?] avec action = { libelle, fait }
function detail(titre, lignes, cle = titre) {
  const nb = lignes.filter((x) => !x.entete).length;
  const rendu = (x) => {
    if (x.entete) { const e = h("div", { class: "ligne-synthese" }, h("strong", {}, x.entete), h("strong", {}, euros(x.montant))); e.dataset.entete = "1"; return e; }
    const [dt, nom, m, act] = x;
    const r = h("div", { class: "ligne-synthese" }, h("span", {}, dt ? `${dt} · ${nom}` : nom),
      h("span", { class: "droite-ligne" }, h("strong", {}, euros(m)),
        act ? h("button", { type: "button", class: "mini-action", title: act.libelle, "aria-label": act.libelle, onclick: act.fait }, SYMBOLES[act.libelle] || "•") : null));
    r.dataset.texte = `${dt} ${nom}`.toLowerCase();
    r.dataset.prix = (Math.abs(m) / 100).toFixed(2);
    return r;
  };
  const liste = h("div", {}, ...lignes.map(rendu));
  const filtrer = (q) => {
    recherches.set(cle, q);
    const txt = q.trim().toLowerCase(), num = txt.replace(/[\s€]/g, "").replace(",", ".");
    let visible = 0;
    const lignesDom = [...liste.children];
    lignesDom.forEach((el, i) => {
      if (el.dataset.entete) return;
      const ok = !txt || el.dataset.texte.includes(txt) || (num && el.dataset.prix.includes(num));
      el.style.display = ok ? "" : "none"; if (ok) visible++;
    });
    lignesDom.forEach((el, i) => {
      if (!el.dataset.entete) return;
      let ok = false;
      for (let j = i + 1; j < lignesDom.length && !lignesDom[j].dataset.entete; j++) if (lignesDom[j].style.display !== "none") ok = true;
      el.style.display = ok ? "" : "none";
    });
    vide.style.display = txt && !visible ? "" : "none";
  };
  const vide = h("p", { class: "note", style: "display:none" }, "Aucun résultat.");
  const champRecherche = h("input", { type: "search", class: "recherche-detail", placeholder: "Rechercher un prix ou un nom", value: recherches.get(cle) || "", "aria-label": "Rechercher", oninput: (e) => filtrer(e.target.value) });
  const d = h("details", { class: "tableau-proj", open: ouverts.has(cle) ? true : null }, h("summary", {}, `${titre} (${nb})`),
    lignes.length ? h("div", {}, nb > 1 ? champRecherche : null, liste, vide) : h("p", { class: "note" }, "Aucune dépense."));
  if (nb > 1 && recherches.get(cle)) filtrer(recherches.get(cle));
  d.addEventListener("toggle", () => { if (d.open) ouverts.add(cle); else ouverts.delete(cle); });
  return d;
}

function editeurHistorique(libelle, histoInitial) {
  const lignes = (histoInitial || []).map((x) => ({ depuis: x.depuis || "", brut: x.brut || 0 }));
  if (!lignes.length) lignes.push({ depuis: "", brut: 0 });
  const zone = h("div", {});
  const dessiner = () => zone.replaceChildren(...lignes.map((x, i) => {
    const d = h("input", { type: "month", value: x.depuis || "", "aria-label": "À partir de" });
    d.addEventListener("input", () => { x.depuis = d.value; });
    const m = h("input", { type: "text", inputmode: "decimal", value: x.brut ? versSaisie(x.brut) : "", placeholder: "Brut annuel", "aria-label": "Salaire brut annuel" });
    m.addEventListener("input", () => { x.brut = Math.abs(versCentimes(m.value) || 0); });
    return h("div", { class: "ligne-synthese" }, d, m, lignes.length > 1 ? h("button", { type: "button", class: "sec", "aria-label": "Retirer", onclick: () => { lignes.splice(i, 1); dessiner(); } }, "✕") : null);
  }));
  dessiner();
  const noeud = h("div", { class: "champ" }, h("label", {}, libelle), zone,
    h("button", { type: "button", class: "sec", onclick: () => { lignes.push({ depuis: "", brut: 0 }); dessiner(); } }, "+ Augmentation"));
  return { noeud, valeur: () => lignes.filter((x) => x.brut > 0).map((x) => ({ depuis: x.depuis || "", brut: x.brut })).sort((p, q) => p.depuis.localeCompare(q.depuis)) };
}

function formParametres() {
  const P = params();
  const iChr = h("input", { type: "text", value: P.nomChr, autocomplete: "off" });
  const iAle = h("input", { type: "text", value: P.nomAle, autocomplete: "off" });
  const baseChr = (P.histoChr && P.histoChr.length) ? P.histoChr : (P.brutChr ? [{ depuis: "", brut: P.brutChr }] : []);
  const baseAle = (P.histoAle && P.histoAle.length) ? P.histoAle : (P.brutAle ? [{ depuis: "", brut: P.brutAle }] : []);
  const eChr = editeurHistorique("Salaire brut annuel : première personne", baseChr);
  const eAle = editeurHistorique("Salaire brut annuel : seconde personne", baseAle);
  const iCoef = h("input", { type: "text", inputmode: "decimal", value: String(P.coef).replace(".", ",") });
  const corps = h("div", {},
    champ("Prénom de la première personne (vous)", iChr), champ("Prénom de la seconde personne", iAle),
    eChr.noeud, eAle.noeud,
    h("p", { class: "note" }, "Ajoute une ligne à chaque changement de salaire, avec le mois à partir duquel il s'applique. Une première ligne sans date vaut « depuis le début »."),
    champ("Coefficient brut vers net", iCoef),
    h("p", { class: "note" }, "Net mensuel = brut annuel × coefficient ÷ 12. La répartition « prorata » suit ces revenus nets, mois par mois."),
    h("div", { class: "actions" }, h("button", { type: "submit" }, "Enregistrer"), h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Paramètres du duo", corps);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const coef = parseFloat(iCoef.value.replace(",", "."));
    const hc = eChr.valeur(), ha = eAle.valeur();
    const l = lot();
    l.set("reglages", "duo", { nomChr: iChr.value.trim() || "Moi", nomAle: iAle.value.trim() || "Partenaire", histoChr: hc, histoAle: ha,
      brutChr: hc.length ? hc[hc.length - 1].brut : 0, brutAle: ha.length ? ha[ha.length - 1].brut : 0, coef: Number.isFinite(coef) && coef > 0 ? coef : 0.77 });
    l.envoyer(); dialogue.close();
  });
}

function formLignes() {
  const P = params();
  const lignes = (P.lignes || []).map((x) => ({ ...x }));
  if (!lignes.length) lignes.push({ nom: "", montant: 0, periode: "mensuel", mode: "prorata", credit: false });
  const modes = [["prorata", "Prorata"], ["5050", "50/50"], ["chr", "100 % " + P.nomChr], ["ale", "100 % " + P.nomAle]];
  const corpsTable = h("tbody", {});
  const lignesDom = [];   // références des champs, pour passer à la ligne suivante avec Entrée
  function dessiner() {
    lignesDom.length = 0;
    corpsTable.replaceChildren(...lignes.map((x, i) => {
      const cr = h("input", { type: "checkbox", checked: x.credit ? true : null, "aria-label": "Crédit" });
      cr.addEventListener("change", () => { x.credit = cr.checked; });
      const nom = h("input", { type: "text", value: x.nom || "", placeholder: "Nom", autocomplete: "off", "aria-label": "Nom" });
      nom.addEventListener("input", () => { x.nom = nom.value; });
      const mt = h("input", { type: "text", inputmode: "decimal", value: x.montant ? versSaisie(x.montant) : "", placeholder: "Prix", "aria-label": "Prix" });
      mt.addEventListener("input", () => { x.montant = Math.abs(versCentimes(mt.value) || 0); });
      mt.addEventListener("change", () => { if (x.montant) mt.value = versSaisie(x.montant); });
      const per = selecteur([["mensuel", "/mois"], ["annuel", "/an"]], x.periode || "mensuel", { "aria-label": "Périodicité" });
      per.addEventListener("change", () => { x.periode = per.value; });
      const mode = selecteur(modes, x.mode || "prorata", { "aria-label": "Répartition" });
      mode.addEventListener("change", () => { x.mode = mode.value; });
      lignesDom.push({ nom, mt });
      for (const [col, champSaisie] of [["nom", nom], ["mt", mt]]) {
        champSaisie.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          if (i === lignes.length - 1) { lignes.push({ nom: "", montant: 0, periode: "mensuel", mode: "prorata", credit: false }); dessiner(); }
          lignesDom[i + 1][col].focus();
        });
      }
      return h("tr", {}, h("td", { class: "centre" }, cr), h("td", {}, nom), h("td", {}, mt), h("td", {}, per), h("td", {}, mode),
        h("td", {}, h("button", { type: "button", class: "sec", "aria-label": "Retirer cette ligne", onclick: () => { lignes.splice(i, 1); dessiner(); } }, "✕")));
    }));
  }
  dessiner();
  const table = h("table", { class: "table-provision" },
    h("thead", {}, h("tr", {}, h("th", {}, "Créd."), h("th", {}, "Nom"), h("th", {}, "Prix"), h("th", {}, "Par"), h("th", {}, "Répartition"), h("th", {}, ""))),
    corpsTable);
  const corps = h("div", {},
    h("p", { class: "note" }, "Dépenses prélevées sur le compte commun ou provisionnées. Une dépense par an est lissée : prix ÷ 12 chaque mois. « Crédit » alimente le taux d'endettement. Entrée passe à la ligne suivante."),
    h("div", { class: "defile-x" }, table),
    h("button", { type: "button", class: "sec", onclick: () => { lignes.push({ nom: "", montant: 0, periode: "mensuel", mode: "prorata", credit: false }); dessiner(); lignesDom[lignes.length - 1].nom.focus(); } }, "+ Ajouter une ligne"),
    h("div", { class: "actions" }, h("button", { type: "submit" }, "Enregistrer"), h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Provision du compte commun", corps);
  dialogue.style.width = "calc(100vw - 8px)"; dialogue.style.padding = "10px";   // place maximale pour le tableau
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const l = lot();
    l.set("reglages", "duo", { lignes: lignes.filter((x) => (x.nom || "").trim() || x.montant).map((x) => ({ nom: (x.nom || "").trim(), montant: x.montant || 0, periode: x.periode || "mensuel", mode: x.mode || "prorata", credit: !!x.credit })) });
    l.envoyer(); dialogue.close();
  });
}

export function monter(conteneur) {
  let mois = aujourdhui().slice(0, 7);
  let saisie = null, moisSaisie = null, vueQui = "tous";   // montants de l'autre personne (texte), conservés pendant la frappe
  const titre = h("strong", { class: "mois-budget" });
  const nav = h("div", { class: "nav-mois" },
    h("button", { type: "button", class: "sec", "aria-label": "Mois précédent", onclick: () => { mois = moisDecale(mois, -1); maj(); } }, "‹"),
    titre,
    h("button", { type: "button", class: "sec", "aria-label": "Mois suivant", onclick: () => { mois = moisDecale(mois, 1); maj(); } }, "›"));
  const corps = h("div", {});
  const grille = h("div", {});
  conteneur.replaceChildren(h("h2", {}, "Duo"), h("button", { type: "button", class: "sec", onclick: () => formParametres() }, "⚙️ Paramètres (salaires, noms)"), nav, corps);

  const montantsSaisis = () => (saisie || []).map((t) => Math.abs(versCentimes(t) || 0)).filter((x) => x > 0);
  const recurrentes = () => recurrentesDuMois(params(), mois);
  const montants = () => [...recurrentes().map((r) => r.montant), ...montantsSaisis()];
  const persoDe = (cle) => Math.abs(docMois(mois)[cle] || 0);

  const optsMois = () => { const d = docMois(mois); return { exclus: d.exclus || [], inclus: d.inclus || [] }; };
  function retirer(id) { const o = optsMois(); enregistrerMois({ exclus: [...new Set([...o.exclus, id])], inclus: o.inclus.filter((x) => x !== id) }); }
  function remettre(id) { const o = optsMois(); enregistrerMois({ exclus: o.exclus.filter((x) => x !== id) }); }
  function ajouter(id) { const o = optsMois(); enregistrerMois({ inclus: [...new Set([...o.inclus, id])], exclus: o.exclus.filter((x) => x !== id) }); }

  function ajouterRecurrente(nom, montant) {
    const P = params();
    const l = lot();
    l.set("reglages", "duo", { recurrentes: [...(P.recurrentes || []), { id: String(Date.now()), nom, montant, depuis: mois, fin: null }] });
    l.envoyer();
  }
  function retirerRecurrente(r) {
    const P = params();
    const fin = moisDecale(mois, -1);
    const liste = (P.recurrentes || []).flatMap((x) => (x.id !== r.id ? [x] : (x.depuis && x.depuis > fin ? [] : [{ ...x, fin }])));
    const l = lot(); l.set("reglages", "duo", { recurrentes: liste }); l.envoyer();
  }
  function carteRecurrentes(P) {
    const iNom = h("input", { type: "text", placeholder: "Nom (ex. nounou)", autocomplete: "off", "aria-label": "Nom de la dépense récurrente" });
    const iMt = h("input", { type: "text", inputmode: "decimal", placeholder: "Montant", "aria-label": "Montant" });
    const liste = recurrentes();
    return h("div", { class: "carte", "data-resume": liste.length ? `${euros(liste.reduce((t, r) => t + r.montant, 0))} / mois` : "aucune" }, h("h3", { class: "titre-carte" }, `Dépenses récurrentes : ${P.nomAle}`),
      h("p", { class: "note" }, "Reprises automatiquement chaque mois, à partir du mois affiché, jusqu'à ce que tu les retires."),
      ...liste.map((r) => h("div", { class: "ligne-synthese" }, h("span", {}, `${r.nom || "Dépense"} · ${euros(r.montant)}`),
        h("button", { type: "button", class: "sec bouton-choix", onclick: () => retirerRecurrente(r) }, "Retirer dès ce mois"))),
      h("div", { class: "ligne-synthese" }, iNom, iMt),
      h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => {
        const m = Math.abs(versCentimes(iMt.value) || 0);
        if (!m) return;
        ajouterRecurrente(iNom.value.trim(), m); iNom.value = ""; iMt.value = "";
      } }, "Ajouter dès ce mois")));
  }

  function enregistrerMois(champs) { const l = lot(); l.set("reglages", "duo_" + mois, champs); l.envoyer(); }

  function dessinerGrille(nomAle) {
    const inputs = [];
    const ligne = (valeur) => {
      const i = h("input", { type: "text", inputmode: "decimal", enterkeyhint: "next", placeholder: "Montant", value: valeur || "", autocomplete: "off", "aria-label": "Dépense : " + nomAle });
      i.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const k = inputs.indexOf(i);
        if (k === inputs.length - 1) { const n = ligne(""); inputs.push(n); grille.append(n); n.focus(); } else inputs[k + 1].focus();
      });
      i.addEventListener("input", () => { saisie = inputs.map((x) => x.value); majTotaux(); majResume(grille, euros(montantsSaisis().reduce((t, x) => t + x, 0))); });
      i.addEventListener("change", () => {
        const m = montantsDepuisTexte(i.value);
        i.value = m.length ? versSaisie(m[0]) : "";   // un montant lisible est réécrit au format « 12,50 »
        saisie = inputs.map((x) => x.value); majTotaux();
        enregistrerMois({ ale: montantsSaisis() });
      });
      // Collage de plusieurs cellules (une par ligne) : une ligne par montant, au format numérique
      i.addEventListener("paste", (e) => {
        const texte = (e.clipboardData || window.clipboardData).getData("text");
        const m = montantsDepuisTexte(texte);
        if (!m.length) return;
        e.preventDefault();
        let k = inputs.indexOf(i);
        for (const c of m) {
          if (k >= inputs.length) { const n = ligne(""); inputs.push(n); grille.append(n); }
          inputs[k].value = versSaisie(c);
          k++;
        }
        if (inputs[inputs.length - 1].value) { const n = ligne(""); inputs.push(n); grille.append(n); }
        inputs[Math.min(k, inputs.length - 1)].focus();
        saisie = inputs.map((x) => x.value); majTotaux();
        enregistrerMois({ ale: montantsSaisis() });
      });
      return i;
    };
    const valeurs = (docMois(mois).ale || []).map((c) => versSaisie(c));
    inputs.length = 0;
    for (const v of valeurs.length ? valeurs : [""]) inputs.push(ligne(v));
    if (valeurs.length) inputs.push(ligne(""));
    saisie = inputs.map((x) => x.value);
    grille.replaceChildren(...inputs);
  }

  const zoneTotaux = h("div", {});
  function majTotaux() { if (pret()) zoneTotaux.replaceChildren(...bilanNoeuds()); }

  function bilanNoeuds() {
    const P = params();
    const b = bilanDuo({ params: P, chrPartagees: depensesPartagees(etat.operations, mois, optsMois()), ale: montants(), persoChr: persoDe("persoChr"), persoAle: persoDe("persoAle"), mois });
    const pc = (x) => Math.round(x * 100) + " %";
    const L = (a, v, cls) => h("div", { class: "ligne-synthese" }, h("span", {}, a), h("strong", { class: cls || "" }, v));
    const doit = b.doit
      ? `${b.doit.de === "chr" ? P.nomChr : P.nomAle} doit ${euros(b.doit.montant)} à ${b.doit.de === "chr" ? P.nomAle : P.nomChr}`
      : "Les comptes sont équilibrés";
    const sansReglage = !P.brutChr && !P.brutAle;
    return [
      h("div", { class: "carte", "data-resume": b.depTotal ? doit : "aucune dépense" }, h("h3", { class: "titre-carte" }, "Qui doit quoi"), h("p", {}, h("strong", {}, b.depTotal ? doit : "Aucune dépense partagée ce mois-ci")),
        sansReglage ? h("div", {}, h("p", { class: "note" }, "Renseigne d'abord les salaires : sans eux, la répartition est de 50/50."), h("div", { class: "actions" }, h("button", { type: "button", onclick: () => formParametres() }, "Renseigner les salaires"))) : null,
        L(`Dépenses payées par ${P.nomChr}`, euros(b.depChr)), L(`Dépenses payées par ${P.nomAle}`, euros(b.depAle)), L("Total partagé", euros(b.depTotal)),
        detail(`Détail des dépenses : ${P.nomChr}`, parCompte(operationsPartagees(etat.operations, mois, optsMois()), (o) => [dateCourte(o.date), `${o.nom}${nomCat(o.categorieId) ? " · " + nomCat(o.categorieId) : ""}${o.montant > 0 ? " (remboursement)" : ""}`, -o.montant, { libelle: "Retirer", fait: () => retirer(o.id) }]), "chr"),
        detail("Retirées du duo", parCompte(operationsRetirees(etat.operations, mois, optsMois()), (o) => [dateCourte(o.date), o.nom, -o.montant, { libelle: "Remettre", fait: () => remettre(o.id) }]), "retirees"),
        detail("Déduire un remboursement", parCompte(remboursementsPossibles(etat.operations, mois, optsMois()), (o) => [dateCourte(o.date), `${o.nom}${nomCat(o.categorieId) ? " · " + nomCat(o.categorieId) : ""}`, o.montant, { libelle: "Déduire", fait: () => ajouter(o.id) }]), "rembs"),
        detail("Ajouter une dépense manquante", parCompte(operationsManquantes(etat.operations, mois, optsMois()), (o) => [dateCourte(o.date), o.nom, -o.montant, { libelle: "Ajouter", fait: () => ajouter(o.id) }]), "manquantes"),
        detail(`Détail des dépenses : ${P.nomAle}`, [...recurrentes().map((r) => ["", `${r.nom || "Dépense"} (récurrente)`, r.montant]), ...montantsSaisis().map((m, i) => ["", `Dépense ${i + 1}`, m])], "ale"),
        L(`Part : ${P.nomChr} (${pc(b.partChr)})`, euros(b.partDepChr)), L(`Part : ${P.nomAle} (${pc(b.partAle)})`, euros(b.partDepAle))),
      h("div", { class: "carte", "data-resume": `${euros(b.provChr)} · ${euros(b.provAle)}` }, h("h3", { class: "titre-carte" }, "Provision du compte commun"),
        b.lignes.length ? h("div", {}, ...b.lignes.map((l) => h("div", { class: "ligne-synthese" }, h("span", {}, `${l.nom || "Sans nom"}${l.periode === "annuel" ? " (annuel ÷ 12)" : ""} · ${euros(l.mensuel)}`), h("small", {}, `${euros(l.chr)} / ${euros(l.ale)}`))))
          : h("p", { class: "note" }, "Aucune ligne. Ajoute tes dépenses du compte commun."),
        L(`À provisionner : ${P.nomChr}`, euros(b.provChr)), L(`À provisionner : ${P.nomAle}`, euros(b.provAle)),
        h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => formLignes() }, "Modifier les lignes"))),
      h("div", { class: "carte", "data-resume": `restant ${euros(b.restantChr)} · ${euros(b.restantAle)}` }, h("h3", { class: "titre-carte" }, "Bilan du mois"),
        h("div", { class: "ligne-synthese" }, h("span", {}, ""), h("strong", {}, `${P.nomChr} · ${P.nomAle}`)),
        L("Revenu net", `${euros(b.netChr)} · ${euros(b.netAle)}`), L("Provision", `${euros(b.provChr)} · ${euros(b.provAle)}`),
        L("Part des dépenses partagées", `${euros(b.partDepChr)} · ${euros(b.partDepAle)}`),
        L("Dépenses personnelles", `${euros(persoDe("persoChr"))} · ${euros(persoDe("persoAle"))}`),
        L("Restant", `${euros(b.restantChr)} · ${euros(b.restantAle)}`, b.restantChr < 0 || b.restantAle < 0 ? "montant neg" : "montant pos"),
        h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => formPerso() }, "Dépenses personnelles du mois"), h("button", { type: "button", class: "sec", onclick: () => formParametres() }, "Paramètres"))),
      ...cartesPouvoirAchat(P, b)
    ];
  }


  function cartesPouvoirAchat(P, b) {
    const noms = { chr: P.nomChr, ale: P.nomAle, tous: "Ensemble" };
    const choix = h("div", { class: "modes-bilan" }, ...["chr", "ale", "tous"].map((q) => h("button", { type: "button", class: "sec" + (vueQui === q ? " actif-filtre" : ""), onclick: () => { vueQui = q; majTotaux(); } }, noms[q])));
    const v = vueBilan(b, vueQui);
    const ev = evolution({ params: P, mois, qui: vueQui, n: 12, decale: moisDecale });
    const prem = ev[0], der = ev[ev.length - 1];
    const pct = (a, z) => (a > 0 ? `${z >= a ? "+" : "−"}${Math.abs(Math.round((z - a) / a * 1000) / 10).toString().replace(".", ",")} %` : "—");
    const L = (a, val, cls) => h("div", { class: "ligne-synthese" }, h("span", {}, a), h("strong", { class: cls || "" }, val));
    const taux = v.tauxEndettement == null ? "—" : `${Math.round(v.tauxEndettement * 1000) / 10} %`.replace(".", ",");
    const cartes = [
      h("div", { class: "carte", "data-resume": `${taux} · reste à vivre ${euros(v.resteAVivre)}` }, h("h3", { class: "titre-carte" }, "Endettement et reste à vivre"), choix,
        L("Revenu net mensuel", euros(v.net)),
        L("Provision du compte commun", euros(v.prov)),
        L("Reste à vivre (revenu net − provision)", euros(v.resteAVivre), v.resteAVivre < 0 ? "montant neg" : "montant pos"),
        L("Crédits (lignes marquées « crédit »)", euros(v.credit)),
        L("Taux d'endettement", taux, v.tauxEndettement != null && v.tauxEndettement > 0.35 ? "montant neg" : ""),
        h("p", { class: "note" }, v.credit ? "Taux d'endettement = crédits ÷ revenu net. Les banques retiennent en général 35 % comme repère." : "Aucune ligne n'est marquée « crédit » : dans « Modifier les lignes », coche « crédit » sur le prêt immobilier et les assurances de prêt.")),
      h("div", { class: "carte", "data-resume": `net ${pct(prem.net, der.net)} · reste à vivre ${pct(prem.resteAVivre, der.resteAVivre)}` }, h("h3", { class: "titre-carte" }, `Évolution sur 12 mois : ${noms[vueQui]}`),
        L("Revenu net", `${euros(prem.net)} → ${euros(der.net)} (${pct(prem.net, der.net)})`),
        L("Reste à vivre", `${euros(prem.resteAVivre)} → ${euros(der.resteAVivre)} (${pct(prem.resteAVivre, der.resteAVivre)})`),
        detail("Mois par mois", ev.slice().reverse().map((x) => [moisFr(x.mois + "-01"), `net ${euros(x.net)} · reste à vivre`, x.resteAVivre])),
        h("p", { class: "note" }, "Calculé avec le salaire en vigueur chaque mois et les lignes de provision actuelles.")),
      carteEmprunt(P, v, noms)
    ];
    cartes.push(carteGraphiques(P, choix, noms));
    return [cartes[0], cartes[2], cartes[1], cartes[3]];   // l'emprunt suit directement l'endettement
  }


  function carteGraphiques(P, choix, noms) {
    const serie = serieDuo({ params: P, operations: etat.operations, reglages: etat.reglages, mois, n: 12, decale: moisDecale, qui: vueQui });
    const tend = tendance(serie.map((p) => p.restant));
    const moy = (cle) => Math.round(serie.reduce((a, p) => a + p[cle], 0) / serie.length);
    const sens = Math.abs(tend.pente) < 100 ? "reste stable" : tend.pente > 0 ? `en hausse de ${euros(Math.round(tend.pente))} par mois` : `en baisse de ${euros(Math.round(-tend.pente))} par mois`;
    const L = (a, val, cls) => h("div", { class: "ligne-synthese" }, h("span", {}, a), h("strong", { class: cls || "" }, val));
    const reel = serie.filter((p) => p.reel).length;
    return h("div", { class: "carte", "data-resume": `reste moyen ${euros(moy("restant"))} · ${sens}` }, h("h3", { class: "titre-carte" }, `Bilan graphique (12 mois) : ${noms[vueQui]}`), basculeQui(P, noms),
      L("Recettes moyennes", euros(moy("recettes"))), L("Dépenses moyennes", euros(moy("depenses"))), L("Reste moyen par mois", euros(moy("restant")), moy("restant") < 0 ? "montant neg" : "montant pos"),
      L("Tendance du reste", sens, tend.pente < -100 ? "montant neg" : ""),
      h("p", { class: "titre-graphe" }, "Recettes et dépenses"), lignesRecettesDepenses(serie),
      h("p", { class: "titre-graphe" }, "Reste de chaque mois et tendance"), barresReste(serie, tend),
      h("p", { class: "titre-graphe" }, "Composition des dépenses"), barresComposition(serie),
      tableauSerie(serie),
      h("p", { class: "note" }, `Dépenses = provision du compte commun + part des dépenses partagées + dépenses personnelles. ${reel < serie.length ? `Seuls ${reel} mois sur ${serie.length} ont des dépenses saisies : les autres (barres atténuées) ne comptent que la provision.` : ""}`));
  }
  function basculeQui(P, noms) {
    return h("div", { class: "modes-bilan" }, ...["chr", "ale", "tous"].map((q) => h("button", { type: "button", class: "sec" + (vueQui === q ? " actif-filtre" : ""), onclick: () => { vueQui = q; majTotaux(); } }, noms[q])));
  }

  function carteEmprunt(P, v, noms) {
    const E = { taux: 3.5, ans: 20, assur: 0.3, ...(P.emprunt || {}) };
    const nombre = (t, defaut) => { const x = parseFloat(String(t).replace(",", ".")); return Number.isFinite(x) && x >= 0 ? x : defaut; };
    const champNb = (libelle, valeur, cle, defaut) => {
      const i = h("input", { type: "text", inputmode: "decimal", value: String(valeur).replace(".", ","), "aria-label": libelle });
      i.addEventListener("change", () => {
        const l = lot(); l.set("reglages", "duo", { emprunt: { ...E, [cle]: cle === "ans" ? Math.max(1, nombre(i.value, defaut)) : nombre(i.value, defaut) } }); l.envoyer();
      });
      return champ(libelle, i);
    };
    const c = capaciteEmprunt({ net: v.net, creditExistant: v.credit, taux: E.taux, ans: E.ans, assurance: E.assur });
    const L = (a, val, cls) => h("div", { class: "ligne-synthese" }, h("span", {}, a), h("strong", { class: cls || "" }, val));
    const duree = (an) => ({ an, c: capaciteEmprunt({ net: v.net, creditExistant: v.credit, taux: E.taux, ans: an, assurance: E.assur }) });
    return h("div", { class: "carte", "data-resume": c.deborde ? "déjà au-dessus du seuil" : `${euros(c.capital)} (mensualité ${euros(c.mensualiteMax)})` }, h("h3", { class: "titre-carte" }, `Nouveau crédit possible : ${noms[vueQui]}`),
      h("p", { class: "note" }, `Pour rester sous ${Math.round(SEUIL_ENDETTEMENT * 100)} % d'endettement, crédits actuels compris. Taux, durée et assurance sont à adapter aux offres reçues.`),
      champNb("Taux annuel du crédit (%)", E.taux, "taux", 3.5), champNb("Durée (années)", E.ans, "ans", 20), champNb("Assurance par an (% du capital)", E.assur, "assur", 0.3),
      c.deborde ? h("p", { class: "avert-proj" }, "Les crédits actuels dépassent déjà le seuil : aucun nouveau crédit n'est possible dans ces conditions.") : null,
      L("Mensualité maximale du nouveau crédit", euros(c.mensualiteMax), c.mensualiteMax > 0 ? "montant pos" : "montant neg"),
      L("Montant empruntable", euros(c.capital), "montant pos"),
      L("Coût des intérêts", euros(c.interets)),
      c.assuranceTotale ? L("Coût de l'assurance", euros(c.assuranceTotale)) : null,
      L("Coût total du crédit", euros(c.coutTotal)),
      L("Reste à vivre après ce crédit", euros(v.resteAVivre - c.mensualiteMax), v.resteAVivre - c.mensualiteMax < 0 ? "montant neg" : ""),
      detail("Montant selon la durée", [10, 15, 20, 25].map(duree).map(({ an, c: x }) => [`${an} ans`, `mensualité ${euros(x.mensualiteMax)}`, x.capital]), "durees"),
      h("p", { class: "note" }, "Estimation indicative : la banque regarde aussi ton apport, ton reste à vivre et ta situation. Ce n'est pas un conseil financier."));
  }

  function formPerso() {
    const P = params();
    const a = h("input", { type: "text", inputmode: "decimal", value: persoDe("persoChr") ? versSaisie(persoDe("persoChr")) : "" });
    const b = h("input", { type: "text", inputmode: "decimal", value: persoDe("persoAle") ? versSaisie(persoDe("persoAle")) : "" });
    const c = h("div", {}, champ(`Dépenses personnelles : ${P.nomChr}`, a), champ(`Dépenses personnelles : ${P.nomAle}`, b),
      h("div", { class: "actions" }, h("button", { type: "submit" }, "Enregistrer"), h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
    const { dialogue, formulaire } = modale("Dépenses personnelles, " + moisFr(mois + "-01"), c);
    formulaire.addEventListener("submit", (e) => { e.preventDefault(); enregistrerMois({ persoChr: Math.abs(versCentimes(a.value) || 0), persoAle: Math.abs(versCentimes(b.value) || 0) }); dialogue.close(); });
  }

  function maj() {
    titre.textContent = moisFr(mois + "-01");
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const P = params();
    // La grille de saisie n'est redessinée qu'au changement de mois : elle garde le focus pendant la frappe.
    if (moisSaisie !== mois) { moisSaisie = mois; dessinerGrille(P.nomAle); }
    const nbOps = operationsPartagees(etat.operations, mois, optsMois()).length;
    corps.replaceChildren(
      h("div", { class: "carte", "data-resume": euros(montantsSaisis().reduce((t, x) => t + x, 0)) }, h("h3", { class: "titre-carte" }, `Dépenses saisies : ${P.nomAle}`),
        h("p", { class: "note" }, "Un montant par ligne. Entrée passe à la ligne suivante. Tu peux aussi coller plusieurs cellules Excel d'un coup."), grille),
      carteRecurrentes(P),
      h("p", { class: "note" }, `${P.nomChr} : ${nbOps} opération(s) comptée(s) ce mois-ci (marquées « à exporter »).`),
      zoneTotaux);
    majTotaux();
  }
  maj();
  return { maj: () => { if (document.activeElement && corps.contains(document.activeElement) && document.activeElement.tagName === "INPUT") majTotaux(); else maj(); } };
}
