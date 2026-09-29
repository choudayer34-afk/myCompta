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

// Fenêtre de saisie ; retourne { dialogue, formulaire }
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
