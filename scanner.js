// Lecture d'un ticket par l'appareil photo : l'image reste en mémoire le temps de la lecture, elle n'est ni enregistrée ni envoyée.
// La lecture du texte utilise Tesseract.js (chargé au premier usage, puis gardé en cache par l'application).
import { h, modale } from "./ui.js";
import { aujourdhui } from "./format.js";
import { analyserTicket } from "./ticket.js";

const URL_TESSERACT = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
const URL_LANGUE = "https://cdn.jsdelivr.net/npm/@tesseract.js-data/fra/4.0.0_best_int";

let chargement = null;
function chargerBibliotheque() {
  if (window.Tesseract) return Promise.resolve();
  if (chargement) return chargement;
  chargement = new Promise((ok, ko) => {
    const s = document.createElement("script");
    s.src = URL_TESSERACT;
    s.onload = ok;
    s.onerror = () => { chargement = null; ko(new Error("Bibliothèque de lecture indisponible : une connexion est nécessaire au premier usage.")); };
    document.head.append(s);
  });
  return chargement;
}

// Image -> niveaux de gris contrastés, largeur limitée (lecture plus rapide et plus fiable)
function preparer(source, largeurSource, hauteurSource) {
  const max = 1600;
  const echelle = Math.min(1, max / Math.max(largeurSource, hauteurSource));
  const c = document.createElement("canvas");
  c.width = Math.round(largeurSource * echelle); c.height = Math.round(hauteurSource * echelle);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let min = 255, maxi = 0;
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = g; if (g < min) min = g; if (g > maxi) maxi = g; }
  const etendue = Math.max(1, maxi - min);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - min) * 255) / etendue)); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return c;
}

async function lire(canvas, progression) {
  await chargerBibliotheque();
  const worker = await window.Tesseract.createWorker("fra", 1, {
    langPath: URL_LANGUE,
    logger: (m) => { if (m && m.status === "recognizing text") progression(`Lecture… ${Math.round((m.progress || 0) * 100)} %`); else if (m && m.status) progression("Préparation…"); }
  });
  try {
    try { await worker.setParameters({ tessedit_pageseg_mode: "4" }); } catch (_) { /* facultatif */ }
    const { data } = await worker.recognize(canvas);
    return data.text || "";
  } finally {
    try { await worker.terminate(); } catch (_) { /* rien */ }
  }
}

// Ouvre la caméra ; `apres({ montant, date, nom, commentaire })` est appelée avec les éléments lus (montant en centimes positifs ou null).
export function scannerTicket(apres) {
  const video = h("video", { class: "scan-video", playsinline: true, muted: true, autoplay: true });
  video.muted = true;
  const etatTexte = h("p", { class: "note" }, "Cadrez le ticket, bien à plat et éclairé, puis touchez « Lire le ticket ».");
  const erreur = h("p", { class: "erreur" });
  let flux = null, occupe = false;
  const arreter = () => { if (flux) { flux.getTracks().forEach((t) => t.stop()); flux = null; } video.srcObject = null; };

  async function traiter(source, l, hh) {
    if (occupe) return;
    occupe = true; erreur.textContent = "";
    bLire.disabled = true; bFichier.disabled = true;
    try {
      const canvas = preparer(source, l, hh);
      arreter();
      etatTexte.textContent = "Lecture du ticket… (quelques secondes)";
      const texte = await lire(canvas, (t) => { etatTexte.textContent = t; });
      const r = analyserTicket(texte, aujourdhui());
      dialogue.close();
      apres(r);
    } catch (e) {
      console.error(e);
      erreur.textContent = e.message || "Lecture impossible.";
      occupe = false; bLire.disabled = false; bFichier.disabled = false;
    }
  }

  const bLire = h("button", { type: "button", onclick: () => {
    if (!video.videoWidth) { erreur.textContent = "La caméra n'est pas prête."; return; }
    traiter(video, video.videoWidth, video.videoHeight);
  } }, "Lire le ticket");
  // Solution de repli (caméra refusée) : sélection d'une image, lue puis oubliée
  const iFichier = h("input", { type: "file", accept: "image/*", class: "cache" });
  iFichier.addEventListener("change", async () => {
    const f = iFichier.files && iFichier.files[0];
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      await traiter(bmp, bmp.width, bmp.height);
    } catch (e) { erreur.textContent = "Image illisible."; }
  });
  const bFichier = h("button", { type: "button", class: "sec", onclick: () => iFichier.click() }, "Choisir une image");
  const bAnnuler = h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler");

  const { dialogue } = modale("Scanner un ticket", [
    h("div", { class: "scan-cadre" }, video), etatTexte, erreur,
    h("div", { class: "actions" }, bLire, bFichier, bAnnuler), iFichier
  ]);
  dialogue.addEventListener("close", arreter);

  (async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { erreur.textContent = "Caméra indisponible ici : utilisez « Choisir une image »."; bLire.disabled = true; return; }
    try {
      flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
      if (!dialogue.isConnected) { arreter(); return; }
      video.srcObject = flux;
      await video.play().catch(() => {});
    } catch (e) {
      erreur.textContent = "Accès à la caméra refusé ou impossible : autorisez-la dans les réglages, ou utilisez « Choisir une image ».";
      bLire.disabled = true;
    }
  })();
}
