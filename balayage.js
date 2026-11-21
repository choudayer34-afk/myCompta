// Balayage horizontal d'une ligne (tactile et souris).
// Gauche -> droite : surDroite() ; droite -> gauche : surGauche() ; seulement au-delà du seuil.
const VERROU = 10; // px parcourus avant de décider du sens du geste
const SEUIL = 90;  // px à dépasser pour déclencher l'action

export function balayer(enveloppe, ligne, { surDroite, surGauche }) {
  let id = null, x0 = 0, y0 = 0, dx = 0, horizontal = false, glisse = false;

  const nettoyer = () => {
    ligne.style.transition = "";
    ligne.style.transform = "";
    enveloppe.classList.remove("en-geste", "vers-droite", "vers-gauche", "arme");
  };

  ligne.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; horizontal = false; glisse = false;
  });

  ligne.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!horizontal) {
      if (Math.abs(mx) < VERROU && Math.abs(my) < VERROU) return;
      if (Math.abs(my) >= Math.abs(mx)) { id = null; return; } // défilement vertical : on laisse faire
      horizontal = true; glisse = true;
      try { ligne.setPointerCapture(id); } catch (_) { /* sans effet */ }
      enveloppe.classList.add("en-geste");
    }
    dx = Math.max(-ligne.offsetWidth, Math.min(ligne.offsetWidth, mx));
    ligne.style.transform = `translateX(${dx}px)`;
    enveloppe.classList.toggle("vers-droite", dx > 0);
    enveloppe.classList.toggle("vers-gauche", dx < 0);
    enveloppe.classList.toggle("arme", Math.abs(dx) >= SEUIL);
  });

  const terminer = (annule) => (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!horizontal) return;
    horizontal = false;
    const declenche = !annule && Math.abs(dx) >= SEUIL;
    ligne.style.transition = "transform .18s ease-out";
    if (declenche && dx < 0) {
      ligne.style.transform = "translateX(-100%)";
      setTimeout(() => { surGauche(); nettoyer(); }, 180);
    } else {
      ligne.style.transform = "translateX(0)";
      if (declenche) surDroite();
      setTimeout(nettoyer, 200);
    }
  };
  ligne.addEventListener("pointerup", terminer(false));
  ligne.addEventListener("pointercancel", terminer(true));

  // Un glissement ne doit pas ouvrir la fiche de l'opération.
  ligne.addEventListener("click", (e) => {
    if (glisse) { e.stopPropagation(); e.preventDefault(); glisse = false; }
  }, true);
}
