// Choix de la valeur mise en avant pour les soldes : en cours, à date ou nombre d'opérations à pointer.
// Le choix est mémorisé sur l'appareil et vaut pour la liste des comptes comme pour chaque compte.
import { h } from "./ui.js";
import { euros, aujourdhui } from "./format.js";

const CLE = "compta_vue_solde";
export const VUES = [["encours", "En cours"], ["pointe", "Pointé"], ["adate", "À date"], ["finmois", "Fin de mois"]];

// Dernier jour du mois en cours (AAAA-MM-JJ)
export function finDuMois() {
  const [a, m] = aujourdhui().split("-").map(Number);
  return `${a}-${String(m).padStart(2, "0")}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}

export function lireVue() {
  try { const v = localStorage.getItem(CLE); return VUES.some((x) => x[0] === v) ? v : "encours"; } catch (_) { return "encours"; }
}
function ecrireVue(v) { try { localStorage.setItem(CLE, v); } catch (_) { /* rien */ } }

// Trois boutons à choix unique ; `surChangement` est appelé après chaque changement.
export function boutonsVue(surChangement) {
  const groupe = h("div", { class: "choix-vue", role: "radiogroup", "aria-label": "Valeur mise en avant" });
  const dessiner = () => {
    const courante = lireVue();
    groupe.replaceChildren(...VUES.map(([v, l]) => h("button", {
      type: "button", class: "sec" + (v === courante ? " actif" : ""), role: "radio", "aria-checked": v === courante ? "true" : "false",
      onclick: () => { ecrireVue(v); dessiner(); surChangement(); }
    }, l)));
  };
  dessiner();
  return h("div", { class: "barre-vue" }, h("small", {}, "Mettre en avant :"), groupe);
}

// Découpe l'affichage : une valeur en gros, les autres en petit dans l'ordre fixe
// en cours, pointé, à date, fin de mois, nombre à pointer.
// `neg` indique si la valeur en gros est négative (couleur du montant).
export function lignesSolde(vue, { enCours, pointe, aDate, finMois, nb }) {
  const toutes = {
    encours: { libelle: "En cours", texte: euros(enCours), neg: enCours < 0 },
    pointe: { libelle: "Pointé", texte: euros(pointe), neg: pointe < 0 },
    adate: { libelle: "À date", texte: euros(aDate), neg: aDate < 0 },
    finmois: { libelle: "Fin de mois", texte: euros(finMois), neg: finMois < 0 }
  };
  const gros = toutes[vue] || toutes.encours;
  const petits = ["encours", "pointe", "adate", "finmois"].filter((k) => toutes[k] !== gros)
    .map((k) => `${toutes[k].libelle} : ${toutes[k].texte}`);
  petits.push(nb ? `${nb} à pointer` : "Rien à pointer");
  return { gros, petits };
}
