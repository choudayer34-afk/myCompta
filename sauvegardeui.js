// Carte « Sauvegarde et restauration » (affichée dans l'écran Export).
import { etat, pret, ecrireEnParallele, supprimerEnParallele } from "./store.js";
import { aujourdhui, dateFr } from "./format.js";
import { h, selecteur } from "./ui.js";
import { construireSauvegarde, lireSauvegarde, planRestauration, csvOperations } from "./sauvegarde.js";

const CLE = "compta-derniere-sauvegarde";
export const dernierSauvegarde = () => { try { return localStorage.getItem(CLE) || ""; } catch (_) { return ""; } };
const noter = () => { try { localStorage.setItem(CLE, new Date().toISOString()); } catch (_) { /* rien */ } };

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const lien = h("a", { href: url, download: nom });
  document.body.append(lien); lien.click(); lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

export function carteSauvegarde() {
  const etatTexte = h("p", { class: "note" });
  const info = h("p", { class: "note" });
  const erreur = h("p", { class: "erreur" });
  const zoneRestau = h("div", { class: "cache" });
  let lue = null;

  function maj() {
    const n = (c) => etat[c].length;
    const d = dernierSauvegarde();
    etatTexte.textContent = pret()
      ? `${n("comptes")} comptes, ${n("operations")} opérations, ${n("categories")} catégories, ${n("planifiees")} échéances. ` +
        (d ? `Dernière sauvegarde sur cet appareil : ${dateFr(d.slice(0, 10))}.` : "Aucune sauvegarde faite depuis cet appareil.")
      : "Chargement…";
  }

  const bSauver = h("button", { type: "button", onclick: () => {
    if (!pret()) return;
    const s = construireSauvegarde(etat);
    telecharger(new Blob([JSON.stringify(s)], { type: "application/json" }), `compta-sauvegarde_${aujourdhui()}.json`);
    noter(); maj();
    info.textContent = `Sauvegarde téléchargée : ${s.nombres.operations} opérations, ${s.nombres.comptes} comptes.`;
  } }, "Télécharger la sauvegarde complète");

  const bCsv = h("button", { type: "button", class: "sec", onclick: () => {
    if (!pret()) return;
    telecharger(new Blob([csvOperations(etat)], { type: "text/csv;charset=utf-8" }), `compta-operations_${aujourdhui()}.csv`);
  } }, "Toutes les opérations en CSV");

  // Restauration
  const iFichier = h("input", { type: "file", accept: ".json,application/json" });
  const resume = h("div", { class: "note" });
  const iMode = selecteur([["fusion", "Fusionner : ajouter et mettre à jour, sans rien supprimer"], ["remplacement", "Remplacer : les données actuelles absentes de la sauvegarde sont supprimées"]], "fusion");
  const iConfirmation = h("input", { type: "text", placeholder: "Tapez REMPLACER pour confirmer", autocomplete: "off" });
  const cConfirmation = h("div", { class: "champ cache" }, iConfirmation);
  const bRestaurer = h("button", { type: "button", class: "danger", disabled: true }, "Restaurer");
  iMode.addEventListener("change", () => { cConfirmation.classList.toggle("cache", iMode.value !== "remplacement"); });

  iFichier.addEventListener("change", async () => {
    erreur.textContent = ""; info.textContent = ""; lue = null; bRestaurer.disabled = true; zoneRestau.classList.add("cache");
    const f = iFichier.files && iFichier.files[0];
    if (!f) return;
    const r = lireSauvegarde(await f.text());
    if (!r.ok) { erreur.textContent = r.erreur; return; }
    lue = r.sauvegarde;
    const x = r.resume;
    resume.textContent = `Sauvegarde du ${x.date ? dateFr(x.date.slice(0, 10)) : "?"} : ${x.comptes} comptes, ${x.operations} opérations, ${x.categories} catégories, ${x.planifiees} échéances.` +
      (x.orphelines ? ` Attention : ${x.orphelines} opération(s) visent un compte absent de la sauvegarde.` : "");
    zoneRestau.classList.remove("cache"); bRestaurer.disabled = false;
  });

  bRestaurer.addEventListener("click", async () => {
    if (!lue || !pret()) return;
    const mode = iMode.value;
    if (mode === "remplacement" && iConfirmation.value.trim() !== "REMPLACER") { erreur.textContent = "Tapez REMPLACER pour confirmer le remplacement."; return; }
    if (!confirm(mode === "remplacement" ? "Remplacer toutes les données actuelles par cette sauvegarde ?" : "Fusionner cette sauvegarde avec les données actuelles ?")) return;
    erreur.textContent = ""; bRestaurer.disabled = true;
    try {
      const plan = planRestauration(lue, etat, mode);
      info.textContent = "Restauration en cours… (connexion nécessaire)";
      await ecrireEnParallele(plan.ecritures);
      if (plan.suppressions.length) await supprimerEnParallele(plan.suppressions);
      info.textContent = `Restauration terminée : ${plan.ecritures.length} document(s) écrit(s)` + (plan.suppressions.length ? `, ${plan.suppressions.length} supprimé(s).` : ".");
      iFichier.value = ""; lue = null; zoneRestau.classList.add("cache");
    } catch (e) {
      console.error(e); erreur.textContent = "Échec de la restauration : " + (e.message || e); bRestaurer.disabled = false;
    }
  });
  zoneRestau.append(resume, h("div", { class: "champ" }, h("label", {}, "Mode"), iMode), cConfirmation, bRestaurer);

  const element = h("div", { class: "carte" },
    h("h2", {}, "Sauvegarde et restauration"),
    etatTexte,
    h("div", { class: "actions" }, bSauver, bCsv),
    h("p", { class: "note" }, "Le fichier de sauvegarde contient tous vos comptes, opérations, catégories et échéances. Conservez-le hors de l'application (Fichiers, e-mail, ordinateur)."),
    h("h3", { class: "section-titre" }, "Restaurer"),
    h("div", { class: "champ" }, h("label", {}, "Fichier de sauvegarde (.json)"), iFichier),
    zoneRestau, info, erreur);
  maj();
  return { element, maj };
}
