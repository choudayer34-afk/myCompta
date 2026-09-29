// Calculs purs des opérations planifiées (aucun accès à Firebase).
import { sansAccent } from "./format.js";

export const FREQUENCES = [
  ["quotidien", "Quotidien"], ["hebdo", "Hebdomadaire"], ["2semaines", "Toutes les 2 semaines"],
  ["mensuel", "Mensuel"], ["2mois", "Tous les 2 mois"], ["trimestriel", "Trimestriel"],
  ["semestriel", "Semestriel"], ["annuel", "Annuel"]
];
export const libelleFrequence = (f) => (FREQUENCES.find((x) => x[0] === f) || [0, f || ""])[1];

const PAS_MOIS = { mensuel: 1, "2mois": 2, trimestriel: 3, semestriel: 6, annuel: 12 };
const PAS_JOURS = { quotidien: 1, hebdo: 7, "2semaines": 14 };
const p2 = (n) => String(n).padStart(2, "0");
const iso = (y, m, j) => `${y}-${p2(m)}-${p2(j)}`;
const finDeMois = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Reconnaît les libellés d'iCompta (anglais ou français). Retourne un code ou null.
export function frequenceDepuis(texte) {
  const s = sansAccent(texte).replace(/[^a-z0-9]/g, "");
  if (!s || s.includes("single") || s === "aucune" || s === "none") return null;
  if (/biweekly|fortnight|2week|deuxsemaine|quinzaine|bihebdo/.test(s)) return "2semaines";
  if (/bimonth|2month|bimestr|2mois/.test(s)) return "2mois";
  if (/daily|quotidien|journalier/.test(s)) return "quotidien";
  if (/weekly|hebdo|semaine/.test(s)) return "hebdo";
  if (/quarter|trimest/.test(s)) return "trimestriel";
  if (/semester|semiannual|biannual|semestr/.test(s)) return "semestriel";
  if (/monthly|mensuel|month/.test(s)) return "mensuel";
  if (/year|annuel|annual/.test(s)) return "annuel";
  return null;
}

// Date de l'échéance suivante. `ancre` = jour du mois d'origine (évite la dérive 31 -> 28 -> 28).
export function suivante(date, freq, ancre) {
  const [y, m, j] = date.split("-").map(Number);
  if (PAS_JOURS[freq]) {
    const d = new Date(Date.UTC(y, m - 1, j + PAS_JOURS[freq]));
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const pas = PAS_MOIS[freq];
  if (!pas) return null;
  let mm = m + pas, yy = y;
  while (mm > 12) { mm -= 12; yy++; }
  return iso(yy, mm, Math.min(ancre || j, finDeMois(yy, mm)));
}

export const estTerminee = (p) => !!(p.dateFin && p.prochaine > p.dateFin);

// Échéances à créer jusqu'à `jusqua` inclus (au plus 600 par passage).
export function echeancesDues(p, jusqua) {
  const dates = [];
  let d = p.prochaine;
  while (d && d <= jusqua && (!p.dateFin || d <= p.dateFin) && dates.length < 600) {
    dates.push(d);
    d = suivante(d, p.frequence, p.jourAncre);
  }
  return { dates, prochaine: d };
}

// Écritures à réaliser : nouvelles opérations « en cours » + avancement de la prochaine échéance.
// `idsExistants` : identifiants d'opérations déjà présents (une opération existante n'est jamais réécrite).
export function ecrituresEcheances(planifiees, idsExistants, jusqua, cree) {
  const ecritures = [];
  let nb = 0;
  for (const p of planifiees) {
    if (!p.prochaine || !p.frequence || (p.dateFin && p.prochaine > p.dateFin)) continue;
    const { dates, prochaine } = echeancesDues(p, jusqua);
    if (!dates.length) continue;
    for (const d of dates) {
      const idA = `e${p.id}_${d}`, idB = `f${p.id}_${d}`;
      if (idsExistants.has(idA)) continue;
      const base = { nom: p.nom, commentaire: p.commentaire || "", date: d, statut: "encours", datePointage: null, info: p.info || "", aExporter: !!p.aExporter, planifieeId: p.id, cree };
      if (p.virementCompteId) {
        const m = -Math.abs(p.montant);
        ecritures.push(["operations", idA, { ...base, compteId: p.compteId, montant: m, nature: "virement", categorieId: null, virementId: idA }]);
        ecritures.push(["operations", idB, { ...base, compteId: p.virementCompteId, montant: -m, nature: "virement", categorieId: null, virementId: idA }]);
      } else {
        ecritures.push(["operations", idA, { ...base, compteId: p.compteId, montant: p.montant, nature: p.nature || "autre", categorieId: p.categorieId || null, virementId: null }]);
      }
      nb++;
    }
    ecritures.push(["planifiees", p.id, { prochaine }]);
  }
  return { ecritures, nb };
}
