import { onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { auth } from "./firebase.js";
import { demarrer, arreter, abonner, donneesFiables } from "./store.js";
import * as vueComptes from "./comptes.js";
import * as vueOperations from "./operations.js";
import * as vueCategories from "./categories.js";
import * as vueImport from "./import.js";
import * as vueEcheancier from "./echeancier.js";

const $ = (id) => document.getElementById(id);

// Service worker (installation et mode déconnecté de l'application)
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.error("SW", e));
}

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

// Navigation par adresse (#/comptes, #/compte/ID, #/categories)
let vue = null;
function naviguer() {
  const principal = $("principal");
  const hash = location.hash || "#/comptes";
  const compte = hash.match(/^#\/compte\/(.+)$/);
  let onglet = "comptes";
  if (compte) {
    vue = vueOperations.monter(principal, { id: decodeURIComponent(compte[1]) });
  } else if (hash === "#/echeancier") {
    onglet = "echeancier";
    vue = vueEcheancier.monter(principal);
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
abonner(() => { if (vue && vue.maj) vue.maj(); tenterGeneration(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tenterGeneration(); });

onAuthStateChanged(auth, (user) => {
  const connecte = !!user;
  $("ecran-connexion").classList.toggle("cache", connecte);
  $("ecran-app").classList.toggle("cache", !connecte);
  $("btn-sortie").classList.toggle("cache", !connecte);
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
