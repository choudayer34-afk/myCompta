// Gestion à deux : recettes nettes, provision du compte commun, dépenses partagées du mois, qui doit quoi à qui (logique pure, montants en centimes).
export const MODES = ["prorata", "5050", "chr", "ale"];

export const PARAMS_DEFAUT = { nomChr: "CHR", nomAle: "ALE", brutChr: 0, brutAle: 0, coef: 0.77, lignes: [] };

const arrondi = Math.round;

// Net mensuel = brut annuel × coefficient ÷ 12
export const netMensuel = (brut, coef) => arrondi((brut || 0) * (coef || 0) / 12);

// Parts de chacun (prorata des revenus nets). Sans revenu : moitié-moitié.
export function parts(netChr, netAle) {
  const t = netChr + netAle;
  return t > 0 ? { chr: netChr / t, ale: netAle / t } : { chr: 0.5, ale: 0.5 };
}

// Montant mensuel d'une ligne de provision (une dépense annuelle est lissée sur 12 mois)
export const mensualise = (l) => (l.periode === "annuel" ? arrondi((l.montant || 0) / 12) : (l.montant || 0));

// Part de chacun pour une ligne : prorata, 50/50, ou 100 % pour une seule personne
export function repartLigne(l, p) {
  const m = mensualise(l);
  if (l.mode === "chr") return { chr: m, ale: 0 };
  if (l.mode === "ale") return { chr: 0, ale: m };
  if (l.mode === "5050") { const a = arrondi(m / 2); return { chr: a, ale: m - a }; }
  const c = arrondi(m * p.chr);
  return { chr: c, ale: m - c };
}

// Dépenses partagées d'un mois pour la personne qui utilise l'application : opérations marquées « à exporter ».
export function depensesPartagees(operations, mois) {
  return operations
    .filter((o) => o.aExporter && o.montant < 0 && !o.virementId && o.statut !== "annule" && String(o.date || "").slice(0, 7) === mois)
    .reduce((s, o) => s - o.montant, 0);
}

// Bilan du mois. `ale` : liste des montants saisis par l'autre personne (centimes positifs).
export function bilanDuo({ params, chrPartagees, ale = [], persoChr = 0, persoAle = 0 }) {
  const P = { ...PARAMS_DEFAUT, ...params };
  const netChr = netMensuel(P.brutChr, P.coef), netAle = netMensuel(P.brutAle, P.coef);
  const p = parts(netChr, netAle);
  let provChr = 0, provAle = 0;
  const lignes = (P.lignes || []).map((l) => { const r = repartLigne(l, p); provChr += r.chr; provAle += r.ale; return { ...l, mensuel: mensualise(l), ...r }; });
  const depAle = ale.reduce((s, x) => s + (x || 0), 0);
  const total = chrPartagees + depAle;
  const partDepChr = arrondi(total * p.chr), partDepAle = total - partDepChr;
  const ecart = chrPartagees - partDepChr;   // > 0 : CHR a avancé plus que sa part
  return { netChr, netAle, partChr: p.chr, partAle: p.ale, lignes, provChr, provAle,
    depChr: chrPartagees, depAle, depTotal: total, partDepChr, partDepAle,
    doit: ecart < 0 ? { de: "chr", montant: -ecart } : ecart > 0 ? { de: "ale", montant: ecart } : null,
    restantChr: netChr - provChr - partDepChr - persoChr, restantAle: netAle - provAle - partDepAle - persoAle };
}
