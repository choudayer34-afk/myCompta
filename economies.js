// Économies : part « confort » des dépenses, plus gros postes, hausses et abonnements (aucun accès à Firebase ni au DOM).
import { repartitionDepenses, bornesPeriode } from "./bilancalc.js";
import { partCompte } from "./calc.js";
import { moisDecale } from "./budget.js";

export const USAGES = [["", "Non classée"], ["essentiel", "Essentielle"], ["confort", "Confort"]];

const sa = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Proposition de classement d'après le nom (à vérifier par l'utilisateur)
const ESSENTIEL = ["loyer", "logement", "habitation", "courses", "alimentation", "supermarche", "sante", "medecin", "pharmacie", "mutuelle", "assurance", "energie", "electricite", "gaz", "eau", "impot", "taxe", "scolarite", "ecole", "creche", "enfant", "transport", "carburant", "essence", "credit", "pret", "charges", "telephone", "internet", "banque"];
const CONFORT = ["restaurant", "resto", "sortie", "loisir", "vetement", "shopping", "cadeau", "voyage", "vacances", "abonnement", "streaming", "culture", "cinema", "sport", "bar", "cafe", "livraison", "jeux", "high-tech", "multimedia", "beaute", "coiffeur", "deco", "plaisir", "divers"];
export function usageSuggere(nom) {
  const n = sa(nom);
  if (CONFORT.some((m) => n.includes(m))) return "confort";
  if (ESSENTIEL.some((m) => n.includes(m))) return "essentiel";
  return "";
}

export function racines(categories) {
  const parId = new Map(categories.map((c) => [c.id, c]));
  return categories.filter((c) => !c.parentId || !parId.get(c.parentId));
}

const moyenne = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);

export function analyseEconomies({ categories, operations, comptes, comptesIds = [], mois }) {
  const usageDe = new Map(racines(categories).map((c) => [c.id, c.usage || ""]));
  const calc = (ym) => {
    const [debut, fin] = bornesPeriode("mois", ym + "-01");
    const r = repartitionDepenses({ categories, operations, comptes, comptesIds, debut, fin });
    let confort = 0, essentiel = 0, autre = 0;
    const parRacine = new Map();
    for (const p of r.postes) {
      const u = p.categorieId && usageDe.has(p.categorieId) ? usageDe.get(p.categorieId) : "";
      if (u === "confort") confort += p.realise; else if (u === "essentiel") essentiel += p.realise; else autre += p.realise;
      parRacine.set(p.categorieId, p.realise);
    }
    return { total: r.total, confort, essentiel, autre, parRacine };
  };
  const cur = calc(mois);
  const prec = [1, 2, 3].map((n) => calc(moisDecale(mois, -n))).filter((x) => x.total > 0);
  const moyConfort = prec.length ? moyenne(prec.map((x) => x.confort)) : null;
  const moyPart = prec.length ? Math.round(prec.reduce((s, x) => s + (x.confort / x.total) * 100, 0) / prec.length) : null;
  const moyDe = (id) => (prec.length ? moyenne(prec.map((x) => x.parRacine.get(id) || 0)) : null);
  const lignes = [...cur.parRacine].map(([id, realise]) => ({ categorieId: id, realise, usage: id && usageDe.has(id) ? usageDe.get(id) : "", moyenne: moyDe(id) }));
  const postesConfort = lignes.filter((l) => l.usage === "confort").sort((a, b) => b.realise - a.realise).slice(0, 5);
  const hausses = lignes.filter((l) => l.moyenne != null && l.moyenne > 0 && l.realise >= l.moyenne * 1.2 && l.realise - l.moyenne >= 1000)
    .map((l) => ({ ...l, ecart: l.realise - l.moyenne })).sort((a, b) => b.ecart - a.ecart).slice(0, 5);
  const nonClassees = lignes.filter((l) => l.categorieId && !l.usage).length;
  return { total: cur.total, confort: cur.confort, essentiel: cur.essentiel, autre: cur.autre,
    partConfort: cur.total > 0 ? Math.round((cur.confort / cur.total) * 100) : null,
    moyConfort, moyPart, postesConfort, hausses, nonClassees };
}

// Économie mensuelle en réduisant un montant de `pct` %
export const economieSiReduit = (montant, pct = 20) => Math.round((montant * pct) / 100);

// Abonnements : même nom, une dépense par mois sur au moins 3 mois consécutifs jusqu'au mois dernier ou au mois courant,
// montants proches (± 8 % ou 1 €) et jours du mois proches (± 7 jours).
export function detecterAbonnements({ operations, comptes, comptesIds = [], aujourdhui }) {
  const suivis = new Map(comptes.filter((c) => (comptesIds.length ? comptesIds.includes(c.id) : !c.archive)).map((c) => [c.id, c]));
  const groupes = new Map();
  const moisCourant = aujourdhui.slice(0, 7);
  const depart = moisDecale(moisCourant, -9);
  for (const o of operations) {
    if (!suivis.has(o.compteId) || o.montant >= 0 || o.statut === "annule" || o.virementId || o.nature === "virement") continue;
    if (o.date.slice(0, 7) < depart) continue;
    const cle = sa(o.nom).replace(/[0-9]+/g, " ").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    if (!cle) continue;
    if (!groupes.has(cle)) groupes.set(cle, { nom: o.nom, parMois: new Map() });
    const g = groupes.get(cle);
    if (!g.dateNom || o.date > g.dateNom) { g.dateNom = o.date; g.nom = o.nom; }
    const ym = o.date.slice(0, 7);
    if (!g.parMois.has(ym) || o.date < g.parMois.get(ym).date) g.parMois.set(ym, { date: o.date, montant: -Math.round(o.montant * partCompte(suivis.get(o.compteId)) / 100), categorieId: o.categorieId || null });
  }
  const res = [];
  for (const g of groupes.values()) {
    let fin = g.parMois.has(moisCourant) ? moisCourant : moisDecale(moisCourant, -1);
    if (!g.parMois.has(fin)) continue;
    const serie = [];
    for (let ym = fin; g.parMois.has(ym); ym = moisDecale(ym, -1)) serie.unshift(g.parMois.get(ym));
    if (serie.length < 3) continue;
    const dernier = serie[serie.length - 1].montant;
    const tol = Math.max(100, dernier * 0.08);
    const jours = serie.map((s) => +s.date.slice(8, 10)).sort((a, b) => a - b);
    const medJour = jours[Math.floor(jours.length / 2)];
    if (!serie.every((s) => Math.abs(s.montant - dernier) <= tol && Math.abs(+s.date.slice(8, 10) - medJour) <= 7)) continue;
    const premier = serie[0].montant;
    res.push({ nom: g.nom, mensuel: dernier, annuel: dernier * 12, mois: serie.length,
      ancien: Math.abs(premier - dernier) > dernier * 0.01 ? premier : null, categorieId: serie[serie.length - 1].categorieId });
  }
  res.sort((a, b) => b.mensuel - a.mensuel);
  return { liste: res, mensuel: res.reduce((s, x) => s + x.mensuel, 0), annuel: res.reduce((s, x) => s + x.annuel, 0) };
}
