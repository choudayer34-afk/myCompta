import { etat, ecrireEnParallele } from "./store.js";
import { euros, versCentimes, dateFr, aujourdhui } from "./format.js";
import { h, modale, champ } from "./ui.js";
import { finProposee, preparerRapprochement, evaluerRapprochement } from "./rapprochement.js";

// Clôture d'un mois : on saisit le solde du relevé, on coche les opérations présentes sur le relevé,
// l'écart doit tomber à zéro, puis on pointe la sélection.
export function formCloture(compte, apres = () => {}) {
  const iDate = h("input", { type: "date", required: true, value: finProposee(compte, aujourdhui()) });
  const iSolde = h("input", { type: "text", inputmode: "decimal", placeholder: "ex. 1 234,56 ou -80,00", autocomplete: "off" });
  const synthese = h("div", { class: "carte synthese-cloture" });
  const indice = h("p", { class: "note" });
  const liste = h("div", { class: "liste" });
  const erreur = h("p", { class: "erreur" });
  const bPointer = h("button", { type: "submit" }, "Pointer la sélection");
  let prep = null, selection = new Set();

  function recharger() {
    prep = preparerRapprochement(compte, etat.operations, iDate.value || "0000-00-00");
    selection = new Set(prep.candidates.map((o) => o.id));
    maj();
  }

  function maj() {
    const releve = versCentimes(iSolde.value);
    const ev = releve == null ? null : evaluerRapprochement(prep, selection, releve);
    synthese.replaceChildren(
      h("div", { class: "ligne-synthese" }, h("span", {}, "Déjà pointé à cette date"), h("strong", {}, euros(prep.base))),
      h("div", { class: "ligne-synthese" }, h("span", {}, `Après pointage (${selection.size})`), h("strong", {}, euros(prep.base + prep.candidates.filter((o) => selection.has(o.id)).reduce((s, o) => s + o.montant, 0)))),
      ev ? h("p", { class: "reste-budget " + (ev.ecart === 0 ? "pos" : "neg") }, ev.ecart === 0 ? "✓ En accord avec le relevé" : `Écart : ${euros(ev.ecart)}`) : h("p", { class: "note" }, "Saisissez le solde du relevé pour calculer l'écart."));
    indice.textContent = ev && ev.indice
      ? (ev.indice.type === "decocher" ? `Piste : « ${ev.indice.op.nom} » (${euros(ev.indice.op.montant)}) est peut-être absente du relevé.`
        : `Piste : « ${ev.indice.op.nom} » (${euros(ev.indice.op.montant)}) figure peut-être sur le relevé.`)
      : "";
    bPointer.textContent = `Pointer la sélection (${selection.size})`;
    bPointer.disabled = !selection.size;
    if (!prep.candidates.length) { liste.replaceChildren(h("p", { class: "vide" }, "Aucune opération à pointer jusqu'à cette date.")); return; }
    liste.replaceChildren(...prep.candidates.map((o) => {
      const i = h("input", { type: "checkbox", checked: selection.has(o.id) || null });
      i.addEventListener("change", () => { if (i.checked) selection.add(o.id); else selection.delete(o.id); maj(); });
      return h("label", { class: "case ligne-cloture" }, i,
        h("span", { class: "nom-cloture" }, h("strong", {}, o.nom), h("small", {}, dateFr(o.date))),
        h("span", { class: "montant " + (o.montant < 0 ? "neg" : "pos") }, euros(o.montant)));
    }));
  }

  const corps = h("div", {},
    compte.derniereCloture ? h("p", { class: "note" }, `Dernière clôture : ${dateFr(compte.derniereCloture)}.`) : null,
    h("div", { class: "deux" }, champ("Fin du relevé", iDate), champ("Solde du relevé (€)", iSolde)),
    synthese, indice,
    h("div", { class: "actions" },
      h("button", { type: "button", class: "sec", onclick: () => { selection = new Set(prep.candidates.map((o) => o.id)); maj(); } }, "Tout cocher"),
      h("button", { type: "button", class: "sec", onclick: () => { selection.clear(); maj(); } }, "Tout décocher")),
    liste, erreur,
    h("div", { class: "barre-fixe actions" }, bPointer, h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale(`Clôture · ${compte.nom}`, corps);
  iDate.addEventListener("change", recharger);
  iSolde.addEventListener("input", maj);
  recharger();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    erreur.textContent = "";
    const releve = versCentimes(iSolde.value);
    if (releve == null) { erreur.textContent = "Saisissez le solde du relevé."; return; }
    if (!selection.size) return;
    const ev = evaluerRapprochement(prep, selection, releve);
    if (ev.ecart !== 0 && !confirm(`L'écart avec le relevé est de ${euros(ev.ecart)}. Pointer quand même ces ${selection.size} opération(s) ?`)) return;
    const jour = aujourdhui();
    const ecritures = [...selection].map((id) => ["operations", id, { statut: "pointe", datePointage: jour }]);
    if (ev.ecart === 0) ecritures.push(["comptes", compte.id, { derniereCloture: iDate.value }]);
    bPointer.disabled = true;
    ecrireEnParallele(ecritures).then(() => { dialogue.close(); apres(selection.size, ev.ecart === 0); })
      .catch((err) => { console.error(err); bPointer.disabled = false; erreur.textContent = "Échec de l'enregistrement : " + err.message; });
  });
}
