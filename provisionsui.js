// Onglet « Provisions » des Budgets : combien je mets de côté, où j'en suis, quand l'avis sera prélevé.
import { etat, pret, lot, nouvelId, serverTimestamp, categoriesTriees, comparerComptes } from "./store.js";
import { euros, versCentimes, versSaisie, aujourdhui, dateFr } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { situationProvision, syntheseProvisions, datesVersements, mensualiteProvision } from "./provisions.js";
import { suivante } from "./planning.js";
import { blocCorrections, caseSuppression, appliquerAuxOps, recaler, supprimerOps, opsNonPointees } from "./corrections.js";
import { formPlanifiee } from "./echeancier.js";

const liste = () => ((etat.reglages.find((r) => r.id === "provisions") || {}).liste || []);
const nomCompte = (id) => { const c = etat.comptes.find((x) => x.id === id); return c ? c.nom : "compte inconnu"; };
const ecrireListe = (nouvelle, l = lot()) => { l.set("reglages", "provisions", { liste: nouvelle }); return l; };

// Provision à l'origine d'une échéance (ou null).
export const provisionDeEcheance = (echeanceId) => (echeanceId ? liste().find((x) => x.echeanceId === echeanceId) || null : null);

export function formProvision(p = null) {
  const comptes = etat.comptes.filter((c) => !c.archive || c.id === p?.compteId).sort(comparerComptes);
  const optComptes = comptes.map((c) => [c.id, c.nom]);
  const iNom = h("input", { type: "text", required: true, value: p?.nom || "", placeholder: "Ex. Assurance habitation 2027" });
  const iTotal = h("input", { type: "text", inputmode: "decimal", required: true, value: p ? versSaisie(p.total) : "", placeholder: "1200,00" });
  const iNb = h("input", { type: "number", min: "1", max: "120", required: true, value: p?.nb || 12 });
  const iPremier = h("input", { type: "date", required: true, value: p?.premier || aujourdhui() });
  const iPrelev = h("input", { type: "date", required: true, value: p?.prelevement || "" });
  const iCompte = selecteur(optComptes, p?.compteId || (comptes[0] || {}).id);
  const iSource = selecteur([["", "Aucun : le versement est une recette du compte"], ...optComptes], p?.sourceId || "");
  const iCat = selecteur([["", "— aucune —"], ...categoriesTriees(false, p?.categorieId).map((c) => [c.id, c.libelle])], p?.categorieId || "");
  const iCreer = h("input", { type: "checkbox", checked: p ? !!(p.echeanceId || p.operationId) : true });
  const indice = h("p", { class: "note" });
  const erreur = h("p", { class: "erreur" });
  const courant = () => ({ total: Math.abs(versCentimes(iTotal.value) || 0), nb: Math.floor(Number(iNb.value)) || 0, premier: iPremier.value });
  function aff() {
    const c = courant();
    const m = mensualiteProvision(c);
    const d = c.nb && c.premier ? datesVersements(c) : [];
    indice.textContent = m && d.length ? `${euros(m)} par mois du ${dateFr(d[0])} au ${dateFr(d[d.length - 1])}.` + (c.total - m * c.nb ? ` Écart d'arrondi : ${euros(c.total - m * c.nb)}.` : "") : "";
    if (!p && !iPrelev.value && d.length) iPrelev.placeholder = dateFr(suivante(d[d.length - 1], "mensuel", +c.premier.slice(8, 10)));
  }
  for (const e of [iTotal, iNb, iPremier]) e.addEventListener("input", aff);
  aff();
  const corr = p && p.echeanceId ? blocCorrections(p.echeanceId) : { noeud: null, valeurs: () => ({}) };
  const supp = p && p.echeanceId ? caseSuppression(p.echeanceId) : { noeud: null, coche: () => false, ops: [], nb: 0 };
  const opPrelev = p && p.operationId ? etat.operations.find((o) => o.id === p.operationId && o.statut === "encours") : null;
  const casePrelev = opPrelev ? h("label", { class: "case" }, h("input", { type: "checkbox", id: "supp-prelev" }), "Supprimer aussi le prélèvement prévu (non pointé)") : null;
  const actions = h("div", { class: "actions" }, h("button", { type: "submit" }, "Enregistrer"),
    h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"),
    p && h("button", { type: "button", class: "danger", onclick: () => {
      const avecVersements = supp.coche(), avecPrelev = !!(casePrelev && casePrelev.querySelector("input").checked);
      if (!confirm("Supprimer cette provision ? L'échéance mensuelle est supprimée." + (avecVersements || avecPrelev ? " Les opérations non pointées cochées sont supprimées aussi." : " Les opérations déjà créées et le prélèvement prévu sont conservés."))) return;
      const l = lot();
      if (p.echeanceId) l.del("planifiees", p.echeanceId);
      if (avecVersements) supprimerOps(l, supp.ops);
      if (avecPrelev) l.del("operations", p.operationId);
      ecrireListe(liste().filter((x) => x.id !== p.id), l).envoyer();
      dialogue.close();
    } }, "Supprimer"));
  const { dialogue, formulaire } = modale(p ? "Provision" : "Nouvelle provision", [
    champ("Nom", iNom), champ("Total de l'avis (€)", iTotal), champ("Nombre de mois de versement", iNb),
    champ("Premier versement", iPremier), indice, champ("Date du prélèvement de l'avis", iPrelev),
    champ("Compte qui reçoit la provision", iCompte), champ("Versement depuis le compte (facultatif)", iSource), champ("Catégorie du prélèvement (facultatif)", iCat),
    h("label", { class: "case" }, iCreer, p ? "Mettre à jour l'échéance mensuelle et le prélèvement" : "Créer l'échéance mensuelle et le prélèvement dans mes comptes"),
    h("p", { class: "note" }, "Les opérations créées ne sont pas marquées « à exporter »."), corr.noeud, supp.noeud, casePrelev, erreur, actions]);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const c = courant();
    if (!c.total || !c.nb) { erreur.textContent = "Total ou nombre de mois invalide."; return; }
    if (iSource.value && iSource.value === iCompte.value) { erreur.textContent = "Choisissez deux comptes différents."; return; }
    const nom = iNom.value.trim();
    const fiche = { id: p?.id || nouvelId("reglages"), nom, total: c.total, nb: c.nb, premier: c.premier, prelevement: iPrelev.value, compteId: iCompte.value, sourceId: iSource.value || null,
      categorieId: iCat.value || null, echeanceId: p?.echeanceId || null, operationId: p?.operationId || null };
    const l = lot();
    if (iCreer.checked) {
      const m = mensualiteProvision(fiche), dates = datesVersements(fiche), ancre = +fiche.premier.slice(8, 10);
      fiche.echeanceId = fiche.echeanceId || nouvelId("planifiees");
      const virement = !!fiche.sourceId;
      const echeance = { nom, commentaire: "Provision", info: "", aExporter: false, montant: virement ? -m : m, compteId: virement ? fiche.sourceId : fiche.compteId,
        virementCompteId: virement ? fiche.compteId : null, nature: virement ? "virement" : "autre", categorieId: null, frequence: "mensuel",
        prochaine: p && p.premier === fiche.premier && p.nb === fiche.nb ? (etat.planifiees.find((x) => x.id === fiche.echeanceId) || {}).prochaine || fiche.premier : fiche.premier,
        jourAncre: ancre, dateFin: dates[dates.length - 1] };
      if (!p?.echeanceId) echeance.cree = serverTimestamp();
      const c = corr.valeurs();
      if (c.recaler) echeance.prochaine = fiche.premier;
      l.set("planifiees", fiche.echeanceId, echeance);
      if (p && p.echeanceId) {
        const suppr = new Set(c.recaler && c.depuis ? recaler(l, p.echeanceId, c.depuis).map((o) => o.id) : []);
        if (c.appliquer) appliquerAuxOps(l, { ...echeance, id: fiche.echeanceId }, opsNonPointees(p.echeanceId).filter((o) => !suppr.has(o.id)));
      }
      fiche.operationId = fiche.operationId || nouvelId("operations");
      const op = { nom: `${nom} (prélèvement)`, commentaire: "Provision", date: fiche.prelevement, statut: "encours", datePointage: null, info: "", aExporter: false,
        compteId: fiche.compteId, montant: -fiche.total, nature: "autre", categorieId: fiche.categorieId, aClasser: !fiche.categorieId, virementId: null };
      if (!p?.operationId) op.cree = serverTimestamp();
      const existante = p?.operationId && etat.operations.find((o) => o.id === p.operationId);
      if (!existante || existante.statut !== "pointe") l.set("operations", fiche.operationId, op);
    }
    ecrireListe(p ? liste().map((x) => (x.id === p.id ? fiche : x)) : [...liste(), fiche], l).envoyer();
    dialogue.close();
  });
}

export function monter(conteneur) {
  const corps = h("div", {});
  conteneur.replaceChildren(corps);
  function maj() {
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const auj = aujourdhui();
    const l = liste();
    const sy = syntheseProvisions(l, auj);
    const noeuds = [h("div", { class: "actions" }, h("button", { type: "button", onclick: () => formProvision() }, "+ Nouvelle provision"))];
    if (!l.length) {
      noeuds.push(h("div", { class: "carte" }, h("p", {}, "Aucune provision."),
        h("p", { class: "note" }, "Une provision met de côté, chaque mois, une part d'un avis réglé en une fois. Exemple : avis de 1 200 € pour 2027 → 100 € par mois, prélevés d'un coup à la fin.")));
    } else {
      noeuds.push(h("div", { class: "carte", "data-resume": `${euros(sy.parMois)} / mois · ${euros(sy.provisionne)} provisionnés` }, h("h3", { class: "titre-carte" }, "Vue d'ensemble"),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Je provisionne chaque mois"), h("strong", {}, euros(sy.parMois))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Déjà provisionné"), h("strong", {}, euros(sy.provisionne))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Reste à provisionner"), h("strong", {}, euros(sy.reste))),
        sy.prelevements.length ? h("div", {}, h("p", { class: "note" }, "Prélèvements à venir :"), ...sy.prelevements.map((x) => h("div", { class: "ligne-synthese" }, h("span", {}, `${dateFr(x.date)} · ${x.nom}`), h("strong", {}, euros(x.montant))))) : null));
      for (const { p, s } of sy.lignes) {
        const pct = p.total ? Math.min(100, Math.round(100 * (s.preleve ? 100 : s.provisionne / p.total))) : 0;
        const statut = s.preleve ? "Prélevé" : s.faits === 0 ? `Premier versement le ${dateFr(p.premier)}` : s.restants ? `Prochain versement le ${dateFr(s.prochainVersement)}` : "Provision complète";
        noeuds.push(h("div", { class: "carte", "data-resume": `${euros(s.provisionne)} sur ${euros(p.total)}` }, h("h3", { class: "titre-carte" }, p.nom),
          h("div", { class: "barre-budget vert", role: "img", "aria-label": `${pct} % provisionné` }, h("span", { class: "reel", style: `width:${pct}%` })),
          h("div", { class: "ligne-synthese" }, h("span", {}, "Provisionné"), h("strong", {}, `${euros(s.provisionne)} sur ${euros(p.total)}`)),
          h("div", { class: "ligne-synthese" }, h("span", {}, "Chaque mois"), h("strong", {}, `${euros(s.mensuel)} × ${s.nb}`)),
          h("div", { class: "ligne-synthese" }, h("span", {}, "Prélèvement"), h("strong", {}, p.prelevement ? dateFr(p.prelevement) : "non daté")),
          s.moisAvantPrelevement != null ? h("p", { class: "note" }, s.moisAvantPrelevement <= 0 ? "Prélèvement ce mois-ci." : `Dans ${s.moisAvantPrelevement} mois.`) : null,
          h("p", { class: "note" }, `${statut} · compte : ${nomCompte(p.compteId)}${p.sourceId ? ` · versé depuis : ${nomCompte(p.sourceId)}` : ""}`),
          h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => formProvision(p) }, "Modifier"),
            etat.planifiees.find((x) => x.id === p.echeanceId) ? h("button", { type: "button", class: "sec", onclick: () => formPlanifiee(etat.planifiees.find((x) => x.id === p.echeanceId)) }, "Ouvrir l'échéance") : null)));
      }
    }
    corps.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
