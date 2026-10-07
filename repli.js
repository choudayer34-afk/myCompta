// Blocs repliables : toute carte dont le premier élément est un titre (.titre-carte) devient repliable.
// Une carte qui fournit data-resume démarre repliée et affiche cette information importante à côté du titre ;
// sans data-resume, elle démarre dépliée. L'état choisi est mémorisé pour l'écran et le titre.
const CLE = "compta-repli";
const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || "{}"); } catch (_) { return {}; } };
const ecrire = (o) => { try { localStorage.setItem(CLE, JSON.stringify(o)); } catch (_) {} };

function transformer(carte) {
  const titre = carte.firstElementChild;
  if (!titre || !titre.classList.contains("titre-carte") || carte.dataset.repli) return;
  const resume = carte.dataset.resume || "";
  const cle = (location.hash.replace(/^#\/?/, "").split("/")[0] || "comptes") + "|" + titre.textContent.replace(/\s*:.*$/, "").trim();
  const etats = lire();
  const ouvert = cle in etats ? etats[cle] : !resume;
  const details = document.createElement("details");
  details.className = carte.className + " bloc-repliable";
  details.dataset.repli = "1";
  if (resume) details.dataset.resume = resume;
  if (ouvert) details.open = true;
  const sommaire = document.createElement("summary");
  const t = document.createElement("span"); t.className = "repli-titre"; t.textContent = titre.textContent;
  const r = document.createElement("span"); r.className = "repli-resume"; r.textContent = resume;
  sommaire.append(t, r);
  const corps = document.createElement("div"); corps.className = "repli-corps";
  const enfants = [...carte.children].slice(1);
  corps.append(...enfants);
  details.append(sommaire, corps);
  details.addEventListener("toggle", () => { const e = lire(); e[cle] = details.open; ecrire(e); });
  carte.replaceWith(details);
}

export function demarrerRepli(racine) {
  const passer = () => racine.querySelectorAll(".carte:not([data-repli])").forEach(transformer);
  new MutationObserver(passer).observe(racine, { childList: true, subtree: true });
  passer();
}

// Met à jour l'information affichée d'un bloc replié (ex. total qui change pendant une saisie)
export function majResume(noeud, texte) {
  const d = noeud && noeud.closest ? noeud.closest("details.bloc-repliable") : null;
  if (!d) return;
  d.dataset.resume = texte;
  const r = d.querySelector(":scope > summary .repli-resume");
  if (r) r.textContent = texte;
}
