// Tableau rapide : plusieurs opérations d'un coup. Une carte par opération (date avec calendrier, montant avec sens, titre avec suggestions).
import { etat, ecrireEnParallele, nouvelId, serverTimestamp, comparerComptes } from "./store.js";
import { NATURES, STATUTS } from "./constantes.js";
import { euros, versCentimes, aujourdhui, dateFr, sansAccent } from "./format.js";
import { h, modale, champ, selecteur, combo } from "./ui.js";
import { analyserDate, analyserReleve } from "./saisie.js";
import { nomsConnus, associationPour } from "./noms.js";

const ICONES = { encours: "○", pointe: "●" };

// Catégorie associée à ce nom (si l'association existe et que la catégorie existe encore et n'est pas archivée)
const categorieDe = (nom) => { const a = associationPour(etat.nomsCategories, nom); return a && etat.categories.some((c) => c.id === a.categorieId && !c.archive) ? a.categorieId : null; };
const jjmmaaaa = (iso) => iso.split("-").reverse().join("/");

export function formRapide({ compteId }) {
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === compteId).sort(comparerComptes);
  const noms = nomsConnus(etat.operations, etat.planifiees).map((n) => ({ id: n.nom, libelle: n.nom }));
  const iCompte = selecteur(comptes.map((c) => [c.id, c.nom]), compteId);
  const iNature = selecteur(NATURES, "carte");
  let statut = "encours";
  const boutonsStatut = STATUTS.filter((s) => s[0] !== "annule").map(([v, l]) => h("button", { type: "button", class: "statut-choix", role: "radio", "data-v": v,
    onclick: () => { statut = v; majStatut(); } }, h("span", { class: "ico" }, ICONES[v]), h("small", {}, l)));
  const majStatut = () => boutonsStatut.forEach((b) => { const on = b.dataset.v === statut; b.classList.toggle("actif", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
  const iExport = h("input", { type: "checkbox", checked: true });
  const iDoublons = h("input", { type: "checkbox", checked: true });
  const iMeme = h("input", { type: "checkbox" });
  const iDateCommune = h("input", { type: "text", inputmode: "decimal", placeholder: "jjmmaa ou jj.mm.aaaa", autocomplete: "off", value: jjmmaaaa(aujourdhui()) });
  const cDateCommune = h("div", { class: "champ" }, h("label", {}, "Date commune à toutes les lignes"), champDate(iDateCommune));
  cDateCommune.hidden = true;
  const liste = h("div", { class: "cartes-lignes" });
  const recap = h("p", { class: "recap" });
  const erreur = h("p", { class: "erreur" });
  const zoneColle = h("div", { class: "cache" });
  const iColle = h("textarea", { rows: 8, placeholder: "28/09/2026\nPAIEMENT PSC 2609 VILLETELLE\n-125,00 EUR\n\n28/09/2026\nVIR SMAG\n+3 128,84 EUR" });
  const lignes = [];

  // Champ de date (texte libre) + bouton calendrier : un sélecteur de date natif, invisible, posé sur le bouton
  function champDate(iDate) {
    const cal = h("input", { type: "date", class: "cal-input", "aria-label": "Choisir dans le calendrier", tabindex: "-1" });
    cal.addEventListener("change", () => { if (cal.value) { iDate.value = jjmmaaaa(cal.value); iDate.dispatchEvent(new Event("input", { bubbles: true })); } });
    iDate.addEventListener("input", () => { const d = analyserDate(iDate.value, aujourdhui()); if (d) cal.value = d; });
    const bouton = h("span", { class: "cal-bouton" }, h("span", { "aria-hidden": "true" }, "📅"), cal);
    const g = h("div", { class: "champ-date" }, iDate, bouton);
    g.bloquer = (b) => { iDate.readOnly = b; cal.disabled = b; bouton.classList.toggle("inactif", b); };
    return g;
  }

  function ajouterLigne(val = {}, apres = null) {
    const iDate = h("input", { type: "text", inputmode: "decimal", placeholder: "jjmmaa", autocomplete: "off", value: val.date || "", "aria-label": "Date" });
    const gDate = champDate(iDate);
    const cTitre = combo({ elements: () => noms, texte: val.titre || "", minCaracteres: 3, placeholder: "Titre (suggestions dès 3 lettres)" });
    const iTitre = cTitre.input;
    const iMontant = h("input", { type: "text", inputmode: "decimal", placeholder: "0,00", autocomplete: "off", class: "gros-montant", value: val.montant || "", "aria-label": "Montant" });
    const ligne = { iDate, gDate, cTitre, iTitre, iMontant, sens: val.sens || -1, exp: iExport.checked };
    const bSens = h("button", { type: "button", class: "sens petit", onclick: () => { ligne.sens = -ligne.sens; majSens(); majRecap(); } });
    function majSens() {
      bSens.textContent = ligne.sens === 1 ? "↑" : "↓";
      bSens.classList.toggle("recette", ligne.sens === 1);
      bSens.title = ligne.sens === 1 ? "Recette : toucher pour passer en dépense" : "Dépense : toucher pour passer en recette";
      bSens.setAttribute("aria-label", bSens.title);
    }
    const iExp = h("input", { type: "checkbox", checked: ligne.exp });
    iExp.addEventListener("change", () => { ligne.exp = iExp.checked; });
    ligne.iExp = iExp;
    const carte = h("div", { class: "carte-ligne" },
      h("div", { class: "rang haut" }, gDate, h("div", { class: "montant-zone" }, bSens, iMontant)),
      h("div", { class: "rang" }, cTitre.element),
      h("div", { class: "info-ligne" }),
      h("div", { class: "rang pied" },
        h("label", { class: "case mini" }, iExp, "À exporter"),
        h("span", { class: "espace" }),
        h("button", { type: "button", class: "mini-bouton", title: "Dupliquer cette ligne en dessous (mêmes date, titre et montant)", onclick: () => {
          ajouterLigne({ date: iDate.value, titre: iTitre.value, montant: iMontant.value, sens: ligne.sens }, ligne); majRecap();
        } }, "↧ Dupliquer"),
        h("button", { type: "button", class: "mini-bouton", "aria-label": "Supprimer la ligne", onclick: () => {
          lignes.splice(lignes.indexOf(ligne), 1); carte.remove();
          if (!lignes.length) ajouterLigne();
          majRecap();
        } }, "✕")));
    ligne.carte = carte; ligne.info = carte.querySelector(".info-ligne");
    if (iMeme.checked) { iDate.value = iDateCommune.value; gDate.bloquer(true); }
    majSens();
    if (apres) { lignes.splice(lignes.indexOf(apres) + 1, 0, ligne); apres.carte.after(carte); }
    else { lignes.push(ligne); liste.append(carte); }

    // « + » ou « - » tapé devant le montant : choisit le sens
    iMontant.addEventListener("input", () => {
      const m = iMontant.value.match(/^\s*([+\-−–—])\s*/);
      if (m) { ligne.sens = m[1] === "+" ? 1 : -1; iMontant.value = iMontant.value.slice(m[0].length); majSens(); }
      if (lignes[lignes.length - 1] === ligne && iTitre.value.trim() && iMontant.value.trim()) ajouterLigne();
      majRecap();
    });
    for (const el of [iDate, iTitre]) el.addEventListener("input", () => {
      if (lignes[lignes.length - 1] === ligne && iDate.value.trim() && iTitre.value.trim() && iMontant.value.trim()) ajouterLigne();
      majRecap();
    });
    cTitre.surChangement(majRecap);
    iDate.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); iTitre.focus(); } });
    iMontant.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const i = lignes.indexOf(ligne);
      if (i === lignes.length - 1) ajouterLigne();
      lignes[i + 1].iDate.focus();
    });
    return ligne;
  }

  const vide = (l) => (iMeme.checked || !l.iDate.value.trim()) && !l.iTitre.value.trim() && !l.iMontant.value.trim();
  const lireMontant = (l) => { const c = versCentimes(l.iMontant.value.replace(/EUR|€/gi, "")); return c === null || c === 0 ? null : Math.abs(c); };
  const cle = (compte, nom, date, m) => [compte, sansAccent(nom).trim(), date, m].join("|");

  function majRecap() {
    const existants = new Set(etat.operations.map((o) => cle(o.compteId, o.nom, o.date, o.montant)));
    const vus = new Set();
    let invalides = 0, doublons = 0, debit = 0, credit = 0;
    const aEcrire = [];
    for (const l of lignes) {
      l.carte.classList.remove("invalide", "doublon");
      if (vide(l)) { l.info.textContent = ""; continue; }
      const date = analyserDate(l.iDate.value, aujourdhui()), abs = lireMontant(l), titre = l.iTitre.value.trim();
      const bon = date && abs !== null && titre;
      let txt = date ? dateFr(date) : "date ?";
      if (!bon) { invalides++; l.carte.classList.add("invalide"); l.info.textContent = txt + (titre ? "" : " · titre ?") + (abs === null ? " · montant ?" : ""); continue; }
      const m = l.sens * abs;
      const k = cle(iCompte.value, titre, date, m);
      const dup = existants.has(k) || vus.has(k);
      vus.add(k);
      if (dup) { doublons++; l.carte.classList.add("doublon"); txt += " · déjà saisi ?"; }
      l.info.textContent = txt;
      if (dup && iDoublons.checked) continue;
      if (m < 0) debit += m; else credit += m;
      aEcrire.push({ date, titre, montant: m, aExporter: l.iExp.checked });
    }
    recap.textContent = `${aEcrire.length} opération(s) – débits ${euros(debit)} · crédits ${euros(credit)}` +
      (doublons && iDoublons.checked ? ` – ${doublons} doublon(s) ignoré(s)` : "") + (invalides ? ` – ${invalides} ligne(s) à corriger` : "");
    return { aEcrire, invalides };
  }

  // Date commune : recopiée dans toutes les lignes (existantes et à venir)
  function appliquerDateCommune() {
    cDateCommune.hidden = !iMeme.checked;
    for (const l of lignes) { l.gDate.bloquer(iMeme.checked); if (iMeme.checked) l.iDate.value = iDateCommune.value; }
    majRecap();
  }
  iMeme.addEventListener("change", appliquerDateCommune);
  iDateCommune.addEventListener("input", appliquerDateCommune);

  for (let i = 0; i < 3; i++) ajouterLigne();

  const bColle = h("button", { type: "button", class: "sec", onclick: () => zoneColle.classList.toggle("cache") }, "Coller un relevé");
  zoneColle.append(
    h("p", { class: "note" }, "Collez le texte copié depuis votre banque : la date, le titre et le montant (− débit, + crédit), sur une même ligne séparés par une tabulation, ou chacun sur sa ligne."),
    iColle,
    h("button", { type: "button", class: "sec", onclick: () => {
      const lus = analyserReleve(iColle.value);
      if (!lus.length) { erreur.textContent = "Aucune opération reconnue."; return; }
      erreur.textContent = "";
      for (const l of [...lignes]) if (vide(l)) { l.carte.remove(); lignes.splice(lignes.indexOf(l), 1); }
      for (const o of lus) {
        const signe = /^\s*\+/.test(o.montant) ? 1 : -1;
        ajouterLigne({ date: o.date, titre: o.titre, montant: o.montant.replace(/^\s*[+\-−–—]\s*/, "").replace(/\s*(EUR|€)\s*$/i, ""), sens: signe });
      }
      ajouterLigne();
      if (iMeme.checked) appliquerDateCommune();
      iColle.value = ""; zoneColle.classList.add("cache");
      majRecap();
    } }, "Remplir le tableau"));

  const section = (titre, ...c) => h("section", { class: "section" }, h("h3", { class: "section-titre" }, titre), ...c);
  const { dialogue, formulaire } = modale("Tableau rapide", [
    section("Pour toutes les lignes",
      champ("Compte", iCompte),
      h("div", { class: "champ" }, h("label", {}, "Statut"), h("div", { class: "statut-groupe", role: "radiogroup" }, boutonsStatut)),
      h("div", { class: "deux" }, champ("Nature", iNature)),
      h("label", { class: "case" }, iExport, "À exporter (coche toutes les lignes)"),
      h("label", { class: "case" }, iMeme, "Même date pour toutes les lignes"), cDateCommune),
    section("Opérations", liste,
      h("div", { class: "actions" },
        h("button", { type: "button", class: "sec", onclick: () => { ajouterLigne(); majRecap(); } }, "+ Ligne"),
        bColle),
      zoneColle),
    h("label", { class: "case" }, iDoublons, "Ignorer les doublons probables (même titre, date et montant)"),
    h("div", { class: "barre-fixe" }, recap, erreur,
      h("div", { class: "actions" },
        h("button", { type: "submit" }, "Créer les opérations"),
        h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")))
  ]);
  majStatut();
  iExport.addEventListener("change", () => { lignes.forEach((l) => { l.iExp.checked = iExport.checked; l.exp = iExport.checked; }); });
  for (const el of [iCompte, iDoublons]) el.addEventListener("input", majRecap);
  majRecap();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const { aEcrire, invalides } = majRecap();
    if (invalides) { erreur.textContent = "Corrigez les lignes en rouge (date, titre ou montant manquant) ou supprimez-les."; return; }
    if (!aEcrire.length) { erreur.textContent = "Aucune opération à créer."; return; }
    const jour = aujourdhui();
    const ecritures = aEcrire.map((v) => ["operations", nouvelId("operations"), {
      nom: v.titre, commentaire: "", date: v.date, montant: v.montant, compteId: iCompte.value, nature: iNature.value, info: "",
      categorieId: categorieDe(v.titre), statut, datePointage: statut === "pointe" ? jour : null,
      aExporter: v.aExporter, virementId: null, cree: serverTimestamp()
    }]);
    ecrireEnParallele(ecritures).catch((err) => { console.error(err); alert("Échec de l'enregistrement : " + err.message); });
    dialogue.close();
  });
}
