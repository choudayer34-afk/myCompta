import { etat, pret, nouvelId, lot, serverTimestamp, categoriesTriees, ecrireEnParallele, comparerComptes } from "./store.js";
import { lignesAvecSolde, soldePointe, habitudes } from "./calc.js";
import { euros, versCentimes, versSaisie, dateFr, moisFr, aujourdhui, sansAccent } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { formCompte } from "./comptes.js";
import { NATURES, STATUTS } from "./constantes.js";
import { formMasse } from "./masse.js";
import { formTableau } from "./tableau.js";

export { NATURES, STATUTS };
const ICONES = { encours: "○", pointe: "●", annule: "✕" };
const libelleNature = (n) => (NATURES.find((x) => x[0] === n) || [0, ""])[1];

// Formulaire de création / modification. `op` = opération existante, `modele` = valeurs de départ (duplication).
export function formOperation({ compteId, op = null, modele = null }) {
  const src = op || modele || {};
  const virement = !!(op && op.virementId);
  const paire = virement ? etat.operations.find((o) => o.virementId === op.virementId && o.id !== op.id) : null;
  const signe = virement ? (op.montant < 0 ? -1 : 1) : 0;
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === src.compteId).sort(comparerComptes);
  const optComptes = comptes.map((c) => [c.id, c.nom]);

  const iType = selecteur([["operation", "Opération"], ["virement", "Virement entre comptes"]], "operation");
  const iNom = h("input", { type: "text", required: true, value: src.nom || "", autocomplete: "off" });
  const iCom = h("input", { type: "text", value: src.commentaire || "" });
  const iDate = h("input", { type: "date", required: true, value: src.date || aujourdhui() });
  const iSens = selecteur([["-1", "Dépense"], ["1", "Recette"]], src.sens != null ? String(src.sens) : src.montant > 0 ? "1" : "-1");
  const saisieRapide = !!modele && modele.montant == null;
  const iMontant = h("input", { type: "text", inputmode: "decimal", required: true, autofocus: saisieRapide,
    placeholder: modele && modele.dernierMontant != null ? "dernier : " + versSaisie(modele.dernierMontant) : "0,00", value: src.montant != null ? versSaisie(src.montant) : "" });
  const iCompte = selecteur(optComptes, src.compteId || compteId);
  const iDest = selecteur(optComptes, (comptes.find((c) => c.id !== (src.compteId || compteId)) || {}).id);
  const iNature = selecteur(NATURES, src.nature || "autre");
  const iInfo = h("input", { type: "text", value: src.info || "" });
  const iCat = selecteur([["", "— aucune —"], ...categoriesTriees().map((c) => [c.id, c.libelle])], src.categorieId || "");
  const iExport = h("input", { type: "checkbox", checked: !!src.aExporter });
  const cExport = h("label", { class: "case" }, iExport, "Inclure dans l'export");
  const iStatut = selecteur(STATUTS, src.statut || "encours");
  const iPointage = h("input", { type: "date", value: src.datePointage || "" });
  const erreur = h("p", { class: "erreur" });

  const cType = champ("Type de saisie", iType);
  const cSens = champ("Sens", iSens);
  const cCompte = champ("Compte", iCompte);
  const cDest = champ("Compte destination", iDest);
  const cNature = champ("Nature", iNature);
  const cCat = champ("Catégorie", iCat);
  const cPointage = champ("Date de pointage", iPointage);
  const cLie = virement && h("p", { class: "note" }, `Virement lié à : ${(etat.comptes.find((c) => c.id === paire?.compteId) || {}).nom || "compte introuvable"}. Le montant, la date et le nom sont modifiés des deux côtés.`);

  function basculer() {
    const nouveauVirement = !op && iType.value === "virement";
    cType.hidden = !!op || !!modele;
    cSens.hidden = virement || nouveauVirement;
    cCompte.hidden = virement;
    cCompte.querySelector("label").textContent = nouveauVirement ? "Compte source" : "Compte (déplacer ici pour changer)";
    cDest.hidden = !nouveauVirement;
    cNature.hidden = virement || nouveauVirement;
    cCat.hidden = virement || nouveauVirement;
    cPointage.hidden = iStatut.value !== "pointe";
    if (iStatut.value === "pointe" && !iPointage.value) iPointage.value = aujourdhui();
  }
  iType.addEventListener("change", basculer);
  iStatut.addEventListener("change", basculer);

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

  const { dialogue, formulaire } = modale(op ? "Opération" : "Nouvelle opération", [
    cType, champ("Nom", iNom), champ("Commentaire", iCom), champ("Date", iDate), cSens,
    champ("Montant (€)", iMontant), cCompte, cDest, cNature, champ("Info (n° de chèque…)", iInfo), cCat,
    cExport, champ("Statut", iStatut), cPointage, cLie, erreur, actions
  ]);
  basculer();
  if (saisieRapide) iMontant.focus();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const saisi = versCentimes(iMontant.value);
    if (saisi === null || saisi === 0) { erreur.textContent = "Montant invalide."; return; }
    const m = Math.abs(saisi);
    const statut = iStatut.value;
    const datePointage = statut === "pointe" ? (iPointage.value || aujourdhui()) : null;
    const commun = { nom: iNom.value.trim(), commentaire: iCom.value.trim(), date: iDate.value, statut, datePointage, info: iInfo.value.trim(), aExporter: iExport.checked };
    const l = lot();

    if (virement) {
      l.set("operations", op.id, { ...commun, montant: signe * m });
      if (paire) l.set("operations", paire.id, { nom: commun.nom, commentaire: commun.commentaire, date: commun.date, montant: -signe * m });
    } else if (!op && iType.value === "virement") {
      if (iCompte.value === iDest.value) { erreur.textContent = "Choisissez deux comptes différents."; return; }
      const vid = nouvelId("operations"), idB = nouvelId("operations");
      const base = { ...commun, nature: "virement", categorieId: null, virementId: vid, cree: serverTimestamp() };
      l.set("operations", vid, { ...base, compteId: iCompte.value, montant: -m });
      l.set("operations", idB, { ...base, compteId: iDest.value, montant: m });
    } else {
      const id = op?.id || nouvelId("operations");
      const donnees = { ...commun, compteId: iCompte.value, montant: Number(iSens.value) * m, nature: iNature.value, categorieId: iCat.value || null, virementId: null };
      if (!op) donnees.cree = serverTimestamp();
      l.set("operations", id, donnees);
    }
    l.envoyer();
    dialogue.close();
  });
}

const PAGE = 200;

export function monter(conteneur, { id }) {
  conteneur.classList.remove("mode-selection");
  let recherche = "";
  let limite = PAGE;
  let nonPointees = false;   // filtre « à pointer » (statut en cours)
  let affichees = [];        // opérations actuellement listées (après filtres)
  let mode = false;          // mode sélection
  const choisies = new Set();
  let message = "";
  const compte = () => etat.comptes.find((c) => c.id === id);

  const titre = h("strong", { class: "titre-vue" });
  const solde = h("span", { class: "solde-vue" });
  const enTete = h("div", { class: "entete-vue" },
    h("a", { href: "#/comptes", class: "retour" }, "‹ Comptes"), titre,
    h("button", { class: "sec", onclick: () => compte() && formCompte(compte()) }, "Modifier"));
  const iRecherche = h("input", { type: "search", placeholder: "Recherche", class: "recherche", autocomplete: "off" });
  iRecherche.addEventListener("input", () => { recherche = iRecherche.value; limite = PAGE; majListe(); });
  const bFiltre = h("button", { type: "button", class: "sec filtre", onclick: () => { nonPointees = !nonPointees; limite = PAGE; majListe(); } }, "À pointer");
  const bTout = h("button", { type: "button", class: "sec cache", onclick: () => {
    const cibles = affichees.filter((o) => o.statut === "encours");
    if (!cibles.length) return;
    if (!confirm(`Pointer les ${cibles.length} opération(s) affichées ?`)) return;
    const date = aujourdhui();
    ecrireEnParallele(cibles.map((o) => ["operations", o.id, { statut: "pointe", datePointage: date }])).catch((e) => { console.error(e); alert("Échec du pointage : " + e.message); });
  } }, "Tout pointer");
  const rapide = h("div", { class: "rapide cache" });
  const barre = h("div", { class: "barre" }, iRecherche, bFiltre, bTout);
  const liste = h("div", { class: "liste" });
  const bSelect = h("button", { type: "button", class: "sec", onclick: () => basculerMode() }, "Sélectionner");
  const bTableau = h("button", { type: "button", class: "sec", onclick: () => compte() && formTableau({ compteId: id }) }, "Saisie en tableau");
  const info = h("p", { class: "note" });
  const actionsVue = h("div", { class: "actions-vue" }, bSelect, bTableau);
  const nbSel = h("span", { class: "nb" });
  const barreSel = h("div", { class: "barre-selection cache" }, nbSel,
    h("button", { type: "button", class: "sec", onclick: () => { affichees.forEach((o) => choisies.add(o.id)); majListe(); } }, "Tout"),
    h("button", { type: "button", class: "sec", onclick: () => { choisies.clear(); majListe(); } }, "Aucune"),
    h("button", { type: "button", onclick: () => {
      const ops = etat.operations.filter((o) => choisies.has(o.id));
      if (!ops.length) return;
      formMasse(ops, (nb, ignorees) => {
        message = `${nb} opération(s) modifiée(s)` + (ignorees ? ` – ${ignorees} ignorée(s) (virements liés ou déjà dans ce compte).` : ".");
        choisies.clear(); mode = false; majListe();
      });
    } }, "Modifier…"),
    h("button", { type: "button", class: "sec", onclick: () => basculerMode() }, "Terminer"));
  const ajout = h("button", { class: "flottant", "aria-label": "Nouvelle opération", onclick: () => compte() && formOperation({ compteId: id }) }, "+");
  conteneur.replaceChildren(enTete, h("div", { class: "resume" }, solde), rapide, actionsVue, info, barre, liste, ajout, barreSel);

  function basculerMode() { mode = !mode; choisies.clear(); message = ""; majListe(); }

  // Pointage rapide d'une opération (en cours <-> pointé) sans ouvrir la fiche
  function basculer(o) {
    const pointe = o.statut === "pointe";
    const l = lot();
    l.set("operations", o.id, { statut: pointe ? "encours" : "pointe", datePointage: pointe ? null : aujourdhui() });
    l.envoyer();
  }

  function correspond(o, q, nomsCat) {
    const cible = sansAccent([o.nom, o.commentaire, o.info, nomsCat.get(o.categorieId), libelleNature(o.nature), euros(o.montant), dateFr(o.date)].join(" "));
    return q.split(/\s+/).every((mot) => cible.includes(mot));
  }

  function majListe() {
    const c = compte();
    if (!pret()) { titre.textContent = "…"; liste.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    if (!c) { titre.textContent = "Introuvable"; liste.replaceChildren(h("p", { class: "vide" }, "Ce compte n'existe pas.")); return; }
    titre.textContent = c.nom;
    let lignes = lignesAvecSolde(c, etat.operations).reverse();
    solde.textContent = `${lignes.length} opérations – En cours : ${euros(lignes.length ? lignes[0].solde : c.soldeInitial || 0)} – Pointé : ${euros(soldePointe(c, etat.operations))}`;
    // Saisie rapide : habitudes du compte (hors opérations déjà couvertes par une planification)
    const exclus = new Set(etat.planifiees.filter((p) => p.compteId === id || p.virementCompteId === id).map((p) => sansAccent(p.nom).trim()));
    const modeles = habitudes(id, etat.operations, aujourdhui(), exclus);
    rapide.classList.toggle("cache", !modeles.length);
    rapide.replaceChildren(h("span", { class: "rapide-titre" }, "Saisie rapide"),
      ...modeles.map((m) => h("button", { type: "button", class: "puce", title: `${m.nb} fois · dernier montant ${euros(m.dernierMontant)}`,
        onclick: () => formOperation({ compteId: id, modele: { nom: m.nom, categorieId: m.categorieId, nature: m.nature, info: m.info, sens: m.sens, dernierMontant: m.dernierMontant, aExporter: m.aExporter, date: aujourdhui(), statut: "encours" } }) }, m.nom)));
    const aPointer = lignes.filter((x) => x.statut === "encours");
    if (aPointer.length) solde.textContent += ` – À pointer : ${aPointer.length} (${euros(aPointer.reduce((s, x) => s + x.montant, 0))})`;
    bFiltre.classList.toggle("actif-filtre", nonPointees);
    bFiltre.textContent = nonPointees ? "À pointer ✓" : "À pointer";
    if (nonPointees) lignes = aPointer;
    const cats = new Map(etat.categories.map((x) => [x.id, x]));
    const nomsCat = new Map(etat.categories.map((x) => [x.id, x.nom]));
    const q = sansAccent(recherche).trim();
    if (q) lignes = lignes.filter((o) => correspond(o, q, nomsCat));
    affichees = lignes;
    // Ne garder que les opérations encore existantes dans la sélection
    const existantes = new Set(etat.operations.map((o) => o.id));
    for (const k of [...choisies]) if (!existantes.has(k)) choisies.delete(k);
    conteneur.classList.toggle("mode-selection", mode);
    bSelect.textContent = mode ? "Terminer" : "Sélectionner";
    barreSel.classList.toggle("cache", !mode);
    ajout.classList.toggle("cache", mode);
    nbSel.textContent = `${choisies.size} sélectionnée(s)`;
    info.textContent = message;
    bTout.classList.toggle("cache", !(nonPointees && lignes.some((x) => x.statut === "encours")));
    if (!lignes.length) { liste.replaceChildren(h("p", { class: "vide" }, q ? "Aucun résultat." : nonPointees ? "Aucune opération à pointer." : "Aucune opération. Touchez + pour en ajouter.")); return; }

    const noeuds = [];
    let mois = "";
    for (const o of lignes.slice(0, limite)) {
      const m = moisFr(o.date);
      if (m !== mois) { mois = m; noeuds.push(h("h3", { class: "groupe" }, m)); }
      const cat = cats.get(o.categorieId);
      const choisie = choisies.has(o.id);
      const pastille = mode
        ? h("span", { class: "pointer sel", "aria-hidden": "true" }, choisie ? "☑" : "☐")
        : o.statut === "annule"
        ? h("span", { class: "pointer inactif", title: "Annulée" }, ICONES.annule)
        : h("button", { type: "button", class: "pointer", "aria-label": o.statut === "pointe" ? "Dépointer" : "Pointer", title: o.statut === "pointe" ? "Pointée : toucher pour dépointer" : "En cours : toucher pour pointer", onclick: () => basculer(o) }, ICONES[o.statut]);
      noeuds.push(h("div", {
        class: "ligne avec-pointage" + (o.statut === "annule" ? " annule" : "") + (mode && choisie ? " choisie" : ""),
        style: `border-left-color:${cat?.couleur || c.couleur || "transparent"}`
      },
        pastille,
        h("button", { type: "button", class: "corps", onclick: () => {
          if (mode) { if (choisies.has(o.id)) choisies.delete(o.id); else choisies.add(o.id); majListe(); return; }
          formOperation({ compteId: id, op: etat.operations.find((x) => x.id === o.id) });
        } },
          h("div", { class: "gauche" },
            h("strong", {}, o.nom),
            h("small", {}, `${dateFr(o.date)}${cat ? " · " + cat.nom : ""}${o.aExporter ? " · à exporter" : ""}`)),
          h("div", { class: "droite" },
            h("small", {}, euros(o.solde)),
            h("span", { class: "montant " + (o.montant < 0 ? "neg" : "pos") }, euros(o.montant)),
            h("small", {}, libelleNature(o.nature))))));
    }
    if (lignes.length > limite) {
      noeuds.push(h("button", { class: "sec plus", onclick: () => { limite += PAGE; majListe(); } }, `Afficher plus (${lignes.length - limite} restantes)`));
    }
    liste.replaceChildren(...noeuds);
  }

  majListe();
  return { maj: majListe };
}
