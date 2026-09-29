import { etat, pret, nouvelId, lot, ecrireEnParallele, serverTimestamp, categoriesTriees, comparerComptes } from "./store.js";
import { ecrituresEcheances, FREQUENCES, libelleFrequence, estTerminee } from "./planning.js";
import { euros, versCentimes, versSaisie, dateFr, aujourdhui } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { NATURES } from "./operations.js";

// Crée les opérations « en cours » des échéances arrivées à terme. Sans risque de doublon : identifiants déterministes.
// Retourne { nb, fini } ; `fini` se résout quand le serveur a confirmé (jamais hors connexion).
export function genererEcheances() {
  if (!etat.uid) return { nb: 0, fini: Promise.resolve() };
  const ids = new Set(etat.operations.map((o) => o.id));
  const { ecritures, nb } = ecrituresEcheances(etat.planifiees, ids, aujourdhui(), serverTimestamp());
  if (!ecritures.length) return { nb: 0, fini: Promise.resolve() };
  const fini = ecrireEnParallele(ecritures).catch((e) => console.error("Échéances", e));
  return { nb, fini };
}

export function formPlanifiee(p = null) {
  const virement = !!(p && p.virementCompteId);
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === p?.compteId).sort(comparerComptes);
  const optComptes = comptes.map((c) => [c.id, c.nom]);

  const iType = selecteur([["operation", "Opération"], ["virement", "Virement entre comptes"]], virement ? "virement" : "operation");
  const iNom = h("input", { type: "text", required: true, value: p?.nom || "", autocomplete: "off" });
  const iCom = h("input", { type: "text", value: p?.commentaire || "" });
  const iSens = selecteur([["-1", "Dépense"], ["1", "Recette"]], p && !virement && p.montant > 0 ? "1" : "-1");
  const iMontant = h("input", { type: "text", inputmode: "decimal", required: true, placeholder: "0,00", value: p ? versSaisie(p.montant) : "" });
  const iCompte = selecteur(optComptes, p?.compteId);
  const iDest = selecteur(optComptes, p?.virementCompteId || (comptes.find((c) => c.id !== (p?.compteId || comptes[0]?.id)) || {}).id);
  const iNature = selecteur(NATURES, p?.nature || "autre");
  const iCat = selecteur([["", "— aucune —"], ...categoriesTriees().map((c) => [c.id, c.libelle])], p?.categorieId || "");
  const iFreq = selecteur(FREQUENCES, p?.frequence || "mensuel");
  const iProchaine = h("input", { type: "date", required: true, value: p?.prochaine || aujourdhui() });
  const iFin = h("input", { type: "date", value: p?.dateFin || "" });
  const iInfo = h("input", { type: "text", value: p?.info || "" });
  const erreur = h("p", { class: "erreur" });

  const cSens = champ("Sens", iSens);
  const cCompte = champ("Compte", iCompte);
  const cDest = champ("Compte destination", iDest);
  const cNature = champ("Nature", iNature);
  const cCat = champ("Catégorie", iCat);

  function basculer() {
    const v = iType.value === "virement";
    cSens.hidden = v; cDest.hidden = !v; cNature.hidden = v; cCat.hidden = v;
    cCompte.querySelector("label").textContent = v ? "Compte source" : "Compte";
  }
  iType.addEventListener("change", basculer);

  const actions = h("div", { class: "actions" },
    h("button", { type: "submit" }, "Enregistrer"),
    h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"),
    p && h("button", { type: "button", class: "danger", onclick: () => {
      if (!confirm("Supprimer cette opération planifiée ? Les opérations déjà créées sont conservées.")) return;
      const l = lot(); l.del("planifiees", p.id); l.envoyer();
      dialogue.close();
    } }, "Supprimer")
  );

  const { dialogue, formulaire } = modale(p ? "Opération planifiée" : "Nouvelle opération planifiée", [
    champ("Type de saisie", iType), champ("Nom", iNom), champ("Commentaire", iCom), cSens,
    champ("Montant (€)", iMontant), cCompte, cDest, cNature, champ("Info", iInfo), cCat,
    champ("Fréquence", iFreq), champ("Prochaine échéance", iProchaine), champ("Date de fin (facultative)", iFin), erreur, actions
  ]);
  if (p) formulaire.querySelector(".champ").hidden = true;
  basculer();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const saisi = versCentimes(iMontant.value);
    if (saisi === null || saisi === 0) { erreur.textContent = "Montant invalide."; return; }
    const v = iType.value === "virement";
    if (v && iCompte.value === iDest.value) { erreur.textContent = "Choisissez deux comptes différents."; return; }
    if (iFin.value && iFin.value < iProchaine.value) { erreur.textContent = "La date de fin précède la prochaine échéance."; return; }
    const m = Math.abs(saisi);
    const donnees = {
      nom: iNom.value.trim(), commentaire: iCom.value.trim(), info: iInfo.value.trim(),
      montant: v ? -m : Number(iSens.value) * m,
      compteId: iCompte.value, virementCompteId: v ? iDest.value : null,
      nature: v ? "virement" : iNature.value, categorieId: v ? null : (iCat.value || null),
      frequence: iFreq.value, prochaine: iProchaine.value, jourAncre: +iProchaine.value.slice(8, 10), dateFin: iFin.value || null
    };
    if (!p) donnees.cree = serverTimestamp();
    const l = lot();
    l.set("planifiees", p?.id || nouvelId("planifiees"), donnees);
    l.envoyer();
    dialogue.close();
  });
}

export function monter(conteneur) {
  const resume = h("div", { class: "resume" });
  const liste = h("div", { class: "liste" });
  const ajout = h("button", { class: "flottant", "aria-label": "Nouvelle opération planifiée", onclick: () => formPlanifiee() }, "+");
  conteneur.replaceChildren(resume, liste, ajout);

  function maj() {
    if (!pret()) { liste.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const comptes = new Map(etat.comptes.map((c) => [c.id, c]));
    resume.textContent = `${etat.planifiees.length} opérations planifiées`;
    if (!etat.planifiees.length) { liste.replaceChildren(h("p", { class: "vide" }, "Aucune opération planifiée. Touchez + pour en créer une, ou importez votre CSV iCompta.")); return; }
    const groupes = new Map();
    for (const p of etat.planifiees) {
      if (!groupes.has(p.compteId)) groupes.set(p.compteId, []);
      groupes.get(p.compteId).push(p);
    }
    const noeuds = [];
    const ordre = [...groupes.keys()].sort((a, b) => comparerComptes(comptes.get(a) || { nom: "~" }, comptes.get(b) || { nom: "~" }));
    for (const cid of ordre) {
      noeuds.push(h("h3", { class: "groupe" }, (comptes.get(cid) || {}).nom || "Compte supprimé"));
      for (const p of groupes.get(cid).sort((a, b) => (a.prochaine || "").localeCompare(b.prochaine || ""))) {
        const fin = estTerminee(p);
        const dest = p.virementCompteId && (comptes.get(p.virementCompteId) || {}).nom;
        noeuds.push(h("button", { class: "ligne bouton-ligne" + (fin ? " terminee" : ""), style: `border-left-color:${(comptes.get(cid) || {}).couleur || "transparent"}`, onclick: () => formPlanifiee(etat.planifiees.find((x) => x.id === p.id)) },
          h("div", { class: "gauche" },
            h("strong", {}, (p.virementCompteId ? "⇄ " : "") + p.nom),
            h("small", {}, `${fin ? "terminée" : dateFr(p.prochaine)} · ${libelleFrequence(p.frequence)}${dest ? " · vers " + dest : ""}`)),
          h("div", { class: "droite" },
            h("span", { class: "montant " + (p.montant < 0 ? "neg" : "pos") }, euros(p.montant)))));
      }
    }
    liste.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
