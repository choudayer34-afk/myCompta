// Réorganisation d'une grande catégorie en sous-catégories, d'après les mots du nom des opérations (logique pure).
import { normaliser } from "./noms.js";

export const REGLES = [
  { nom: "Abonnements", icone: "🔁", mots: ["netflix", "deezer", "disney", "duolingo", "duolinguo", "spotify", "canal", "youtube", "prime video", "apple", "icloud", "abonnement"] },
  { nom: "Achats en ligne", icone: "📦", mots: ["amazon", "cdiscount", "aliexpress", "temu", "ebay", "vinted"] },
  { nom: "Vêtements", icone: "👕", mots: ["costume", "vetement", "verbaudet", "zara", "kiabi", "decathlon", "chaussure"] },
  { nom: "Loisirs et sorties", icone: "🎬", mots: ["cinema", "marrakech", "arcachon", "helicopter", "aquarium", "parc", "concert", "spectacle", "jeux", "musee", "zoo", "bowling", "escape"] },
  { nom: "Bénévolat", icone: "⛑️", mots: ["protection civile"] },
  { nom: "Soins personnels", icone: "💈", mots: ["coiffeur", "barbier", "esthetique", "massage", "manucure"] },
  { nom: "Maison et déco", icone: "🛋️", mots: ["ikea", "leroy merlin", "castorama", "centrakor", "action", "maison du monde", "tediber"] },
  { nom: "Photos et souvenirs", icone: "📷", mots: ["photo"] },
  { nom: "Démarches", icone: "🛂", mots: ["passeport", "timbre", "carte identite"] }
];

const contient = (nomNorm, mot) => new RegExp("(^|[^a-z0-9])" + mot).test(nomNorm);

// Propose un classement des opérations directement rattachées à `parentId`.
// Retourne { groupes: [{ regle, operations, noms }], restantes: [operations] } ; seules les règles qui trouvent des opérations sont gardées.
export function proposerSousCategories(operations, parentId, regles = REGLES) {
  const groupes = regles.map((regle) => ({ regle, operations: [] }));
  const restantes = [];
  for (const o of operations) {
    if (o.categorieId !== parentId || o.virementId) continue;
    const n = normaliser(o.nom).toLowerCase();
    const g = groupes.find((x) => x.regle.mots.some((m) => contient(n, m)));
    if (g) g.operations.push(o); else restantes.push(o);
  }
  return {
    groupes: groupes.filter((g) => g.operations.length).map((g) => ({ ...g, noms: [...new Set(g.operations.map((o) => o.nom))] })),
    restantes
  };
}
