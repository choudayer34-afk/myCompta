// Écran « Relevé bancaire » : lecture d'un fichier (CSV, OFX, QIF), vue ligne par ligne, rapprochement ajustable,
// pointage automatique et création des lignes manquantes. Rien n'est écrit avant « Appliquer ».
import { etat, pret, lot, nouvelId, serverTimestamp, compteDepenseParDefaut, comparerComptes } from "./store.js";
import { euros, dateFr, aujourdhui } from "./format.js";
import { h, champ, modale } from "./ui.js";
import { decoder } from "./importcsv.js";
import { lireReleve, rapprocher } from "./releve.js";

const JOUR = 86400000;
const ecartJours = (a, b) => Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / JOUR;

export function monter(conteneur) {
  const actifs = () => etat.comptes.filter((c) => !c.archive).sort(comparerComptes);
  const iCompte = h("select", { "aria-label": "Compte" });
  const iFichier = h("input", { type: "file", accept: ".csv,.ofx,.qfx,.qif,.txt,text/csv,text/plain" });
  const zone = h("div");
  let releve = null, absentesBase = [], items = [], filtre = "tout";
  // items : { ligne, mode: "op" | "deja" | "creer" | "ignorer", opId, pointer, corriger, nom, creer }

  const remplirComptes = () => {
    if (iCompte.options.length === actifs().length) return;
    const par = compteDepenseParDefaut();
    iCompte.replaceChildren(...actifs().map((c) => h("option", { value: c.id, selected: par && par.id === c.id ? true : null }, c.nom)));
  };

  conteneur.replaceChildren(
    h("h2", {}, "Relevé bancaire"),
    h("div", { class: "carte" },
      h("p", { class: "note" }, "Fichier téléchargé depuis le site de ta banque : CSV, OFX ou QIF. Pour un fichier Excel, enregistre-le d'abord au format CSV. Rien n'est modifié avant ta confirmation."),
      champ("Compte", iCompte),
      h("div", { class: "champ" }, h("label", {}, "Fichier du relevé"), iFichier)),
    zone);

  const operation = (id) => etat.operations.find((o) => o.id === id);

  async function analyser() {
    zone.replaceChildren();
    const f = iFichier.files && iFichier.files[0];
    if (!f) return;
    if (!pret() || !iCompte.value) { zone.replaceChildren(h("p", { class: "erreur" }, "Données non chargées ou aucun compte.")); return; }
    const r = lireReleve(decoder(await f.arrayBuffer()), f.name);
    if (r.erreur) { zone.replaceChildren(h("p", { class: "erreur" }, r.erreur)); return; }
    releve = r; filtre = "tout";
    const res = rapprocher({ lignes: r.lignes, operations: etat.operations, compteId: iCompte.value });
    absentesBase = res.absentes;
    const parLigne = new Map();
    for (const p of res.paires) parLigne.set(p.ligne, { mode: "op", opId: p.operation.id, pointer: true, corriger: false });
    for (const p of res.dejaPointees) parLigne.set(p.ligne, { mode: "deja", opId: p.operation.id });
    items = r.lignes.map((ligne) => ({ ligne, nom: ligne.libelle || "Opération du relevé", creer: true, ...(parLigne.get(ligne) || { mode: "creer" }) }));
    afficher();
  }
  iFichier.addEventListener("change", analyser);
  iCompte.addEventListener("change", () => { if (iFichier.files && iFichier.files[0]) analyser(); });

  const utilisees = (sauf) => new Set(items.filter((x) => x !== sauf && (x.mode === "op" || x.mode === "deja")).map((x) => x.opId));
  const montantDiff = (it) => { const o = it.opId && operation(it.opId); return o && o.montant !== it.ligne.montant ? o : null; };

  // Choix d'une autre opération pour une ligne
  function choisir(it) {
    const prises = utilisees(it);
    const candidates = etat.operations.filter((o) => o.compteId === iCompte.value && o.statut === "encours" && !prises.has(o.id));
    const note = (o) => (o.montant === it.ligne.montant ? 0 : 1);
    candidates.sort((a, b) => note(a) - note(b) || ecartJours(a.date, it.ligne.date) - ecartJours(b.date, it.ligne.date));
    const iFiltre = h("input", { type: "search", class: "recherche", placeholder: "Filtrer par nom ou montant", autocomplete: "off" });
    const liste = h("div", { class: "carte-jour" });
    const fermer = () => dialogue.close();
    const majListe = () => {
      const q = iFiltre.value.trim().toLowerCase();
      const vus = candidates.filter((o) => !q || `${o.nom} ${euros(o.montant)}`.toLowerCase().includes(q)).slice(0, 40);
      liste.replaceChildren(...(vus.length ? vus.map((o) => h("button", { type: "button", class: "ligne-eco bouton-ligne", onclick: () => {
        it.mode = "op"; it.opId = o.id; it.pointer = true; it.corriger = o.montant !== it.ligne.montant; fermer(); afficher();
      } },
        h("div", { class: "eco-texte" }, h("strong", {}, o.nom), h("small", {}, dateFr(o.date) + (o.montant !== it.ligne.montant ? " · montant différent du relevé" : ""))),
        h("span", { class: "montant " + (o.montant < 0 ? "neg" : "pos") }, euros(o.montant)))) : [h("p", { class: "vide" }, "Aucune opération en cours correspondante.")]));
    };
    iFiltre.addEventListener("input", majListe);
    const { dialogue } = modale("Choisir l'opération", [
      h("p", { class: "note" }, `Ligne du relevé : ${it.ligne.libelle || "—"} · ${dateFr(it.ligne.date)} · ${euros(it.ligne.montant)}`),
      iFiltre, liste,
      h("div", { class: "actions" },
        h("button", { type: "button", class: "sec", onclick: () => { it.mode = "creer"; it.opId = null; fermer(); afficher(); } }, "Aucune : créer une opération"),
        h("button", { type: "button", class: "sec", onclick: () => { it.mode = "ignorer"; it.opId = null; fermer(); afficher(); } }, "Ignorer cette ligne"),
        h("button", { type: "button", class: "sec", onclick: fermer }, "Annuler"))]);
    majListe();
  }

  const compteur = h("div", { class: "carte" });
  function majResume() {
    const n = (m) => items.filter((x) => x.mode === m).length;
    const aPointer = items.filter((x) => x.mode === "op" && x.pointer).length;
    const aCreer = items.filter((x) => x.mode === "creer" && x.creer).length;
    const diff = items.filter((x) => x.mode === "op" && montantDiff(x)).length;
    compteur.replaceChildren(
      h("p", {}, `${releve.lignes.length} ligne(s) lues (${releve.format}), du ${dateFr(releve.lignes[0].date)} au ${dateFr(releve.lignes[releve.lignes.length - 1].date)}.`),
      h("ul", { class: "puces" },
        h("li", {}, `${aPointer} opération(s) à pointer`),
        h("li", {}, `${aCreer} opération(s) à créer`),
        h("li", {}, `${n("deja")} ligne(s) déjà pointée(s)`),
        n("ignorer") ? h("li", {}, `${n("ignorer")} ligne(s) ignorée(s)`) : null,
        diff ? h("li", {}, `${diff} rapprochement(s) avec un montant différent`) : null));
  }

  function afficher() {
    const visible = (it) => filtre === "tout" || (filtre === "verifier" ? (it.mode === "creer" || it.mode === "ignorer" || !!montantDiff(it)) : it.mode === "op" || it.mode === "deja");
    const bouton = (id, lib) => h("button", { type: "button", class: "sec" + (filtre === id ? " actif-filtre" : ""), onclick: () => { filtre = id; afficher(); } }, lib);
    majResume();
    const noeuds = [compteur, h("div", { class: "modes-bilan" }, bouton("tout", "Toutes"), bouton("verifier", "À vérifier"), bouton("rapprochees", "Rapprochées"))];

    const lignes = items.filter(visible);
    noeuds.push(h("div", { class: "carte-jour" }, lignes.length ? lignes.map((it) => {
      const o = it.opId ? operation(it.opId) : null;
      const diff = montantDiff(it);
      let etatLigne;
      if (it.mode === "op" && o) {
        const c = h("input", { type: "checkbox", checked: it.pointer ? true : null, "aria-label": "Pointer" });
        c.addEventListener("change", () => { it.pointer = c.checked; majResume(); });
        etatLigne = h("div", { class: "etat-ligne" },
          h("label", { class: "case" }, c, `Pointer : ${o.nom} (${dateFr(o.date)}, ${euros(o.montant)})`),
          diff ? (() => {
            const k = h("input", { type: "checkbox", checked: it.corriger ? true : null });
            k.addEventListener("change", () => { it.corriger = k.checked; });
            return h("label", { class: "case avert" }, k, `Montant différent : corriger l'opération à ${euros(it.ligne.montant)}`);
          })() : null,
          h("button", { type: "button", class: "sec petit-bouton", onclick: () => choisir(it) }, "Changer"));
      } else if (it.mode === "deja" && o) {
        etatLigne = h("div", { class: "etat-ligne" }, h("small", {}, `Déjà pointée : ${o.nom} (${dateFr(o.date)})`),
          h("button", { type: "button", class: "sec petit-bouton", onclick: () => choisir(it) }, "Changer"));
      } else if (it.mode === "ignorer") {
        etatLigne = h("div", { class: "etat-ligne" }, h("small", {}, "Ligne ignorée"),
          h("button", { type: "button", class: "sec petit-bouton", onclick: () => choisir(it) }, "Relier"));
      } else {
        const c = h("input", { type: "checkbox", checked: it.creer ? true : null, "aria-label": "Créer" });
        c.addEventListener("change", () => { it.creer = c.checked; majResume(); });
        const nom = h("input", { type: "text", value: it.nom, "aria-label": "Nom de l'opération", autocomplete: "off" });
        nom.addEventListener("input", () => { it.nom = nom.value; });
        etatLigne = h("div", { class: "etat-ligne" }, h("label", { class: "case" }, c, "Créer (déjà pointée) :"), nom,
          h("button", { type: "button", class: "sec petit-bouton", onclick: () => choisir(it) }, "Relier à une opération"));
      }
      return h("div", { class: "ligne-releve" },
        h("div", { class: "entete-releve" },
          h("div", { class: "eco-texte" }, h("strong", {}, it.ligne.libelle || "—"), h("small", {}, dateFr(it.ligne.date))),
          h("span", { class: "montant " + (it.ligne.montant < 0 ? "neg" : "pos") }, euros(it.ligne.montant))),
        etatLigne);
    }) : [h("p", { class: "vide" }, "Aucune ligne dans ce filtre.")]));

    const absentes = absentesBase.filter((o) => o.statut === "encours" && !utilisees(null).has(o.id));
    if (absentes.length) {
      noeuds.push(h("h3", { class: "groupe" }, "En cours, absentes du relevé"));
      noeuds.push(h("div", { class: "carte-jour" }, absentes.map((o) => h("div", { class: "ligne-eco" },
        h("div", { class: "eco-texte" }, h("strong", {}, o.nom), h("small", {}, dateFr(o.date))),
        h("span", { class: "montant" }, euros(o.montant))))));
      noeuds.push(h("p", { class: "note" }, "Ces opérations ne sont pas modifiées : elles n'ont pas encore été débitées ou créditées, ou comportent une erreur de date ou de montant. Utilise « Changer » sur une ligne pour les rattacher."));
    }
    noeuds.push(h("div", { class: "actions barre-fixe" }, h("button", { type: "button", onclick: appliquer }, "Appliquer")));
    zone.replaceChildren(...noeuds);
  }

  async function appliquer() {
    const compteId = iCompte.value;
    const aPointer = items.filter((x) => x.mode === "op" && x.pointer && operation(x.opId));
    const aCreer = items.filter((x) => x.mode === "creer" && x.creer);
    if (!aPointer.length && !aCreer.length) return;
    const jour = aujourdhui();
    const taches = [
      ...aPointer.map((x) => (l) => l.set("operations", x.opId, { statut: "pointe", datePointage: jour, ...(x.corriger && montantDiff(x) ? { montant: x.ligne.montant } : {}) })),
      ...aCreer.map((x) => (l) => l.set("operations", nouvelId("operations"), {
        nom: x.nom.trim() || "Opération du relevé", commentaire: "Importé du relevé", date: x.ligne.date, montant: x.ligne.montant, compteId,
        statut: "pointe", datePointage: jour, nature: "autre", categorieId: null, aClasser: true, info: "", aExporter: true, virementId: null, cree: serverTimestamp() }))
    ];
    try {
      for (let i = 0; i < taches.length; i += 300) {
        const l = lot();
        taches.slice(i, i + 300).forEach((t) => t(l));
        await l.envoyer();
      }
    } catch (e) { console.error(e); zone.prepend(h("p", { class: "erreur" }, "Écriture impossible : vérifiez la connexion et réessayez.")); return; }
    const corrigees = aPointer.filter((x) => x.corriger).length;
    const msg = `${aPointer.length} opération(s) pointée(s)` + (corrigees ? ` (dont ${corrigees} montant(s) corrigé(s))` : "") + `, ${aCreer.length} créée(s).`;
    iFichier.value = "";
    releve = null; items = [];
    zone.replaceChildren(h("div", { class: "carte" }, h("p", {}, msg), h("p", { class: "note" }, "Les opérations créées sont marquées « à classer » : tu peux leur donner une catégorie depuis le compte.")));
  }

  return { maj() { remplirComptes(); } };
}
