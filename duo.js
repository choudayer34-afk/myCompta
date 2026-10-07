// Gestion à deux : recettes nettes, provision du compte commun, dépenses partagées du mois, qui doit quoi à qui (logique pure, montants en centimes).
export const MODES = ["prorata", "5050", "chr", "ale"];

export const PARAMS_DEFAUT = { nomChr: "Moi", nomAle: "Partenaire", brutChr: 0, brutAle: 0, histoChr: [], histoAle: [], coef: 0.77, lignes: [], recurrentes: [] };

// Salaire brut annuel en vigueur un mois donné ("AAAA-MM") : dernière ligne de l'historique dont la date est atteinte
// (une date vide signifie « depuis toujours »). Avant la première ligne, on garde la première valeur.
export function brutEnVigueur(histo, brutDefaut, mois) {
  const h = [...(histo || [])].filter((x) => x && x.brut >= 0).sort((a, b) => String(a.depuis || "").localeCompare(String(b.depuis || "")));
  if (!h.length) return brutDefaut || 0;
  if (!mois) return h[h.length - 1].brut;
  let v = h[0].brut;
  for (const x of h) if (!x.depuis || x.depuis <= mois) v = x.brut;
  return v;
}

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

// Une dépense du mois compte dans le duo si elle est marquée « à exporter » (sauf si retirée à la main) ou ajoutée à la main.
// Un remboursement (opération en entrée) ne compte que s'il est ajouté à la main : il vient alors en déduction.
// `opts` : { exclus: [ids retirés], inclus: [ids ajoutés à la main] }.
const duMois = (o, mois) => !o.virementId && o.statut !== "annule" && String(o.date || "").slice(0, 7) === mois;
const parDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function operationsPartagees(operations, mois, { exclus = [], inclus = [] } = {}) {
  return operations.filter((o) => duMois(o, mois) && !exclus.includes(o.id) &&
    (o.montant < 0 ? (o.aExporter || inclus.includes(o.id)) : (o.montant > 0 && inclus.includes(o.id)))).sort(parDate);
}
// Dépenses retirées à la main (marquées « à exporter » mais exclues du duo)
export const operationsRetirees = (operations, mois, { exclus = [] } = {}) =>
  operations.filter((o) => duMois(o, mois) && o.montant < 0 && o.aExporter && exclus.includes(o.id)).sort(parDate);
// Dépenses du mois qui ne comptent pas encore (non marquées, non ajoutées)
export const operationsManquantes = (operations, mois, { inclus = [] } = {}) =>
  operations.filter((o) => duMois(o, mois) && o.montant < 0 && !o.aExporter && !inclus.includes(o.id)).sort(parDate);
// Entrées du mois pouvant être déduites comme remboursement (pas encore déduites)
export const remboursementsPossibles = (operations, mois, { inclus = [] } = {}) =>
  operations.filter((o) => duMois(o, mois) && o.montant > 0 && !inclus.includes(o.id)).sort(parDate);

export const depensesPartagees = (operations, mois, opts) => operationsPartagees(operations, mois, opts).reduce((s, o) => s - o.montant, 0);

// Bilan du mois. `ale` : liste des montants saisis par l'autre personne (centimes positifs).
export function bilanDuo({ params, chrPartagees, ale = [], persoChr = 0, persoAle = 0, mois = null }) {
  const P = { ...PARAMS_DEFAUT, ...params };
  const netChr = netMensuel(brutEnVigueur(P.histoChr, P.brutChr, mois), P.coef), netAle = netMensuel(brutEnVigueur(P.histoAle, P.brutAle, mois), P.coef);
  const p = parts(netChr, netAle);
  let provChr = 0, provAle = 0, credChr = 0, credAle = 0;
  const lignes = (P.lignes || []).map((l) => { const r = repartLigne(l, p); provChr += r.chr; provAle += r.ale; if (l.credit) { credChr += r.chr; credAle += r.ale; } return { ...l, mensuel: mensualise(l), ...r }; });
  const depAle = ale.reduce((s, x) => s + (x || 0), 0);
  const total = chrPartagees + depAle;
  const partDepChr = arrondi(total * p.chr), partDepAle = total - partDepChr;
  const ecart = chrPartagees - partDepChr;   // > 0 : la première personne a avancé plus que sa part
  return { netChr, netAle, partChr: p.chr, partAle: p.ale, lignes, provChr, provAle, credChr, credAle,
    depChr: chrPartagees, depAle, depTotal: total, partDepChr, partDepAle,
    doit: ecart < 0 ? { de: "chr", montant: -ecart } : ecart > 0 ? { de: "ale", montant: ecart } : null,
    restantChr: netChr - provChr - partDepChr - persoChr, restantAle: netAle - provAle - partDepAle - persoAle };
}

// Vue « Moi », « Partenaire » ou « Ensemble » d'un bilan : revenu net, provision (charges fixes du compte commun), crédits.
export function vueBilan(b, qui) {
  const net = qui === "chr" ? b.netChr : qui === "ale" ? b.netAle : b.netChr + b.netAle;
  const prov = qui === "chr" ? b.provChr : qui === "ale" ? b.provAle : b.provChr + b.provAle;
  const cred = qui === "chr" ? b.credChr : qui === "ale" ? b.credAle : b.credChr + b.credAle;
  return { net, prov, credit: cred, resteAVivre: net - prov, tauxEndettement: net > 0 ? cred / net : null };
}

// Évolution sur les `n` derniers mois (mois courant compris) : [{ mois, net, resteAVivre }]
export function evolution({ params, mois, qui, n = 12, decale }) {
  const serie = [];
  for (let k = n - 1; k >= 0; k--) {
    const m = decale(mois, -k);
    const v = vueBilan(bilanDuo({ params, chrPartagees: 0, mois: m }), qui);
    serie.push({ mois: m, net: v.net, resteAVivre: v.resteAVivre });
  }
  return serie;
}

// Dépenses récurrentes de la seconde personne actives un mois donné : [{ id, nom, montant, depuis, fin }]
export const recurrentesDuMois = (params, mois) =>
  ((params && params.recurrentes) || []).filter((r) => r.montant > 0 && (!r.depuis || r.depuis <= mois) && (!r.fin || mois <= r.fin));

// Texte collé (cellules Excel, une par ligne) -> montants en centimes positifs ; les cellules illisibles sont ignorées.
// Accepte « 12,5 », « 12.5 », « 1 234,56 € », « 1.234,56 » et « 1,234.56 » ; le signe est ignoré.
export function montantsDepuisTexte(texte) {
  return String(texte ?? "").split(/[\r\n\t;]+/).map((c) => {
    let t = c.replace(/[^0-9.,]/g, "");
    if (!/[0-9]/.test(t)) return null;
    const p = t.lastIndexOf("."), v = t.lastIndexOf(",");
    const sep = Math.max(p, v);
    if (sep >= 0 && t.length - sep - 1 <= 2 && sep > 0 || (sep === 0 && t.length - 1 <= 2)) t = t.slice(0, sep).replace(/[.,]/g, "") + "." + t.slice(sep + 1);
    else t = t.replace(/[.,]/g, "");
    const n = parseFloat(t);
    return Number.isFinite(n) ? Math.round(n * 100) : null;
  }).filter((x) => x !== null && x > 0);
}
