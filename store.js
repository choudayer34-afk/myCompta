import { collection, doc, onSnapshot, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./firebase.js";

export { serverTimestamp };

// Copie locale de toutes les données de l'utilisateur, mise à jour en direct.
export const etat = { uid: null, comptes: [], categories: [], operations: [] };
const charge = { comptes: false, categories: false, operations: false };
const abonnes = new Set();
let arrets = [];
let planifie = false;

function notifier() {
  if (planifie) return;
  planifie = true;
  queueMicrotask(() => {
    planifie = false;
    abonnes.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  });
}

export function abonner(f) { abonnes.add(f); return () => abonnes.delete(f); }
export const pret = () => charge.comptes && charge.categories && charge.operations;

export function demarrer(uid) {
  arreter();
  etat.uid = uid;
  for (const nom of ["comptes", "categories", "operations"]) {
    arrets.push(onSnapshot(
      collection(db, "users", uid, nom),
      (snap) => {
        etat[nom] = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: "estimate" }), id: d.id }));
        charge[nom] = true;
        notifier();
      },
      (err) => console.error(nom, err)
    ));
  }
}

export function arreter() {
  arrets.forEach((a) => a());
  arrets = [];
  etat.uid = null;
  etat.comptes = []; etat.categories = []; etat.operations = [];
  charge.comptes = charge.categories = charge.operations = false;
  notifier();
}

export const nouvelId = (nom) => doc(collection(db, "users", etat.uid, nom)).id;

// Écritures groupées. L'enregistrement est local immédiatement, puis synchronisé dès que le réseau revient.
export function lot() {
  const b = writeBatch(db);
  const ref = (n, id) => doc(db, "users", etat.uid, n, id);
  return {
    set(nom, id, donnees) { b.set(ref(nom, id), donnees, { merge: true }); },
    del(nom, id) { b.delete(ref(nom, id)); },
    envoyer() {
      return b.commit().catch((e) => { console.error(e); alert("Échec de l'enregistrement : " + e.message); });
    }
  };
}

// Écriture de nombreux documents (import). Nécessite une connexion : chaque lot attend la confirmation du serveur.
export async function ecrireParLots(ecritures, progression) {
  const TAILLE = 400;
  for (let i = 0; i < ecritures.length; i += TAILLE) {
    const b = writeBatch(db);
    for (const [nom, id, donnees] of ecritures.slice(i, i + TAILLE)) {
      b.set(doc(db, "users", etat.uid, nom, id), donnees, { merge: true });
    }
    await b.commit();
    if (progression) progression(Math.min(i + TAILLE, ecritures.length), ecritures.length);
  }
}

export function libelleCategorie(c) {
  const p = c.parentId && etat.categories.find((x) => x.id === c.parentId);
  return p ? `${p.nom} › ${c.nom}` : c.nom;
}

export function categoriesTriees() {
  return etat.categories
    .map((c) => ({ ...c, libelle: libelleCategorie(c) }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
}
