// Dépense dictée : reconnaissance vocale du navigateur (si disponible) ou dictée du clavier, puis validation dans le formulaire.
import { etat } from "./store.js";
import { aujourdhui, dateFr, euros } from "./format.js";
import { h, modale } from "./ui.js";
import { analyserPhrase } from "./phrase.js";

export function dicterDepense(apres) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const zone = h("textarea", { rows: 3, class: "dictee", placeholder: "Exemple : crée une dépense course à la date du 16 décembre, montant 53 euros 99", autocomplete: "off" });
  const apercu = h("div", { class: "apercu-voix" });
  const erreur = h("p", { class: "erreur" });
  let rec = null, ecoute = false;

  const comprendre = () => analyserPhrase(zone.value, aujourdhui(), etat.comptes);
  function maj() {
    const r = comprendre();
    const compte = r.compteId && etat.comptes.find((c) => c.id === r.compteId);
    const ligne = (lib, val, ok) => h("div", { class: "ligne-voix" + (ok ? "" : " manque") }, h("span", { class: "lib" }, lib), h("span", { class: "val" }, val || "à compléter"));
    apercu.replaceChildren(
      ligne("Type", r.sens === 1 ? "Recette" : "Dépense", true),
      ligne("Nom", r.nom, !!r.nom),
      ligne("Montant", r.montant ? euros(r.sens * r.montant) : "", !!r.montant),
      ligne("Date", dateFr(r.date) + (r.dateTrouvee ? "" : " (aujourd'hui par défaut)"), true),
      ...(compte ? [ligne("Compte", compte.nom, true)] : []));
    bValider.disabled = !zone.value.trim();
  }
  zone.addEventListener("input", maj);

  const bMicro = h("button", { type: "button", class: "sec", onclick: () => {
    erreur.textContent = "";
    if (ecoute) { rec && rec.stop(); return; }
    try {
      rec = new SR();
      rec.lang = "fr-FR"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      rec.onresult = (e) => { zone.value = [...e.results].map((x) => x[0].transcript).join(" ").trim(); maj(); };
      rec.onerror = (e) => {
        erreur.textContent = e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Micro ou reconnaissance vocale non autorisés ici. Touchez le micro du clavier pour dicter, ou autorisez le micro dans les réglages."
          : e.error === "no-speech" ? "Aucune voix détectée, réessayez." : "Reconnaissance vocale indisponible : " + e.error;
      };
      rec.onend = () => { ecoute = false; bMicro.textContent = "🎤 Dicter"; bMicro.classList.remove("actif-filtre"); };
      rec.start();
      ecoute = true; bMicro.textContent = "⏹ Arrêter"; bMicro.classList.add("actif-filtre");
    } catch (e) { erreur.textContent = "Reconnaissance vocale indisponible : utilisez le micro du clavier."; ecoute = false; }
  } }, "🎤 Dicter");
  if (!SR) bMicro.hidden = true;
  const bValider = h("button", { type: "button", onclick: () => {
    const r = comprendre();
    if (rec && ecoute) rec.abort();
    dialogue.close();
    apres(r);
  } }, "Valider et vérifier");

  const { dialogue } = modale("Dépense à l'oral", [
    h("p", { class: "note" }, SR
      ? "Touchez « Dicter » et parlez, ou écrivez / dictez au clavier (micro du clavier). Dites le type, le nom, le montant et la date."
      : "Dictez avec le micro du clavier (ou écrivez) : dites le type, le nom, le montant et la date."),
    zone, h("div", { class: "actions" }, bMicro), apercu, erreur,
    h("p", { class: "note" }, "Le formulaire s'ouvre ensuite pré-rempli : vous vérifiez et enregistrez."),
    h("div", { class: "actions barre-fixe" }, bValider, h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler"))
  ]);
  dialogue.addEventListener("close", () => { try { if (rec && ecoute) rec.abort(); } catch (_) { /* rien */ } });
  maj();
  zone.focus();
}
