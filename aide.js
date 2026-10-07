// Guide d'aide propre à chaque écran (bouton « ? » en haut) : à quoi il sert, ce qu'on peut y faire, comment.
import { h, modale } from "./ui.js";

const GUIDES = {
  comptes: { titre: "Comptes", but: "Voir tous tes comptes et leur solde d'un coup d'œil.", points: [
    "Chaque compte affiche le solde en cours (ce qu'il te reste, opérations non pointées comprises) et le solde pointé (celui du relevé de la banque).",
    "Touche un compte pour ouvrir ses opérations.",
    "Touche + pour créer un compte : nom, type, solde initial, part (50 % pour un compte joint à moitié), objectif d'épargne facultatif.",
    "« Changer l'ordre » permet de glisser les comptes pour les ranger.",
    "Une pastille rouge sur l'onglet Comptes signale des opérations à pointer (réglable dans Plus, « Pastille à pointer »)."] },
  compte: { titre: "Un compte", but: "Saisir, pointer et retrouver les opérations d'un compte.", points: [
    "Touche + pour ajouter une opération : nom, montant, date, catégorie, moyen de paiement, statut, et « Inclure dans l'export ».",
    "Touche une opération pour la modifier. Touche son rond (○ en cours, ● pointée) pour la pointer ou la dépointer d'un geste.",
    "« Saisie rapide » : touche un nom habituel pour créer l'opération presque toute faite.",
    "« Tableau rapide » : saisir plusieurs opérations à la suite.",
    "Filtres : « À pointer », période (ce mois-ci, mois dernier, dates à choisir…), export, catégorie, et la recherche par nom. Une ligne résume les entrées et sorties de la période.",
    "« Sélectionner » : coche plusieurs opérations pour changer leur catégorie, leur statut, leur export ou leur compte d'un coup. Avec le filtre « À pointer », « Tout pointer » les pointe toutes.",
    "« Clôturer un mois » : tu saisis le solde de ton relevé, tu coches les opérations présentes sur le relevé, et l'écart doit tomber à zéro avant de pointer la sélection."] },
  budgets: { titre: "Budgets", but: "Suivre tes dépenses par catégorie, mois par mois.", points: [
    "Les flèches ‹ › changent de mois.",
    "« Plafonds » : définis un plafond mensuel par catégorie. La barre passe à l'orange puis au rouge quand tu t'en approches.",
    "« Répartition » : où part ton argent, par catégorie et sous-catégorie, en camembert.",
    "« Évolution » et « Comparer » : voir les mois qui précèdent et les comparer.",
    "Touche une catégorie pour ouvrir le détail de ses opérations, les filtrer et les reclasser.",
    "Les comptes pris en compte se règlent dans Plus, « Comptes suivis »."] },
  previsions: { titre: "Projection", but: "Voir où ira ton solde dans les prochains mois.", points: [
    "Les boutons de comptes en haut choisissent ceux qui comptent. Ton choix est conservé.",
    "3, 6 ou 12 mois : l'horizon de la projection.",
    "La capacité d'épargne compare les recettes et dépenses de l'échéancier à tes dépenses habituelles.",
    "La courbe montre trois scénarios : prudent, central, favorable. « Voir le tableau » donne les chiffres.",
    "« Et si… ? » : simule la réduction d'une catégorie ou la suppression d'un abonnement.",
    "« Objectifs d'épargne » et « Rythme du mois » : date d'atteinte de tes objectifs et dépenses de confort du mois en cours.",
    "« Échéances prises en compte » liste ce que la projection lit dans ton échéancier, et ce qu'elle ignore.",
    "Chaque bloc se replie et se déplie en touchant son titre ; replié, il n'affiche que l'information importante."] },
  releve: { titre: "Relevé bancaire", but: "Rapprocher le relevé de ta banque avec tes opérations.", points: [
    "Choisis le compte puis le fichier du relevé (CSV, OFX, QIF ou Excel). Le relevé n'est pas conservé dans l'application.",
    "Chaque ligne du relevé est reliée à une opération en cours : elle sera pointée. Sinon, tu peux la créer, la relier à une autre ou l'ignorer.",
    "Filtres : « Toutes », « À pointer », « À vérifier » (rapprochement incertain), « Rapprochées ».",
    "« Changer » ou « Relier » corrige un mauvais rapprochement.",
    "« Appliquer » enregistre les pointages et créations. Rien n'est écrit avant."] },
  plus: { titre: "Plus", but: "Toutes les autres fonctions de l'application.", points: [
    "Échéances, Catégories, Import, Export Excel, Sauvegarde, Duo, Économies.",
    "Pastille à pointer, Comptes suivis, Verrouillage et Mise à jour sont des réglages.",
    "La loupe en haut de l'écran ouvre la recherche globale."] },
  echeancier: { titre: "Échéances", but: "Programmer les opérations qui reviennent (salaire, loyer, abonnements, virements).", points: [
    "Touche + pour créer une opération planifiée : montant, compte, fréquence (mensuelle, annuelle…), prochaine échéance, date de fin facultative.",
    "Tu peux choisir une dépense, une recette ou un virement entre deux comptes.",
    "Les échéances arrivées à terme sont créées automatiquement dans le compte.",
    "La Projection, les budgets et les abonnements lisent cet échéancier."] },
  categories: { titre: "Catégories", but: "Organiser le classement de tes opérations.", points: [
    "Touche une catégorie pour la modifier : nom, icône, couleur, catégorie parente, aide-mémoire (mots qui aident à la retrouver) et classement « essentielle » ou « confort ».",
    "Touche + pour en créer une. Une sous-catégorie suit le classement de sa catégorie principale.",
    "« Découper une catégorie en sous-catégories » propose un regroupement automatique avec un aperçu avant d'appliquer.",
    "Archiver une catégorie la masque à la saisie sans toucher à ses opérations."] },
  import: { titre: "Import", but: "Reprendre un export iCompta (CSV) dans l'application.", points: [
    "Choisis le fichier CSV, puis indique le format des dates, les types d'opération et les statuts.",
    "L'aperçu indique, pour chaque compte du fichier, s'il existe déjà (réutilisé) ou s'il sera créé. Après l'import, le solde de chaque compte peut être recalé sur celui d'iCompta.",
    "Les échéances arrivées à terme sont créées automatiquement en « en cours ».",
    "Une connexion est nécessaire."] },
  export: { titre: "Export Excel", but: "Sortir tes opérations dans un fichier Excel.", points: [
    "Choisis le compte (ou tous), la période et, si besoin, seulement les opérations « à exporter ».",
    "Réglages du fichier : en-tête, format du montant (nombre ou texte avec virgule), espaces dans les titres.",
    "« Télécharger » ou « Partager / Enregistrer » fournit le fichier.",
    "En bas de l'écran : la sauvegarde complète des données."] },
  economies: { titre: "Économies", but: "Repérer où tu peux dépenser moins.", points: [
    "Les flèches ‹ › changent de mois.",
    "La barre sépare l'essentiel, le confort et le non classé. « Classer mes catégories » règle ce classement.",
    "« Si je ne dépense que l'indispensable » montre l'effet sur ton solde dans 3, 6 ou 12 mois.",
    "« Plus gros postes de confort », « En hausse » et « Abonnements » donnent les pistes concrètes.",
    "Le bloc « Si je ne dépense que l'indispensable » se replie en touchant son titre."] },
  recherche: { titre: "Recherche", but: "Retrouver une opération, tous comptes confondus.", points: [
    "Tape un nom, un montant, une catégorie, un compte ou une date.",
    "Choisis un compte pour restreindre la recherche.",
    "Touche un résultat pour l'ouvrir."] },
  duo: { titre: "Duo", but: "Partager les dépenses à deux et savoir qui doit quoi.", points: [
    "« Paramètres » : noms, salaires bruts (avec leur historique) et coefficient brut vers net. La répartition suit les revenus nets.",
    "Tes dépenses partagées sont tes opérations du mois marquées « Inclure dans l'export ». Dans le détail, « Retirer » écarte une opération en trop, « Ajouter » en intègre une qui manque, « Déduire » compte un remboursement.",
    "Les dépenses de l'autre personne se saisissent dans la grille : un montant par ligne, Entrée pour passer à la suivante, ou colle plusieurs cellules Excel d'un coup.",
    "« Dépenses récurrentes » : une dépense reprise chaque mois jusqu'à ce que tu la retires.",
    "« Provision du compte commun » : les lignes prélevées sur le compte joint, avec leur mode de partage. Une ligne annuelle est lissée sur 12 mois et la case « crédit » alimente le taux d'endettement.",
    "« Bilan du mois », « Endettement et reste à vivre » et « Évolution » résument la situation de chacun, ou des deux ensemble.",
    "« Nouveau crédit possible » estime le montant empruntable pour rester sous 35 % d'endettement, selon le taux, la durée et l'assurance que tu indiques.",
    "Chaque bloc se replie et se déplie en touchant son titre. Replié, il n'affiche que l'information importante ; ton choix est mémorisé."] }
};

export function cleGuide(hash) {
  const h0 = hash || "#/comptes";
  if (/^#\/compte\//.test(h0)) return "compte";
  if (h0 === "#/bilan") return "budgets";
  if (h0.startsWith("#/export")) return "export";
  const m = h0.match(/^#\/([a-z]+)/);
  return m && GUIDES[m[1]] ? m[1] : "comptes";
}

export function afficherAide(hash) {
  const g = GUIDES[cleGuide(hash)];
  const corps = h("div", {},
    h("p", {}, h("strong", {}, g.but)),
    h("ul", { class: "puces" }, ...g.points.map((p) => h("li", {}, p))),
    h("div", { class: "actions" }, h("button", { type: "button", onclick: () => dialogue.close() }, "Fermer")));
  const { dialogue } = modale("Aide : " + g.titre, corps);
}
