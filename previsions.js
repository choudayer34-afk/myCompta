// Aide à la décision : flux moyens, projection du solde, objectifs, rythme du mois (aucun accès à Firebase ni au DOM).
import { partCompte, soldeCompte } from "./calc.js";
import { bornesMois, moisDecale } from "./budget.js";
import { echeancesDues } from "./planning.js";
import { repartitionDepenses } from "./bilancalc.js";
import { racines } from "./economies.js";

const RARES = new Set(["trimestriel", "semestriel", "annuel"]);   // échéances ponctuelles, traitées à part
const estVirement = (o) => o.virementId || o.nature === "virement";
const ajustement = (o) => o.nom === "Ajustement de solde";
const suivisDe = (comptes, comptesIds) => new Map(comptes.filter((c) => (comptesIds.length ? comptesIds.includes(c.id) : !c.archive)).map((c) => [c.id, c]));

// Revenus, dépenses et net de chaque mois complet précédant `mois` (hors virements, ajustements et échéances ponctuelles).
export function fluxMensuels({ operations, comptes, comptesIds = [], planifiees = [], mois, nb = 3 }) {
  const suivis = suivisDe(comptes, comptesIds);
  const rares = new Set(planifiees.filter((p) => RARES.has(p.frequence)).map((p) => p.id));
  const res = [];
  for (let n = nb; n >= 1; n--) {
    const ym = moisDecale(mois, -n);
    const [debut, fin] = bornesMois(ym);
    let revenus = 0, depenses = 0, nbOps = 0;
    for (const o of operations) {
      if (!suivis.has(o.compteId) || o.date < debut || o.date > fin || o.statut === "annule" || estVirement(o) || ajustement(o) || (o.planifieeId && rares.has(o.planifieeId))) continue;
      const v = Math.round(o.montant * partCompte(suivis.get(o.compteId)) / 100);
      if (v >= 0) revenus += v; else depenses += -v;
      nbOps++;
    }
    if (nbOps) res.push({ mois: ym, revenus, depenses, net: revenus - depenses });
  }
  return res;
}

const moy = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);

// Projection du solde en cours à la fin de chacun des `horizon` prochains mois.
// central = flux moyen ; prudent = mois le plus défavorable ; favorable = mois le plus favorable ; avec = central + économie mensuelle.
export function projection({ operations, comptes, comptesIds = [], planifiees = [], aujourdhui, horizon = 6, economieMensuelle = 0 }) {
  const mois = aujourdhui.slice(0, 7);
  const suivis = suivisDe(comptes, comptesIds);
  const flux = fluxMensuels({ operations, comptes, comptesIds, planifiees, mois });
  if (flux.length < 2) return { insuffisant: true };
  const solde = [...suivis.values()].reduce((s, c) => s + Math.round(soldeCompte(c, operations) * partCompte(c) / 100), 0);
  const nets = flux.map((f) => f.net);
  const moyNet = moy(nets), minNet = Math.min(...nets), maxNet = Math.max(...nets);
  // Échéances ponctuelles à venir (trimestrielles, semestrielles, annuelles)
  const fin = bornesMois(moisDecale(mois, horizon))[1];
  const ponctuels = [];
  for (const p of planifiees) {
    if (!RARES.has(p.frequence) || p.virementCompteId || p.nature === "virement" || !suivis.has(p.compteId) || !p.prochaine) continue;
    for (const d of echeancesDues(p, fin).dates) {
      if (d <= aujourdhui) continue;
      ponctuels.push({ date: d, nom: p.nom, montant: Math.round(p.montant * partCompte(suivis.get(p.compteId)) / 100) });
    }
  }
  const indice = (d) => { const [a, m] = d.slice(0, 7).split("-").map(Number); const [a0, m0] = mois.split("-").map(Number); return Math.max(1, (a - a0) * 12 + (m - m0)); };
  const points = [{ k: 0, mois, central: solde, prudent: solde, favorable: solde, avec: solde }];
  for (let k = 1; k <= horizon; k++) {
    const cumul = ponctuels.filter((x) => indice(x.date) <= k).reduce((s, x) => s + x.montant, 0);
    points.push({ k, mois: moisDecale(mois, k), central: solde + k * moyNet + cumul, prudent: solde + k * minNet + cumul, favorable: solde + k * maxNet + cumul, avec: solde + k * (moyNet + economieMensuelle) + cumul });
  }
  const premierNegatif = points.find((p) => p.k > 0 && p.prudent < 0) || null;
  return { insuffisant: false, solde, points, moyNet, minNet, maxNet, moyRevenus: moy(flux.map((f) => f.revenus)), moyDepenses: moy(flux.map((f) => f.depenses)),
    nbMois: flux.length, ponctuels: ponctuels.sort((a, b) => (a.date < b.date ? -1 : 1)), premierNegatif };
}

// Dépense mensuelle moyenne par catégorie principale sur les mois complets précédents : [{ categorieId, moyenne, usage }]
export function moyennesCategories({ categories, operations, comptes, comptesIds = [], mois, nb = 3 }) {
  const usage = new Map(racines(categories).map((c) => [c.id, c.usage || ""]));
  const tot = new Map();
  let nbMois = 0;
  for (let n = 1; n <= nb; n++) {
    const [debut, fin] = bornesMois(moisDecale(mois, -n));
    const r = repartitionDepenses({ categories, operations, comptes, comptesIds, debut, fin });
    if (r.total > 0) nbMois++;
    for (const p of r.postes) tot.set(p.categorieId, (tot.get(p.categorieId) || 0) + p.realise);
  }
  if (!nbMois) return [];
  return [...tot].map(([id, v]) => ({ categorieId: id, moyenne: Math.round(v / nbMois), usage: id && usage.has(id) ? usage.get(id) : "" })).sort((a, b) => b.moyenne - a.moyenne);
}

// Date d'atteinte de chaque objectif d'épargne au rythme des derniers mois (virements compris, ajustements exclus).
export function objectifsEpargne({ operations, comptes, aujourdhui, nb = 3 }) {
  const mois = aujourdhui.slice(0, 7);
  const res = [];
  for (const c of comptes) {
    if (c.archive || !(c.objectifMontant > 0)) continue;
    const solde = soldeCompte(c, operations);
    const mensuels = [];
    for (let n = nb; n >= 1; n--) {
      const [debut, fin] = bornesMois(moisDecale(mois, -n));
      const ops = operations.filter((o) => o.compteId === c.id && o.statut !== "annule" && !ajustement(o) && o.date >= debut && o.date <= fin);
      if (ops.length) mensuels.push(ops.reduce((s, o) => s + o.montant, 0));
    }
    const rythme = moy(mensuels);
    const reste = Math.max(0, c.objectifMontant - solde);
    let atteint = reste === 0, finMois = null, moisRestants = null;
    if (!atteint && mensuels.length && rythme > 0) { moisRestants = Math.ceil(reste / rythme); finMois = moisDecale(mois, moisRestants); }
    const enRetard = !!(c.objectifDate && finMois && bornesMois(finMois)[1] > c.objectifDate);
    res.push({ compteId: c.id, nom: c.nom, solde, objectif: c.objectifMontant, reste, rythme, atteint, finMois, moisRestants, aucuneDonnee: !mensuels.length, objectifDate: c.objectifDate || null, enRetard });
  }
  return res;
}

// Rythme du mois en cours pour les catégories « confort » : dépensé à ce jour comparé au montant attendu à ce jour.
export function rythmeDuMois({ categories, operations, comptes, comptesIds = [], aujourdhui, nb = 3 }) {
  const mois = aujourdhui.slice(0, 7);
  const [debut, finMois] = bornesMois(mois);
  const jour = +aujourdhui.slice(8, 10), jours = +finMois.slice(8, 10);
  const moyennes = moyennesCategories({ categories, operations, comptes, comptesIds, mois, nb }).filter((m) => m.usage === "confort");
  const r = repartitionDepenses({ categories, operations, comptes, comptesIds, debut, fin: aujourdhui });
  const faits = new Map(r.postes.map((p) => [p.categorieId, p.realise]));
  const lignes = moyennes.map((m) => {
    const attendu = Math.round(m.moyenne * jour / jours), realise = faits.get(m.categorieId) || 0;
    return { categorieId: m.categorieId, realise, attendu, moyenne: m.moyenne, ecart: realise - attendu };
  });
  const total = { realise: lignes.reduce((s, l) => s + l.realise, 0), attendu: lignes.reduce((s, l) => s + l.attendu, 0), moyenne: lignes.reduce((s, l) => s + l.moyenne, 0) };
  const alertes = lignes.filter((l) => l.realise > l.attendu * 1.25 && l.ecart >= 2000).sort((a, b) => b.ecart - a.ecart).slice(0, 5);
  return { jour, jours, total, alertes, aucuneClasse: !moyennes.length };
}
