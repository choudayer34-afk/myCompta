import { etat, ecrireParLots, lot } from "./store.js";
import { genererEcheances } from "./echeancier.js";
import { libelleFrequence, echeancesDues } from "./planning.js";
import { soldeCompte, soldePointe, recalerSoldeInitial } from "./calc.js";
import { euros, versCentimes, aujourdhui, dateFr } from "./format.js";
import { h, selecteur, champ } from "./ui.js";
import { decoder, parseCsv, lire, detecterFormat, analyser, statutDepuis } from "./importcsv.js";

const NOM_STATUT = { encours: "en cours", pointe: "pointé", annule: "annulé" };

export function monter(conteneur) {
  let lignes = null;
  let plan = null;
  let detection = null;
  let rafraichir = [];

  const zone = h("div");
  const iFichier = h("input", { type: "file", accept: ".csv,text/csv,text/plain" });
  const iFormat = selecteur([["MJA", "Mois/Jour/Année (12/31/25)"], ["JMA", "Jour/Mois/Année (31/12/25)"]], "MJA");
  const iType = selecteur([["categorie", "Catégorie"], ["nature", "Moyen de paiement (nature)"], ["ignorer", "Ignorer"]], "categorie");
  const iPassees = selecteur([["derniere", "Créer seulement la dernière échéance de chaque planification"], ["toutes", "Créer toutes les échéances arrivées à terme"]], "derniere");
  const bouton = h("button", { class: "cache" }, "Importer");

  const options = h("div", { class: "carte cache" },
    h("h2", {}, "Options"),
    champ("Format des dates du fichier", iFormat),
    champ("La colonne « Type » correspond à", iType),
    champ("Échéances passées des opérations planifiées", iPassees));

  conteneur.replaceChildren(
    h("div", { class: "carte" },
      h("h2", {}, "Importer un export iCompta (CSV)"),
      h("p", { class: "note" }, "Rien n'est écrit avant votre confirmation. Un import peut être relancé sans créer de doublons : les mêmes opérations sont simplement mises à jour."),
      h("div", { class: "champ" }, h("label", {}, "Fichier CSV"), iFichier)),
    options, zone, bouton);

  function liste(titre, elements) {
    return h("div", { class: "champ" }, h("strong", {}, titre), h("ul", { class: "puces" }, elements.map((e) => h("li", {}, e))));
  }

  // Recalage : règle le solde initial pour que le solde « en cours » corresponde à celui d'iCompta
  function blocRecalage(c) {
    const compte = () => etat.comptes.find((x) => x.id === c.id);
    const etatTxt = h("small", {});
    const iCible = h("input", { type: "text", inputmode: "decimal", placeholder: "Solde en cours dans iCompta (€)" });
    const maj = () => {
      const k = compte();
      etatTxt.textContent = k ? `Actuellement – en cours : ${euros(soldeCompte(k, etat.operations))} – pointé : ${euros(soldePointe(k, etat.operations))} (solde initial : ${euros(k.soldeInitial || 0)})` : "";
    };
    rafraichir.push(maj);
    maj();
    const bouton = h("button", { type: "button", class: "sec", onclick: async () => {
      const k = compte();
      const cible = versCentimes(iCible.value);
      if (!k || cible === null) { alert("Montant invalide."); return; }
      const l = lot();
      l.set("comptes", k.id, { soldeInitial: recalerSoldeInitial(k, etat.operations, cible) });
      await l.envoyer();
      maj();
    } }, "Recaler");
    return h("div", { class: "champ" }, h("strong", {}, c.nom), iCible, bouton, h("br"), etatTxt);
  }

  function afficher() {
    if (!lignes) return;
    plan = analyser(lignes, { formatDate: iFormat.value, typeVers: iType.value }, etat);
    const noeuds = [];

    if (detection) {
      const f = detection.format === "MJA" ? "mois/jour/année" : "jour/mois/année";
      noeuds.push(h("p", { class: "note" },
        detection.conflit ? `Format de date ambigu (${detection.jma} dates jour/mois, ${detection.mja} dates mois/jour) : vérifiez le format ci-dessus.`
          : detection.certain ? `Format des dates détecté avec certitude : ${f}.`
          : `Format des dates supposé : ${f} (aucune date ne permet de trancher, vérifiez l'aperçu).`));
    }

    noeuds.push(h("p", {}, h("strong", {}, `${plan.nbOps} opérations`), ` à importer, sur ${plan.comptes.length} compte(s).`));
    noeuds.push(liste("Comptes", plan.comptes.map((c) => `${c.nom} : ${c.nbOps} op., solde des opérations ${euros(c.solde)} – ${c.existe ? "existant, réutilisé" : "à créer"}`)));

    if (plan.categories.length) {
      const nouvelles = plan.categories.filter((c) => !c.existe).length;
      noeuds.push(liste(`Catégories (${plan.categories.length}, dont ${nouvelles} à créer)`, plan.categories.slice(0, 40).map((c) => `${c.nom} : ${c.nb} op.${c.existe ? " (existante)" : ""}`)));
    }

    noeuds.push(liste("Statuts du fichier", [...plan.statuts].map(([brut, n]) => `${brut} → ${NOM_STATUT[statutDepuis(brut)]} : ${n}`)));
    noeuds.push(liste("Types d'opération du fichier", [...plan.kinds].map(([k, n]) => `${k} : ${n}`)));

    if (plan.appariees || plan.sansContrepartie) {
      noeuds.push(h("p", {}, `Virements : ${plan.appariees} apparié(s) entre deux comptes` +
        (plan.sansContrepartie ? `, ${plan.sansContrepartie} sans opération miroir (importés comme opération simple, avec la nature « virement »).` : ".")));
    }
    if (plan.nbPlanifiees) {
      const nouvelles = planifieesAEcrire().length;
      noeuds.push(h("p", {}, h("strong", {}, `${plan.nbPlanifiees} opérations planifiées`),
        ` (dont ${plan.virementsPlanifies} virement(s) entre comptes), ${nouvelles} nouvelle(s). Les échéances arrivées à terme seront créées automatiquement en « en cours ».`));
      const prevues = planifieesAEcrire();
      const enRetard = prevues.filter((x) => x.dates.length > 1);
      noeuds.push(h("p", {}, `Échéances arrivées à terme à créer maintenant : ${prevues.reduce((s, x) => s + x.nbCreees, 0)}.`));
      if (enRetard.length) {
        noeuds.push(liste("Planifications avec plusieurs échéances passées (vérifiez l'option ci-dessus)",
          enRetard.slice(0, 12).map((x) => `${x.d.nom} : ${x.dates.length} échéances depuis le ${dateFr(x.dates[0])}`)));
      }
      noeuds.push(liste("Fréquences du fichier", [...plan.frequences].map(([brut, code]) => `${brut} → ${code ? libelleFrequence(code) : "non reconnue"}`)));
    }
    if (plan.inconnues.length) {
      noeuds.push(h("div", { class: "champ" },
        h("p", { class: "erreur" }, `${plan.inconnues.length} opération(s) répétitive(s) avec une fréquence non reconnue : non importées. Envoyez-moi les fréquences ci-dessus.`),
        h("ul", { class: "puces" }, plan.inconnues.slice(0, 8).map((l) => h("li", {}, `${l.description} – ${l.frequency} – ${l.amount}`)))));
    }
    if (plan.ignoreesTaxes) noeuds.push(h("p", { class: "note" }, `${plan.ignoreesTaxes} ligne(s) ont une valeur dans la colonne « Taxes » : elle n'est pas reprise.`));
    if (plan.erreurs.length) {
      noeuds.push(liste(`${plan.erreurs.length} ligne(s) ignorée(s) car invalides`, plan.erreurs.slice(0, 10)));
    }

    zone.replaceChildren(h("div", { class: "carte" }, noeuds));
    const total = plan.nbOps + plan.nbPlanifiees;
    bouton.classList.toggle("cache", total === 0);
    bouton.textContent = plan.nbPlanifiees ? `Importer ${plan.nbOps} opérations et ${plan.nbPlanifiees} planifiées` : `Importer ${plan.nbOps} opérations`;
    bouton.disabled = false;
  }

  // Planifications à écrire (celles déjà présentes ne sont jamais réécrites), avec l'option d'échéances passées appliquée.
  function planifieesAEcrire() {
    const deja = new Set(etat.planifiees.map((p) => p.id));
    const jusqua = aujourdhui();
    return plan.ecritures.filter((e) => e[0] === "planifiees" && !deja.has(e[1])).map(([n, id, d]) => {
      const { dates } = echeancesDues({ ...d, id }, jusqua);
      const derniere = dates.length > 1 && iPassees.value === "derniere" ? dates[dates.length - 1] : null;
      return { id, d, dates, ecriture: [n, id, derniere ? { ...d, prochaine: derniere } : d], nbCreees: derniere ? 1 : dates.length };
    });
  }

  iFormat.addEventListener("change", afficher);
  iPassees.addEventListener("change", afficher);
  iType.addEventListener("change", afficher);

  iFichier.addEventListener("change", async () => {
    const f = iFichier.files[0];
    if (!f) return;
    zone.replaceChildren(h("p", { class: "vide" }, "Lecture du fichier…"));
    try {
      const { rows } = parseCsv(decoder(await f.arrayBuffer()));
      const lu = lire(rows);
      if (lu.manquantes.length) {
        zone.replaceChildren(h("div", { class: "carte" }, h("p", { class: "erreur" }, `Colonnes introuvables : ${lu.manquantes.join(", ")}. Ce fichier n'est pas un export iCompta attendu.`)));
        options.classList.add("cache"); bouton.classList.add("cache");
        return;
      }
      lignes = lu.lignes;
      detection = detecterFormat(lignes.flatMap((l) => [l.date, l.conciled]));
      iFormat.value = detection.format;
      options.classList.remove("cache");
      afficher();
    } catch (e) {
      console.error(e);
      zone.replaceChildren(h("p", { class: "erreur" }, "Lecture impossible : " + e.message));
    }
  });

  bouton.addEventListener("click", async () => {
    if (!plan || !(plan.nbOps + plan.nbPlanifiees)) return;
    if (!navigator.onLine) { alert("Une connexion est nécessaire pour importer."); return; }
    if (!confirm(`Importer ${plan.nbOps} opérations et ${plan.nbPlanifiees} opérations planifiées dans l'application ?`)) return;
    bouton.disabled = true;
    iFichier.disabled = iFormat.disabled = iType.disabled = iPassees.disabled = true;
    const suivi = h("p", { class: "note" }, "Import en cours…");
    zone.prepend(suivi);
    try {
      // Une planification déjà présente n'est jamais réécrite (sa prochaine échéance a pu avancer).
      const planifieesChoisies = planifieesAEcrire().map((x) => x.ecriture);
      const aEcrire = [...plan.ecritures.filter((e) => e[0] !== "planifiees"), ...planifieesChoisies];
      await ecrireParLots(aEcrire, (fait, total) => { suivi.textContent = `Import en cours : ${fait} / ${total}`; });
      suivi.textContent = "Création des échéances arrivées à terme…";
      await new Promise((r) => setTimeout(r, 400));
      const gen = genererEcheances();
      await gen.fini;
      const resultat = h("div", { class: "carte" },
        h("h2", {}, "Import terminé"),
        h("p", {}, `${plan.nbOps} opérations et ${plan.nbPlanifiees} opérations planifiées enregistrées.`),
        gen.nb ? h("p", {}, `${gen.nb} échéance(s) arrivée(s) à terme créée(s) en « en cours ».`) : null,
        h("p", {}, "Recalage des soldes : saisissez, pour chaque compte, le solde « en cours » affiché par iCompta. Le solde initial est calculé pour que l'application affiche le même montant. Le solde pointé doit alors correspondre aussi ; sinon, des statuts diffèrent."),
        ...(rafraichir = [], plan.comptes.map(blocRecalage)),
        h("a", { href: "#/comptes" }, "Voir les comptes"));
      zone.replaceChildren(resultat);
      bouton.classList.add("cache");
      iFichier.disabled = iFormat.disabled = iType.disabled = iPassees.disabled = false;
      iFichier.value = "";
    } catch (e) {
      console.error(e);
      suivi.className = "erreur";
      suivi.textContent = "Échec de l'import : " + e.message + ". Vous pouvez relancer : les opérations déjà enregistrées ne seront pas dupliquées.";
      bouton.disabled = false;
      iFichier.disabled = iFormat.disabled = iType.disabled = iPassees.disabled = false;
    }
  });

  return { maj() { rafraichir.forEach((f) => f()); } };
}
