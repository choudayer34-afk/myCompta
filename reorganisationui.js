// Écran de réorganisation d'une catégorie en sous-catégories : aperçu, choix, application.
import { etat, nouvelId, lot } from "./store.js";
import { cleNom } from "./noms.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { proposerSousCategories } from "./reorganisation.js";

export function formReorganisation() {
  const parents = etat.categories.filter((c) => !c.parentId && !c.archive)
    .map((c) => ({ c, nb: etat.operations.filter((o) => o.categorieId === c.id && !o.virementId).length }))
    .filter((x) => x.nb > 0).sort((a, b) => b.nb - a.nb);
  const iParent = selecteur(parents.map((x) => [x.c.id, `${x.c.icone || ""} ${x.c.nom} (${x.nb} op.)`.trim()]), parents[0]?.c.id || "");
  const zone = h("div", {});
  let proposition = null;

  function apercu() {
    const parent = etat.categories.find((c) => c.id === iParent.value);
    if (!parent) { zone.replaceChildren(); return; }
    proposition = proposerSousCategories(etat.operations, parent.id);
    if (!proposition.groupes.length) { zone.replaceChildren(h("p", { class: "vide" }, "Aucun nom d'opération ne correspond aux regroupements connus.")); return; }
    zone.replaceChildren(
      h("p", { class: "note" }, "Décochez les regroupements que vous ne voulez pas. Les opérations non reconnues restent dans la catégorie d'origine."),
      ...proposition.groupes.map((g, i) => {
        const case_ = h("input", { type: "checkbox", checked: true }); case_.dataset.i = i;
        const nom = h("input", { type: "text", value: g.regle.nom, autocomplete: "off" }); nom.dataset.i = i;
        const icone = h("input", { type: "text", value: g.regle.icone, maxlength: "4", class: "champ-icone" }); icone.dataset.i = i;
        return h("div", { class: "carte" },
          h("label", { class: "case" }, case_, h("strong", {}, `${g.operations.length} opération(s)`)),
          h("div", { class: "ligne-synthese" }, icone, nom),
          h("small", { class: "note" }, g.noms.slice(0, 8).join(", ") + (g.noms.length > 8 ? "…" : "")));
      }),
      h("p", { class: "note" }, `${proposition.restantes.length} opération(s) resteront dans « ${parent.nom} » : ` + [...new Set(proposition.restantes.map((o) => o.nom))].slice(0, 10).join(", ") + (proposition.restantes.length ? "…" : "")));
  }
  iParent.addEventListener("change", apercu);

  const erreur = h("p", { class: "erreur" });
  const corps = h("div", {}, champ("Catégorie à découper", iParent), zone, erreur,
    h("div", { class: "actions" }, h("button", { type: "submit" }, "Appliquer"), h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Réorganiser une catégorie", corps);
  apercu();
  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault();
    const parent = etat.categories.find((c) => c.id === iParent.value);
    if (!parent || !proposition) return;
    const ecritures = [];
    let ordre = 0;
    proposition.groupes.forEach((g, i) => {
      if (!zone.querySelector(`input[type=checkbox][data-i="${i}"]`)?.checked) return;
      const nom = zone.querySelector(`input[type=text][data-i="${i}"]:not(.champ-icone)`).value.trim() || g.regle.nom;
      const icone = zone.querySelector(`input.champ-icone[data-i="${i}"]`).value.trim();
      const existante = etat.categories.find((c) => c.parentId === parent.id && c.nom.toLowerCase() === nom.toLowerCase());
      const id = existante ? existante.id : nouvelId("categories");
      if (!existante) ecritures.push(["categories", id, { nom, parentId: parent.id, couleur: parent.couleur || null, icone, memo: g.regle.mots.join(", "), archive: false }]);
      for (const o of g.operations) ecritures.push(["operations", o.id, { categorieId: id, aClasser: false }]);
      for (const n of g.noms) ecritures.push(["nomsCategories", cleNom(n), { nom: n, categorieId: id }]);
      ordre++;
    });
    if (!ordre) { erreur.textContent = "Aucun regroupement coché."; return; }
    for (let k = 0; k < ecritures.length; k += 400) {
      const l = lot();
      for (const [col, id, d] of ecritures.slice(k, k + 400)) l.set(col, id, d);
      await l.envoyer();
    }
    dialogue.close();
  });
}
