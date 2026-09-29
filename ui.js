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
export function modale(titre, corps) {
  const formulaire = h("form", { method: "dialog" }, h("h2", {}, titre), corps);
  const dialogue = h("dialog", { class: "modale" }, formulaire);
  dialogue.addEventListener("close", () => dialogue.remove());
  dialogue.addEventListener("click", (e) => { if (e.target === dialogue) dialogue.close(); });
  document.body.append(dialogue);
  dialogue.showModal();
  return { dialogue, formulaire };
}

export const PALETTE = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#475569"];
export const couleurAuHasard = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];
