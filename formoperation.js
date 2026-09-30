// Formulaire de saisie d'une opération : compte, nom, export, catégorie (puces + recherche), montant avec flèche de sens,
// date, nature, statut en icônes, fréquence éventuelle.
import { etat, nouvelId, lot, serverTimestamp, categoriesTriees, comparerComptes } from "./store.js";
import { versCentimes, versSaisie, aujourdhui } from "./format.js";
import { h, modale, champ, selecteur, combo, couleurAuHasard } from "./ui.js";
import { nomsConnus, associationPour, cleNom } from "./noms.js";
import { NATURES, STATUTS } from "./constantes.js";
import { FREQUENCES, suivante } from "./planning.js";

const ICONES = { encours: "○", pointe: "●", annule: "✕" };
const NB_PUCES = 6;

// Catégories les plus utilisées sur un compte (puis sur l'ensemble des comptes), de la plus fréquente à la moins fréquente.
export function categoriesFrequentes(compteId, operations, categories, max = NB_PUCES) {
  const ici = new Map(), partout = new Map();
  for (const o of operations) {
    if (!o.categorieId || o.statut === "annule" || o.virementId) continue;
    partout.set(o.categorieId, (partout.get(o.categorieId) || 0) + 1);
    if (o.compteId === compteId) ici.set(o.categorieId, (ici.get(o.categorieId) || 0) + 1);
  }
  const existantes = categories.filter((c) => !c.archive && partout.has(c.id));
  existantes.sort((a, b) => (ici.get(b.id) || 0) - (ici.get(a.id) || 0) || partout.get(b.id) - partout.get(a.id) || a.nom.localeCompare(b.nom, "fr"));
  return existantes.slice(0, max);
}

// Formulaire de création / modification. `op` = opération existante, `modele` = valeurs de départ (duplication, saisie rapide).
export function formOperation({ compteId, op = null, modele = null }) {
  const src = op || modele || {};
  const virement = !!(op && op.virementId);
  const paire = virement ? etat.operations.find((o) => o.virementId === op.virementId && o.id !== op.id) : null;
  const signe = virement ? (op.montant < 0 ? -1 : 1) : 0;
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === src.compteId).sort(comparerComptes);
  const optComptes = comptes.map((c) => [c.id, c.nom]);

  const iType = selecteur([["operation", "Opération"], ["virement", "Virement entre comptes"]], "operation");
  // Nom : liste des noms déjà saisis (filtre « contient »), la saisie libre ajoute un nouveau nom
  const noms = nomsConnus(etat.operations, etat.planifiees).map((n) => ({ id: n.nom, libelle: n.nom }));
  const cNom = combo({ elements: () => noms, texte: src.nom || "", requis: true });
  const iNom = cNom.input;
  const iCom = h("input", { type: "text", value: src.commentaire || "" });
  const iDate = h("input", { type: "date", required: true, value: src.date || aujourdhui() });
  const iCompte = selecteur(optComptes, src.compteId || compteId);
  const iDest = selecteur(optComptes, (comptes.find((c) => c.id !== (src.compteId || compteId)) || {}).id);
  const iNature = selecteur(NATURES, src.nature || "autre");
  const iInfo = h("input", { type: "text", value: src.info || "", autocomplete: "off" });
  const iExport = h("input", { type: "checkbox", checked: op ? !!op.aExporter : true });
  const cExport = h("label", { class: "case" }, iExport, "Inclure dans l'export");
  const iPointage = h("input", { type: "date", value: src.datePointage || "" });
  const erreur = h("p", { class: "erreur" });

  // Sens : flèche rouge vers le bas (dépense) ou verte vers le haut (recette), on la touche pour basculer
  let sens = src.sens != null ? Number(src.sens) : src.montant > 0 ? 1 : -1;
  const libelleSens = h("span", { class: "sens-texte" });
  const bSens = h("button", { type: "button", class: "sens", onclick: () => { sens = -sens; majSens(); } });
  function majSens() {
    bSens.textContent = sens === 1 ? "↑" : "↓";
    bSens.classList.toggle("recette", sens === 1);
    bSens.setAttribute("aria-label", sens === 1 ? "Recette. Toucher pour passer en dépense" : "Dépense. Toucher pour passer en recette");
    bSens.title = sens === 1 ? "Recette : toucher pour passer en dépense" : "Dépense : toucher pour passer en recette";
    libelleSens.textContent = sens === 1 ? "Recette" : "Dépense";
  }
  const saisieRapide = !!modele && modele.montant == null;
  const iMontant = h("input", { type: "text", inputmode: "decimal", required: true, class: "gros-montant", autocomplete: "off",
    placeholder: modele && modele.dernierMontant != null ? "dernier : " + versSaisie(modele.dernierMontant) : "0,00", value: src.montant != null ? versSaisie(src.montant) : "" });
  const rangeeMontant = h("div", { class: "ligne-montant" }, bSens, iMontant);
  const cMontant = h("div", { class: "champ" }, h("label", {}, "Montant (€) · ", libelleSens), rangeeMontant);

  // Statut : trois icônes
  let statut = src.statut || "encours";
  const boutonsStatut = STATUTS.map(([v, l]) => h("button", { type: "button", class: "statut-choix", role: "radio", "data-v": v, title: l,
    onclick: () => { statut = v; basculer(); } }, h("span", { class: "ico" }, ICONES[v]), h("small", {}, l)));
  const cStatut = h("div", { class: "champ" }, h("label", {}, "Statut"), h("div", { class: "statut-groupe", role: "radiogroup" }, boutonsStatut));

  // Catégorie : puces fréquentes (icône + nom), recherche « contient » triée par ordre alphabétique, ajout à la volée
  const iCat = combo({
    elements: () => categoriesTriees(false, src.categorieId).map((c) => ({ id: c.id, libelle: c.libelle, affichage: (c.icone ? c.icone + " " : "") + c.libelle })),
    valeur: src.categorieId || "", ajout: "Ajouter la catégorie", placeholder: "Autre catégorie : rechercher ou ajouter", alpha: true });
  const zonePuces = h("div", { class: "puces-cat" });
  const assocInitiale = associationPour(etat.nomsCategories, src.nom || "");
  const iAssoc = h("input", { type: "checkbox", checked: !!(assocInitiale && src.categorieId && assocInitiale.categorieId === src.categorieId) });
  const cAssoc = h("label", { class: "case" }, iAssoc, "Toujours utiliser cette catégorie pour ce nom");
  let categorieTouchee = !!src.categorieId || !!op;   // choisie à la main : on n'y touche plus automatiquement
  let categorieAuto = false;                          // reprise automatiquement depuis le nom
  let assocModifiee = false;
  let enCours = false;
  function majPuces() {
    zonePuces.replaceChildren(...categoriesFrequentes(iCompte.value, etat.operations, etat.categories).map((c) =>
      h("button", { type: "button", class: "puce-cat" + (iCat.id() === c.id ? " actif" : ""), "aria-pressed": iCat.id() === c.id ? "true" : "false",
        onclick: () => iCat.definir(iCat.id() === c.id ? null : c.id) }, (c.icone ? c.icone + " " : "") + c.nom)));
  }
  const cCat = h("div", { class: "champ" }, h("label", {}, "Catégorie"), zonePuces, iCat.element, cAssoc);

  // Fréquence (création seulement) : répète l'opération
  const iFreq = selecteur([["", "Aucune (opération unique)"], ...FREQUENCES], "");
  const iProchaine = h("input", { type: "date", value: "" });
  const iFin = h("input", { type: "date", value: "" });
  const zoneFreq = h("div", { class: "zone-freq cache" },
    champ("Prochaine échéance", iProchaine), champ("Date de fin (facultative)", iFin),
    h("p", { class: "note" }, "L'opération saisie ici est créée maintenant ; les suivantes sont créées automatiquement à chaque échéance."));
  const cFreq = h("div", { class: "champ" }, h("label", {}, "Fréquence"), iFreq, zoneFreq);
  let prochaineModifiee = false;
  function majFreq() {
    const actif = !!iFreq.value;
    zoneFreq.classList.toggle("cache", !actif);
    if (actif && !prochaineModifiee && iDate.value) iProchaine.value = suivante(iDate.value, iFreq.value, +iDate.value.slice(8, 10)) || "";
  }
  iProchaine.addEventListener("input", () => { prochaineModifiee = true; });
  iFreq.addEventListener("change", majFreq);
  iDate.addEventListener("change", majFreq);

  const cType = champ("Type de saisie", iType);
  const cCompte = champ("Compte", iCompte);
  const cDest = champ("Compte destination", iDest);
  const cNature = champ("Nature", iNature);
  const cInfo = champ("N°", iInfo);
  const cPointage = champ("Date de pointage", iPointage);
  const cLie = virement && h("p", { class: "note" }, `Virement lié à : ${(etat.comptes.find((c) => c.id === paire?.compteId) || {}).nom || "compte introuvable"}. Le montant, la date et le nom sont modifiés des deux côtés.`);

  function basculer() {
    const nouveauVirement = !op && iType.value === "virement";
    cType.hidden = !!op || !!modele;
    bSens.hidden = virement || nouveauVirement;
    libelleSens.hidden = virement || nouveauVirement;
    cCompte.hidden = virement;
    cCompte.querySelector("label").textContent = nouveauVirement ? "Compte source" : "Compte";
    cDest.hidden = !nouveauVirement;
    cNature.hidden = virement || nouveauVirement;
    cInfo.hidden = virement || nouveauVirement || iNature.value !== "cheque";
    cCat.hidden = virement || nouveauVirement;
    cFreq.hidden = !!op;
    boutonsStatut.forEach((b) => { const on = b.dataset.v === statut; b.classList.toggle("actif", on); b.setAttribute("aria-checked", on ? "true" : "false"); });
    cPointage.hidden = statut !== "pointe";
    majAssoc();
    if (statut === "pointe" && !iPointage.value) iPointage.value = aujourdhui();
  }
  function majAssoc() { cAssoc.hidden = !!iCat.resoudre().vide; }
  // Catégorie reprise par défaut lorsque le nom est connu (association enregistrée)
  function appliquerAssociation() {
    if (op) return;
    const a = associationPour(etat.nomsCategories, iNom.value);
    const cat = a && etat.categories.find((c) => c.id === a.categorieId && !c.archive);
    enCours = true;
    if (cat && !categorieTouchee) { iCat.definir(cat.id); iAssoc.checked = true; categorieAuto = true; }
    else if (!cat && categorieAuto) { iCat.definirTexte(""); iAssoc.checked = false; categorieAuto = false; }
    enCours = false;
    majAssoc(); majPuces();
  }
  cNom.surChangement(appliquerAssociation);
  iCat.surChangement(() => { if (!enCours) { categorieTouchee = true; categorieAuto = false; } majAssoc(); majPuces(); });
  iAssoc.addEventListener("change", () => { assocModifiee = true; });
  iType.addEventListener("change", basculer);
  iNature.addEventListener("change", basculer);
  iCompte.addEventListener("change", majPuces);

  const actions = h("div", { class: "actions" },
    h("button", { type: "submit" }, "Enregistrer"),
    h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"),
    op && !virement && h("button", { type: "button", class: "sec", onclick: () => {
      dialogue.close();
      formOperation({ compteId: op.compteId, modele: { ...op, id: undefined, date: aujourdhui(), statut: "encours", datePointage: null } });
    } }, "Dupliquer"),
    op && h("button", { type: "button", class: "danger", onclick: () => {
      if (!confirm(virement ? "Supprimer ce virement (les deux opérations) ?" : "Supprimer cette opération ?")) return;
      const l = lot();
      l.del("operations", op.id);
      if (paire) l.del("operations", paire.id);
      l.envoyer();
      dialogue.close();
    } }, "Supprimer")
  );

  const plus = h("details", { class: "plus" }, h("summary", {}, "Plus d'options"), champ("Commentaire", iCom));
  if (src.commentaire) plus.open = true;

  const { dialogue, formulaire } = modale(op ? "Opération" : "Nouvelle opération", [
    cCompte, cType, cDest, champ("Nom", cNom.element), cExport, cCat, cMontant,
    h("div", { class: "deux" }, champ("Date", iDate), cNature), cInfo,
    cStatut, cPointage, cFreq, plus, cLie, erreur, actions
  ]);
  majSens();
  basculer();
  majPuces();
  if (!op && !src.categorieId) appliquerAssociation();
  if (saisieRapide) iMontant.focus(); else if (!op) iNom.focus();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const saisi = versCentimes(iMontant.value);
    if (saisi === null || saisi === 0) { erreur.textContent = "Montant invalide."; return; }
    const m = Math.abs(saisi);
    const datePointage = statut === "pointe" ? (iPointage.value || aujourdhui()) : null;
    const commun = { nom: iNom.value.trim(), commentaire: iCom.value.trim(), date: iDate.value, statut, datePointage, info: iInfo.value.trim(), aExporter: iExport.checked };
    const nouveauVirement = !op && iType.value === "virement";
    const l = lot();

    // Opération répétée : création de la planification (la première opération est celle saisie ici)
    let planifieeId = null;
    if (iFreq.value && !op) {
      if (nouveauVirement && iCompte.value === iDest.value) { erreur.textContent = "Choisissez deux comptes différents."; return; }
      if (!iProchaine.value || iProchaine.value <= iDate.value) { erreur.textContent = "La prochaine échéance doit être postérieure à la date de l'opération."; return; }
      if (iFin.value && iFin.value < iProchaine.value) { erreur.textContent = "La date de fin précède la prochaine échéance."; return; }
      planifieeId = nouvelId("planifiees");
    }
    const planif = (categorieId) => l.set("planifiees", planifieeId, {
      nom: commun.nom, commentaire: commun.commentaire, info: commun.info, aExporter: commun.aExporter,
      montant: nouveauVirement ? -m : sens * m, compteId: iCompte.value, virementCompteId: nouveauVirement ? iDest.value : null,
      nature: nouveauVirement ? "virement" : iNature.value, categorieId: nouveauVirement ? null : categorieId,
      frequence: iFreq.value, prochaine: iProchaine.value, jourAncre: +iDate.value.slice(8, 10), dateFin: iFin.value || null, cree: serverTimestamp()
    });

    if (virement) {
      l.set("operations", op.id, { ...commun, montant: signe * m });
      if (paire) l.set("operations", paire.id, { nom: commun.nom, commentaire: commun.commentaire, date: commun.date, montant: -signe * m });
    } else if (nouveauVirement) {
      if (iCompte.value === iDest.value) { erreur.textContent = "Choisissez deux comptes différents."; return; }
      const vid = nouvelId("operations"), idB = nouvelId("operations");
      const base = { ...commun, nature: "virement", categorieId: null, virementId: vid, cree: serverTimestamp(), ...(planifieeId ? { planifieeId } : {}) };
      l.set("operations", vid, { ...base, compteId: iCompte.value, montant: -m });
      l.set("operations", idB, { ...base, compteId: iDest.value, montant: m });
      if (planifieeId) planif(null);
    } else {
      const id = op?.id || nouvelId("operations");
      const choix = iCat.resoudre();
      let categorieId = choix.id || null;
      if (choix.nouveau) {
        categorieId = nouvelId("categories");
        l.set("categories", categorieId, { nom: choix.nouveau, parentId: null, couleur: couleurAuHasard() });
      }
      const cle = cleNom(commun.nom);
      if (categorieId && iAssoc.checked) l.set("nomsCategories", cle, { nom: commun.nom, categorieId });
      else if (assocModifiee && !iAssoc.checked) l.del("nomsCategories", cle);
      const donnees = { ...commun, compteId: iCompte.value, montant: sens * m, nature: iNature.value, categorieId, virementId: null, ...(planifieeId ? { planifieeId } : {}) };
      if (!op) donnees.cree = serverTimestamp();
      l.set("operations", id, donnees);
      if (planifieeId) planif(categorieId);
    }
    l.envoyer();
    dialogue.close();
  });
}
