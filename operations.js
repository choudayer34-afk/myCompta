import { etat, pret, nouvelId, lot, serverTimestamp, categoriesTriees } from "./store.js";
import { lignesAvecSolde, soldePointe } from "./calc.js";
import { euros, versCentimes, versSaisie, dateFr, moisFr, aujourdhui, sansAccent } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { formCompte } from "./comptes.js";

export const NATURES = [
  ["autre", "Autre"], ["carte", "Carte"], ["cheque", "Chèque"],
  ["prelevement", "Prélèvement"], ["virement", "Virement"], ["especes", "Espèces"]
];
export const STATUTS = [["encours", "En cours"], ["pointe", "Pointé"], ["annule", "Annulé"]];
const ICONES = { encours: "○", pointe: "●", annule: "✕" };
const libelleNature = (n) => (NATURES.find((x) => x[0] === n) || [0, ""])[1];

// Formulaire de création / modification. `op` = opération existante, `modele` = valeurs de départ (duplication).
export function formOperation({ compteId, op = null, modele = null }) {
  const src = op || modele || {};
  const virement = !!(op && op.virementId);
  const paire = virement ? etat.operations.find((o) => o.virementId === op.virementId && o.id !== op.id) : null;
  const signe = virement ? (op.montant < 0 ? -1 : 1) : 0;
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === src.compteId).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const optComptes = comptes.map((c) => [c.id, c.nom]);

  const iType = selecteur([["operation", "Opération"], ["virement", "Virement entre comptes"]], "operation");
  const iNom = h("input", { type: "text", required: true, value: src.nom || "", autocomplete: "off" });
  const iCom = h("input", { type: "text", value: src.commentaire || "" });
  const iDate = h("input", { type: "date", required: true, value: src.date || aujourdhui() });
  const iSens = selecteur([["-1", "Dépense"], ["1", "Recette"]], src.montant > 0 ? "1" : "-1");
  const iMontant = h("input", { type: "text", inputmode: "decimal", required: true, placeholder: "0,00", value: src.montant != null ? versSaisie(src.montant) : "" });
  const iCompte = selecteur(optComptes, src.compteId || compteId);
  const iDest = selecteur(optComptes, (comptes.find((c) => c.id !== (src.compteId || compteId)) || {}).id);
  const iNature = selecteur(NATURES, src.nature || "autre");
  const iInfo = h("input", { type: "text", value: src.info || "" });
  const iCat = selecteur([["", "— aucune —"], ...categoriesTriees().map((c) => [c.id, c.libelle])], src.categorieId || "");
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
    champ("Statut", iStatut), cPointage, cLie, erreur, actions
  ]);
  basculer();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const saisi = versCentimes(iMontant.value);
    if (saisi === null || saisi === 0) { erreur.textContent = "Montant invalide."; return; }
    const m = Math.abs(saisi);
    const statut = iStatut.value;
    const datePointage = statut === "pointe" ? (iPointage.value || aujourdhui()) : null;
    const commun = { nom: iNom.value.trim(), commentaire: iCom.value.trim(), date: iDate.value, statut, datePointage, info: iInfo.value.trim() };
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
  let recherche = "";
  let limite = PAGE;
  const compte = () => etat.comptes.find((c) => c.id === id);

  const titre = h("strong", { class: "titre-vue" });
  const solde = h("span", { class: "solde-vue" });
  const enTete = h("div", { class: "entete-vue" },
    h("a", { href: "#/comptes", class: "retour" }, "‹ Comptes"), titre,
    h("button", { class: "sec", onclick: () => compte() && formCompte(compte()) }, "Modifier"));
  const iRecherche = h("input", { type: "search", placeholder: "Recherche", class: "recherche", autocomplete: "off" });
  iRecherche.addEventListener("input", () => { recherche = iRecherche.value; limite = PAGE; majListe(); });
  const liste = h("div", { class: "liste" });
  const ajout = h("button", { class: "flottant", "aria-label": "Nouvelle opération", onclick: () => compte() && formOperation({ compteId: id }) }, "+");
  conteneur.replaceChildren(enTete, h("div", { class: "resume" }, solde), iRecherche, liste, ajout);

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
    const cats = new Map(etat.categories.map((x) => [x.id, x]));
    const nomsCat = new Map(etat.categories.map((x) => [x.id, x.nom]));
    const q = sansAccent(recherche).trim();
    if (q) lignes = lignes.filter((o) => correspond(o, q, nomsCat));
    if (!lignes.length) { liste.replaceChildren(h("p", { class: "vide" }, q ? "Aucun résultat." : "Aucune opération. Touchez + pour en ajouter.")); return; }

    const noeuds = [];
    let mois = "";
    for (const o of lignes.slice(0, limite)) {
      const m = moisFr(o.date);
      if (m !== mois) { mois = m; noeuds.push(h("h3", { class: "groupe" }, m)); }
      const cat = cats.get(o.categorieId);
      noeuds.push(h("button", {
        class: "ligne bouton-ligne" + (o.statut === "annule" ? " annule" : ""),
        style: `border-left-color:${cat?.couleur || c.couleur || "transparent"}`,
        onclick: () => formOperation({ compteId: id, op: etat.operations.find((x) => x.id === o.id) })
      },
        h("div", { class: "gauche" },
          h("strong", {}, o.nom),
          h("small", {}, `${ICONES[o.statut] || ""} ${dateFr(o.date)}${cat ? " · " + cat.nom : ""}`)),
        h("div", { class: "droite" },
          h("small", {}, euros(o.solde)),
          h("span", { class: "montant " + (o.montant < 0 ? "neg" : "pos") }, euros(o.montant)),
          h("small", {}, libelleNature(o.nature)))));
    }
    if (lignes.length > limite) {
      noeuds.push(h("button", { class: "sec plus", onclick: () => { limite += PAGE; majListe(); } }, `Afficher plus (${lignes.length - limite} restantes)`));
    }
    liste.replaceChildren(...noeuds);
  }

  majListe();
  return { maj: majListe };
}
