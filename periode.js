// Périodes proposées dans le filtre d'un compte (logique pure) : retourne [début, fin] (dates incluses) ou null (aucune limite).
import { bornesMois, moisDecale } from "./budget.js";

export const PERIODES = [["", "Période : toutes"], ["mois", "Ce mois-ci"], ["precedent", "Mois dernier"], ["3mois", "3 derniers mois"], ["annee", "Cette année"], ["perso", "Dates à choisir…"]];

export function bornesFiltre(code, aujourdhui, du = "", au = "") {
  const ym = aujourdhui.slice(0, 7);
  if (code === "mois") return bornesMois(ym);
  if (code === "precedent") return bornesMois(moisDecale(ym, -1));
  if (code === "3mois") return [bornesMois(moisDecale(ym, -2))[0], bornesMois(ym)[1]];
  if (code === "annee") return [`${aujourdhui.slice(0, 4)}-01-01`, `${aujourdhui.slice(0, 4)}-12-31`];
  if (code === "perso") return du || au ? [du || "0000-01-01", au || "9999-12-31"] : null;
  return null;
}
