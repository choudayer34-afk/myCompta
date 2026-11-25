// Provisions : dépenses non mensuelles lissées sur N mois, au cycle libre (logique pure, montants en centimes, dates AAAA-MM-JJ).
const JOUR = 86400000;
const ms = (iso) => Date.parse(iso + "T12:00:00Z");
const p2 = (n) => String(n).padStart(2, "0");

// Ajoute n mois à une date ; `ancre` = jour du mois voulu (ramené au dernier jour si le mois est plus court).
export function ajouterMois(date, n, ancre) {
  const [y, m, j] = date.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  const yy = Math.floor(t / 12), mm = t - yy * 12 + 1;
  const dernier = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${p2(mm)}-${p2(Math.min(ancre || j, dernier))}`;
}

const PAS_MOIS = { mensuel: 1, "2mois": 2, trimestriel: 3, semestriel: 6, annuel: 12 };
const FACTEUR_MENSUEL = { quotidien: 365 / 12, hebdo: 52 / 12, "2semaines": 26 / 12 };

// Montant mensuel moyen (centimes, positif) d'une échéance
export function mensuelPlanifiee(p) {
  const m = Math.abs(p.montant || 0);
  if (PAS_MOIS[p.frequence]) return m / PAS_MOIS[p.frequence];
  if (FACTEUR_MENSUEL[p.frequence]) return m * FACTEUR_MENSUEL[p.frequence];
  return 0;
}

// Cycle courant : de (échéance − durée) exclu jusqu'à l'échéance incluse.
export function cycle(prov) {
  return { debut: ajouterMois(prov.echeance, -prov.duree, prov.jourAncre), fin: prov.echeance };
}

// Versements du cycle : opérations créées par les échéances liées (côté dépense / compte source), jusqu'à la date `jusqua`.
export function versementsCycle(prov, operations, jusqua) {
  const { debut, fin } = cycle(prov);
  const limite = jusqua && jusqua < fin ? jusqua : fin;
  const ids = new Set(prov.planifieesIds || []);
  let total = 0, nb = 0;
  for (const o of operations) {
    if (!o.planifieeId || !ids.has(o.planifieeId) || o.statut === "annule" || !(o.montant < 0)) continue;
    if (o.date > debut && o.date <= limite) { total += -o.montant; nb++; }
  }
  return { total, nb };
}

export function etatProvision(prov, operations, planifiees, aujourdhui) {
  const { debut, fin } = cycle(prov);
  const report = prov.report || 0;
  const montant = prov.montant;
  const v = versementsCycle(prov, operations, aujourdhui);
  const provisionne = report + v.total;
  const duree = Math.max(1, ms(fin) - ms(debut));
  const ecoule = Math.min(1, Math.max(0, (ms(aujourdhui) - ms(debut)) / duree));
  const rythme = report + Math.round((montant - report) * ecoule);
  const mensualite = Math.round((montant - report) / prov.duree);
  const reste = Math.max(0, montant - provisionne);
  const depassee = aujourdhui > fin;
  const moisRestants = depassee ? 0 : Math.max(1, Math.ceil((ms(fin) - ms(aujourdhui)) / (JOUR * 30.4375)));
  const conseillee = moisRestants ? Math.round(reste / moisRestants) : reste;
  const ecart = provisionne - rythme;
  const tolerance = Math.max(Math.abs(mensualite), 1);
  const statutRythme = Math.abs(ecart) < tolerance ? "rythme" : ecart < 0 ? "retard" : "avance";
  const liees = (planifiees || []).filter((p) => (prov.planifieesIds || []).includes(p.id));
  const mensuelActuel = Math.round(liees.reduce((s, p) => s + mensuelPlanifiee(p), 0));
  const pct = (x) => (montant > 0 ? Math.min(100, Math.max(0, (x / montant) * 100)) : 0);
  return { debut, fin, montant, report, versements: v.total, nbVersements: v.nb, provisionne, rythme, ecart, statutRythme, mensualite, reste,
    moisRestants, conseillee, depassee, liees, mensuelActuel, pctProvisionne: pct(provisionne), pctRythme: pct(rythme) };
}
