import { etat, pret, nouvelId, lot } from "./store.js";
import { soldeCompte } from "./calc.js";
import { euros, versCentimes, versSaisie, aujourdhui } from "./format.js";
import { h, modale, champ, selecteur, couleurAuHasard } from "./ui.js";

export const TYPES_COMPTE = [
  ["courant", "Compte courant"], ["epargne", "Épargne"], ["assurance-vie", "Assurance vie"],
  ["placement", "Placement"], ["especes", "Espèces"], ["credit", "Crédit"], ["autre", "Autre"]
];

export function formCompte(compte = null) {
  const iNom = h("input", { type: "text", required: true, value: compte?.nom || "", autocomplete: "off" });
  const iType = selecteur(TYPES_COMPTE, compte?.type || "courant");
  const iOuv = h("input", { type: "date", value: compte?.dateOuverture || aujourdhui() });
  const iSolde = h("input", { type: "text", inputmode: "decimal", value: compte ? (compte.soldeInitial < 0 ? "-" : "") + versSaisie(compte.soldeInitial || 0) : "0,00" });
  const iCouleur = h("input", { type: "color", value: compte?.couleur || couleurAuHasard() });
  const iEtat = selecteur([["actif", "Actif"], ["archive", "Archivé"]], compte?.archive ? "archive" : "actif");
  const erreur = h("p", { class: "erreur" });

  const actions = h("div", { class: "actions" },
    h("button", { type: "submit" }, "Enregistrer"),
    h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"),
    compte && h("button", { type: "button", class: "danger", onclick: () => {
      const nb = etat.operations.filter((o) => o.compteId === compte.id).length;
      if (nb > 0) { erreur.textContent = `Ce compte contient ${nb} opération(s) : archivez-le plutôt que de le supprimer.`; return; }
      if (!confirm("Supprimer ce compte ?")) return;
      const l = lot(); l.del("comptes", compte.id); l.envoyer();
      dialogue.close();
      location.hash = "#/comptes";
    } }, "Supprimer")
  );

  const { dialogue, formulaire } = modale(compte ? "Modifier le compte" : "Nouveau compte", [
    champ("Nom", iNom), champ("Type", iType), champ("Date d'ouverture", iOuv),
    champ("Solde initial (€)", iSolde), champ("Couleur", iCouleur), champ("État", iEtat), erreur, actions
  ]);

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const solde = versCentimes(iSolde.value);
    if (solde === null) { erreur.textContent = "Solde initial invalide."; return; }
    const id = compte?.id || nouvelId("comptes");
    const l = lot();
    l.set("comptes", id, {
      nom: iNom.value.trim(), type: iType.value, dateOuverture: iOuv.value || null,
      soldeInitial: solde, couleur: iCouleur.value, archive: iEtat.value === "archive"
    });
    l.envoyer();
    dialogue.close();
  });
}

export function monter(conteneur) {
  const resume = h("div", { class: "resume" });
  const liste = h("div", { class: "liste" });
  const ajout = h("button", { class: "flottant", "aria-label": "Nouveau compte", onclick: () => formCompte() }, "+");
  conteneur.replaceChildren(resume, liste, ajout);

  function ligne(c) {
    return h("a", { class: "ligne", href: `#/compte/${c.id}`, style: `border-left-color:${c.couleur || "transparent"}` },
      h("div", { class: "gauche" },
        h("strong", {}, c.nom),
        h("small", {}, (TYPES_COMPTE.find((t) => t[0] === c.type) || [0, ""])[1])),
      h("div", { class: "droite" },
        h("span", { class: "montant " + (soldeCompte(c, etat.operations) < 0 ? "neg" : "pos") }, euros(soldeCompte(c, etat.operations)))));
  }

  function maj() {
    if (!pret()) { liste.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const actifs = etat.comptes.filter((c) => !c.archive).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    const archives = etat.comptes.filter((c) => c.archive).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    const total = actifs.reduce((s, c) => s + soldeCompte(c, etat.operations), 0);
    resume.textContent = `${etat.operations.length} opérations – Solde : ${euros(total)}`;
    const noeuds = actifs.map(ligne);
    if (!actifs.length && !archives.length) noeuds.push(h("p", { class: "vide" }, "Aucun compte. Touchez + pour en créer un."));
    if (archives.length) noeuds.push(h("h3", { class: "groupe" }, "Archivés"), ...archives.map(ligne));
    liste.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
