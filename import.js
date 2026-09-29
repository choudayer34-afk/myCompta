import { etat, ecrireParLots } from "./store.js";
import { euros } from "./format.js";
import { h, selecteur, champ } from "./ui.js";
import { decoder, parseCsv, lire, detecterFormat, analyser, statutDepuis } from "./importcsv.js";

const NOM_STATUT = { encours: "en cours", pointe: "pointé", annule: "annulé" };

export function monter(conteneur) {
  let lignes = null;
  let plan = null;
  let detection = null;

  const zone = h("div");
  const iFichier = h("input", { type: "file", accept: ".csv,text/csv,text/plain" });
  const iFormat = selecteur([["MJA", "Mois/Jour/Année (12/31/25)"], ["JMA", "Jour/Mois/Année (31/12/25)"]], "MJA");
  const iType = selecteur([["categorie", "Catégorie"], ["nature", "Moyen de paiement (nature)"], ["ignorer", "Ignorer"]], "categorie");
  const bilan = h("div");
  const bouton = h("button", { class: "cache" }, "Importer");

  const options = h("div", { class: "carte cache" },
    h("h2", {}, "Options"),
    champ("Format des dates du fichier", iFormat),
    champ("La colonne « Type » correspond à", iType));

  conteneur.replaceChildren(
    h("div", { class: "carte" },
      h("h2", {}, "Importer un export iCompta (CSV)"),
      h("p", { class: "note" }, "Rien n'est écrit avant votre confirmation. Un import peut être relancé sans créer de doublons : les mêmes opérations sont simplement mises à jour."),
      h("div", { class: "champ" }, h("label", {}, "Fichier CSV"), iFichier)),
    options, zone, bouton);

  function liste(titre, elements) {
    return h("div", { class: "champ" }, h("strong", {}, titre), h("ul", { class: "puces" }, elements.map((e) => h("li", {}, e))));
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
    if (plan.recurrentes.length) {
      noeuds.push(h("div", { class: "champ" },
        h("p", {}, `${plan.recurrentes.length} opération(s) répétitive(s) ne sont pas importées à cette étape (elles seront traitées avec l'échéancier). Relancez l'import à ce moment-là.`),
        h("ul", { class: "puces" }, plan.recurrentes.slice(0, 8).map((l) => h("li", {}, `${l.description} – ${l.frequency} – ${l.amount}`)))));
    }
    if (plan.ignoreesTaxes) noeuds.push(h("p", { class: "note" }, `${plan.ignoreesTaxes} ligne(s) ont une valeur dans la colonne « Taxes » : elle n'est pas reprise.`));
    if (plan.erreurs.length) {
      noeuds.push(liste(`${plan.erreurs.length} ligne(s) ignorée(s) car invalides`, plan.erreurs.slice(0, 10)));
    }

    zone.replaceChildren(h("div", { class: "carte" }, noeuds));
    bouton.classList.toggle("cache", plan.nbOps === 0);
    bouton.textContent = `Importer ${plan.nbOps} opérations`;
    bouton.disabled = false;
  }

  iFormat.addEventListener("change", afficher);
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
    if (!plan || !plan.nbOps) return;
    if (!navigator.onLine) { alert("Une connexion est nécessaire pour importer."); return; }
    if (!confirm(`Importer ${plan.nbOps} opérations dans l'application ?`)) return;
    bouton.disabled = true;
    iFichier.disabled = iFormat.disabled = iType.disabled = true;
    const suivi = h("p", { class: "note" }, "Import en cours…");
    zone.prepend(suivi);
    try {
      await ecrireParLots(plan.ecritures, (fait, total) => { suivi.textContent = `Import en cours : ${fait} / ${total}`; });
      const resultat = h("div", { class: "carte" },
        h("h2", {}, "Import terminé"),
        h("p", {}, `${plan.nbOps} opérations enregistrées.`),
        liste("Soldes des opérations importées (à comparer à iCompta, puis ajuster le solde initial de chaque compte si besoin)",
          plan.comptes.map((c) => `${c.nom} : ${euros(c.solde)}`)),
        h("a", { href: "#/comptes" }, "Voir les comptes"));
      zone.replaceChildren(resultat);
      bouton.classList.add("cache");
    } catch (e) {
      console.error(e);
      suivi.className = "erreur";
      suivi.textContent = "Échec de l'import : " + e.message + ". Vous pouvez relancer : les opérations déjà enregistrées ne seront pas dupliquées.";
      bouton.disabled = false;
      iFichier.disabled = iFormat.disabled = iType.disabled = false;
    }
  });

  return { maj() {} };
}
