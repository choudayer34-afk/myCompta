import { etat, pret, nouvelId, lot, ecrireEnParallele, comparerComptes } from "./store.js";
import { soldeCompte, soldePointe } from "./calc.js";
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
  const saisie = (c) => (c < 0 ? "-" : "") + versSaisie(c);
  // Somme des opérations du compte (hors annulées) : lie le solde initial et le solde en cours
  const somme = compte ? soldeCompte(compte, etat.operations) - (compte.soldeInitial || 0) : 0;
  const iSolde = h("input", { type: "text", inputmode: "decimal", value: compte ? saisie(compte.soldeInitial || 0) : "0,00" });
  const iEnCours = h("input", { type: "text", inputmode: "decimal", value: compte ? saisie((compte.soldeInitial || 0) + somme) : "" });
  iSolde.addEventListener("input", () => { const v = versCentimes(iSolde.value); if (v !== null) iEnCours.value = saisie(v + somme); });
  iEnCours.addEventListener("input", () => { const v = versCentimes(iEnCours.value); if (v !== null) iSolde.value = saisie(v - somme); });
  const cEnCours = champ("Solde en cours (€) – opérations non pointées comprises", iEnCours);
  cEnCours.hidden = !compte;
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
    champ("Solde initial (€)", iSolde), cEnCours, champ("Couleur", iCouleur), champ("État", iEtat), erreur, actions
  ]);

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const solde = versCentimes(iSolde.value);
    if (solde === null) { erreur.textContent = "Solde initial invalide."; return; }
    const id = compte?.id || nouvelId("comptes");
    const l = lot();
    l.set("comptes", id, {
      nom: iNom.value.trim(), type: iType.value, dateOuverture: iOuv.value || null,
      soldeInitial: solde, couleur: iCouleur.value, archive: iEtat.value === "archive",
      ...(compte ? {} : { ordre: etat.comptes.reduce((m, c) => Math.max(m, Number.isFinite(c.ordre) ? c.ordre : -1), -1) + 1 })
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

  const nbAPointer = (c) => etat.operations.filter((o) => o.compteId === c.id && o.statut === "encours").length;

  // Glisser-déposer par la poignée (souris et tactile). L'ordre est enregistré au relâchement.
  function activerGlisser(poignee, ligneEl) {
    poignee.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      poignee.setPointerCapture(e.pointerId);
      ligneEl.classList.add("glisse");
      const lignes = () => [...liste.querySelectorAll(".ligne[data-actif]")];
      const avant = lignes().map((x) => x.dataset.id);
      const deplacer = (ev) => {
        const y = ev.clientY;
        const courantes = lignes();
        const iLigne = courantes.indexOf(ligneEl);
        const cible = courantes.find((x) => x !== ligneEl && y < x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2);
        const iCible = cible ? courantes.indexOf(cible) : courantes.length;
        // La ligne glissée n'est jamais retirée du document (sinon le navigateur interrompt le glissement) :
        // on déplace les lignes voisines autour d'elle.
        if (iCible < iLigne) { for (let k = iLigne - 1; k >= iCible; k--) ligneEl.after(courantes[k]); }
        else if (iCible > iLigne + 1) { for (let k = iLigne + 1; k <= iCible - 1; k++) ligneEl.before(courantes[k]); }
        if (y < 90) window.scrollBy(0, -14); else if (y > window.innerHeight - 110) window.scrollBy(0, 14);
      };
      const fin = () => {
        poignee.removeEventListener("pointermove", deplacer);
        poignee.removeEventListener("pointerup", fin);
        poignee.removeEventListener("pointercancel", fin);
        ligneEl.classList.remove("glisse");
        const apres = lignes().map((x) => x.dataset.id);
        if (apres.join() === avant.join()) return;
        ecrireEnParallele(apres.map((id, i) => ["comptes", id, { ordre: i }])).catch((err) => console.error(err));
      };
      poignee.addEventListener("pointermove", deplacer);
      poignee.addEventListener("pointerup", fin);
      poignee.addEventListener("pointercancel", fin);
    });
    // Un relâchement sur la poignée ne doit pas ouvrir le compte
    poignee.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); });
  }

  function ligne(c, glissable) {
    const corps = h("a", { class: "corps", href: `#/compte/${c.id}` },
      h("div", { class: "gauche" },
        h("strong", {}, c.nom),
        h("small", {}, (TYPES_COMPTE.find((t) => t[0] === c.type) || [0, ""])[1])),
      h("div", { class: "droite" },
        h("span", { class: "montant " + (soldeCompte(c, etat.operations) < 0 ? "neg" : "pos") }, euros(soldeCompte(c, etat.operations))),
        h("small", {}, "pointé : " + euros(soldePointe(c, etat.operations)) + (nbAPointer(c) ? ` · ${nbAPointer(c)} à pointer` : ""))));
    const poignee = glissable && h("span", { class: "poignee", title: "Glisser pour changer l'ordre", "aria-label": "Changer l'ordre" }, "⋮⋮");
    const el = h("div", { class: "ligne avec-poignee", "data-id": c.id, "data-actif": glissable ? "1" : null, style: `border-left-color:${c.couleur || "transparent"}` }, corps, poignee);
    if (poignee) activerGlisser(poignee, el);
    return el;
  }

  function maj() {
    if (!pret()) { liste.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const actifs = etat.comptes.filter((c) => !c.archive).sort(comparerComptes);
    const archives = etat.comptes.filter((c) => c.archive).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
    const total = actifs.reduce((s, c) => s + soldeCompte(c, etat.operations), 0);
    const totalPointe = actifs.reduce((s, c) => s + soldePointe(c, etat.operations), 0);
    resume.textContent = `${etat.operations.length} opérations – En cours : ${euros(total)} – Pointé : ${euros(totalPointe)}`;
    const noeuds = actifs.map((c) => ligne(c, true));
    if (!actifs.length && !archives.length) noeuds.push(h("p", { class: "vide" }, "Aucun compte. Touchez + pour en créer un."));
    if (archives.length) noeuds.push(h("h3", { class: "groupe" }, "Archivés"), ...archives.map((c) => ligne(c, false)));
    liste.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
