// Objectif d'épargne d'un compte : progression et épargne mensuelle nécessaire.
import { h } from "./ui.js";
import { euros, dateFr } from "./format.js";

const JOUR = 86400000;
const ms = (iso) => Date.parse(iso + "T12:00:00Z");

// solde, montant en centimes ; dateCible et aujourdhui au format AAAA-MM-JJ
export function progression(solde, montant, dateCible, aujourdhui) {
  if (!(montant > 0)) return null;
  const reste = Math.max(0, montant - solde);
  const atteint = reste === 0;
  const pct = Math.max(0, Math.min(100, Math.floor((Math.max(0, solde) / montant) * 100)));
  const r = { pct, reste, atteint, mois: null, mensuel: null, depasse: false };
  if (dateCible && !atteint) {
    const jours = (ms(dateCible) - ms(aujourdhui)) / JOUR;
    if (jours <= 0) r.depasse = true;
    else { r.mois = Math.max(1, Math.ceil(jours / 30.4375)); r.mensuel = Math.ceil(reste / r.mois); }
  }
  return r;
}

// Bloc d'affichage ; compact = barre et pourcentage seulement (liste des comptes)
export function blocObjectif(compte, solde, aujourdhui, compact = false) {
  const p = progression(solde, compte.objectifMontant, compte.objectifDate, aujourdhui);
  if (!p) return null;
  const barre = h("div", { class: "objectif-barre", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(p.pct) },
    h("span", { style: `width:${p.pct}%` }));
  if (compact) return h("div", { class: "objectif compact" }, h("small", {}, `🎯 ${p.pct} % de ${euros(compte.objectifMontant)}`), barre);
  const detail = p.atteint ? "Objectif atteint."
    : p.depasse ? `Reste ${euros(p.reste)} · date cible dépassée (${dateFr(compte.objectifDate)}).`
    : p.mensuel != null ? `Reste ${euros(p.reste)} · soit environ ${euros(p.mensuel)} par mois jusqu'au ${dateFr(compte.objectifDate)} (${p.mois} mois).`
    : `Reste ${euros(p.reste)}.`;
  return h("div", { class: "objectif" },
    h("div", { class: "objectif-titre" }, h("span", {}, `🎯 Objectif ${euros(compte.objectifMontant)}`), h("strong", {}, `${p.pct} %`)),
    barre, h("small", { class: "objectif-detail" }, detail));
}
