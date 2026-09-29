// Saisie rapide en tableau : une ligne = date, titre, montant (− débit, + crédit), export.
import { etat, ecrireEnParallele, nouvelId, serverTimestamp, comparerComptes } from "./store.js";
import { STATUTS } from "./constantes.js";
import { euros, aujourdhui, dateFr, sansAccent } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { analyserDate, analyserReleve, montantSigne } from "./saisie.js";

export function formRapide({ compteId }) {
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === compteId).sort(comparerComptes);
  const iCompte = selecteur(comptes.map((c) => [c.id, c.nom]), compteId);
  const iStatut = selecteur(STATUTS.filter((s) => s[0] !== "annule"), "encours");
  const iExport = h("input", { type: "checkbox", checked: true });
  const iDoublons = h("input", { type: "checkbox", checked: true });
  const corps = h("tbody");
  const recap = h("p", { class: "note" });
  const erreur = h("p", { class: "erreur" });
  const zoneColle = h("div", { class: "cache" });
  const iColle = h("textarea", { rows: 8, placeholder: "28/09/2026\nPAIEMENT PSC 2609 VILLETELLE\n-125,00 EUR\n\n28/09/2026\nVIR SMAG\n+3 128,84 EUR" });
  const lignes = [];

  function ajouterLigne(date = "", titre = "", montant = "") {
    const iDate = h("input", { type: "text", inputmode: "decimal", placeholder: "jjmmaa", autocomplete: "off", value: date });
    const iTitre = h("input", { type: "text", placeholder: "Titre", autocomplete: "off", value: titre });
    const iMontant = h("input", { type: "text", inputmode: "decimal", placeholder: "-0,00", autocomplete: "off", value: montant });
    const iExp = h("input", { type: "checkbox", checked: iExport.checked, "aria-label": "À exporter" });
    const info = h("small", { class: "apercu-date" });
    const ligne = { iDate, iTitre, iMontant, iExp, info };
    const tr = h("tr", {},
      h("td", {}, h("div", { class: "cellule" }, iDate, info)),
      h("td", {}, iTitre),
      h("td", {}, iMontant),
      h("td", { class: "centre" }, iExp),
      h("td", {}, h("button", { type: "button", class: "croix", "aria-label": "Supprimer la ligne", onclick: () => {
        lignes.splice(lignes.indexOf(ligne), 1); tr.remove();
        if (!lignes.length) ajouterLigne();
        majRecap();
      } }, "×")));
    ligne.tr = tr;
    lignes.push(ligne);
    corps.append(tr);
    const suivant = () => { const i = lignes.indexOf(ligne); if (i === lignes.length - 1) ajouterLigne(); return lignes[i + 1]; };
    iDate.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); iTitre.focus(); } });
    iTitre.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); iMontant.focus(); } });
    iMontant.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); suivant().iDate.focus(); } });
    for (const el of [iDate, iTitre, iMontant]) el.addEventListener("input", () => {
      if (lignes[lignes.length - 1] === ligne && iDate.value.trim() && iTitre.value.trim() && iMontant.value.trim()) ajouterLigne();
      majRecap();
    });
    iExp.addEventListener("change", majRecap);
    return ligne;
  }

  const vide = (l) => !l.iDate.value.trim() && !l.iTitre.value.trim() && !l.iMontant.value.trim();
  const cle = (compte, nom, date, m) => [compte, sansAccent(nom).trim(), date, m].join("|");

  function majRecap() {
    const existants = new Set(etat.operations.map((o) => cle(o.compteId, o.nom, o.date, o.montant)));
    const vus = new Set();
    let invalides = 0, doublons = 0, debit = 0, credit = 0;
    const aEcrire = [];
    for (const l of lignes) {
      l.tr.classList.remove("invalide", "doublon");
      if (vide(l)) { l.info.textContent = ""; continue; }
      const date = analyserDate(l.iDate.value, aujourdhui()), m = montantSigne(l.iMontant.value), titre = l.iTitre.value.trim();
      const bon = date && m !== null && titre;
      let txt = date ? dateFr(date) : "date ?";
      if (m !== null) txt += m < 0 ? " · débit" : " · crédit";
      if (!bon) { invalides++; l.tr.classList.add("invalide"); l.info.textContent = txt; continue; }
      const k = cle(iCompte.value, titre, date, m);
      const dup = existants.has(k) || vus.has(k);
      vus.add(k);
      if (dup) { doublons++; l.tr.classList.add("doublon"); txt += " · déjà saisi ?"; }
      l.info.textContent = txt;
      if (dup && iDoublons.checked) continue;
      if (m < 0) debit += m; else credit += m;
      aEcrire.push({ date, titre, montant: m, aExporter: l.iExp.checked });
    }
    recap.textContent = `${aEcrire.length} opération(s) à créer – débits ${euros(debit)}, crédits ${euros(credit)}` +
      (doublons && iDoublons.checked ? ` – ${doublons} doublon(s) probable(s) ignoré(s)` : "") + (invalides ? ` – ${invalides} ligne(s) invalide(s)` : "");
    return { aEcrire, invalides };
  }

  for (let i = 0; i < 5; i++) ajouterLigne();

  const bColle = h("button", { type: "button", class: "sec", onclick: () => zoneColle.classList.toggle("cache") }, "Coller un relevé");
  zoneColle.append(
    h("p", { class: "note" }, "Collez le texte copié depuis votre banque : la date, le titre et le montant (− débit, + crédit), sur une même ligne séparés par une tabulation, ou chacun sur sa ligne."),
    iColle,
    h("button", { type: "button", class: "sec", onclick: () => {
      const lus = analyserReleve(iColle.value);
      if (!lus.length) { erreur.textContent = "Aucune opération reconnue."; return; }
      erreur.textContent = "";
      for (const l of [...lignes]) if (vide(l)) { l.tr.remove(); lignes.splice(lignes.indexOf(l), 1); }
      for (const o of lus) ajouterLigne(o.date, o.titre, o.montant);
      ajouterLigne();
      iColle.value = ""; zoneColle.classList.add("cache");
      majRecap();
    } }, "Remplir le tableau"));

  const { dialogue, formulaire } = modale("Tableau rapide", [
    h("p", { class: "note" }, "Une ligne par opération. Montant : « - » pour un débit, « + » pour un crédit (sans signe : débit)."),
    champ("Compte", iCompte), champ("Statut des opérations créées", iStatut),
    h("label", { class: "case" }, iExport, "À exporter (coche toutes les lignes)"),
    h("table", { class: "grille rapide-grille" }, h("thead", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Titre"), h("th", {}, "Montant (€)"), h("th", {}, "Exp."), h("th"))), corps),
    h("div", { class: "actions" },
      h("button", { type: "button", class: "sec", onclick: () => { for (let i = 0; i < 5; i++) ajouterLigne(); } }, "+ 5 lignes"), bColle),
    zoneColle,
    h("label", { class: "case" }, iDoublons, "Ignorer les doublons probables (même titre, date et montant)"),
    recap, erreur,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Créer les opérations"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"))
  ]);
  iExport.addEventListener("change", () => { lignes.forEach((l) => { l.iExp.checked = iExport.checked; }); majRecap(); });
  for (const el of [iCompte, iDoublons]) el.addEventListener("input", majRecap);
  majRecap();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const { aEcrire, invalides } = majRecap();
    if (invalides) { erreur.textContent = "Corrigez les lignes en rouge (date, titre ou montant manquant) ou videz-les."; return; }
    if (!aEcrire.length) { erreur.textContent = "Aucune opération à créer."; return; }
    const jour = aujourdhui(), statut = iStatut.value;
    const ecritures = aEcrire.map((v) => ["operations", nouvelId("operations"), {
      nom: v.titre, commentaire: "", date: v.date, montant: v.montant, compteId: iCompte.value, nature: "autre", info: "",
      categorieId: null, statut, datePointage: statut === "pointe" ? jour : null,
      aExporter: v.aExporter, virementId: null, cree: serverTimestamp()
    }]);
    ecrireEnParallele(ecritures).catch((err) => { console.error(err); alert("Échec de l'enregistrement : " + err.message); });
    dialogue.close();
  });
}
