// Écran « Relevé bancaire » : lecture d'un fichier (CSV, OFX, QIF), pointage automatique et création des lignes manquantes.
import { etat, pret, lot, nouvelId, serverTimestamp, compteDepenseParDefaut, comparerComptes } from "./store.js";
import { euros, dateFr, aujourdhui } from "./format.js";
import { h, champ, selecteur } from "./ui.js";
import { decoder } from "./importcsv.js";
import { lireReleve, rapprocher } from "./releve.js";

export function monter(conteneur) {
  const actifs = () => etat.comptes.filter((c) => !c.archive).sort(comparerComptes);
  const iCompte = h("select", { "aria-label": "Compte" });
  const iFichier = h("input", { type: "file", accept: ".csv,.ofx,.qfx,.qif,.txt,text/csv,text/plain" });
  const zone = h("div");
  let releve = null, resultat = null, nomFichier = "";
  const cochesPaires = [], cochesManquantes = [];

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

  async function analyser() {
    zone.replaceChildren();
    const f = iFichier.files && iFichier.files[0];
    if (!f) return;
    if (!pret() || !iCompte.value) { zone.replaceChildren(h("p", { class: "erreur" }, "Données non chargées ou aucun compte.")); return; }
    nomFichier = f.name;
    const r = lireReleve(decoder(await f.arrayBuffer()), f.name);
    if (r.erreur) { zone.replaceChildren(h("p", { class: "erreur" }, r.erreur)); return; }
    releve = r;
    resultat = rapprocher({ lignes: r.lignes, operations: etat.operations, compteId: iCompte.value });
    afficher();
  }
  iFichier.addEventListener("change", analyser);
  iCompte.addEventListener("change", () => { if (iFichier.files && iFichier.files[0]) analyser(); });

  function afficher(message = "") {
    cochesPaires.length = 0; cochesManquantes.length = 0;
    const { paires, dejaPointees, manquantes, absentes } = resultat;
    const noeuds = [];
    noeuds.push(h("div", { class: "carte" },
      h("p", {}, `${releve.lignes.length} ligne(s) lues (${releve.format}), du ${dateFr(releve.lignes[0].date)} au ${dateFr(releve.lignes[releve.lignes.length - 1].date)}.`),
      h("ul", { class: "puces" },
        h("li", {}, `${paires.length} à pointer (correspondance trouvée)`),
        h("li", {}, `${dejaPointees.length} déjà pointée(s)`),
        h("li", {}, `${manquantes.length} sans équivalent dans l'application`),
        absentes.length ? h("li", {}, `${absentes.length} opération(s) en cours absente(s) du relevé`) : null),
      message ? h("p", { class: "note" }, message) : null));

    if (paires.length) {
      noeuds.push(h("h3", { class: "groupe" }, "À pointer"));
      noeuds.push(h("div", { class: "carte-jour" }, paires.map((p) => {
        const c = h("input", { type: "checkbox", checked: true }); cochesPaires.push([c, p]);
        return h("label", { class: "ligne-eco" }, c,
          h("div", { class: "eco-texte" }, h("strong", {}, p.operation.nom), h("small", {}, `relevé : ${p.ligne.libelle || "—"} · ${dateFr(p.ligne.date)}`)),
          h("span", { class: "montant " + (p.ligne.montant < 0 ? "neg" : "pos") }, euros(p.ligne.montant)));
      })));
    }
    if (manquantes.length) {
      noeuds.push(h("h3", { class: "groupe" }, "Sans équivalent : à créer (déjà pointées)"));
      noeuds.push(h("div", { class: "carte-jour" }, manquantes.map((l) => {
        const c = h("input", { type: "checkbox", checked: true });
        const nom = h("input", { type: "text", value: l.libelle || "Opération du relevé", "aria-label": "Nom de l'opération", autocomplete: "off" });
        cochesManquantes.push([c, nom, l]);
        return h("div", { class: "ligne-eco" }, c,
          h("div", { class: "eco-texte" }, nom, h("small", {}, dateFr(l.date))),
          h("span", { class: "montant " + (l.montant < 0 ? "neg" : "pos") }, euros(l.montant)));
      })));
    }
    if (absentes.length) {
      noeuds.push(h("h3", { class: "groupe" }, "En cours, absentes du relevé"));
      noeuds.push(h("div", { class: "carte-jour" }, absentes.map((o) => h("div", { class: "ligne-eco" },
        h("div", { class: "eco-texte" }, h("strong", {}, o.nom), h("small", {}, dateFr(o.date))),
        h("span", { class: "montant" }, euros(o.montant))))));
      noeuds.push(h("p", { class: "note" }, "Ces opérations ne sont pas modifiées : elles n'ont pas encore été débitées ou créditées, ou comportent une erreur de date ou de montant."));
    }
    if (paires.length || manquantes.length) noeuds.push(h("div", { class: "actions barre-fixe" }, h("button", { type: "button", onclick: appliquer }, "Appliquer")));
    zone.replaceChildren(...noeuds);
  }

  async function appliquer() {
    const compteId = iCompte.value;
    const aPointer = cochesPaires.filter(([c]) => c.checked).map(([, p]) => p.operation.id);
    const aCreer = cochesManquantes.filter(([c]) => c.checked).map(([, n, l]) => ({ nom: n.value.trim() || "Opération du relevé", ligne: l }));
    if (!aPointer.length && !aCreer.length) return;
    const jour = aujourdhui();
    const taches = [
      ...aPointer.map((id) => (l) => l.set("operations", id, { statut: "pointe", datePointage: jour })),
      ...aCreer.map((x) => (l) => l.set("operations", nouvelId("operations"), {
        nom: x.nom, commentaire: "Importé du relevé", date: x.ligne.date, montant: x.ligne.montant, compteId,
        statut: "pointe", datePointage: jour, nature: "autre", categorieId: null, aClasser: true, info: "", aExporter: true, virementId: null, cree: serverTimestamp() }))
    ];
    try {
      for (let i = 0; i < taches.length; i += 300) {
        const l = lot();
        taches.slice(i, i + 300).forEach((t) => t(l));
        await l.envoyer();
      }
    } catch (e) { console.error(e); zone.prepend(h("p", { class: "erreur" }, "Écriture impossible : vérifiez la connexion et réessayez.")); return; }
    const msg = `${aPointer.length} opération(s) pointée(s), ${aCreer.length} créée(s).`;
    iFichier.value = "";
    releve = null; resultat = null;
    zone.replaceChildren(h("div", { class: "carte" }, h("p", {}, msg), h("p", { class: "note" }, "Les opérations créées sont marquées « à classer » : tu peux leur donner une catégorie depuis le compte.")));
  }

  return { maj() { remplirComptes(); } };
}
