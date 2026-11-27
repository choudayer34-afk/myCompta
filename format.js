const fmtEuro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

// Centimes (entier) -> "1 234,56 €"
export const euros = (centimes) => fmtEuro.format((centimes || 0) / 100);

// "1 234,56" ou "-12.5" -> centimes (entier), ou null si invalide. Pas de calcul en virgule flottante.
export function versCentimes(texte) {
  if (texte == null) return null;
  const t = String(texte).replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^[+-]?\d+(\.\d*)?$|^[+-]?\.\d+$/.test(t)) return null;
  const negatif = t.startsWith("-");
  const [entier, dec = ""] = t.replace(/^[+-]/, "").split(".");
  const decimales = dec.padEnd(3, "0");
  let c = (parseInt(entier || "0", 10) * 100) + parseInt(decimales.slice(0, 2), 10);
  if (decimales[2] >= "5") c += 1;
  return negatif ? -c : c;
}

// Centimes -> texte de saisie "12,50"
export const versSaisie = (centimes) => (Math.abs(centimes) / 100).toFixed(2).replace(".", ",");

export function dateFr(iso) {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

export function moisFr(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function aujourdhui() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const sansAccent = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
