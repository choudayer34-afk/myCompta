// Provisions : mettre de côté chaque mois une part d'un avis réglé en une fois (aucun accès à Firebase ni au DOM).
// Une provision : { id, nom, total (centimes), nb (mois), premier (date du 1er versement), prelevement (date du prélèvement), compteId, sourceId, categorieId, echeanceId, operationId }
import { suivante } from "./planning.js";

export const mensualiteProvision = (p) => (p.nb > 0 ? Math.round((p.total || 0) / p.nb) : 0);

// Dates des versements mensuels (le 1er est à `premier`, jour du mois conservé).
export function datesVersements(p) {
  const dates = [];
  let d = p.premier;
  const ancre = d ? +d.slice(8, 10) : 1;
  for (let i = 0; i < (p.nb || 0) && d; i++) { dates.push(d); d = suivante(d, "mensuel", ancre); }
  return dates;
}

const ecartMois = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));

// Situation d'une provision à une date.
export function situationProvision(p, aujourdhui) {
  const dates = datesVersements(p);
  const m = mensualiteProvision(p);
  const faits = dates.filter((d) => d <= aujourdhui).length;
  const provisionne = Math.min(p.total || 0, faits * m);
  const preleve = !!p.prelevement && p.prelevement <= aujourdhui;
  return { mensuel: m, nb: dates.length, faits, restants: dates.length - faits, provisionne: preleve ? 0 : provisionne,
    reste: preleve ? 0 : Math.max(0, (p.total || 0) - provisionne), prochainVersement: dates.find((d) => d > aujourdhui) || null,
    dernierVersement: dates[dates.length - 1] || null, preleve,
    moisAvantPrelevement: p.prelevement && !preleve ? ecartMois(aujourdhui, p.prelevement) : null,
    ecartTotal: (p.total || 0) - m * dates.length };   // écart d'arrondi
}

// Vue d'ensemble : effort mensuel, montant déjà provisionné, prélèvements à venir (du plus proche au plus lointain).
export function syntheseProvisions(liste, aujourdhui) {
  const lignes = liste.map((p) => ({ p, s: situationProvision(p, aujourdhui) }));
  const actives = lignes.filter((x) => !x.s.preleve);
  return {
    lignes,
    parMois: actives.filter((x) => x.s.restants > 0).reduce((t, x) => t + x.s.mensuel, 0),
    provisionne: actives.reduce((t, x) => t + x.s.provisionne, 0),
    reste: actives.reduce((t, x) => t + x.s.reste, 0),
    prelevements: actives.filter((x) => x.p.prelevement).map((x) => ({ nom: x.p.nom, date: x.p.prelevement, montant: x.p.total })).sort((a, b) => (a.date < b.date ? -1 : 1))
  };
}
