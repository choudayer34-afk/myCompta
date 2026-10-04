// Dernier pointage / dernière saisie d'un compte et retard de pointage (aucun accès à Firebase ni au DOM).
const p2 = (n) => String(n).padStart(2, "0");
const enMs = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : v && Number.isFinite(v.seconds) ? v.seconds * 1000 : null);
const isoLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };

// Nombre de jours entiers entre deux dates « AAAA-MM-JJ » (b - a).
export function joursEntre(a, b) {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}

// dernierPointage : date de pointage la plus récente ; derniereSaisie : date de création la plus récente d'une opération du compte.
export function activiteCompte(compte, operations) {
  let pointage = null, saisie = null;
  for (const o of operations) {
    if (o.compteId !== compte.id) continue;
    if (o.statut === "pointe" && typeof o.datePointage === "string" && (!pointage || o.datePointage > pointage)) pointage = o.datePointage;
    const ms = enMs(o.cree);
    if (ms && (!saisie || ms > saisie)) saisie = ms;
  }
  return { dernierPointage: pointage, derniereSaisie: saisie ? isoLocal(saisie) : null };
}

// Comptes actifs ayant des opérations à pointer (déjà datées) et dont le dernier pointage remonte à plus de `jours` jours.
// Sans aucun pointage : on compare à l'opération à pointer la plus ancienne.
export function comptesEnRetard(comptes, operations, aujourdhui, jours = 7) {
  const res = [];
  for (const c of comptes) {
    if (c.archive) continue;
    const aPointer = operations.filter((o) => o.compteId === c.id && o.statut === "encours" && o.date <= aujourdhui);
    if (!aPointer.length) continue;
    const { dernierPointage } = activiteCompte(c, operations);
    const reference = dernierPointage || aPointer.reduce((m, o) => (o.date < m ? o.date : m), aPointer[0].date);
    const depuis = joursEntre(reference, aujourdhui);
    if (depuis > jours) res.push({ compte: c, dernierPointage, depuis, nb: aPointer.length });
  }
  return res.sort((a, b) => b.depuis - a.depuis);
}
