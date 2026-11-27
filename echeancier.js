import { etat, pret, nouvelId, lot, ecrireEnParallele, serverTimestamp, categoriesTriees, comparerComptes } from "./store.js";
import { ecrituresEcheances, FREQUENCES, libelleFrequence, estTerminee, suivante, nbJoursSemaine, moisDesSeances, montantEcheance } from "./planning.js";
import { euros, versCentimes, versSaisie, dateFr, aujourdhui } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { blocCorrections, caseSuppression, appliquerAuxOps, recaler, supprimerOps, opsNonPointees } from "./corrections.js";
import * as vueProvisions from "./provisionsui.js";
import { NATURES } from "./operations.js";
import { libelleCategorie } from "./recherche.js";

// Crée les opérations « en cours » des échéances arrivées à terme. Sans risque de doublon : identifiants déterministes.
// Retourne { nb, fini } ; `fini` se résout quand le serveur a confirmé (jamais hors connexion).
export function genererEcheances() {
  if (!etat.uid) return { nb: 0, fini: Promise.resolve() };
  const ids = new Set(etat.operations.map((o) => o.id));
  const { ecritures, nb } = ecrituresEcheances(etat.planifiees, ids, aujourdhui(), serverTimestamp());
  if (!ecritures.length) return { nb: 0, fini: Promise.resolve() };
  const fini = ecrireEnParallele(ecritures).catch((e) => console.error("Échéances", e));
  return { nb, fini };
}

export function formPlanifiee(p = null) {
  const virement = !!(p && p.virementCompteId);
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === p?.compteId).sort(comparerComptes);
  const optComptes = comptes.map((c) => [c.id, c.nom]);

  const iType = selecteur([["operation", "Opération"], ["virement", "Virement entre comptes"]], virement ? "virement" : "operation");
  const iNom = h("input", { type: "text", required: true, value: p?.nom || "", autocomplete: "off" });
  const iCom = h("input", { type: "text", value: p?.commentaire || "" });
  const iSens = selecteur([["-1", "Dépense"], ["1", "Recette"]], p && !virement && p.montant > 0 ? "1" : "-1");
  const iMontant = h("input", { type: "text", inputmode: "decimal", required: true, placeholder: "0,00", value: p ? versSaisie(p.montant) : "" });
  const iCompte = selecteur(optComptes, p?.compteId || (comptes[0] || {}).id);
  const iDest = selecteur(optComptes, p?.virementCompteId || (comptes.find((c) => c.id !== (p?.compteId || comptes[0]?.id)) || {}).id);
  const iNature = selecteur(NATURES, p?.nature || "autre");
  const iCat = selecteur([["", "— aucune —"], ...categoriesTriees(false, p?.categorieId).map((c) => [c.id, c.libelle])], p?.categorieId || "");
  const iFreq = selecteur(FREQUENCES, p?.frequence || "mensuel");
  const iProchaine = h("input", { type: "date", required: true, value: p?.prochaine || aujourdhui() });
  const iFin = h("input", { type: "date", value: p?.dateFin || "" });
  const iNombre = h("input", { type: "number", min: "1", max: "600", inputmode: "numeric", placeholder: "Ex. 10" });
  const indiceFin = h("small", { class: "indice-fin" });
  // Date de la dernière échéance quand on indique un nombre d'échéances (la prochaine échéance compte pour la première).
  function dateDuNieme(n) {
    let d = iProchaine.value;
    for (let i = 1; i < n && d; i++) d = suivante(d, iFreq.value, +iProchaine.value.slice(8, 10));
    return d;
  }
  function majNombre() {
    const n = Math.floor(Number(iNombre.value));
    if (n >= 1 && iProchaine.value) { iFin.value = dateDuNieme(n); indiceFin.textContent = `Dernière échéance : ${dateFr(iFin.value)}`; }
    else indiceFin.textContent = "";
  }
  iNombre.addEventListener("input", majNombre);
  iProchaine.addEventListener("change", majNombre);
  iFreq.addEventListener("change", majNombre);
  iFin.addEventListener("input", () => { iNombre.value = ""; indiceFin.textContent = ""; });
  // ── Montant calculé selon le nombre de séances du mois ──
  const s0 = p?.seances || null;
  const iSeancesOn = h("input", { type: "checkbox", checked: s0 ? true : null });
  const cSeancesOn = h("label", { class: "case" }, iSeancesOn, "Montant selon le nombre de séances du mois");
  const iTarif = h("input", { type: "text", inputmode: "decimal", placeholder: "36,00", value: s0 ? versSaisie(s0.tarif) : "" });
  const iJour = selecteur([["1", "Lundi"], ["2", "Mardi"], ["3", "Mercredi"], ["4", "Jeudi"], ["5", "Vendredi"], ["6", "Samedi"], ["0", "Dimanche"]], String(s0 ? s0.jour : 1));
  const iDecal = selecteur([["0", "Du mois de l'échéance"], ["-1", "Du mois précédent"]], String(s0 ? s0.decalage || 0 : 0));
  const iFraisM = h("input", { type: "text", inputmode: "decimal", placeholder: "0,00", value: s0 && s0.fraisMensuels ? versSaisie(s0.fraisMensuels) : "" });
  const iFraisU = h("input", { type: "text", inputmode: "decimal", placeholder: "0,00", value: s0 && s0.fraisUniques ? versSaisie(s0.fraisUniques) : "" });
  const forces = { ...(p?.seancesMois || {}) };   // nombre de séances modifié à la main, par mois
  const tableSeances = h("div", {});
  const MOIS_LONG = (ym) => new Date(ym + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
  const fiche = () => ({ montant: -1, virementCompteId: null, premiere: p?.premiere || iProchaine.value, seancesMois: forces,
    seances: { tarif: Math.abs(versCentimes(iTarif.value) || 0), jour: +iJour.value, decalage: +iDecal.value, fraisMensuels: Math.abs(versCentimes(iFraisM.value) || 0), fraisUniques: Math.abs(versCentimes(iFraisU.value) || 0) } });
  function majSeances() {
    const zone = [cTarif, cJour, cDecal, cFraisM, cFraisU, tableSeances];
    zone.forEach((e) => e.classList.toggle("cache", !iSeancesOn.checked));
    cMontant.classList.toggle("cache", iSeancesOn.checked);
    iMontant.required = !iSeancesOn.checked;
    if (!iSeancesOn.checked || !iProchaine.value) { tableSeances.replaceChildren(); return; }
    const f = fiche();
    const lignes = [];
    let d = iProchaine.value;
    for (let i = 0; i < 12 && d && (!iFin.value || d <= iFin.value); i++) {
      const date = d, mois = moisDesSeances(f, date), calcule = nbJoursSemaine(mois, f.seances.jour);
      const montant = h("strong", {}, "");
      const saisie = h("input", { type: "number", min: "0", max: "10", inputmode: "numeric", value: String(Number.isFinite(forces[mois]) ? forces[mois] : calcule), "aria-label": `Séances de ${MOIS_LONG(mois)}` });
      const maj = () => { montant.textContent = euros(Math.abs(montantEcheance({ ...fiche(), seancesMois: forces }, date))); };
      saisie.addEventListener("input", () => { const n = Math.floor(Number(saisie.value)); if (Number.isFinite(n) && n >= 0 && n !== calcule) forces[mois] = n; else delete forces[mois]; maj(); });
      maj();
      lignes.push(h("div", { class: "ligne-seance" }, h("span", {}, `${dateFr(date)}`), h("small", {}, `séances de ${MOIS_LONG(mois)}`), saisie, montant));
      d = suivante(d, iFreq.value, +iProchaine.value.slice(8, 10));
    }
    tableSeances.replaceChildren(h("p", { class: "note" }, "Séances et montant de chaque échéance. Modifie le nombre pour une séance annulée ou ajoutée ; les frais uniques s'ajoutent à la première échéance."), ...lignes);
  }
  const cTarif = champ("Tarif par séance (€)", iTarif), cJour = champ("Jour des séances", iJour), cDecal = champ("Séances comptées", iDecal);
  const cFraisM = champ("Frais mensuels (€)", iFraisM), cFraisU = champ("Frais uniques à la première échéance (€)", iFraisU);
  for (const e of [iSeancesOn, iTarif, iJour, iDecal, iFraisM, iFraisU, iProchaine, iFreq, iFin]) e.addEventListener(e.tagName === "SELECT" || e.type === "checkbox" || e.type === "date" ? "change" : "input", majSeances);
  const iInfo = h("input", { type: "text", value: p?.info || "" });
  const iExport = h("input", { type: "checkbox", checked: p ? !!p.aExporter : true });
  const cExport = h("label", { class: "case" }, iExport, "Inclure dans l'export (opérations créées)");
  const erreur = h("p", { class: "erreur" });

  const cSens = champ("Sens", iSens);
  const cMontant = champ("Montant (€)", iMontant);
  const cCompte = champ("Compte", iCompte);
  const cDest = champ("Compte destination", iDest);
  const cNature = champ("Nature", iNature);
  const cCat = champ("Catégorie", iCat);

  function basculer() {
    const v = iType.value === "virement";
    cSens.hidden = v; cDest.hidden = !v; cNature.hidden = v; cCat.hidden = v;
    cCompte.querySelector("label").textContent = v ? "Compte source (débité)" : iSens.value === "1" ? "Compte crédité" : "Compte débité";
  }
  iType.addEventListener("change", basculer);
  iSens.addEventListener("change", basculer);

  const corr = p ? blocCorrections(p.id) : { noeud: null, valeurs: () => ({}) };
  const supp = p ? caseSuppression(p.id) : { noeud: null, coche: () => false };
  const provision = p ? vueProvisions.provisionDeEcheance(p.id) : null;
  const lienProvision = provision ? h("p", { class: "note" }, `Cette échéance vient de la provision « ${provision.nom} ». `,
    h("button", { type: "button", class: "sec", onclick: () => { dialogue.close(); vueProvisions.formProvision(provision); } }, "Ouvrir la provision")) : null;
  const actions = h("div", { class: "actions" },
    h("button", { type: "submit" }, "Enregistrer"),
    h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"),
    p && h("button", { type: "button", class: "danger", onclick: () => {
      const avecOps = supp.coche();
      if (!confirm(avecOps ? `Supprimer cette opération planifiée et ${supp.nb} opération(s) non pointée(s) déjà créée(s) ? Les opérations pointées sont conservées.` : "Supprimer cette opération planifiée ? Les opérations déjà créées sont conservées.")) return;
      const l = lot(); l.del("planifiees", p.id);
      if (avecOps) supprimerOps(l, supp.ops);
      l.envoyer();
      dialogue.close();
    } }, "Supprimer")
  );

  const { dialogue, formulaire } = modale(p ? "Opération planifiée" : "Nouvelle opération planifiée", [
    champ("Type de saisie", iType), champ("Nom", iNom), champ("Commentaire", iCom), cSens,
    cMontant, cSeancesOn, cTarif, cJour, cDecal, cFraisM, cFraisU, tableSeances, cCompte, cDest, cNature, champ("Info", iInfo), cCat,
    cExport, champ("Fréquence", iFreq), champ("Prochaine échéance", iProchaine), champ("Nombre d'échéances (facultatif, calcule la date de fin)", iNombre), champ("Date de fin (facultative)", iFin), indiceFin, lienProvision, corr.noeud, supp.noeud, erreur, actions
  ]);
  if (p) formulaire.querySelector(".champ").hidden = true;
  basculer();
  majSeances();

  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const seancesOn = iSeancesOn.checked;
    const fSeances = fiche();
    if (seancesOn && !fSeances.seances.tarif) { erreur.textContent = "Indique le tarif par séance."; return; }
    const typique = seancesOn ? Math.round(fSeances.seances.tarif * 52 / 12) + fSeances.seances.fraisMensuels : 0;
    const saisi = seancesOn ? typique : versCentimes(iMontant.value);
    if (saisi === null || saisi === 0) { erreur.textContent = "Montant invalide."; return; }
    const v = iType.value === "virement";
    if (!iCompte.value) { erreur.textContent = "Choisissez un compte."; return; }
    if (v && iCompte.value === iDest.value) { erreur.textContent = "Choisissez deux comptes différents."; return; }
    if (iFin.value && iFin.value < iProchaine.value) { erreur.textContent = "La date de fin précède la prochaine échéance."; return; }
    const m = Math.abs(saisi);
    const donnees = {
      nom: iNom.value.trim(), commentaire: iCom.value.trim(), info: iInfo.value.trim(), aExporter: iExport.checked,
      montant: v ? -m : Number(iSens.value) * m,
      compteId: iCompte.value, virementCompteId: v ? iDest.value : null,
      nature: v ? "virement" : iNature.value, categorieId: v ? null : (iCat.value || null),
      frequence: iFreq.value, prochaine: iProchaine.value, jourAncre: +iProchaine.value.slice(8, 10), dateFin: iFin.value || null,
      seances: seancesOn ? fSeances.seances : null, seancesMois: seancesOn ? forces : null, premiere: seancesOn ? (p?.premiere || iProchaine.value) : null
    };
    if (!p) donnees.cree = serverTimestamp();
    const l = lot();
    l.set("planifiees", p?.id || nouvelId("planifiees"), donnees);
    if (p) {
      const c = corr.valeurs();
      const completes = { ...p, ...donnees, id: p.id };
      const aSupprimer = c.recaler && c.depuis ? recaler(l, p.id, c.depuis) : [];
      const suppr = new Set(aSupprimer.map((o) => o.id));
      if (c.appliquer) appliquerAuxOps(l, completes, opsNonPointees(p.id).filter((o) => !suppr.has(o.id)));
    }
    l.envoyer();
    dialogue.close();
  });
}

export function monter(conteneur) {
  let onglet = "echeances";
  const resume = h("div", { class: "resume" });
  const liste = h("div", { class: "liste" });
  const ajout = h("button", { class: "flottant", "aria-label": "Nouvelle opération planifiée", onclick: () => formPlanifiee() }, "+");
  const zoneEch = h("div", {}, resume, liste, ajout);
  const zoneProv = h("div", { class: "cache" });
  const vueProv = vueProvisions.monter(zoneProv);
  const onglets = h("div", { class: "modes-bilan" }, [["echeances", "Échéances"], ["provisions", "Provisions"]].map(([v, l]) =>
    h("button", { type: "button", class: "sec", "data-vue": v, onclick: () => { onglet = v; maj(); } }, l)));
  conteneur.replaceChildren(onglets, zoneEch, zoneProv);

  function maj() {
    onglets.querySelectorAll("button").forEach((b) => b.classList.toggle("actif-filtre", b.dataset.vue === onglet));
    zoneEch.classList.toggle("cache", onglet !== "echeances");
    zoneProv.classList.toggle("cache", onglet !== "provisions");
    vueProv.maj();
    if (!pret()) { liste.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const comptes = new Map(etat.comptes.map((c) => [c.id, c]));
    resume.textContent = `${etat.planifiees.length} opérations planifiées`;
    if (!etat.planifiees.length) { liste.replaceChildren(h("p", { class: "vide" }, "Aucune opération planifiée. Touchez + pour en créer une, ou importez votre CSV iCompta.")); return; }
    const groupes = new Map();
    for (const p of etat.planifiees) {
      if (!groupes.has(p.compteId)) groupes.set(p.compteId, []);
      groupes.get(p.compteId).push(p);
    }
    const noeuds = [];
    const ordre = [...groupes.keys()].sort((a, b) => comparerComptes(comptes.get(a) || { nom: "~" }, comptes.get(b) || { nom: "~" }));
    for (const cid of ordre) {
      noeuds.push(h("h3", { class: "groupe" }, (comptes.get(cid) || {}).nom || "Compte supprimé"));
      for (const p of groupes.get(cid).sort((a, b) => (a.prochaine || "").localeCompare(b.prochaine || ""))) {
        const fin = estTerminee(p);
        const dest = p.virementCompteId && (comptes.get(p.virementCompteId) || {}).nom;
        noeuds.push(h("button", { class: "ligne bouton-ligne" + (fin ? " terminee" : ""), style: `border-left-color:${(comptes.get(cid) || {}).couleur || "transparent"}`, onclick: () => formPlanifiee(etat.planifiees.find((x) => x.id === p.id)) },
          h("div", { class: "gauche" },
            h("strong", {}, (p.virementCompteId ? "⇄ " : "") + p.nom),
            h("small", {}, `${fin ? "terminée" : dateFr(p.prochaine)} · ${libelleFrequence(p.frequence)}${dest ? " · vers " + dest : ""}${vueProvisions.provisionDeEcheance(p.id) ? " · provision" : ""}`),
            h("small", { class: "cat-planifiee" }, p.virementCompteId ? "Virement" : (libelleCategorie(p.categorieId, etat.categories) || "Sans catégorie"))),
          h("div", { class: "droite" },
            h("span", { class: "montant " + (p.montant < 0 ? "neg" : "pos") }, euros(p.seances && p.prochaine ? montantEcheance(p, p.prochaine) : p.montant)))));
      }
    }
    liste.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
