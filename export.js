import { etat, pret, comparerComptes } from "./store.js";
import { aujourdhui, dateFr, euros } from "./format.js";
import { h, selecteur, champ } from "./ui.js";
import { selectionner, lignesExport, construireXlsx, montantTexte } from "./exportation.js";

const p2 = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
const slug = (s) => String(s || "compte").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "compte";

export function monter(conteneur, { id } = {}) {
  const [a, m] = aujourdhui().split("-").map(Number);
  const debutMois = (annee, mois) => iso(new Date(Date.UTC(annee, mois - 1, 1)));
  const finMois = (annee, mois) => iso(new Date(Date.UTC(annee, mois, 0)));

  const iCompte = h("select");
  const iDu = h("input", { type: "date", value: debutMois(a, m) });
  const iAu = h("input", { type: "date", value: aujourdhui() });
  const iMarquees = h("input", { type: "checkbox", checked: true });
  const iSansEsp = h("input", { type: "checkbox" });
  const iEntete = h("input", { type: "checkbox" });
  const iFormat = selecteur([["texte", "Texte avec virgule (12,50)"], ["nombre", "Nombre (calculable)"]], "texte");
  const apercu = h("div");
  const boutons = h("div", { class: "actions" });

  function preset(annee, mois, jusqua) { iDu.value = debutMois(annee, mois); iAu.value = jusqua || finMois(annee, mois); maj(); }
  const precedent = m === 1 ? [a - 1, 12] : [a, m - 1];

  conteneur.replaceChildren(
    h("div", { class: "carte" },
      h("h2", {}, "Export Excel"),
      h("p", { class: "note" }, "Fichier .xlsx à deux colonnes : titre et montant. Le statut des opérations n'est pas pris en compte."),
      champ("Compte", iCompte),
      h("div", { class: "deux" }, champ("Du", iDu), champ("Au", iAu)),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "sec", onclick: () => preset(a, m, aujourdhui()) }, "Mois en cours"),
        h("button", { type: "button", class: "sec", onclick: () => preset(precedent[0], precedent[1]) }, "Mois précédent")),
      h("label", { class: "case" }, iMarquees, "Seulement les opérations « à exporter »"),
      h("label", { class: "case" }, iSansEsp, "Supprimer aussi les espaces dans les titres"),
      h("label", { class: "case" }, iEntete, "Ajouter une ligne d'en-tête (Titre, Montant)"),
      champ("Format du montant", iFormat)),
    apercu, boutons);

  function reconstruireComptes() {
    const valeur = iCompte.value || id || "";
    const comptes = etat.comptes.filter((c) => !c.archive || c.id === valeur).sort(comparerComptes);
    iCompte.replaceChildren(...[["", "Tous les comptes"], ...comptes.map((c) => [c.id, c.nom])].map(([v, l]) => h("option", { value: v }, l)));
    iCompte.value = comptes.some((c) => c.id === valeur) ? valeur : (comptes[0] ? comptes[0].id : "");
  }

  function courant() {
    const ops = selectionner(etat.operations, { compteId: iCompte.value, du: iDu.value, au: iAu.value, seulementMarquees: iMarquees.checked });
    const lignes = lignesExport(ops, { sansEspaces: iSansEsp.checked });
    const options = { montantEnTexte: iFormat.value === "texte", entete: iEntete.checked };
    const compte = etat.comptes.find((c) => c.id === iCompte.value);
    const nom = `export_${compte ? slug(compte.nom) : "tous-les-comptes"}_${iDu.value}_${iAu.value}.xlsx`;
    return { ops, lignes, options, nom };
  }

  function telecharger() {
    const { lignes, options, nom } = courant();
    const url = URL.createObjectURL(construireXlsx(lignes, options));
    const lien = h("a", { href: url, download: nom });
    document.body.append(lien); lien.click(); lien.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  async function partager() {
    const { lignes, options, nom } = courant();
    const blob = construireXlsx(lignes, options);
    const fichier = new File([blob], nom, { type: blob.type });
    try { await navigator.share({ files: [fichier], title: nom }); } catch (e) { if (e.name !== "AbortError") console.error(e); }
  }

  function maj() {
    if (!pret()) { apercu.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    if (!iCompte.options.length) reconstruireComptes();
    if (!iDu.value || !iAu.value) { apercu.replaceChildren(h("p", { class: "note" }, "Choisissez les deux dates.")); boutons.replaceChildren(); return; }
    if (iDu.value > iAu.value) { apercu.replaceChildren(h("p", { class: "erreur" }, "La date de début est postérieure à la date de fin.")); boutons.replaceChildren(); return; }
    const { ops, lignes, options } = courant();
    const total = ops.reduce((s, o) => s + o.montant, 0);
    const annulees = ops.filter((o) => o.statut === "annule").length;
    apercu.replaceChildren(h("div", { class: "carte" },
      h("p", {}, h("strong", {}, `${ops.length} opération(s)`), ` du ${dateFr(iDu.value)} au ${dateFr(iAu.value)} – total ${euros(total)}.`),
      annulees ? h("p", { class: "note" }, `Dont ${annulees} annulée(s), incluse(s) car le statut n'est pas pris en compte.`) : null,
      ops.length ? h("ul", { class: "puces" }, lignes.slice(0, 10).map((l) => h("li", {}, `${l.titre} ; ${options.montantEnTexte ? montantTexte(l.montant) : l.montant / 100}`))) : h("p", { class: "note" }, "Aucune opération pour ces critères. Cochez « Inclure dans l'export » dans les opérations concernées, ou décochez l'option ci-dessus."),
      ops.length > 10 ? h("p", { class: "note" }, `… et ${ops.length - 10} autre(s).`) : null));
    boutons.replaceChildren(
      h("button", { type: "button", disabled: ops.length ? null : true, onclick: telecharger }, "Télécharger le fichier Excel"),
      typeof navigator.canShare === "function" && navigator.canShare({ files: [new File(["x"], "t.xlsx", { type: "application/octet-stream" })] })
        ? h("button", { type: "button", class: "sec", disabled: ops.length ? null : true, onclick: partager }, "Partager / Enregistrer") : null);
  }

  for (const el of [iCompte, iDu, iAu, iMarquees, iSansEsp, iEntete, iFormat]) el.addEventListener("change", maj);
  reconstruireComptes();
  maj();
  return { maj() { if (!iCompte.options.length || pret()) { if (!iCompte.options.length) reconstruireComptes(); maj(); } } };
}
