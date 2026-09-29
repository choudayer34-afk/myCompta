// Calculs purs (sans Firebase) : soldes et tri des opérations.
const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : typeof t === "number" ? t : 0);

// Tri chronologique : date, puis ordre de création, puis identifiant
export function cleTri(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const d = ms(a.cree) - ms(b.cree);
  if (d !== 0) return d;
  return a.id < b.id ? -1 : 1;
}

// Une opération annulée n'est pas comptée dans les soldes.
export function soldeCompte(compte, operations) {
  let s = compte.soldeInitial || 0;
  for (const o of operations) if (o.compteId === compte.id && o.statut !== "annule") s += o.montant;
  return s;
}

// Opérations du compte, de la plus ancienne à la plus récente, avec le solde après chacune.
export function lignesAvecSolde(compte, operations) {
  const liste = operations.filter((o) => o.compteId === compte.id).sort(cleTri);
  let s = compte.soldeInitial || 0;
  return liste.map((o) => {
    if (o.statut !== "annule") s += o.montant;
    return { ...o, solde: s };
  });
}
