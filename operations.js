import { blocObjectif } from "./objectif.js";
import { etat, pret, nouvelId, lot, serverTimestamp, categoriesTriees, ecrireEnParallele, comparerComptes } from "./store.js";
import { lignesAvecSolde, soldePointe, habitudes } from "./calc.js";
import { euros, versCentimes, versSaisie, dateFr, moisFr, aujourdhui, sansAccent } from "./format.js";
import { h, modale, champ, selecteur, combo, couleurAuHasard } from "./ui.js";
import { nomsConnus, associationPour, cleNom } from "./noms.js";
import { formCompte } from "./comptes.js";
import { NATURES, STATUTS } from "./constantes.js";
import { formMasse } from "./masse.js";
import { formRapide } from "./rapide.js";
import { formOperation } from "./formoperation.js";
import { formCloture } from "./clotureui.js";

export { NATURES, STATUTS, formOperation };
const ICONES = { encours: "○", pointe: "●", annule: "✕" };
const libelleNature = (n) => (NATURES.find((x) => x[0] === n) || [0, ""])[1];

const PAGE = 200;

export function monter(conteneur, { id }) {
  conteneur.classList.remove("mode-selection");
  let recherche = "";
  let limite = PAGE;
  let fExport = "", fCat = "";   // filtres : export (« oui » / « non »), catégorie (« avec » / « sans » / « aclasser »)
  let nonPointees = false;   // filtre « à pointer » (statut en cours)
  let affichees = [];        // opérations actuellement listées (après filtres)
  let mode = false;          // mode sélection
  const choisies = new Set();
  let message = "";
  const compte = () => etat.comptes.find((c) => c.id === id);

  const titre = h("strong", { class: "titre-vue" });
  const solde = h("div", { class: "solde-bloc" });   // solde pointé (grand) + en cours (italique, plus petit)
  const objectifVue = h("div", { class: "objectif-vue" });
  const detailSolde = h("div", { class: "solde-vue" });   // nombre d'opérations à pointer
  const enTete = h("div", { class: "entete-vue" },
    h("a", { href: "#/comptes", class: "retour" }, "‹ Comptes"), titre,
    h("button", { class: "sec", onclick: () => compte() && formCompte(compte()) }, "Modifier"));
  const iRecherche = h("input", { type: "search", placeholder: "Recherche", class: "recherche", autocomplete: "off" });
  iRecherche.addEventListener("input", () => { recherche = iRecherche.value; limite = PAGE; majListe(); });
  const bFiltre = h("button", { type: "button", class: "sec filtre", onclick: () => { nonPointees = !nonPointees; limite = PAGE; majListe(); } }, "À pointer");
  const bTout = h("button", { type: "button", class: "sec cache", onclick: () => {
    const cibles = affichees.filter((o) => o.statut === "encours");
    if (!cibles.length) return;
    if (!confirm(`Pointer les ${cibles.length} opération(s) affichées ?`)) return;
    const date = aujourdhui();
    ecrireEnParallele(cibles.map((o) => ["operations", o.id, { statut: "pointe", datePointage: date }])).catch((e) => { console.error(e); alert("Échec du pointage : " + e.message); });
  } }, "Tout pointer");
  const rapide = h("div", { class: "rapide cache" });
  const sExport = selecteur([["", "Export : tous"], ["oui", "À exporter"], ["non", "Non exporté"]], "", { "aria-label": "Filtre export" });
  const sCat = selecteur([["", "Catégorie : toutes"], ["avec", "Avec catégorie"], ["sans", "Sans catégorie"], ["aclasser", "🤔 À classer"]], "", { "aria-label": "Filtre catégorie" });
  sExport.addEventListener("change", () => { fExport = sExport.value; limite = PAGE; majListe(); });
  sCat.addEventListener("change", () => { fCat = sCat.value; limite = PAGE; majListe(); });
  const filtres = h("div", { class: "barre filtres" }, sExport, sCat);
  const barre = h("div", { class: "barre barre-recherche" }, iRecherche, bFiltre, bTout);
  const liste = h("div", { class: "liste" });
  const bSelect = h("button", { type: "button", class: "sec", onclick: () => basculerMode() }, "Sélectionner");
  const bRapide = h("button", { type: "button", class: "sec", onclick: () => compte() && formRapide({ compteId: id }) }, "Tableau rapide");
  const bCloture = h("button", { type: "button", class: "sec", onclick: () => compte() && formCloture(compte(), (nb, accord) => {
    message = `${nb} opération(s) pointée(s)` + (accord ? " – clôture en accord avec le relevé." : " – écart non résolu.");
    majListe();
  }) }, "Clôturer un mois");
  const info = h("p", { class: "note" });
  const actionsVue = h("div", { class: "actions-vue" }, bRapide, bSelect, bCloture);
  const nbSel = h("span", { class: "nb" });
  const barreSel = h("div", { class: "barre-selection cache" }, nbSel,
    h("button", { type: "button", class: "sec", onclick: () => { affichees.forEach((o) => choisies.add(o.id)); majListe(); } }, "Tout (affichées)"),
    h("button", { type: "button", class: "sec", onclick: () => { choisies.clear(); majListe(); } }, "Aucune"),
    h("button", { type: "button", onclick: () => {
      const ops = etat.operations.filter((o) => choisies.has(o.id));
      if (!ops.length) return;
      formMasse(ops, (nb, ignorees) => {
        message = `${nb} opération(s) modifiée(s)` + (ignorees ? ` – ${ignorees} ignorée(s) (virements liés ou déjà dans ce compte).` : ".");
        choisies.clear(); mode = false; majListe();
      });
    } }, "Modifier…"),
    h("button", { type: "button", class: "sec", onclick: () => basculerMode() }, "Terminer"));
  const ajout = h("button", { class: "flottant", "aria-label": "Nouvelle opération", onclick: () => compte() && formOperation({ compteId: id }) }, "+");
  conteneur.replaceChildren(enTete, h("div", { class: "resume" }, solde, detailSolde), objectifVue, rapide, actionsVue, info, barre, filtres, liste, ajout, barreSel);

  function basculerMode() { mode = !mode; choisies.clear(); message = ""; majListe(); }

  // Pointage rapide d'une opération (en cours <-> pointé) sans ouvrir la fiche
  function basculer(o) {
    const pointe = o.statut === "pointe";
    const l = lot();
    l.set("operations", o.id, { statut: pointe ? "encours" : "pointe", datePointage: pointe ? null : aujourdhui() });
    l.envoyer();
  }

  function correspond(o, q, nomsCat) {
    const cible = sansAccent([o.nom, o.commentaire, o.info, nomsCat.get(o.categorieId), libelleNature(o.nature), euros(o.montant), dateFr(o.date)].join(" "));
    return q.split(/\s+/).every((mot) => cible.includes(mot));
  }

  function majListe() {
    const c = compte();
    if (!pret()) { solde.replaceChildren(); detailSolde.textContent = ""; titre.textContent = "…"; liste.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    if (!c) { titre.textContent = "Introuvable"; liste.replaceChildren(h("p", { class: "vide" }, "Ce compte n'existe pas.")); return; }
    titre.textContent = c.nom;
    let lignes = lignesAvecSolde(c, etat.operations).reverse();
    const enCours = lignes.length ? lignes[0].solde : c.soldeInitial || 0;
    const pointe = soldePointe(c, etat.operations);
    solde.replaceChildren(
      h("div", { class: "solde-pointe" }, h("small", {}, "En cours"), h("strong", { class: "montant " + (enCours < 0 ? "neg" : "pos") }, euros(enCours))),
      h("em", { class: "solde-encours" }, `pointé : ${euros(pointe)}`));
    objectifVue.replaceChildren(blocObjectif(c, enCours, aujourdhui()));
    // Saisie rapide : habitudes du compte (hors opérations déjà couvertes par une planification)
    const exclus = new Set(etat.planifiees.filter((p) => p.compteId === id || p.virementCompteId === id).map((p) => sansAccent(p.nom).trim()));
    const modeles = habitudes(id, etat.operations, aujourdhui(), exclus);
    rapide.classList.toggle("cache", !modeles.length);
    rapide.replaceChildren(h("span", { class: "rapide-titre" }, "Saisie rapide"),
      ...modeles.map((m) => h("button", { type: "button", class: "puce", title: `${m.nb} fois · dernier montant ${euros(m.dernierMontant)}`,
        onclick: () => formOperation({ compteId: id, modele: { nom: m.nom, categorieId: m.categorieId, nature: m.nature, info: m.info, sens: m.sens, dernierMontant: m.dernierMontant, aExporter: m.aExporter, date: aujourdhui(), statut: "encours" } }) }, m.nom)));
    const aPointer = lignes.filter((x) => x.statut === "encours");
    detailSolde.textContent = aPointer.length ? `${aPointer.length} à pointer` : "";
    bFiltre.classList.toggle("actif-filtre", nonPointees);
    bFiltre.textContent = nonPointees ? "À pointer ✓" : "À pointer";
    if (nonPointees) lignes = aPointer;
    const cats = new Map(etat.categories.map((x) => [x.id, x]));
    const nomsCat = new Map(etat.categories.map((x) => [x.id, x.nom]));
    const q = sansAccent(recherche).trim();
    if (fExport) lignes = lignes.filter((o) => (fExport === "oui") === !!o.aExporter);
    const estVirement = (o) => o.virementId || o.nature === "virement";
    if (fCat === "avec") lignes = lignes.filter((o) => o.categorieId);
    else if (fCat === "sans") lignes = lignes.filter((o) => !o.categorieId && !estVirement(o));
    else if (fCat === "aclasser") lignes = lignes.filter((o) => o.aClasser && !o.categorieId);
    if (q) lignes = lignes.filter((o) => correspond(o, q, nomsCat));
    // Même jour : regroupées par catégorie (parent › sous-catégorie), sans catégorie en dernier
    const libCat = (o) => { const k = cats.get(o.categorieId); if (!k) return ""; const p = k.parentId && cats.get(k.parentId); return p ? `${p.nom} › ${k.nom}` : k.nom; };
    const cle = new Map(lignes.map((o) => [o.id, libCat(o)]));
    lignes = lignes.map((o, i) => [o, i]).sort((a, b) => {
      if (a[0].date !== b[0].date) return a[0].date < b[0].date ? 1 : -1;
      const ca = cle.get(a[0].id), cb = cle.get(b[0].id);
      if (ca !== cb) return !ca ? 1 : !cb ? -1 : ca.localeCompare(cb, "fr");
      return a[1] - b[1];
    }).map((x) => x[0]);
    affichees = lignes;
    // Ne garder que les opérations encore existantes dans la sélection
    const existantes = new Set(etat.operations.map((o) => o.id));
    for (const k of [...choisies]) if (!existantes.has(k)) choisies.delete(k);
    conteneur.classList.toggle("mode-selection", mode);
    bSelect.textContent = mode ? "Terminer" : "Sélectionner";
    barreSel.classList.toggle("cache", !mode);
    ajout.classList.toggle("cache", mode);
    nbSel.textContent = `${choisies.size} sélectionnée(s) / ${lignes.length} affichée(s)`;
    sExport.classList.toggle("filtre-actif", !!fExport); sCat.classList.toggle("filtre-actif", !!fCat);
    info.textContent = message;
    bTout.classList.toggle("cache", !(nonPointees && lignes.some((x) => x.statut === "encours")));
    if (!lignes.length) { liste.replaceChildren(h("p", { class: "vide" }, q ? "Aucun résultat." : nonPointees ? "Aucune opération à pointer." : "Aucune opération. Touchez + pour en ajouter.")); return; }

    const noeuds = [];
    const jourTitre = (iso) => {
      if (iso === aujourdhui()) return "aujourd'hui";
      const hier = new Date(); hier.setDate(hier.getDate() - 1);
      if (iso === `${hier.getFullYear()}-${String(hier.getMonth() + 1).padStart(2, "0")}-${String(hier.getDate()).padStart(2, "0")}`) return "hier";
      const d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
    };
    const parId = new Map(etat.categories.map((x) => [x.id, x]));
    const iconeDe = (cat) => (cat && (cat.icone || (cat.parentId && parId.get(cat.parentId) && parId.get(cat.parentId).icone))) || "";
    let jour = null, carteJour = null;
    for (const o of lignes.slice(0, limite)) {
      if (o.date !== jour) {
        jour = o.date;
        noeuds.push(h("h3", { class: "groupe" }, jourTitre(jour)));
        carteJour = h("div", { class: "carte-jour" });
        noeuds.push(carteJour);
      }
      const cat = cats.get(o.categorieId);
      const choisie = choisies.has(o.id);
      const virement = !!o.virementId || o.nature === "virement";
      const glyphe = virement ? "⇄" : iconeDe(cat) || "•";
      const teinte = !virement && cat && cat.couleur ? `background:${cat.couleur}26` : "";
      const libCat = virement ? "Virement" : cat ? (cat.parentId && parId.get(cat.parentId) ? `${parId.get(cat.parentId).nom} › ${cat.nom}` : cat.nom) : o.aClasser ? "🤔 À classer" : "Sans catégorie";
      let icone;
      if (mode) icone = h("span", { class: "op-icone sel", "aria-hidden": "true", onclick: () => { if (choisies.has(o.id)) choisies.delete(o.id); else choisies.add(o.id); majListe(); } }, choisie ? "☑" : "☐");
      else {
        const coche = o.statut === "pointe" ? h("span", { class: "coche" }, "✓") : o.statut === "annule" ? h("span", { class: "coche annule" }, "✕") : null;
        icone = h(o.statut === "annule" ? "span" : "button", {
          type: o.statut === "annule" ? null : "button", class: "op-icone", style: teinte,
          "aria-label": o.statut === "pointe" ? "Dépointer" : o.statut === "annule" ? "Annulée" : "Pointer",
          title: o.statut === "pointe" ? "Pointée : toucher pour dépointer" : o.statut === "annule" ? "Annulée" : "En cours : toucher pour pointer",
          onclick: o.statut === "annule" ? null : () => basculer(o)
        }, h("span", { class: "glyphe" }, glyphe), coche);
      }
      carteJour.append(h("div", { class: "op-ligne" + (o.statut === "annule" ? " annule" : "") + (mode && choisie ? " choisie" : "") },
        icone,
        h("button", { type: "button", class: "op-corps", onclick: () => {
          if (mode) { if (choisies.has(o.id)) choisies.delete(o.id); else choisies.add(o.id); majListe(); return; }
          formOperation({ compteId: id, op: etat.operations.find((x) => x.id === o.id) });
        } },
          h("span", { class: "op-texte" }, h("span", { class: "op-nom" }, o.nom), h("small", { class: "op-cat" }, libCat)),
          h("span", { class: "montant op-montant " + (o.montant < 0 ? "neg" : "pos") }, euros(o.montant)))));
    }
    if (lignes.length > limite) {
      noeuds.push(h("button", { class: "sec plus", onclick: () => { limite += PAGE; majListe(); } }, `Afficher plus (${lignes.length - limite} restantes)`));
    }
    liste.replaceChildren(...noeuds);
  }

  majListe();
  return { maj: majListe };
}
