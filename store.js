import { collection, doc, onSnapshot, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { db } from "./firebase.js";

export { serverTimestamp };

// Copie locale de toutes les données de l'utilisateur, mise à jour en direct.
export const etat = { uid: null, comptes: [], categories: [], operations: [], planifiees: [], nomsCategories: [] };
const charge = { comptes: false, categories: false, operations: false, planifiees: false, nomsCategories: false };
const serveur = { comptes: false, categories: false, operations: false, planifiees: false, nomsCategories: false };
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
export const pret = () => charge.comptes && charge.categories && charge.operations && charge.planifiees;
// Données à jour : lues depuis le serveur (ou appareil hors connexion, donc seule source disponible).
export const donneesFiables = () => pret() && (!navigator.onLine || (serveur.comptes && serveur.categories && serveur.operations && serveur.planifiees));

export function demarrer(uid) {
  arreter();
  etat.uid = uid;
  // nomsCategories (association nom → catégorie) n'entre pas dans « pret » : l'application ne l'attend pas.
  for (const nom of ["comptes", "categories", "operations", "planifiees", "nomsCategories"]) {
    arrets.push(onSnapshot(
      collection(db, "users", uid, nom),
      (snap) => {
        etat[nom] = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: "estimate" }), id: d.id }));
        charge[nom] = true;
        serveur[nom] = !(snap.metadata && snap.metadata.fromCache);
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
  etat.comptes = []; etat.categories = []; etat.operations = []; etat.planifiees = []; etat.nomsCategories = [];
  for (const k of Object.keys(charge)) { charge[k] = false; serveur[k] = false; }
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

// Comme ecrireParLots, mais tous les lots sont mis en file immédiatement : fonctionne aussi hors connexion.
export function ecrireEnParallele(ecritures) {
  const TAILLE = 400;
  const promesses = [];
  for (let i = 0; i < ecritures.length; i += TAILLE) {
    const b = writeBatch(db);
    for (const [nom, id, donnees] of ecritures.slice(i, i + TAILLE)) {
      b.set(doc(db, "users", etat.uid, nom, id), donnees, { merge: true });
    }
    promesses.push(b.commit());
  }
  return Promise.all(promesses);
}

// Ordre des comptes : ordre choisi (glisser-déposer), puis nom pour les comptes sans ordre.
export function comparerComptes(a, b) {
  const oa = Number.isFinite(a.ordre) ? a.ordre : Infinity, ob = Number.isFinite(b.ordre) ? b.ordre : Infinity;
  if (oa !== ob) return oa < ob ? -1 : 1;
  return (a.nom || "").localeCompare(b.nom || "", "fr");
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
