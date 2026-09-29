import { etat, pret, nouvelId, lot, categoriesTriees } from "./store.js";
import { h, modale, champ, selecteur, couleurAuHasard } from "./ui.js";

function formCategorie(cat = null) {
  const parents = etat.categories
    .filter((c) => !c.parentId && c.id !== cat?.id)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((c) => [c.id, c.nom]);
  const aDesEnfants = cat && etat.categories.some((c) => c.parentId === cat.id);
  const iNom = h("input", { type: "text", required: true, value: cat?.nom || "", autocomplete: "off" });
  const iParent = selecteur([["", "— aucune (catégorie principale) —"], ...parents], cat?.parentId || "", { disabled: aDesEnfants || null });
  const iCouleur = h("input", { type: "color", value: cat?.couleur || couleurAuHasard() });
  const erreur = h("p", { class: "erreur" });

  const actions = h("div", { class: "actions" },
    h("button", { type: "submit" }, "Enregistrer"),
    h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"),
    cat && h("button", { type: "button", class: "danger", onclick: () => {
      const nb = etat.operations.filter((o) => o.categorieId === cat.id).length;
      if (aDesEnfants) { erreur.textContent = "Cette catégorie contient des sous-catégories."; return; }
      if (nb > 0) { erreur.textContent = `Cette catégorie est utilisée par ${nb} opération(s).`; return; }
      if (!confirm("Supprimer cette catégorie ?")) return;
      const l = lot(); l.del("categories", cat.id); l.envoyer();
      dialogue.close();
    } }, "Supprimer")
  );

  const { dialogue, formulaire } = modale(cat ? "Modifier la catégorie" : "Nouvelle catégorie", [
    champ("Nom", iNom), champ("Catégorie parente", iParent), champ("Couleur", iCouleur), erreur, actions
  ]);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const l = lot();
    l.set("categories", cat?.id || nouvelId("categories"), {
      nom: iNom.value.trim(), parentId: iParent.value || null, couleur: iCouleur.value
    });
    l.envoyer();
    dialogue.close();
  });
}

export function monter(conteneur) {
  const resume = h("div", { class: "resume" });
  const liste = h("div", { class: "liste" });
  const ajout = h("button", { class: "flottant", "aria-label": "Nouvelle catégorie", onclick: () => formCategorie() }, "+");
  conteneur.replaceChildren(resume, liste, ajout);

  function maj() {
    if (!pret()) { liste.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const utilisations = new Map();
    for (const o of etat.operations) if (o.categorieId) utilisations.set(o.categorieId, (utilisations.get(o.categorieId) || 0) + 1);
    resume.textContent = `${etat.categories.length} catégories`;
    const lignes = categoriesTriees().map((c) =>
      h("button", { class: "ligne bouton-ligne" + (c.parentId ? " enfant" : ""), style: `border-left-color:${c.couleur || "transparent"}`, onclick: () => formCategorie(etat.categories.find((x) => x.id === c.id)) },
        h("div", { class: "gauche" }, h("strong", {}, c.parentId ? c.nom : c.libelle)),
        h("div", { class: "droite" }, h("small", {}, `${utilisations.get(c.id) || 0} op.`))));
    liste.replaceChildren(...(lignes.length ? lignes : [h("p", { class: "vide" }, "Aucune catégorie. Touchez + pour en créer une.")]));
  }
  maj();
  return { maj };
}
