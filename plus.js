// Écran « Plus » : fonctions secondaires présentées en cartes sur 3 colonnes.
import { h } from "./ui.js";
import { formPastille } from "./alertes.js";
import { formComptes } from "./budgets.js";
import { formVerrou } from "./verrou.js";

export function monter(conteneur) {
  const carte = (ico, texte, action) => h("button", { type: "button", class: "carte-plus", onclick: action },
    h("span", { class: "ico" }, ico), h("span", {}, texte));
  const aller = (hash) => () => { location.hash = hash; };
  conteneur.replaceChildren(
    h("h2", {}, "Plus"),
    h("div", { class: "grille-plus" },
      carte("📥", "Import", aller("#/import")),
      carte("📤", "Export Excel", aller("#/export")),
      carte("💾", "Sauvegarde", () => { location.hash = "#/export"; setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 200); }),
      carte("🔴", "Pastille à pointer", () => formPastille()),
      carte("👥", "Comptes suivis", () => formComptes()),
      carte("🔒", "Verrouillage", () => formVerrou()),
      carte("🔄", "Mise à jour", () => { const b = document.getElementById("version"); if (b) b.click(); })));
  return { maj() {} };
}
