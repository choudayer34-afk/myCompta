// Verrouillage de l'application : code à 6 chiffres (+ Face ID / Touch ID facultatif).
// Le code est conservé sur l'appareil uniquement, sous forme d'empreinte (jamais en clair).
import { h, modale, champ, selecteur } from "./ui.js";

const CLE = "compta-verrou";
const LONGUEUR = 6;
const DELAIS = [["0", "À chaque retour dans l'application"], ["60", "Après 1 minute"], ["300", "Après 5 minutes"], ["900", "Après 15 minutes"]];

const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch (_) { return null; } };
const ecrire = (c) => { try { if (c) localStorage.setItem(CLE, JSON.stringify(c)); else localStorage.removeItem(CLE); } catch (_) { /* rien */ } };
export const verrouActif = () => !!lire();

const enB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function empreinte(code, sel) {
  const cle = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: deB64(sel), iterations: 150000 }, cle, 256);
  return enB64(bits);
}
async function creerConfig(code, ancienne = {}) {
  const sel = enB64(crypto.getRandomValues(new Uint8Array(16)));
  return { ...ancienne, sel, hash: await empreinte(code, sel), echecs: 0, jusqua: 0 };
}
async function codeJuste(code) {
  const c = lire();
  return !!c && (await empreinte(code, c.sel)) === c.hash;
}

// ---- Face ID / Touch ID (contrôle local de l'appareil)
async function biometrieDispo() {
  try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (_) { return false; }
}
async function enregistrerBiometrie() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: "Compta" },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "compta", displayName: "Compta" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
    timeout: 60000 } });
  return enB64(cred.rawId);
}
async function verifierBiometrie(idB64) {
  await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: "public-key", id: deB64(idB64) }],
    userVerification: "required", timeout: 60000 } });
}

// ---- Écran de verrouillage
let ecran = null, saisie = "", occupe = false, deconnexion = () => {};
let dernierPassage = 0, minuteur = null, auPremierPlan = true;

const verrouille = () => !!ecran;
export const estVerrouille = verrouille;

function afficherPoints() {
  if (!ecran) return;
  ecran.querySelectorAll(".point").forEach((p, i) => p.classList.toggle("plein", i < saisie.length));
}
function message(t) { if (ecran) ecran.querySelector(".verrou-msg").textContent = t || ""; }

function deverrouiller() {
  if (ecran) { ecran.remove(); ecran = null; }
  saisie = ""; dernierPassage = Date.now(); armer();
  window.dispatchEvent(new Event("compta-deverrouille"));
}

async function essayer() {
  const c = lire();
  if (!c || occupe) return;
  if (c.jusqua && Date.now() < c.jusqua) { message(`Trop d'essais. Patientez ${Math.ceil((c.jusqua - Date.now()) / 1000)} s.`); saisie = ""; afficherPoints(); return; }
  occupe = true;
  const ok = await codeJuste(saisie);
  occupe = false;
  if (ok) { c.echecs = 0; c.jusqua = 0; ecrire(c); deverrouiller(); return; }
  c.echecs = (c.echecs || 0) + 1;
  if (c.echecs >= 5) c.jusqua = Date.now() + Math.min(600, 30 * 2 ** (c.echecs - 5)) * 1000;
  ecrire(c);
  saisie = ""; afficherPoints();
  ecran && ecran.classList.add("secoue"); setTimeout(() => ecran && ecran.classList.remove("secoue"), 400);
  message(c.jusqua ? "Trop d'essais. Patientez un instant." : "Code incorrect.");
}

function toucher(chiffre) {
  if (saisie.length >= LONGUEUR) return;
  saisie += chiffre; message(""); afficherPoints();
  if (saisie.length === LONGUEUR) essayer();
}

async function biometrie() {
  const c = lire();
  if (!c || !c.bio) return;
  try { await verifierBiometrie(c.bio); c.echecs = 0; c.jusqua = 0; ecrire(c); deverrouiller(); }
  catch (_) { message("Reconnaissance annulée : saisissez le code."); }
}

export function verrouiller() {
  if (ecran || !lire()) return;
  saisie = "";
  const touche = (t, f, classe = "") => h("button", { type: "button", class: "touche " + classe, onclick: f }, t);
  const c = lire();
  const pave = h("div", { class: "pave" },
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => touche(String(n), () => toucher(String(n)))),
    c.bio ? touche("🔓", biometrie, "bio") : h("span"),
    touche("0", () => toucher("0")),
    touche("⌫", () => { saisie = saisie.slice(0, -1); afficherPoints(); }, "eff"));
  ecran = h("div", { class: "verrou", role: "dialog", "aria-modal": "true", "aria-label": "Application verrouillée" },
    h("div", { class: "verrou-corps" },
      h("div", { class: "verrou-ico" }, "🔒"),
      h("h2", {}, "Compta est verrouillé"),
      h("div", { class: "points", "aria-hidden": "true" }, ...Array.from({ length: LONGUEUR }, () => h("span", { class: "point" }))),
      h("p", { class: "verrou-msg", "aria-live": "polite" }),
      pave,
      h("button", { type: "button", class: "lien-oubli", onclick: () => {
        if (confirm("Se déconnecter et supprimer le verrouillage de cet appareil ? Vous devrez vous reconnecter avec votre e-mail et votre mot de passe.")) { ecrire(null); deconnexion(); retirerVerrou(); }
      } }, "Code oublié ?")));
  document.body.append(ecran);
  if (c.bio) setTimeout(biometrie, 250);
}
function retirerVerrou() { if (ecran) { ecran.remove(); ecran = null; } saisie = ""; clearTimeout(minuteur); }

// ---- Déclenchement : retour au premier plan, inactivité
function armer() {
  clearTimeout(minuteur);
  const c = lire();
  if (!c || verrouille()) return;
  const d = Number(c.delai || 0);
  if (d > 0) minuteur = setTimeout(verrouiller, d * 1000);
}
function activite() { if (!verrouille() && lire()) { dernierPassage = Date.now(); armer(); } }

export function initVerrou({ surDeconnexion } = {}) {
  deconnexion = surDeconnexion || deconnexion;
  for (const ev of ["pointerdown", "keydown", "scroll", "touchstart"]) window.addEventListener(ev, activite, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => {
    const c = lire();
    if (!c) return;
    if (document.visibilityState === "hidden") {
      auPremierPlan = false; dernierPassage = Date.now(); clearTimeout(minuteur);
      // Masque immédiatement le contenu (aperçu du sélecteur d'applications)
      if (document.body.dataset.connecte === "1") document.body.classList.add("masque");
    } else {
      auPremierPlan = true; document.body.classList.remove("masque");
      const absent = (Date.now() - dernierPassage) / 1000;
      if (document.body.dataset.connecte === "1" && absent >= Number(c.delai || 0)) verrouiller(); else armer();
    }
  });
}
// À appeler à chaque changement de connexion
export function surConnexion(connecte) {
  document.body.dataset.connecte = connecte ? "1" : "0";
  if (!connecte) { retirerVerrou(); return; }
  dernierPassage = Date.now();
  if (lire() && !verrouille()) verrouiller();
}

// ---- Réglages (carte « Verrouillage » de l'écran Plus)
export async function formVerrou() {
  const c = lire();
  const bioOk = await biometrieDispo();
  const erreur = h("p", { class: "erreur" });
  const nouveau = h("input", { type: "password", inputmode: "numeric", pattern: "\\d{6}", maxlength: "6", autocomplete: "off", placeholder: "6 chiffres" });
  const confirmation = h("input", { type: "password", inputmode: "numeric", pattern: "\\d{6}", maxlength: "6", autocomplete: "off", placeholder: "Confirmer le code" });
  const actuel = h("input", { type: "password", inputmode: "numeric", pattern: "\\d{6}", maxlength: "6", autocomplete: "off", placeholder: "Code actuel" });
  const delai = selecteur(DELAIS, String((c && c.delai) || 0));
  const bio = h("input", { type: "checkbox", checked: c && c.bio ? true : null });
  const caseBio = bioOk ? h("label", { class: "case" }, bio, "Déverrouiller avec Face ID / Touch ID") : h("p", { class: "note" }, "Face ID / Touch ID non disponible sur cet appareil ou ce navigateur.");

  const corps = h("div", {},
    h("p", { class: "note" }, c
      ? "Le verrouillage est actif sur cet appareil. Il s'ajoute à la connexion par e-mail et mot de passe."
      : "Le code est demandé à l'ouverture et au retour dans l'application. Il reste sur cet appareil. En cas d'oubli, il faut se déconnecter puis se reconnecter."),
    c ? champ("Code actuel", actuel) : null,
    champ(c ? "Nouveau code (laisser vide pour le conserver)" : "Code (6 chiffres)", nouveau),
    champ("Confirmer le nouveau code", confirmation),
    champ("Verrouiller", delai), caseBio, erreur,
    h("div", { class: "actions" },
      h("button", { type: "submit" }, "Enregistrer"),
      c ? h("button", { type: "button", class: "sec", onclick: async () => {
        if (!(await codeJuste(actuel.value))) { erreur.textContent = "Code actuel incorrect."; return; }
        ecrire(null); dialogue.close();
      } }, "Désactiver") : null,
      h("button", { type: "button", class: "sec", onclick: () => dialogue.close() }, "Annuler")));
  const { dialogue, formulaire } = modale("Verrouillage de l'application", corps);
  formulaire.addEventListener("submit", async (e) => {
    e.preventDefault(); erreur.textContent = "";
    const nv = nouveau.value.trim();
    if (c && !(await codeJuste(actuel.value))) { erreur.textContent = "Code actuel incorrect."; return; }
    if (!c && !nv) { erreur.textContent = "Saisissez un code à 6 chiffres."; return; }
    if (nv && !/^\d{6}$/.test(nv)) { erreur.textContent = "Le code doit comporter exactement 6 chiffres."; return; }
    if (nv && nv !== confirmation.value.trim()) { erreur.textContent = "Les deux codes sont différents."; return; }
    let cfg = c || {};
    if (nv) cfg = await creerConfig(nv, c || {});
    cfg.delai = Number(delai.value);
    if (bioOk && bio.checked) {
      if (!cfg.bio) { try { cfg.bio = await enregistrerBiometrie(); } catch (_) { erreur.textContent = "Face ID / Touch ID n'a pas pu être activé. Le code seul est conservé."; cfg.bio = null; } }
    } else cfg.bio = null;
    ecrire(cfg); dialogue.close(); armer();
  });
}
