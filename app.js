import { onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth } from "./firebase.js";
import { demarrer, arreter, abonner, donneesFiables, pret, compteDepenseParDefaut } from "./store.js";
import { scannerTicket } from "./scanner.js";
import { dicterDepense } from "./voix.js";
import * as vueComptes from "./comptes.js";
import * as vueOperations from "./operations.js";
import * as vueCategories from "./categories.js";
import * as vueImport from "./import.js";
import * as vueEcheancier from "./echeancier.js";
import * as vueExport from "./export.js";
import * as vueBudgets from "./budgets.js";
import { majAlertes } from "./alertes.js";
import { VERSION } from "./version.js";

const $ = (id) => document.getElementById(id);

// Service worker (installation et mode déconnecté de l'application)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.error("SW", e));
}

// Hauteur réelle de l'en-tête (il peut passer sur deux lignes) : sert à coller la recherche sous lui
const entete = document.querySelector("header");
if (entete && "ResizeObserver" in window) new ResizeObserver(() => document.documentElement.style.setProperty("--hauteur-entete", entete.offsetHeight + "px")).observe(entete);

// Version : celle de la page, comparée à celle du service worker actif (écart = mise à jour en attente).
const boutonVersion = $("version");
function versionActive() {
  return new Promise((resolve) => {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!sw) return resolve(null);
    const canal = new MessageChannel();
    const fin = setTimeout(() => resolve(null), 1500);
    canal.port1.onmessage = (e) => { clearTimeout(fin); resolve(e.data); };
    sw.postMessage("version", [canal.port2]);
  });
}
async function majVersion() {
  const active = await versionActive();
  const ecart = active && active !== VERSION;
  boutonVersion.textContent = VERSION + (ecart ? " ⟳" : "");
  boutonVersion.title = ecart ? `Mise à jour disponible (${active}) : toucher pour recharger` : "Toucher pour rechercher une mise à jour";
}
boutonVersion.addEventListener("click", async () => {
  boutonVersion.textContent = VERSION + " …";
  try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (_) {}
  const active = await versionActive();
  if (active && active !== VERSION) { location.reload(); return; }
  boutonVersion.textContent = VERSION + " ✓";
  setTimeout(majVersion, 2500);
});
majVersion();
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => setTimeout(majVersion, 300));

// Indicateur de réseau
function majReseau() {
  const el = $("reseau");
  el.textContent = navigator.onLine ? "En ligne" : "Hors connexion";
  el.className = "etat" + (navigator.onLine ? "" : " hors");
}
window.addEventListener("online", majReseau);
window.addEventListener("offline", majReseau);
majReseau();

// Connexion
$("form-connexion").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("erreur").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("mdp").value);
  } catch (err) {
    $("erreur").textContent = "Connexion impossible : vérifiez l'e-mail et le mot de passe.";
    console.error(err);
  }
});
$("btn-sortie").addEventListener("click", () => signOut(auth));

// Ajout rapide d'une dépense (compte courant par défaut) et lecture d'un ticket, depuis n'importe quel écran
function nouvelleDepense(modele = null, compteId = null) {
  if (!pret()) { alert("Les données se chargent, réessayez dans un instant."); return; }
  const c = compteDepenseParDefaut();
  if (!c && !compteId) { alert("Créez d'abord un compte."); return; }
  vueOperations.formOperation({ compteId: compteId || c.id, modele });
}
$("btn-voix").addEventListener("click", () => {
  if (!pret() || !compteDepenseParDefaut()) { alert("Créez d'abord un compte."); return; }
  dicterDepense((r) => nouvelleDepense({
    nom: r.nom || "", montant: r.montant ? r.sens * r.montant : null, date: r.date, sens: r.sens, statut: "encours"
  }, r.compteId));
});
$("btn-depense").addEventListener("click", () => nouvelleDepense());
$("btn-ticket").addEventListener("click", () => {
  if (!pret() || !compteDepenseParDefaut()) { alert("Créez d'abord un compte."); return; }
  scannerTicket((r) => nouvelleDepense({
    nom: r.nom || "", montant: r.montant ? -r.montant : null, date: r.date, commentaire: r.commentaire, statut: "encours", sens: -1
  }));
});

// Alertes budget : bandeau et pastille sur l'onglet
let surBudgets = false;
function rafraichirAlertes() {
  if (!auth.currentUser) return;
  majAlertes($("bandeau-budget"), document.querySelector('nav a[data-onglet="budgets"]'), surBudgets);
}

// Navigation par adresse (#/comptes, #/compte/ID, #/categories)
let vue = null;
function naviguer() {
  const principal = $("principal");
  const hash = location.hash || "#/comptes";
  const compte = hash.match(/^#\/compte\/(.+)$/);
  let onglet = "comptes";
  if (compte) {
    vue = vueOperations.monter(principal, { id: decodeURIComponent(compte[1]) });
  } else if (hash === "#/export" || hash.startsWith("#/export/")) {
    onglet = "export";
    vue = vueExport.monter(principal, { id: decodeURIComponent(hash.slice(9)) });
  } else if (hash === "#/echeancier") {
    onglet = "echeancier";
    vue = vueEcheancier.monter(principal);
  } else if (hash === "#/budgets" || hash === "#/bilan") {
    onglet = "budgets";
    vue = vueBudgets.monter(principal);
  } else if (hash === "#/import") {
    onglet = "import";
    vue = vueImport.monter(principal);
  } else if (hash === "#/categories") {
    onglet = "categories";
    vue = vueCategories.monter(principal);
  } else {
    vue = vueComptes.monter(principal);
  }
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("actif", a.dataset.onglet === onglet));
  surBudgets = onglet === "budgets";
  rafraichirAlertes();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => { if (auth.currentUser) naviguer(); });
// Création automatique des échéances arrivées à terme, dès que les données sont à jour
let generationEnCours = false;
function tenterGeneration() {
  if (generationEnCours || !auth.currentUser || !donneesFiables()) return;
  generationEnCours = true;
  try { vueEcheancier.genererEcheances(); } catch (e) { console.error(e); }
  generationEnCours = false;
}
abonner(() => { if (vue && vue.maj) vue.maj(); rafraichirAlertes(); tenterGeneration(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tenterGeneration(); });

onAuthStateChanged(auth, (user) => {
  const connecte = !!user;
  $("ecran-connexion").classList.toggle("cache", connecte);
  $("ecran-app").classList.toggle("cache", !connecte);
  $("btn-sortie").classList.toggle("cache", !connecte);
  $("btn-depense").classList.toggle("cache", !connecte);
  $("btn-ticket").classList.toggle("cache", !connecte);
  $("btn-voix").classList.toggle("cache", !connecte);
  $("nav").classList.toggle("cache", !connecte);
  if (user) {
    demarrer(user.uid);
    naviguer();
  } else {
    arreter();
    vue = null;
    $("principal").replaceChildren();
  }
});
