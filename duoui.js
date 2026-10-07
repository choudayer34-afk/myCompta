// Écran « Duo » : gestion à deux (recettes, provision du compte commun, dépenses du mois, qui doit quoi).
import { etat, pret, lot } from "./store.js";
import { euros, aujourdhui, moisFr, versCentimes, versSaisie } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { moisDecale } from "./budget.js";
import { PARAMS_DEFAUT, bilanDuo, depensesPartagees, operationsPartagees } from "./duo.js";

const params = () => ({ ...PARAMS_DEFAUT, ...((etat.reglages.find((r) => r.id === "duo")) || {}) });
const docMois = (mois) => etat.reglages.find((r) => r.id === "duo_" + mois) || {};

const dateCourte = (iso) => { const [, m, j] = String(iso || "").split("-"); return j ? `${j}/${m}` : ""; };
const nomCat = (id) => { const c = etat.categories.find((x) => x.id === id); return c ? c.nom : ""; };
function detail(titre, lignes) {
  return h("details", { class: "tableau-proj" }, h("summary", {}, `${titre} (${lignes.length})`),
    lignes.length ? h("div", {}, ...lignes.map(([d, nom, m]) => h("div", { class: "ligne-synthese" }, h("span", {}, d ? `${d} · ${nom}` : nom), h("strong", {}, euros(m)))))
      : h("p", { class: "note" }, "Aucune dépense."));
}

function formParametres() {
  const P = params();
  const iChr = h("input", { type: "text", value: P.nomChr, autocomplete: "off" });
  const iAle = h("input", { type: "text", value: P.nomAle, autocomplete: "off" });
  const iBrutChr = h("input", { type: "text", inputmode: "decimal", value: P.brutChr ? versSaisie(P.brutChr) : "" });
  const iBrutAle = h("input", { type: "text", inputmode: "decimal", value: P.brutAle ? versSaisie(P.brutAle) : "" });
  const iCoef = h("input", { type: "text", inputmode: "decimal", value: String(P.coef).replace(".", ",") });
  const corps = h("div", {},
    champ("Prénom de la première personne (vous)", iChr), champ("Prénom de la seconde personne", iAle),
    champ("Salaire brut annuel (première personne)", iBrutChr), champ("Salaire brut annuel (seconde personne)", iBrutAle),
    champ("Coefficient brut vers net", iCoef),
    h("p", { class: "note" }, "Net mensuel = brut annuel × coefficient ÷ 12. La répartition « prorata » suit ces revenus nets."),
    h("div", { class: "actions" }, h("button", { type: "submit" }, "Enregistrer"), h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Paramètres du duo", corps);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const coef = parseFloat(iCoef.value.replace(",", "."));
    const l = lot();
    l.set("reglages", "duo", { nomChr: iChr.value.trim() || "Moi", nomAle: iAle.value.trim() || "Partenaire", brutChr: versCentimes(iBrutChr.value) || 0, brutAle: versCentimes(iBrutAle.value) || 0, coef: Number.isFinite(coef) && coef > 0 ? coef : 0.77 });
    l.envoyer(); dialogue.close();
  });
}

function formLignes() {
  const P = params();
  const lignes = (P.lignes || []).map((x) => ({ ...x }));
  const zone = h("div", {});
  const modes = [["prorata", "Prorata des salaires"], ["5050", "50/50"], ["chr", "100 % " + P.nomChr], ["ale", "100 % " + P.nomAle]];
  function dessiner() {
    zone.replaceChildren(...lignes.map((x, i) => {
      const nom = h("input", { type: "text", value: x.nom || "", placeholder: "ex. maison-assurance", autocomplete: "off" });
      nom.addEventListener("input", () => { x.nom = nom.value; });
      const mt = h("input", { type: "text", inputmode: "decimal", value: x.montant ? versSaisie(x.montant) : "", placeholder: "Montant" });
      mt.addEventListener("input", () => { x.montant = Math.abs(versCentimes(mt.value) || 0); });
      const per = selecteur([["mensuel", "par mois"], ["annuel", "par an (lissé sur 12 mois)"]], x.periode || "mensuel");
      per.addEventListener("change", () => { x.periode = per.value; });
      const mode = selecteur(modes, x.mode || "prorata");
      mode.addEventListener("change", () => { x.mode = mode.value; });
      return h("div", { class: "carte" }, nom, mt, per, mode,
        h("button", { type: "button", class: "danger", onclick: () => { lignes.splice(i, 1); dessiner(); } }, "Retirer cette ligne"));
    }));
  }
  dessiner();
  const corps = h("div", {},
    h("p", { class: "note" }, "Dépenses prélevées sur le compte commun (ou provisionnées). Une dépense annuelle est lissée : montant ÷ 12 chaque mois."),
    zone,
    h("button", { type: "button", class: "sec", onclick: () => { lignes.push({ nom: "", montant: 0, periode: "mensuel", mode: "prorata" }); dessiner(); } }, "+ Ajouter une ligne"),
    h("div", { class: "actions" }, h("button", { type: "submit" }, "Enregistrer"), h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Provision du compte commun", corps);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const l = lot();
    l.set("reglages", "duo", { lignes: lignes.filter((x) => (x.nom || "").trim() || x.montant).map((x) => ({ nom: (x.nom || "").trim(), montant: x.montant || 0, periode: x.periode || "mensuel", mode: x.mode || "prorata" })) });
    l.envoyer(); dialogue.close();
  });
}

export function monter(conteneur) {
  let mois = aujourdhui().slice(0, 7);
  let saisie = null, moisSaisie = null;   // montants de l'autre personne (texte), conservés pendant la frappe
  const titre = h("strong", { class: "mois-budget" });
  const nav = h("div", { class: "nav-mois" },
    h("button", { type: "button", class: "sec", "aria-label": "Mois précédent", onclick: () => { mois = moisDecale(mois, -1); maj(); } }, "‹"),
    titre,
    h("button", { type: "button", class: "sec", "aria-label": "Mois suivant", onclick: () => { mois = moisDecale(mois, 1); maj(); } }, "›"));
  const corps = h("div", {});
  const grille = h("div", {});
  conteneur.replaceChildren(h("h2", {}, "Duo"), h("button", { type: "button", class: "sec", onclick: () => formParametres() }, "⚙️ Paramètres (salaires, noms)"), nav, corps);

  const montants = () => (saisie || []).map((t) => Math.abs(versCentimes(t) || 0)).filter((x) => x > 0);
  const persoDe = (cle) => Math.abs(docMois(mois)[cle] || 0);

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
      i.addEventListener("input", () => { saisie = inputs.map((x) => x.value); majTotaux(); });
      i.addEventListener("change", () => enregistrerMois({ ale: montants() }));
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
    const b = bilanDuo({ params: P, chrPartagees: depensesPartagees(etat.operations, mois), ale: montants(), persoChr: persoDe("persoChr"), persoAle: persoDe("persoAle") });
    const pc = (x) => Math.round(x * 100) + " %";
    const L = (a, v, cls) => h("div", { class: "ligne-synthese" }, h("span", {}, a), h("strong", { class: cls || "" }, v));
    const doit = b.doit
      ? `${b.doit.de === "chr" ? P.nomChr : P.nomAle} doit ${euros(b.doit.montant)} à ${b.doit.de === "chr" ? P.nomAle : P.nomChr}`
      : "Les comptes sont équilibrés";
    const sansReglage = !P.brutChr && !P.brutAle;
    return [
      h("div", { class: "carte" }, h("h3", { class: "titre-carte" }, "Qui doit quoi"), h("p", {}, h("strong", {}, b.depTotal ? doit : "Aucune dépense partagée ce mois-ci")),
        sansReglage ? h("div", {}, h("p", { class: "note" }, "Renseigne d'abord les salaires : sans eux, la répartition est de 50/50."), h("div", { class: "actions" }, h("button", { type: "button", onclick: () => formParametres() }, "Renseigner les salaires"))) : null,
        L(`Dépenses payées par ${P.nomChr}`, euros(b.depChr)), L(`Dépenses payées par ${P.nomAle}`, euros(b.depAle)), L("Total partagé", euros(b.depTotal)),
        detail(`Détail des dépenses : ${P.nomChr}`, operationsPartagees(etat.operations, mois).map((o) => [dateCourte(o.date), `${o.nom}${nomCat(o.categorieId) ? " · " + nomCat(o.categorieId) : ""}`, -o.montant])),
        detail(`Détail des dépenses : ${P.nomAle}`, montants().map((m, i) => ["", `Dépense ${i + 1}`, m])),
        L(`Part : ${P.nomChr} (${pc(b.partChr)})`, euros(b.partDepChr)), L(`Part : ${P.nomAle} (${pc(b.partAle)})`, euros(b.partDepAle))),
      h("div", { class: "carte" }, h("h3", { class: "titre-carte" }, "Provision du compte commun"),
        b.lignes.length ? h("div", {}, ...b.lignes.map((l) => h("div", { class: "ligne-synthese" }, h("span", {}, `${l.nom || "Sans nom"}${l.periode === "annuel" ? " (annuel ÷ 12)" : ""} · ${euros(l.mensuel)}`), h("small", {}, `${euros(l.chr)} / ${euros(l.ale)}`))))
          : h("p", { class: "note" }, "Aucune ligne. Ajoute tes dépenses du compte commun."),
        L(`À provisionner : ${P.nomChr}`, euros(b.provChr)), L(`À provisionner : ${P.nomAle}`, euros(b.provAle)),
        h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => formLignes() }, "Modifier les lignes"))),
      h("div", { class: "carte" }, h("h3", { class: "titre-carte" }, "Bilan du mois"),
        h("div", { class: "ligne-synthese" }, h("span", {}, ""), h("strong", {}, `${P.nomChr} · ${P.nomAle}`)),
        L("Revenu net", `${euros(b.netChr)} · ${euros(b.netAle)}`), L("Provision", `${euros(b.provChr)} · ${euros(b.provAle)}`),
        L("Part des dépenses partagées", `${euros(b.partDepChr)} · ${euros(b.partDepAle)}`),
        L("Dépenses personnelles", `${euros(persoDe("persoChr"))} · ${euros(persoDe("persoAle"))}`),
        L("Restant", `${euros(b.restantChr)} · ${euros(b.restantAle)}`, b.restantChr < 0 || b.restantAle < 0 ? "montant neg" : "montant pos"),
        h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => formPerso() }, "Dépenses personnelles du mois"), h("button", { type: "button", class: "sec", onclick: () => formParametres() }, "Paramètres")))
    ];
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
    const nbOps = etat.operations.filter((o) => o.aExporter && o.montant < 0 && !o.virementId && o.statut !== "annule" && String(o.date || "").slice(0, 7) === mois).length;
    corps.replaceChildren(
      h("div", { class: "carte" }, h("h3", { class: "titre-carte" }, `Dépenses saisies : ${P.nomAle}`),
        h("p", { class: "note" }, "Un montant par ligne. Entrée passe à la ligne suivante."), grille),
      h("p", { class: "note" }, `${P.nomChr} : ${nbOps} opération(s) marquée(s) « à exporter » ce mois-ci.`),
      zoneTotaux);
    majTotaux();
  }
  maj();
  return { maj: () => { if (document.activeElement && grille.contains(document.activeElement)) majTotaux(); else maj(); } };
}
