import { etat, ecrireEnParallele, nouvelId, serverTimestamp, categoriesTriees, comparerComptes } from "./store.js";
import { NATURES, STATUTS } from "./constantes.js";
import { euros, aujourdhui, dateFr, sansAccent } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { analyserDate, analyserColle, preparerLignes, doublonsProbables } from "./saisie.js";
import { associationPour } from "./noms.js";

// Catégorie associée à ce nom (si l'association existe et que la catégorie existe encore)
const categorieDe = (nom) => { const a = associationPour(etat.nomsCategories, nom); return a && etat.categories.some((c) => c.id === a.categorieId) ? a.categorieId : null; };

// Saisie en tableau : un même nom d'opération, plusieurs dates et montants (rattrapage).
export function formTableau({ compteId }) {
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === compteId).sort(comparerComptes);
  // Noms déjà utilisés sur le compte, les plus fréquents d'abord (suggestions à la saisie)
  const freq = new Map();
  for (const o of etat.operations) if (o.compteId === compteId && !o.virementId) freq.set(o.nom, (freq.get(o.nom) || 0) + 1);
  const noms = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map((x) => x[0]);

  const iNom = h("input", { type: "text", required: true, list: "noms-tableau", autocomplete: "off" });
  const suggestions = h("datalist", { id: "noms-tableau" }, noms.map((n) => h("option", { value: n })));
  const iSens = selecteur([["-1", "Dépense"], ["1", "Recette"]], "-1");
  const iCompte = selecteur(comptes.map((c) => [c.id, c.nom]), compteId);
  const iCat = selecteur([["", "— aucune —"], ...categoriesTriees().map((c) => [c.id, c.libelle])], "");
  const iNature = selecteur(NATURES, "autre");
  const iStatut = selecteur(STATUTS.filter((s) => s[0] !== "annule"), "encours");
  const iExport = h("input", { type: "checkbox", checked: true });
  const iDoublons = h("input", { type: "checkbox", checked: true });
  const corps = h("tbody");
  const recap = h("p", { class: "note" });
  const erreur = h("p", { class: "erreur" });
  const zoneColle = h("div", { class: "cache" });
  const iColle = h("textarea", { rows: 6, placeholder: "05/03/2026 12,50\n12/03/2026 8,90\n…" });
  const lignes = [];

  function ajouterLigne(date = "", montant = "") {
    const iDate = h("input", { type: "text", inputmode: "decimal", placeholder: "jjmmaa ou jj.mm.aaaa", autocomplete: "off", value: date });
    const iMontant = h("input", { type: "text", inputmode: "decimal", placeholder: "0,00", autocomplete: "off", value: montant });
    const info = h("small", { class: "apercu-date" });
    const tr = h("tr", {}, h("td", {}, iDate, info), h("td", {}, iMontant),
      h("td", {}, h("button", { type: "button", class: "croix", "aria-label": "Supprimer la ligne", onclick: () => {
        lignes.splice(lignes.indexOf(ligne), 1); tr.remove();
        if (!lignes.length) ajouterLigne();
        majRecap();
      } }, "×")));
    const ligne = { tr, iDate, iMontant, info };
    lignes.push(ligne);
    corps.append(tr);
    const suivant = () => {
      const i = lignes.indexOf(ligne);
      if (i === lignes.length - 1) ajouterLigne();
      return lignes[i + 1];
    };
    iDate.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); iMontant.focus(); } });
    iMontant.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); suivant().iDate.focus(); } });
    for (const el of [iDate, iMontant]) el.addEventListener("input", () => {
      if (lignes[lignes.length - 1] === ligne && iDate.value.trim() && iMontant.value.trim()) ajouterLigne();
      majRecap();
    });
    return ligne;
  }

  function lireLignes() { return lignes.map((l) => ({ date: l.iDate.value, montant: l.iMontant.value })); }

  function majRecap() {
    const brut = lireLignes();
    const { valides, invalides } = preparerLignes(brut, aujourdhui());
    const sens = Number(iSens.value);
    const dups = doublonsProbables(etat.operations, iCompte.value, iNom.value, valides, sens);
    lignes.forEach((l, i) => {
      const d = analyserDate(l.iDate.value, aujourdhui());
      const dup = dups.has(i);
      l.info.textContent = l.iDate.value.trim() ? (d ? dateFr(d) + (dup ? " · déjà saisi ?" : "") : "date non reconnue") : "";
      l.tr.classList.toggle("invalide", invalides.includes(i));
      l.tr.classList.toggle("doublon", dup);
    });
    const aEcrire = valides.filter((v) => !(iDoublons.checked && dups.has(v.i)));
    const total = aEcrire.reduce((s, v) => s + sens * v.montant, 0);
    recap.textContent = `${aEcrire.length} opération(s) à créer – total ${euros(total)}` +
      (dups.size && iDoublons.checked ? ` – ${dups.size} doublon(s) probable(s) ignoré(s)` : "") +
      (invalides.length ? ` – ${invalides.length} ligne(s) invalide(s)` : "");
    return { aEcrire, invalides };
  }

  for (let i = 0; i < 5; i++) ajouterLigne();

  const bColle = h("button", { type: "button", class: "sec", onclick: () => zoneColle.classList.toggle("cache") }, "Coller depuis un tableur");
  zoneColle.append(
    h("p", { class: "note" }, "Une opération par ligne : la date, puis le montant (séparés par une tabulation, un point-virgule ou une espace). Les montants sont pris en valeur absolue : le sens est choisi ci-dessus."),
    iColle,
    h("button", { type: "button", class: "sec", onclick: () => {
      const lus = analyserColle(iColle.value);
      if (!lus.length) { erreur.textContent = "Aucune ligne reconnue."; return; }
      erreur.textContent = "";
      for (const l of [...lignes]) if (!l.iDate.value.trim() && !l.iMontant.value.trim()) { l.tr.remove(); lignes.splice(lignes.indexOf(l), 1); }
      for (const l of lus) ajouterLigne(l.date, l.montant);
      ajouterLigne();
      iColle.value = ""; zoneColle.classList.add("cache");
      majRecap();
    } }, "Remplir le tableau"));

  const { dialogue, formulaire } = modale("Saisie en tableau", [
    h("p", { class: "note" }, "Un même nom, plusieurs dates et montants. Touche Entrée : champ suivant."),
    champ("Nom de l'opération", iNom), suggestions, champ("Sens", iSens), champ("Compte", iCompte),
    champ("Catégorie", iCat), champ("Nature", iNature), champ("Statut des opérations créées", iStatut),
    h("label", { class: "case" }, iExport, "Inclure dans l'export"),
    h("table", { class: "grille" }, h("thead", {}, h("tr", {}, h("th", {}, "Date"), h("th", {}, "Montant (€)"), h("th"))), corps),
    h("div", { class: "actions" },
      h("button", { type: "button", class: "sec", onclick: () => { ajouterLigne(); ajouterLigne(); ajouterLigne(); ajouterLigne(); ajouterLigne(); } }, "+ 5 lignes"), bColle),
    zoneColle,
    h("label", { class: "case" }, iDoublons, "Ignorer les doublons probables (même nom, date et montant)"),
    recap, erreur,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Créer les opérations"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"))
  ]);
  for (const el of [iNom, iSens, iCompte, iDoublons]) el.addEventListener("input", majRecap);
  majRecap();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const { aEcrire, invalides } = majRecap();
    if (invalides.length) { erreur.textContent = "Corrigez les lignes en rouge (date ou montant non reconnu) ou videz-les."; return; }
    if (!aEcrire.length) { erreur.textContent = "Aucune opération à créer."; return; }
    const sens = Number(iSens.value), nom = iNom.value.trim(), jour = aujourdhui();
    const ecritures = aEcrire.map((v) => ["operations", nouvelId("operations"), {
      nom, commentaire: "", date: v.date, montant: sens * v.montant, compteId: iCompte.value, nature: iNature.value, info: "",
      categorieId: iCat.value || categorieDe(nom), statut: iStatut.value, datePointage: iStatut.value === "pointe" ? jour : null,
      aExporter: iExport.checked, virementId: null, cree: serverTimestamp()
    }]);
    ecrireEnParallele(ecritures).catch((err) => { console.error(err); alert("Échec de l'enregistrement : " + err.message); });
    dialogue.close();
  });
}
