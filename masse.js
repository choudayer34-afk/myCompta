import { etat, ecrireEnParallele, categoriesTriees, comparerComptes } from "./store.js";
import { modificationsMasse } from "./calc.js";
import { NATURES, STATUTS } from "./constantes.js";
import { aujourdhui } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";

const CHAMPS = [["categorie", "Catégorie"], ["export", "Inclure dans l'export"], ["statut", "Statut"], ["nature", "Nature"], ["compte", "Compte (déplacer)"]];

// Fenêtre de modification en masse. `apres(nbModifiees, nbIgnorees)` est appelée après l'enregistrement.
export function formMasse(operations, apres) {
  const comptes = etat.comptes.filter((c) => !c.archive).sort(comparerComptes);
  const iChamp = selecteur(CHAMPS, "categorie");
  const controles = {
    categorie: selecteur([["", "— aucune —"], ...categoriesTriees().map((c) => [c.id, c.libelle])], ""),
    export: selecteur([["1", "Oui"], ["0", "Non"]], "1"),
    statut: selecteur(STATUTS, "pointe"),
    nature: selecteur(NATURES, "autre"),
    compte: selecteur(comptes.map((c) => [c.id, c.nom]), operations[0] && operations[0].compteId)
  };
  const zone = h("div");
  const note = h("p", { class: "note" });
  const erreur = h("p", { class: "erreur" });
  const nbVirements = operations.filter((o) => o.virementId).length;

  function montrer() {
    zone.replaceChildren(champ("Nouvelle valeur", controles[iChamp.value]));
    const limite = ["categorie", "nature", "compte"].includes(iChamp.value) && nbVirements;
    note.textContent = limite ? `${nbVirements} virement(s) lié(s) ne seront pas modifiés pour ce champ.` : "";
    erreur.textContent = "";
  }
  iChamp.addEventListener("change", montrer);

  const { dialogue, formulaire } = modale(`Modifier ${operations.length} opération(s)`, [
    champ("Champ à modifier", iChamp), zone, note, erreur,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Appliquer"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"))
  ]);
  montrer();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const valeur = controles[iChamp.value].value;
    const { ecritures, ignorees } = modificationsMasse(operations, iChamp.value, valeur, aujourdhui());
    if (!ecritures.length) { erreur.textContent = "Aucune opération à modifier avec ce choix."; return; }
    ecrireEnParallele(ecritures).catch((err) => { console.error(err); alert("Échec de la modification : " + err.message); });
    dialogue.close();
    apres(ecritures.length, ignorees);
  });
}
