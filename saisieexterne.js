// Saisie lancée depuis l'extérieur (Raccourci iPhone, Siri) : adresse « …/?dicte=texte dicté ».
// Le texte est analysé, puis une carte de confirmation propose d'enregistrer sur le compte principal.
import { etat, lot, nouvelId, serverTimestamp, compteDepenseParDefaut } from "./store.js";
import { aujourdhui, dateFr, euros } from "./format.js";
import { h, modale } from "./ui.js";
import { analyserPhrase } from "./phrase.js";
import { associationPour, cleNom } from "./noms.js";

// Lit et retire le paramètre de l'adresse (une seule fois)
export function lireTexteExterne() {
  try {
    const p = new URLSearchParams(location.search);
    const t = p.get("dicte");
    if (t == null) return null;
    p.delete("dicte");
    const reste = p.toString();
    history.replaceState(null, "", location.pathname + (reste ? "?" + reste : "") + location.hash);
    return t.trim() || null;
  } catch (_) { return null; }
}

// ouvrirFormulaire({ compteId, modele }) : formulaire d'opération pré-rempli
export function traiterTexteExterne(texte, ouvrirFormulaire) {
  const compte = compteDepenseParDefaut();
  if (!compte) { alert("Créez d'abord un compte."); return; }
  const r = analyserPhrase(texte, aujourdhui(), etat.comptes);
  const cible = (r.compteId && etat.comptes.find((c) => c.id === r.compteId)) || compte;
  const modele = { nom: r.nom || "", montant: r.montant ? r.sens * r.montant : null, date: r.date, sens: r.sens, statut: "encours" };
  // Il manque le nom ou le montant : on laisse compléter dans le formulaire
  if (!r.nom || !r.montant) { ouvrirFormulaire({ compteId: cible.id, modele }); return; }

  const assoc = associationPour(etat.nomsCategories, r.nom);
  const categorie = assoc && etat.categories.find((c) => c.id === assoc.categorieId);
  const ligne = (lib, val) => h("div", { class: "ligne-voix" }, h("span", { class: "lib" }, lib), h("span", { class: "val" }, val));
  const enregistrer = () => {
    const l = lot();
    l.set("operations", nouvelId("operations"), {
      nom: r.nom, commentaire: "", date: r.date, statut: "encours", datePointage: null, info: "", aExporter: true,
      compteId: cible.id, montant: r.sens * r.montant, nature: "carte", categorieId: categorie ? categorie.id : null,
      aClasser: !categorie, virementId: null, cree: serverTimestamp()
    });
    l.envoyer();
    dialogue.close();
  };
  const { dialogue } = modale(r.sens === 1 ? "Enregistrer cette recette ?" : "Enregistrer cette dépense ?", [
    h("p", { class: "note" }, `Entendu : « ${texte} »`),
    h("div", { class: "apercu-voix" },
      ligne("Nom", r.nom), ligne("Montant", euros(r.sens * r.montant)), ligne("Date", dateFr(r.date)),
      ligne("Compte", cible.nom), ligne("Catégorie", categorie ? categorie.nom : "À classer plus tard")),
    h("div", { class: "actions barre-fixe" },
      h("button", { type: "button", onclick: enregistrer }, "Enregistrer"),
      h("button", { type: "button", class: "sec", onclick: () => { dialogue.close(); ouvrirFormulaire({ compteId: cible.id, modele }); } }, "Modifier"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"))
  ]);
}
