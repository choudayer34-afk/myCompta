import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Données conservées sur l'appareil : l'application fonctionne sans réseau
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

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

let arret = null;

onAuthStateChanged(auth, (user) => {
  const connecte = !!user;
  $("ecran-connexion").classList.toggle("cache", connecte);
  $("ecran-app").classList.toggle("cache", !connecte);
  $("btn-sortie").classList.toggle("cache", !connecte);
  if (arret) { arret(); arret = null; }
  if (!user) return;

  const col = collection(db, "users", user.uid, "tests");
  const q = query(col, orderBy("cree", "desc"));
  arret = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    const ul = $("liste");
    ul.innerHTML = "";
    snap.forEach((d) => {
      const li = document.createElement("li");
      const nom = document.createElement("span");
      nom.textContent = d.data().libelle;
      li.appendChild(nom);
      if (d.metadata.hasPendingWrites) {
        const s = document.createElement("small");
        s.textContent = "en attente de synchronisation";
        li.appendChild(s);
      }
      ul.appendChild(li);
    });
  });

  $("form-test").onsubmit = (e) => {
    e.preventDefault();
    const libelle = $("libelle").value.trim();
    if (!libelle) return;
    // Pas d'attente de la réponse du serveur : l'écriture est locale puis synchronisée
    addDoc(col, { libelle, cree: serverTimestamp() }).catch(console.error);
    $("libelle").value = "";
  };
});
