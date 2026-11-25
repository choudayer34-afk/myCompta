// Écran « Provisions » (onglet de Budgets) : dépenses non mensuelles lissées sur N mois, suivi du provisionné,
// rattachement du règlement et renouvellement du cycle. Données dans reglages/provisions : { liste: [...] }.
import { etat, lot, pret } from "./store.js";
import { euros, versCentimes, versSaisie, aujourdhui, dateFr, sansAccent } from "./format.js";
import { h, modale, champ, selecteur } from "./ui.js";
import { estTerminee, libelleFrequence } from "./planning.js";
import { etatProvision, ajouterMois } from "./provisions.js";

const liste = () => ((etat.reglages.find((r) => r.id === "provisions") || {}).liste || []);
function sauver(nouvelle) { const l = lot(); l.set("reglages", "provisions", { liste: nouvelle }); l.envoyer(); }
const calculer = (prov) => etatProvision(prov, etat.operations, etat.planifiees, aujourdhui());

// Création / modification d'une provision
function formProvision(prov = null) {
  const autres = new Set(liste().filter((p) => !prov || p.id !== prov.id).flatMap((p) => p.planifieesIds || []));
  const miennes = new Set(prov ? prov.planifieesIds || [] : []);
  const candidates = etat.planifiees.filter((p) => !autres.has(p.id) && (miennes.has(p.id) || (p.montant < 0 && !estTerminee(p))))
    .sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
  const iNom = h("input", { type: "text", required: true, value: prov?.nom || "", autocomplete: "off" });
  const iMontant = h("input", { type: "text", inputmode: "decimal", required: true, placeholder: "0,00", autocomplete: "off", value: prov ? versSaisie(prov.montant) : "" });
  const iDuree = h("input", { type: "number", min: "1", max: "60", step: "1", required: true, value: String(prov?.duree || 12) });
  const iEch = h("input", { type: "date", required: true, value: prov?.echeance || ajouterMois(aujourdhui(), 12) });
  const cases = candidates.map((p) => {
    const i = h("input", { type: "checkbox", checked: miennes.has(p.id) || null });
    i.dataset.id = p.id;
    return h("label", { class: "case" }, i, `${p.nom} · ${euros(Math.abs(p.montant))} · ${libelleFrequence(p.frequence)}`);
  });
  const erreur = h("p", { class: "erreur" });
  const dernier = prov && (prov.reglements || [])[(prov.reglements || []).length - 1];
  const corps = h("div", {},
    champ("Nom", iNom),
    champ("Montant à couvrir par cycle (€)", iMontant),
    champ("Durée du cycle (mois)", iDuree),
    champ("Prochaine échéance (date du règlement)", iEch),
    h("p", { class: "note" }, "Mensualité = montant ÷ durée. Le cycle n'a pas à suivre l'année civile ; une durée plus courte (3, 6 mois) se renouvelle de la même façon."),
    h("h3", { class: "groupe" }, "Échéances qui alimentent la provision"),
    cases.length ? h("div", {}, ...cases) : h("p", { class: "vide" }, "Aucune échéance de dépense disponible."),
    erreur,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Enregistrer"),
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"),
      dernier && dernier.avant && h("button", { type: "button", class: "sec", onclick: () => {
        if (!confirm("Annuler le dernier règlement rattaché et revenir au cycle précédent ?")) return;
        const reglements = prov.reglements.slice(0, -1);
        sauver(liste().map((p) => (p.id === prov.id ? { ...prov, reglements, echeance: dernier.avant.echeance, montant: dernier.avant.montant, report: dernier.avant.report } : p)));
        dialogue.close();
      } }, "Annuler le dernier règlement"),
      prov && h("button", { type: "button", class: "danger", onclick: () => {
        if (!confirm("Supprimer cette provision ? Les échéances et les opérations ne sont pas modifiées.")) return;
        sauver(liste().filter((p) => p.id !== prov.id));
        dialogue.close();
      } }, "Supprimer")));
  const { dialogue, formulaire } = modale(prov ? "Modifier la provision" : "Nouvelle provision", corps);
  formulaire.addEventListener("submit", (e) => {
    e.preventDefault();
    const m = versCentimes(iMontant.value);
    const duree = Math.round(Number(iDuree.value));
    if (!iNom.value.trim()) { erreur.textContent = "Indiquez un nom."; return; }
    if (m == null || m <= 0) { erreur.textContent = "Saisissez un montant supérieur à zéro."; return; }
    if (!(duree >= 1 && duree <= 60)) { erreur.textContent = "La durée doit être comprise entre 1 et 60 mois."; return; }
    if (!iEch.value) { erreur.textContent = "Indiquez la prochaine échéance."; return; }
    const ids = [...corps.querySelectorAll("input[type=checkbox]")].filter((i) => i.checked).map((i) => i.dataset.id);
    const nouvelle = { id: prov?.id || String(Date.now()), nom: iNom.value.trim(), montant: Math.abs(m), duree, echeance: iEch.value,
      jourAncre: +iEch.value.slice(8, 10), planifieesIds: ids, report: prov?.report || 0, reglements: prov?.reglements || [] };
    sauver(prov ? liste().map((p) => (p.id === prov.id ? nouvelle : p)) : [...liste(), nouvelle]);
    dialogue.close();
  });
}

// Rattachement du règlement : choix de l'opération, puis récapitulatif (écart, report, montant du cycle suivant)
function formReglement(prov) {
  const e = calculer(prov);
  const utilisees = new Set(liste().flatMap((p) => (p.reglements || []).map((r) => r.opId)));
  const liees = new Set(prov.planifieesIds || []);
  const depuis = ajouterMois(e.debut, -1, prov.jourAncre);
  const candidats = etat.operations
    .filter((o) => o.statut !== "annule" && o.montant < 0 && !o.virementId && !utilisees.has(o.id) && !(o.planifieeId && liees.has(o.planifieeId)) && o.date >= depuis)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const zone = h("div", {});
  const { dialogue, formulaire } = modale(`Règlement : ${prov.nom}`, zone);
  formulaire.addEventListener("submit", (ev) => ev.preventDefault());
  const comptes = new Map(etat.comptes.map((c) => [c.id, c.nom]));

  function choix() {
    const iRecherche = h("input", { type: "search", placeholder: "Filtrer par mot (nom, compte…)", class: "recherche", autocomplete: "off" });
    const resultats = h("div", {});
    const maj = () => {
      const q = sansAccent(iRecherche.value).trim();
      const filtres = candidats.filter((o) => !q || q.split(/\s+/).every((m) => sansAccent([o.nom, o.commentaire, comptes.get(o.compteId)].join(" ")).includes(m)));
      resultats.replaceChildren(...(filtres.length ? filtres.slice(0, 60).map((o) => h("button", { type: "button", class: "carte ligne-hors", onclick: () => recap(o) },
        h("span", {}, `${o.nom} · ${dateFr(o.date)} · ${comptes.get(o.compteId) || ""}`), h("strong", {}, euros(Math.abs(o.montant)))))
        : [h("p", { class: "vide" }, "Aucune dépense récente ne correspond.")]));
    };
    iRecherche.addEventListener("input", maj);
    zone.replaceChildren(
      h("p", { class: "note" }, "Choisissez l'opération qui règle cette dépense. Le cycle suivant démarre ensuite."),
      iRecherche, resultats,
      h("div", { class: "actions" }, h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
    maj();
  }

  function recap(op) {
    const regle = Math.abs(op.montant);
    const ecart = e.provisionne - regle;
    const precedent = (prov.reglements || [])[(prov.reglements || []).length - 1];
    const variation = precedent && precedent.montant ? ((regle - precedent.montant) / precedent.montant) * 100 : null;
    const iEcart = selecteur([["reporter", "Reporter l'écart sur le cycle suivant"], ["solder", "Solder l'écart (repartir de zéro)"]], "reporter");
    const iSuivant = selecteur([["regle", `Reprendre le montant réglé (${euros(regle)})`], ["garde", `Garder le montant actuel (${euros(prov.montant)})`], ["autre", "Saisir un autre montant"]], "regle");
    const iAutre = h("input", { type: "text", inputmode: "decimal", placeholder: "0,00", autocomplete: "off" });
    const cAutre = champ("Autre montant (€)", iAutre);
    const apercu = h("p", { class: "note" });
    const montantSuivant = () => (iSuivant.value === "regle" ? regle : iSuivant.value === "garde" ? prov.montant : versCentimes(iAutre.value));
    const reportSuivant = () => (iEcart.value === "reporter" ? ecart : 0);
    const erreur = h("p", { class: "erreur" });
    function majApercu() {
      cAutre.hidden = iSuivant.value !== "autre";
      const m = montantSuivant();
      apercu.textContent = m && m > 0
        ? `Cycle suivant jusqu'au ${dateFr(ajouterMois(prov.echeance, prov.duree, prov.jourAncre))} : mensualité ${euros(Math.round((m - reportSuivant()) / prov.duree))}.`
        : "";
    }
    iEcart.addEventListener("change", majApercu); iSuivant.addEventListener("change", majApercu); iAutre.addEventListener("input", majApercu);
    zone.replaceChildren(
      h("div", { class: "carte synthese-budget" },
        h("div", { class: "ligne-synthese" }, h("span", {}, "Règlement"), h("strong", {}, `${op.nom} · ${euros(regle)}`)),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Provisionné sur le cycle"), h("strong", {}, euros(e.provisionne))),
        h("div", { class: "ligne-synthese" }, h("span", {}, ecart >= 0 ? "Excédent" : "Manque"), h("strong", { class: ecart >= 0 ? "pos" : "neg" }, euros(Math.abs(ecart)))),
        variation !== null ? h("div", { class: "ligne-synthese" }, h("span", {}, "Par rapport au règlement précédent"), h("strong", {}, `${variation > 0 ? "+" : ""}${variation.toFixed(1).replace(".", ",")} %`)) : null),
      champ("Écart", iEcart), champ("Montant du cycle suivant", iSuivant), cAutre, apercu, erreur,
      h("div", { class: "actions" },
        h("button", { type: "button", onclick: () => {
          const m = montantSuivant();
          if (m == null || m <= 0) { erreur.textContent = "Saisissez un montant supérieur à zéro."; return; }
          const nouvelle = { ...prov, montant: m, report: reportSuivant(), echeance: ajouterMois(prov.echeance, prov.duree, prov.jourAncre),
            reglements: [...(prov.reglements || []), { opId: op.id, date: op.date, montant: regle, provisionne: e.provisionne, ecart, mode: iEcart.value,
              avant: { echeance: prov.echeance, montant: prov.montant, report: prov.report || 0 } }] };
          sauver(liste().map((p) => (p.id === prov.id ? nouvelle : p)));
          dialogue.close();
        } }, "Valider le règlement"),
        h("button", { type: "button", class: "sec", onclick: choix }, "‹ Autre opération"),
        h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
    majApercu();
  }
  choix();
}

// Alignement de l'échéance liée sur la mensualité conseillée (après confirmation)
function aligner(prov, e) {
  const p = etat.planifiees.find((x) => x.id === (prov.planifieesIds || [])[0]);
  if (!p || !e.conseillee) return;
  if (!confirm(`Passer l'échéance « ${p.nom} » de ${euros(Math.abs(p.montant))} à ${euros(e.conseillee)} par mois ? Les opérations déjà créées ne changent pas.`)) return;
  const l = lot();
  l.set("planifiees", p.id, { montant: (p.montant < 0 ? -1 : 1) * e.conseillee });
  l.envoyer();
}

function carte(prov) {
  const e = calculer(prov);
  const texteRythme = e.depassee ? "Échéance dépassée : rattachez le règlement"
    : e.statutRythme === "retard" ? `En retard de ${euros(-e.ecart)}`
    : e.statutRythme === "avance" ? `En avance de ${euros(e.ecart)}` : "Dans le rythme";
  const un = e.liees.length === 1 ? e.liees[0] : null;
  const alignable = un && un.frequence === "mensuel" && !e.depassee && e.conseillee > 0 && Math.abs(Math.abs(un.montant) - e.conseillee) >= 1;
  const dernier = (prov.reglements || [])[(prov.reglements || []).length - 1];
  return h("div", { class: "carte ligne-prov" },
    h("div", { class: "ligne-synthese" }, h("strong", {}, prov.nom), h("span", { class: "montants-budget" }, `${euros(e.provisionne)} / ${euros(e.montant)}`)),
    h("div", { class: "jauge-prov" + (e.depassee || e.statutRythme === "retard" ? " retard" : "") },
      h("span", { class: "rempli", style: `width:${e.pctProvisionne}%` }),
      h("span", { class: "repere", style: `left:${e.pctRythme}%`, title: "Rythme prévu à ce jour" })),
    h("p", { class: "reste-budget " + (e.depassee || e.statutRythme === "retard" ? "neg" : "pos") }, texteRythme),
    h("small", {}, `Échéance ${dateFr(e.fin)} · cycle de ${prov.duree} mois · rythme prévu ${euros(e.rythme)}`),
    h("small", {}, `Mensualité prévue ${euros(e.mensualite)}${e.depassee ? "" : ` · conseillée ${euros(e.conseillee)}`}`),
    h("small", {}, e.liees.length ? `${e.liees.length > 1 ? e.liees.length + " échéances liées" : "Échéance liée"} : ${euros(e.mensuelActuel)} par mois` : "Aucune échéance liée"),
    e.report ? h("small", {}, `${e.report > 0 ? "Excédent" : "Manque"} reporté : ${euros(Math.abs(e.report))}`) : null,
    dernier ? h("small", {}, `Dernier règlement : ${dateFr(dernier.date)} · ${euros(dernier.montant)}`) : null,
    h("div", { class: "actions" },
      h("button", { type: "button", onclick: () => formReglement(prov) }, "Règlement"),
      h("button", { type: "button", class: "sec", onclick: () => formProvision(prov) }, "Modifier"),
      alignable ? h("button", { type: "button", class: "sec", onclick: () => aligner(prov, e) }, `Aligner l'échéance sur ${euros(e.conseillee)}`) : null));
}

export function monter(conteneur) {
  const corps = h("div", {});
  conteneur.replaceChildren(corps);
  function maj() {
    if (!pret()) { corps.replaceChildren(h("p", { class: "vide" }, "Chargement…")); return; }
    const L = [...liste()].sort((a, b) => (a.echeance < b.echeance ? -1 : a.echeance > b.echeance ? 1 : 0));
    const noeuds = [];
    if (L.length) {
      const es = L.map(calculer);
      noeuds.push(h("div", { class: "carte synthese-budget" },
        h("div", { class: "ligne-synthese" }, h("span", {}, "Provisions en cours"), h("strong", {}, euros(es.reduce((s, x) => s + x.provisionne, 0)))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "À couvrir sur les cycles"), h("strong", {}, euros(es.reduce((s, x) => s + x.montant, 0)))),
        h("div", { class: "ligne-synthese" }, h("span", {}, "Mensualités prévues"), h("strong", {}, euros(es.reduce((s, x) => s + x.mensualite, 0))))));
      noeuds.push(...L.map(carte));
    } else {
      noeuds.push(h("p", { class: "vide" }, "Aucune provision. Ajoutez une dépense à provisionner (assurance annuelle, taxe, abonnement…)."));
    }
    noeuds.push(h("button", { type: "button", class: "ajout-budget", onclick: () => pret() && formProvision() }, "+ Nouvelle provision"));
    corps.replaceChildren(...noeuds);
  }
  maj();
  return { maj };
}
