import { etat, pret, nouvelId, lot, categoriesTriees } from "./store.js";
import { h, modale, champ, selecteur, couleurAuHasard } from "./ui.js";

const ICONES_CAT = ["🛒", "🍽", "☕", "⛽", "🚗", "🚌", "🏠", "💡", "📱", "🌐", "🩺", "💊", "🎬", "🎁", "👕", "✈️", "🎓", "👶", "🐾", "🔧", "🏦", "💶", "🧾", "❤️", "🎉", "📦"];

function formCategorie(cat = null) {
  const parents = etat.categories
    .filter((c) => !c.parentId && c.id !== cat?.id)
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    .map((c) => [c.id, c.nom]);
  const aDesEnfants = cat && etat.categories.some((c) => c.parentId === cat.id);
  const iNom = h("input", { type: "text", required: true, value: cat?.nom || "", autocomplete: "off" });
  const iParent = selecteur([["", "— aucune (catégorie principale) —"], ...parents], cat?.parentId || "", { disabled: aDesEnfants || null });
  const iCouleur = h("input", { type: "color", value: cat?.couleur || couleurAuHasard() });
  const iEtat = selecteur([["actif", "Active"], ["archive", "Archivée (masquée à la saisie)"]], cat?.archive ? "archive" : "actif");
  const iMemo = h("input", { type: "text", value: cat?.memo || "", placeholder: "ex. téléphone, casque, jeux", autocomplete: "off" });
  const iIcone = h("input", { type: "text", value: cat?.icone || "", maxlength: "4", placeholder: "Touchez une icône ci-dessous", autocomplete: "off" });
  const choixIcones = h("div", { class: "puces-cat" }, ICONES_CAT.map((i) => h("button", { type: "button", class: "puce-cat", onclick: () => { iIcone.value = iIcone.value === i ? "" : i; } }, i)));
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
    champ("Nom", iNom), champ("Catégorie parente", iParent), champ("Icône (facultative)", iIcone), choixIcones, champ("Aide-mémoire (facultatif)", iMemo), h("p", { class: "note" }, "Mots qui aident à choisir cette catégorie : ils servent à la recherche et aux suggestions à la saisie."), champ("Couleur", iCouleur), champ("État", iEtat), erreur, actions
  ]);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const l = lot();
    const archive = iEtat.value === "archive";
    l.set("categories", cat?.id || nouvelId("categories"), {
      nom: iNom.value.trim(), parentId: iParent.value || null, couleur: iCouleur.value, icone: iIcone.value.trim(), memo: iMemo.value.trim(), archive
    });
    // Archiver une catégorie principale archive aussi ses sous-catégories
    if (cat && archive && !cat.archive) for (const e of etat.categories.filter((c) => c.parentId === cat.id && !c.archive)) l.set("categories", e.id, { archive: true });
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
    const actives = etat.categories.filter((c) => !c.archive).length;
    resume.textContent = `${actives} catégories actives` + (etat.categories.length > actives ? ` · ${etat.categories.length - actives} archivée(s)` : "");
    const ligneDe = (c) =>
      h("button", { class: "ligne bouton-ligne" + (c.parentId ? " enfant" : "") + (c.archive ? " terminee" : ""), style: `border-left-color:${c.couleur || "transparent"}`, onclick: () => formCategorie(etat.categories.find((x) => x.id === c.id)) },
        h("div", { class: "gauche" }, h("strong", {}, (c.icone ? c.icone + " " : "") + (c.parentId ? c.nom : c.libelle)), c.memo ? h("small", {}, c.memo) : null),
        h("div", { class: "droite" }, h("small", {}, `${utilisations.get(c.id) || 0} op.`)));
    const toutes = categoriesTriees(true);
    const lignes = toutes.filter((c) => !c.archive).map(ligneDe);
    const archivees = toutes.filter((c) => c.archive).map((c) => ligneDe({ ...c, parentId: null }));
    liste.replaceChildren(...(lignes.length || archivees.length ? lignes : [h("p", { class: "vide" }, "Aucune catégorie. Touchez + pour en créer une.")]),
      ...(archivees.length ? [h("h3", { class: "groupe" }, "Archivées"), ...archivees] : []));
  }
  maj();
  return { maj };
}
