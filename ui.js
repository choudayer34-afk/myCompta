import { filtrerContient, normaliser } from "./noms.js";

// Petits outils pour construire l'interface sans risque d'injection (tout passe par textContent).
export function h(tag, attrs = {}, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "value") e.value = v;
    else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const c of enfants.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return e;
}

// Liste déroulante : options = [[valeur, libellé], ...]
export function selecteur(options, valeur, attrs = {}) {
  const s = h("select", attrs, options.map(([v, l]) => h("option", { value: v }, l)));
  s.value = valeur ?? "";
  return s;
}

export function champ(libelle, controle) {
  return h("div", { class: "champ" }, h("label", {}, libelle), controle);
}

// Champ de saisie avec liste filtrée « contient ».
//  - elements() : [{ id, libelle }] (relu à chaque affichage)
//  - ajout : texte du bouton d'ajout (ex. « Ajouter la catégorie ») ; si absent, la saisie libre est la valeur (noms d'opérations)
// Retourne { element, input, texte(), id(), definir(id), definirTexte(t), resoudre(), surChangement(f) }
export function combo({ elements, valeur = "", texte = "", ajout = null, placeholder = "", requis = false, alpha = false }) {
  let idChoisi = valeur || null;
  const trouve = (id) => elements().find((e) => e.id === id);
  const input = h("input", { type: "text", autocomplete: "off", autocapitalize: "sentences", placeholder, required: requis || null,
    value: texte || (valeur && trouve(valeur) ? trouve(valeur).libelle : ""), role: "combobox", "aria-autocomplete": "list" });
  const liste = h("div", { class: "choix-liste cache", role: "listbox" });
  const indice = h("small", { class: "indice cache" });
  const element = h("div", { class: "combo" }, input, liste, indice);
  const ecouteurs = [];
  const prevenir = () => ecouteurs.forEach((f) => f());

  // Résolution du texte saisi : identifiant existant, nouvel élément à créer, ou vide
  function resoudre() {
    const t = input.value.trim();
    if (!ajout) return { texte: t };
    if (idChoisi && trouve(idChoisi) && normaliser(trouve(idChoisi).libelle) === normaliser(t)) return { id: idChoisi };
    if (!t) return { vide: true };
    const exact = elements().find((e) => normaliser(e.libelle) === normaliser(t) || normaliser(e.libelle.split("›").pop()) === normaliser(t) && elements().filter((x) => normaliser(x.libelle.split("›").pop()) === normaliser(t)).length === 1);
    if (exact) return { id: exact.id };
    return { nouveau: t };
  }

  function maj() {
    const r = resoudre();
    indice.textContent = r.nouveau ? `Nouvelle catégorie « ${r.nouveau} » : elle sera créée à l'enregistrement.` : "";
    indice.classList.toggle("cache", !r.nouveau);
  }

  function choisir(e) {
    idChoisi = e.id;
    input.value = e.libelle;
    liste.classList.add("cache");
    maj();
    prevenir();
  }

  function afficher() {
    const q = input.value;
    const tous = elements();
    const filtres = filtrerContient(tous, q, (x) => x.libelle, 40, alpha);
    const noeuds = filtres.map((e) => h("button", { type: "button", class: "choix", role: "option",
      onmousedown: (ev) => ev.preventDefault(), onclick: () => choisir(e) }, e.affichage || e.libelle));
    const r = resoudre();
    if (ajout && r.nouveau) noeuds.push(h("button", { type: "button", class: "choix choix-ajout", onmousedown: (ev) => ev.preventDefault(),
      onclick: () => { liste.classList.add("cache"); maj(); prevenir(); } }, `+ ${ajout} « ${r.nouveau} »`));
    liste.replaceChildren(...noeuds);
    liste.classList.toggle("cache", !noeuds.length);
  }

  input.addEventListener("input", () => {
    if (ajout) { const c = idChoisi && trouve(idChoisi); if (!c || normaliser(c.libelle) !== normaliser(input.value)) idChoisi = null; }
    afficher(); maj(); prevenir();
  });
  input.addEventListener("focus", afficher);
  input.addEventListener("blur", () => setTimeout(() => liste.classList.add("cache"), 200));
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") liste.classList.add("cache");
    if (ev.key === "Enter" && !liste.classList.contains("cache")) {
      const premier = liste.querySelector(".choix");
      if (premier) { ev.preventDefault(); premier.click(); }
    }
  });
  maj();

  return {
    element, input, resoudre,
    texte: () => input.value.trim(),
    id: () => idChoisi,
    definir(id) { idChoisi = id || null; const e = id && trouve(id); input.value = e ? e.libelle : ""; maj(); prevenir(); },
    definirTexte(t) { input.value = t; if (ajout) idChoisi = null; maj(); },
    surChangement(f) { ecouteurs.push(f); }
  };
}

// Blocage du défilement de la page derrière une fenêtre (nécessaire sur iPhone :
// sans cela, le doigt fait défiler la page située derrière la fenêtre).
let verrous = 0, decalage = 0;
function verrouiller() {
  if (verrous++ > 0) return;
  decalage = window.scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${decalage}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
}
function deverrouiller() {
  if (--verrous > 0) return;
  verrous = 0;
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  window.scrollTo(0, decalage);
}

// Fenêtre de saisie ; retourne { dialogue, formulaire }
export function modale(titre, corps) {
  // Une seule fenêtre à la fois (évite les fenêtres empilées après un double toucher)
  document.querySelectorAll("dialog.modale").forEach((d) => d.close());
  const formulaire = h("form", { method: "dialog" }, h("h2", {}, titre), corps);
  const dialogue = h("dialog", { class: "modale" }, formulaire);
  let ferme = false;
  dialogue.addEventListener("close", () => {
    if (ferme) return;
    ferme = true;
    deverrouiller();
    dialogue.remove();
  });
  // Fermeture au toucher hors de la fenêtre uniquement (pas sur ses marges intérieures)
  dialogue.addEventListener("click", (e) => {
    if (e.target !== dialogue) return;
    const r = dialogue.getBoundingClientRect();
    const dehors = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (dehors) dialogue.close();
  });
  // Le fond ne doit jamais défiler : on bloque le geste si le contenu n'est pas défilable
  let departY = 0;
  dialogue.addEventListener("touchstart", (e) => { departY = e.touches[0].clientY; }, { passive: true });
  dialogue.addEventListener("touchmove", (e) => {
    // Une liste de choix défilable à l'intérieur de la fenêtre garde son propre défilement
    const interne = e.target.closest && e.target.closest(".choix-liste");
    if (interne && interne.scrollHeight > interne.clientHeight + 1) {
      const d = e.touches[0].clientY - departY;
      const haut = interne.scrollTop <= 0, bas = interne.scrollTop + interne.clientHeight >= interne.scrollHeight - 1;
      if (!((haut && d > 0) || (bas && d < 0))) return;
    }
    const defilable = dialogue.scrollHeight > dialogue.clientHeight + 1;
    if (!defilable) { e.preventDefault(); return; }
    const dy = e.touches[0].clientY - departY;
    const enHaut = dialogue.scrollTop <= 0, enBas = dialogue.scrollTop + dialogue.clientHeight >= dialogue.scrollHeight - 1;
    if ((enHaut && dy > 0) || (enBas && dy < 0)) { if (e.cancelable) e.preventDefault(); }
  }, { passive: false });
  // Clavier virtuel : garde le champ actif visible dans la fenêtre
  dialogue.addEventListener("focusin", (e) => {
    const t = e.target;
    if (t && t.matches && t.matches("input, select, textarea")) setTimeout(() => { try { t.scrollIntoView({ block: "center" }); } catch (_) {} }, 350);
  });
  verrouiller();
  document.body.append(dialogue);
  dialogue.showModal();
  return { dialogue, formulaire };
}

export const PALETTE = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#475569"];
export const couleurAuHasard = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];
