// Questions fréquentes : « comment faire … ? », classées par thème, avec recherche.
import { h } from "./ui.js";

export const FAQ = [
  { theme: "Pour démarrer", questions: [
    ["Comment créer un compte ?", "Onglet Comptes, touche +. Indique le nom, le type, le solde initial (le solde de ton relevé au moment où tu commences) et, pour un compte joint partagé à moitié, une part de 50 %. Un objectif d'épargne est facultatif."],
    ["Quelle différence entre solde en cours et solde pointé ?", "Le solde en cours compte toutes les opérations saisies. Le solde pointé ne compte que celles que tu as pointées, c'est-à-dire vérifiées sur le relevé de ta banque. Quand les deux sont égaux, tout est pointé."],
    ["Comment retrouver une fonction ?", "Touche la loupe en haut pour chercher une opération dans tous les comptes. Touche « ? » en haut pour lire le guide de l'écran où tu es, puis « Questions fréquentes » pour la liste complète. Le reste (échéances, catégories, import, export, Duo, économies) est dans l'onglet Plus."],
    ["Comment vérifier que mon application est à jour ?", "Touche le numéro de version en haut. Si une nouvelle version existe, elle se charge. Sinon, Plus > Mise à jour force une vérification."]
  ] },
  { theme: "Opérations", questions: [
    ["Comment ajouter une dépense ou une recette ?", "Dans un compte, touche +. Renseigne le nom, le montant (la flèche choisit dépense ou recette), la date, la catégorie, puis enregistre. Le bouton « + Dépense » en haut permet aussi de saisir depuis n'importe quel écran."],
    ["Comment saisir plusieurs opérations à la suite ?", "Dans un compte, ouvre le « Tableau rapide » : tu remplis une ligne par opération. Pour des opérations habituelles, la « Saisie rapide » propose tes noms fréquents : un toucher crée l'opération presque toute faite."],
    ["Comment saisir à la voix ?", "Touche le micro en haut et dis une phrase comme « 25 euros courses hier ». L'opération est préparée, tu vérifies puis tu valides."],
    ["Comment modifier ou supprimer plusieurs opérations d'un coup ?", "Dans un compte, touche « Sélectionner », coche les opérations, puis choisis l'action : catégorie, statut, export ou compte. Avec le filtre « À pointer », « Tout pointer » les pointe en une fois."],
    ["Comment retrouver une opération précise ?", "Dans un compte, utilise la recherche par nom et les filtres (période, catégorie, export, à pointer). Pour chercher dans tous les comptes, touche la loupe en haut : tu peux saisir un nom ou un montant."],
    ["Comment filtrer un compte sur une période ?", "Dans les filtres du compte, choisis « Ce mois-ci », « Mois dernier » ou des dates à toi. Le solde affiché reste celui du compte entier."],
    ["Comment photographier un ticket ?", "Touche l'icône appareil photo en haut. Le montant et le nom sont lus sur la photo, tu corriges si besoin avant d'enregistrer. La lecture dépend de la qualité de la photo."]
  ] },
  { theme: "Pointage et relevé", questions: [
    ["Comment pointer une opération ?", "Dans la liste, touche le petit rond à gauche de l'opération : ○ en cours, ● pointée. Touche-le de nouveau pour dépointer."],
    ["Que se passe-t-il si je pointe une opération à venir ?", "L'application demande confirmation : pointer une opération future signifie qu'elle a déjà eu lieu, sa date devient alors celle du jour. Pour un virement, les deux côtés sont mis à jour. Si tu refuses, rien ne change."],
    ["Que fait le filtre « À pointer » ?", "Il n'affiche que les opérations non pointées. Le gros montant du haut devient alors le solde pointé, en bleu, avec le solde en cours en petit dessous. Retire le filtre pour revenir à l'affichage normal."],
    ["Comment vérifier mon relevé de banque ?", "Dans un compte, « Clôturer un mois » : saisis le solde de ton relevé, coche les opérations présentes sur le relevé. L'écart doit tomber à zéro avant de valider. Si l'écart reste, cherche une opération oubliée ou en trop."],
    ["Que veut dire la pastille rouge sur Comptes ?", "Elle compte les opérations à pointer. Son réglage est dans Plus > Pastille à pointer."]
  ] },
  { theme: "Virements", questions: [
    ["Comment faire un virement entre deux comptes ?", "Touche +, choisis « Virement entre comptes », puis le compte source, le compte destination et le montant. Deux opérations liées sont créées, une sur chaque compte. Modifier l'une modifie l'autre."],
    ["Les virements comptent-ils dans mes budgets ?", "Non : un virement n'est ni une dépense ni une recette. Dans la Projection, un virement entre deux comptes sélectionnés s'annule, et un virement vers ou depuis un compte non sélectionné compte comme un vrai mouvement."],
    ["Comment gérer une épargne mensuelle automatique ?", "Dans Plus > Échéances, crée une échéance de type virement : compte source, destination, montant, fréquence mensuelle et prochaine date. Elle apparaît dans la Projection du compte source et du compte destination."]
  ] },
  { theme: "Échéances", questions: [
    ["Comment créer une dépense qui revient chaque mois ?", "Plus > Échéances, touche +. Indique le nom, le montant, le compte, la fréquence « Mensuel » et la prochaine échéance. Les opérations sont créées automatiquement aux dates prévues."],
    ["Comment traiter un avis annuel (du 1er janvier au 31 décembre) ?", "Fréquence « Annuel », prochaine échéance = la date de début (par exemple le 01/01/2027), montant = le total de l'avis. Laisse la date de fin vide si le contrat se renouvelle, ou mets le 31/12/2027 s'il s'arrête. Chaque année, modifie le montant quand le nouvel avis arrive."],
    ["Comment traiter un avis sur 10 mois seulement ?", "Fréquence « Mensuel », montant = total divisé par 10, prochaine échéance = premier prélèvement, et « Nombre d'échéances » = 10 : la date de fin se calcule toute seule (elle est incluse). Passé cette date, l'échéance s'arrête."],
    ["Comment gérer une prestation facturée à la séance (3, 4 ou 5 semaines par mois, frais d'inscription la première fois) ?", "Plus > Échéances > + : coche « Montant selon le nombre de séances du mois ». Indique le tarif par séance (2 h × 18 € = 36 €), le jour des séances, les frais mensuels et les frais uniques de la première échéance. L'appli compte les séances de chaque mois et affiche le montant de chaque échéance : le premier mois est plus élevé, les suivants varient avec le nombre de séances. Pour une séance annulée ou ajoutée, modifie le nombre du mois concerné."],
    ["Faut-il une provision ou une échéance ?", "Une échéance pour une dépense que tu paies à chaque période (prestation, loyer, abonnement). Une provision pour un avis réglé en une fois, dont tu mets une part de côté chaque mois."],
    ["J'ai fait une erreur dans une échéance : comment corriger ce qui est déjà créé ?", "Ouvre l'échéance (Plus > Échéances) : modifie-la, puis déplie « Corriger aussi les opérations déjà créées ». Coche « Appliquer… » pour reporter le montant, le nom et la catégorie sur les opérations non pointées, ou « Recaler » pour les supprimer à partir d'une date et les recréer avec la prochaine échéance indiquée. Les opérations pointées ne sont jamais touchées. Pour supprimer l'échéance et ses opérations non pointées, coche la case au-dessus de « Supprimer »."],
    ["Que veulent dire les fréquences trimestrielle, semestrielle et annuelle ?", "L'opération revient tous les 3, 6 ou 12 mois à partir de la prochaine échéance, le même jour du mois. Ces échéances sont listées à part dans la Projection."],
    ["Comment arrêter une échéance ?", "Ouvre-la et renseigne une date de fin (ou un nombre d'échéances), ou supprime-la. Les opérations déjà créées restent."],
    ["Pourquoi une échéance est-elle « ignorée » dans la Projection ?", "La Projection indique la raison dans « Échéances prises en compte et ignorées » : sans date, terminée, compte non sélectionné, virement entre comptes sélectionnés, ou prochaine date au-delà de l'horizon."]
  ] },
  { theme: "Catégories", questions: [
    ["Comment créer ou ranger mes catégories ?", "Plus > Catégories. Touche + pour créer, touche une catégorie pour changer son nom, son icône, sa couleur ou sa catégorie parente (une sous-catégorie)."],
    ["Comment classer une catégorie en essentiel ou confort ?", "Dans la fiche d'une catégorie, le champ « Classement ». Ce classement alimente l'écran Économies et le rythme du mois."],
    ["Comment reclasser des opérations dans une autre catégorie ?", "Dans un compte ou dans le détail d'une catégorie du budget, touche « Sélectionner », coche les opérations et change leur catégorie."],
    ["Que fait la suggestion de catégorie ?", "À la saisie d'un nom déjà connu, la catégorie habituelle est proposée. Tu peux la changer."]
  ] },
  { theme: "Budgets", questions: [
    ["Comment fixer un plafond par catégorie ?", "Onglet Budgets > Plafonds. La barre passe à l'orange puis au rouge quand tu approches du plafond ou le dépasses."],
    ["Comment voir où part mon argent ?", "Budgets > Répartition : camembert par catégorie et sous-catégorie. Touche une part pour voir le détail. Évolution et Comparer montrent les mois précédents."],
    ["Comment provisionner un avis réglé en une fois (par exemple 1 200 € pour 2027) ?", "Plus > Échéances > onglet « Provisions » > « + Nouvelle provision ». Indique le nom, le total de l'avis, le nombre de mois de versement (12), le premier versement, la date du prélèvement et le compte qui reçoit la provision. Si tu choisis un compte de départ, le versement est un virement ; sinon, une recette du compte. Avec la case cochée, l'appli crée l'échéance mensuelle (100 €) et le prélèvement de 1 200 € à sa date : plus aucune échéance à créer ou à cocher une à une."],
    ["Comment voir combien je provisionne au total ?", "Plus > Échéances > Provisions > « Vue d'ensemble » : ce que tu provisionnes chaque mois, le montant déjà mis de côté, le reste à provisionner et la liste des prélèvements à venir avec leur date. Chaque provision a sa barre de progression."],
    ["Comment modifier ou supprimer une provision ?", "Plus > Échéances > Provisions > « Modifier » sur la provision. « Supprimer » retire l'échéance mensuelle ; coche les cases proposées pour supprimer aussi les versements et le prélèvement non pointés. « Ouvrir l'échéance » mène à l'échéance liée."],
    ["Quels comptes comptent dans les budgets ?", "Ceux cochés dans Plus > Comptes suivis."]
  ] },
  { theme: "Projection et économies", questions: [
    ["Comment lire le graphique du solde projeté ?", "À gauche d'« auj. », la courbe noire est le solde réel des mois passés. À droite, trois scénarios : prudent, central, favorable, et une ligne pointillée de tendance qui prolonge le rythme des mois passés. Touche le graphique pour lire un mois."],
    ["Comment projeter un seul compte, comme un livret ?", "En haut de la Projection, touche les noms des comptes pour les sélectionner. Ton choix est conservé."],
    ["Comment simuler une économie ?", "Projection > « Et si… ? » : réduis une catégorie ou supprime un abonnement. Une courbe « Avec tes changements » s'ajoute au graphique."],
    ["Que montre l'écran Économies ?", "Plus > Économies : le poids du confort et de l'essentiel, les plus gros postes, les hausses, les abonnements détectés, et ce que donnerait un mois où tu ne dépenses que l'indispensable."],
    ["Pourquoi « Rien à projeter » s'affiche-t-il ?", "Aucune échéance dans l'échéancier et aucune opération sur les mois précédents pour les comptes sélectionnés. Sélectionne d'autres comptes ou crée une échéance."]
  ] },
  { theme: "Duo (comptabilité à deux)", questions: [
    ["Comment renseigner les salaires ?", "Plus > Duo > Paramètres : noms, salaires bruts, coefficient brut vers net. Tu peux ajouter un historique : chaque ligne donne le salaire à partir d'un mois. La répartition suit les revenus nets."],
    ["Quelles dépenses comptent dans le Duo ?", "Tes opérations du mois marquées « Inclure dans l'export ». Dans le détail, « ✕ » retire une opération en trop, et « + » ajoute une opération qui manque."],
    ["Comment tenir compte d'un remboursement ?", "Dans « Déduire un remboursement », touche + sur la recette concernée : elle vient en déduction des dépenses partagées."],
    ["Comment saisir les dépenses de l'autre personne ?", "Dans la grille « Dépenses saisies » : un montant par ligne, Entrée pour passer à la suivante. Tu peux aussi copier plusieurs cellules d'Excel et les coller d'un coup ; la virgule décimale est comprise."],
    ["Comment répéter une dépense chaque mois ?", "Dans « Dépenses récurrentes », crée la dépense : elle est reprise chaque mois jusqu'à ce que tu la retires."],
    ["Comment fonctionne la provision du compte commun ?", "Modifie les lignes en tableau : nom, montant, par mois ou par an, mode de partage (au prorata, 50/50, une seule personne), et la case « crédit » pour les prêts. Une ligne annuelle est lissée sur 12 mois."],
    ["Comment provisionner un avis annuel ou sur 10 mois ?", "Duo > Provision > Modifier les lignes. Ajoute une ligne, saisis le total de l'avis dans « Prix » et choisis « avis » dans « Par ». Touche 📅 : indique « À partir de » et « Jusqu'à » (par exemple janvier à octobre). Le total est réparti sur ces mois, et la ligne ne compte que sur eux. Sans dates, il est réparti sur 12 mois."],
    ["Comment créer l'échéance de paiement depuis la provision ?", "Dans le même panneau 📅, coche « Créer l'échéance dans l'échéancier » : compte débité, fréquence, premier prélèvement, nombre d'échéances et montant par prélèvement (calculé, modifiable). L'échéance est créée à l'enregistrement, sans « à exporter » pour ne pas compter deux fois. Elle reste liée à la ligne : rouvre 📅 pour la mettre à jour. Si tu renommes la ligne, l'échéance est renommée aussi."],
    ["Comment savoir si je peux emprunter ?", "Bloc « Nouveau crédit possible » : il estime le montant empruntable pour rester sous 35 % d'endettement, selon le taux, la durée et l'assurance. Coche d'abord « crédit » sur tes prêts dans la provision."],
    ["Comment lire le bilan graphique ?", "Trois graphiques sur 12 mois : recettes et dépenses, reste de chaque mois avec tendance, composition des dépenses. Touche un graphique pour lire un mois, « Voir en tableau » donne les chiffres."]
  ] },
  { theme: "Données et sécurité", questions: [
    ["Comment importer mes opérations ?", "Plus > Import : choisis le fichier exporté par ton ancienne application ou ta banque. Un aperçu t'est montré avant l'import."],
    ["Comment exporter vers Excel ?", "Plus > Export Excel : choisis la période et les comptes. Seules les opérations « Inclure dans l'export » sont reprises si tu actives ce filtre."],
    ["Comment sauvegarder mes données ?", "Plus > Sauvegarde : tu télécharges un fichier complet. Garde-le ailleurs que sur ton téléphone."],
    ["Comment verrouiller l'application ?", "Plus > Verrouillage : choisis le déverrouillage de l'appareil (Face ID) ou un code."],
    ["L'application fonctionne-t-elle sans réseau ?", "Oui. Tu peux consulter et saisir hors ligne. Les données se synchronisent dès le retour du réseau."]
  ] }
];

const sansAccent = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function monter(conteneur) {
  const zone = h("div", {});
  const champ = h("input", { type: "search", placeholder: "Rechercher une question", "aria-label": "Rechercher dans les questions", class: "recherche-detail" });
  const vide = h("p", { class: "note", style: "display:none" }, "Aucune question ne correspond.");
  const sections = FAQ.map((s) => {
    const items = s.questions.map(([q, r]) => {
      const d = h("details", { class: "faq-q" }, h("summary", {}, q), h("p", {}, r));
      d.dataset.texte = sansAccent(q + " " + r);
      return d;
    });
    const corps = h("div", {}, ...items);
    const bloc = h("div", { class: "carte faq-theme" }, h("h3", {}, `${s.theme} (${items.length})`), corps);
    return { bloc, items };
  });
  zone.append(...sections.map((s) => s.bloc));
  const filtrer = () => {
    const mots = sansAccent(champ.value).split(/\s+/).filter(Boolean);
    let total = 0;
    for (const s of sections) {
      let n = 0;
      for (const d of s.items) {
        const ok = mots.every((m) => d.dataset.texte.includes(m));
        d.style.display = ok ? "" : "none";
        if (ok) { n++; if (mots.length) d.open = true; } else d.open = false;
      }
      s.bloc.style.display = n ? "" : "none";
      total += n;
    }
    vide.style.display = total ? "none" : "";
  };
  champ.addEventListener("input", filtrer);
  conteneur.replaceChildren(h("h2", {}, "Questions fréquentes"), champ, vide, zone);
  return { maj() {} };
}
