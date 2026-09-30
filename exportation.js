// Export Excel (.xlsx) : sélection, nettoyage et fabrication du fichier. Aucun accès à Firebase ni au DOM.
import { cleTri } from "./calc.js";

// Opérations à exporter : compte, période (dates incluses) et, si demandé, seulement celles marquées « à exporter ».
// Le statut (en cours, pointé, annulé) n'est volontairement pas pris en compte.
export function selectionner(operations, { compteId, du, au, seulementMarquees }) {
  return operations
    .filter((o) => (!compteId || o.compteId === compteId) && o.date >= du && o.date <= au && (!seulementMarquees || o.aExporter))
    .sort(cleTri);
}

// Titre sans « # », sans retour à la ligne, espaces multiples réduits ; option : aucune espace.
export function nettoyerTitre(titre, sansEspaces) {
  let t = String(titre ?? "").replace(/#/g, "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (sansEspaces) t = t.replace(/\s/g, "");
  return t || "-";
}

// Centimes -> "12,50" ou "-1234,56" (virgule, aucun séparateur de milliers, aucune espace, aucun symbole)
export function montantTexte(centimes) {
  const n = Math.abs(centimes);
  return (centimes < 0 ? "-" : "") + Math.floor(n / 100) + "," + String(n % 100).padStart(2, "0");
}

// Nom de catégorie pour l'export : sans « # », sur une ligne ; vide si l'opération n'a pas de catégorie.
export function nettoyerCategorie(nom) {
  return String(nom ?? "").replace(/#/g, "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

const dateFrExport = (iso) => { const [a, m, j] = String(iso || "").split("-"); return a ? `${j}/${m}/${a}` : ""; };

// `categories` : liste des catégories (id, nom). La date est au format jj/mm/aaaa.
export function lignesExport(operations, { sansEspaces, categories = [] }) {
  const noms = new Map(categories.map((c) => [c.id, c.nom]));
  return operations.map((o) => ({
    date: dateFrExport(o.date), categorie: nettoyerCategorie(noms.get(o.categorieId)),
    titre: nettoyerTitre(o.nom, sansEspaces), montant: o.montant
  }));
}

// Nombre à deux décimales pour une cellule Excel (point décimal dans le fichier, affiché avec la virgule par Excel en français).
const nombreXml = (centimes) => { const v = (centimes / 100).toFixed(2); return Number(v) === 0 ? "0.00" : v; };

const echapper = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cellTexte = (ref, s) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${echapper(s)}</t></is></c>`;

// Fabrique le classeur : 2 colonnes (titre, montant). montantEnTexte : « 12,50 » écrit tel quel ; sinon nombre (affichage selon la langue du tableur).
export function construireXlsx(lignes, { montantEnTexte = true, entete = false, colonnes = 2 } = {}) {
  const enc = new TextEncoder();
  const rangees = [];
  let n = 0;
  if (colonnes === 5) {
    // Date, Catégorie, Opération, Montant inversé, Montant (les deux montants sont des nombres à 2 décimales)
    const nb = (ref, c) => `<c r="${ref}" s="1"><v>${nombreXml(c)}</v></c>`;
    const tete = ["Date", "Catégorie", "Opération", "Montant inversé", "Montant"];
    rangees.push(`<row r="1">${tete.map((t, i) => `<c r="${"ABCDE"[i]}1" t="inlineStr" s="2"><is><t>${t}</t></is></c>`).join("")}</row>`);
    lignes.forEach((l, i) => {
      const r = i + 2;
      rangees.push(`<row r="${r}">${cellTexte(`A${r}`, l.date)}${cellTexte(`B${r}`, l.categorie)}${cellTexte(`C${r}`, l.titre)}${nb(`D${r}`, -l.montant)}${nb(`E${r}`, l.montant)}</row>`);
    });
    const largeurOp = Math.min(80, Math.max(20, ...lignes.map((l) => l.titre.length + 2)));
    const largeurCat = Math.min(50, Math.max(14, ...lignes.map((l) => l.categorie.length + 2)));
    const feuille5 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="2" width="${largeurCat}" customWidth="1"/><col min="3" max="3" width="${largeurOp}" customWidth="1"/><col min="4" max="5" width="16" customWidth="1"/></cols><sheetData>${rangees.join("")}</sheetData></worksheet>`;
    return assembler(enc, feuille5);
  }
  const ajouter = (titre, montant, estEntete) => {
    n++;
    const b = estEntete ? cellTexte(`B${n}`, montant)
      : montantEnTexte ? cellTexte(`B${n}`, montantTexte(montant))
      : `<c r="B${n}" s="1"><v>${(montant / 100).toFixed(2)}</v></c>`;
    rangees.push(`<row r="${n}">${cellTexte(`A${n}`, titre)}${b}</row>`);
  };
  if (entete) ajouter("Titre", "Montant", true);
  for (const l of lignes) ajouter(l.titre, l.montant, false);
  const largeurTitre = Math.min(80, Math.max(20, ...lignes.map((l) => l.titre.length + 2)));
  const feuille = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="${largeurTitre}" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/></cols><sheetData>${rangees.join("")}</sheetData></worksheet>`;
  return assembler(enc, feuille);
}

function assembler(enc, feuille) {
  const xml = (s) => enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
  return zipper([
    { nom: "[Content_Types].xml", contenu: xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
    { nom: "_rels/.rels", contenu: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { nom: "xl/workbook.xml", contenu: xml('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { nom: "xl/_rels/workbook.xml.rels", contenu: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
    { nom: "xl/styles.xml", contenu: xml('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>') },
    { nom: "xl/worksheets/sheet1.xml", contenu: enc.encode(feuille) }
  ]);
}

// --- Archive ZIP minimale (sans compression) ---
const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
  return t;
})();
function crc32(octets) {
  let c = 0xffffffff;
  for (let i = 0; i < octets.length; i++) c = TABLE_CRC[(c ^ octets[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function zipper(fichiers) {
  const enc = new TextEncoder();
  const parties = [], centrale = [];
  let decalage = 0;
  const d = new Date();
  const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const f of fichiers) {
    const nom = enc.encode(f.nom), crc = crc32(f.contenu), taille = f.contenu.length;
    const e = new DataView(new ArrayBuffer(30));
    e.setUint32(0, 0x04034b50, true); e.setUint16(4, 20, true); e.setUint16(6, 0x0800, true); e.setUint16(8, 0, true);
    e.setUint16(10, heure, true); e.setUint16(12, date, true); e.setUint32(14, crc, true);
    e.setUint32(18, taille, true); e.setUint32(22, taille, true); e.setUint16(26, nom.length, true); e.setUint16(28, 0, true);
    parties.push(new Uint8Array(e.buffer), nom, f.contenu);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, heure, true); c.setUint16(14, date, true); c.setUint32(16, crc, true);
    c.setUint32(20, taille, true); c.setUint32(24, taille, true); c.setUint16(28, nom.length, true);
    c.setUint32(42, decalage, true);
    centrale.push(new Uint8Array(c.buffer), nom);
    decalage += 30 + nom.length + taille;
  }
  const tailleCentrale = centrale.reduce((s, x) => s + x.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, fichiers.length, true); fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentrale, true); fin.setUint32(16, decalage, true);
  return new Blob([...parties, ...centrale, new Uint8Array(fin.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
