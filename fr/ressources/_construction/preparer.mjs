/* ==========================================================
   RESSOURCES – préparation d'un document, à la construction
   Pour chaque fiche .md, on vérifie les champs saisis dans
   Pages CMS, on applique les règles de robustesse, on réduit
   l'image et on copie le PDF. Le résultat sert :
   - au modèle des pages (_modeles/document.njk) ;
   - à l'index léger lu par la page liste (index.11ty.mjs).

   Règles (un document incomplet ne casse jamais le site) :
   - pas de titre                       → document non publié
   - image > POIDS_MAX_IMAGE            → document non publié
   - PDF > POIDS_MAX_PDF                → document non publié
   - date manquante ou illisible        → publié, en fin de liste, sans date
   - nature inconnue                    → publié, style neutre, sans nature
   - pôle inconnu                       → cette valeur est ignorée
   - image introuvable ou illisible     → publié, image de remplacement
   - PDF introuvable                    → publié, comme texte (ou lien)
   - lien invalide                      → publié, comme texte
   Chaque problème est écrit dans le journal de construction
   (onglet Actions de GitHub), avec le nom du fichier.
   ========================================================== */
import path from "node:path";
import { existsSync, statSync, mkdirSync, copyFileSync } from "node:fs";
import Image from "@11ty/eleventy-img";
import {
    ADRESSE_SITE, DOSSIER_SITE, POIDS_MAX_IMAGE, POIDS_MAX_PDF, IMAGES,
    NOMS_NATURES, NOMS_POLES, T, formatDate,
} from "./reglages.mjs";

/* ----------------------------------------------------------
   PETITS OUTILS
   ---------------------------------------------------------- */

// Renvoie un texte nettoyé, ou "" si la valeur n'est pas un texte
const texte = (valeur) => (typeof valeur === "string" ? valeur.trim() : "");

// 2 621 440 octets → « 2.5 Mo »
const enMo = (octets) => `${(octets / 1024 / 1024).toFixed(1)} Mo`;

// Chemin écrit par Pages CMS ("/fr/ressources/fichiers/x.jpg") → chemin du fichier
// dans le dépôt, ou null s'il n'existe pas (ou s'il essaie de sortir du dépôt).
function fichierDuDepot(chemin) {
    const racine = process.cwd();
    const fichier = path.join(racine, decodeURIComponent(chemin));
    if (!fichier.startsWith(racine + path.sep)) return null;
    return existsSync(fichier) && statSync(fichier).isFile() ? fichier : null;
}

// Date de publication → "AAAA-MM-JJ", ou null si absente ou illisible.
// Le fichier peut contenir une vraie date (2026-11-02) ou un texte ("2026-11-02").
function lireDate(valeur) {
    if (valeur instanceof Date) {
        return Number.isNaN(valeur.getTime()) ? null : valeur.toISOString().slice(0, 10);
    }
    const r = /^(\d{4})-(\d{2})-(\d{2})/.exec(texte(valeur));
    if (!r) return null;
    const [annee, mois, jour] = r.slice(1).map(Number);
    const test = new Date(Date.UTC(annee, mois - 1, jour)); // refuse par exemple le 31 novembre
    const existe = test.getUTCFullYear() === annee && test.getUTCMonth() === mois - 1 && test.getUTCDate() === jour;
    return existe ? r[0] : null;
}

// Adresse web valide (http ou https) → l'adresse ; sinon null
function lireLien(valeur) {
    try {
        const url = new URL(valeur);
        return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    } catch {
        return null;
    }
}

// Fiche "fr/ressources/documents/2026-11-08-compte-rendu.md"
// → adresse "/fr/ressources/documents/2026-11-08-compte-rendu/"
export function adresseDocument(inputPath) {
    const relatif = path.relative(process.cwd(), inputPath).split(path.sep).join("/");
    return `/${relatif.replace(/\.md$/, "")}/`;
}

/* ----------------------------------------------------------
   IMAGES RÉDUITES (eleventy-img)
   Trois séries à partir de l'image envoyée : vignette de la
   liste, image de la page, image de partage. Les noms des
   fichiers fabriqués dépendent de leur contenu : une image
   déjà réduite n'est pas refaite.
   ---------------------------------------------------------- */
const versSrcset = (versions) => versions.map((v) => `${v.url} ${v.width}w`).join(", ");

async function reduireImage(fichier) {
    const commun = {
        outputDir: path.join(DOSSIER_SITE, IMAGES.dossier),
        urlPath: IMAGES.dossier,
    };
    const [vignette, page, partage] = await Promise.all([
        Image(fichier, { ...commun, widths: IMAGES.vignette, formats: ["webp"] }),
        Image(fichier, { ...commun, widths: IMAGES.page, formats: ["webp"] }),
        Image(fichier, { ...commun, widths: [IMAGES.partage], formats: ["jpeg"] }),
    ]);
    const plusGrande = (versions) => versions[versions.length - 1];
    return {
        vignette: {
            src: vignette.webp[0].url,
            srcset: versSrcset(vignette.webp),
            largeur: vignette.webp[0].width,
            hauteur: vignette.webp[0].height,
        },
        page: {
            src: page.webp[0].url,
            srcset: versSrcset(page.webp),
            largeur: plusGrande(page.webp).width,
            hauteur: plusGrande(page.webp).height,
        },
        partage: {
            urlComplete: ADRESSE_SITE + partage.jpeg[0].url,
            largeur: partage.jpeg[0].width,
            hauteur: partage.jpeg[0].height,
        },
    };
}

// Copie le PDF dans le site construit, à la même adresse que dans le dépôt
function publierPdf(fichier, chemin) {
    const destination = path.join(DOSSIER_SITE, decodeURIComponent(chemin));
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(fichier, destination);
}

/* ----------------------------------------------------------
   PRÉPARATION D'UN DOCUMENT
   Appelée plusieurs fois pour le même document (sa page, puis
   l'index) : le résultat est gardé en mémoire, le travail et
   les messages ne sont faits qu'une fois.
   ---------------------------------------------------------- */
const dejaPrepares = new Map();

// Copie des champs de la fiche dans un objet ordinaire.
// Pourquoi : pour savoir de quoi dépend chaque calcul, Eleventy fait d'abord un
// passage « à blanc » où les listes sont des coquilles vides de la bonne longueur
// (leurs éléments ne se lisent qu'un par un). On lit donc chaque élément un par un :
// le résultat est juste dès ce premier passage, et peut être gardé en mémoire.
function lireChamps(data) {
    const liste = (valeur) => (Array.isArray(valeur)
        ? Array.from({ length: valeur.length }, (_, i) => valeur[i])
        : [valeur]);
    return {
        titre: data.titre,
        date_publication: data.date_publication,
        nature: data.nature,
        poles: liste(data.poles),
        image: data.image,
        epingle: data.epingle,
        sous_titre: data.sous_titre,
        pdf: data.pdf,
        lien: data.lien,
    };
}

export function preparerRessource(data, inputPath) {
    const champs = lireChamps(data);
    // La clé change si un champ ou un fichier joint change (utile avec npm run local)
    const dateFichier = (chemin) => {
        const fichier = texte(chemin) && fichierDuDepot(texte(chemin));
        return fichier ? statSync(fichier).mtimeMs : 0;
    };
    const cle = JSON.stringify([inputPath, champs, dateFichier(champs.image), dateFichier(champs.pdf)]);
    if (!dejaPrepares.has(cle)) dejaPrepares.set(cle, preparer(champs, inputPath));
    return dejaPrepares.get(cle);
}

async function preparer(data, inputPath) {
    const nom = path.basename(inputPath);
    const avertir = (message) => console.warn(`[ressources] ${nom} : ${message}.`);
    const refuser = (raison) => {
        console.warn(`[ressources] ${nom} NON PUBLIÉ : ${raison}.`);
        return { publiable: false, raison };
    };

    // 1. Ce qui empêche la publication (vérifié avant tout travail coûteux)
    const titre = texte(data.titre);
    if (!titre) return refuser("titre manquant");

    const cheminImage = texte(data.image);
    const fichierImage = cheminImage ? fichierDuDepot(cheminImage) : null;
    if (cheminImage && !fichierImage) avertir(`image introuvable (${cheminImage}) → image de remplacement`);
    if (fichierImage && statSync(fichierImage).size > POIDS_MAX_IMAGE) {
        return refuser(`image trop lourde (${enMo(statSync(fichierImage).size)}, maximum ${enMo(POIDS_MAX_IMAGE)})`);
    }

    const cheminPdf = texte(data.pdf);
    let fichierPdf = cheminPdf ? fichierDuDepot(cheminPdf) : null;
    if (cheminPdf && !fichierPdf) avertir(`PDF introuvable (${cheminPdf}) → publié sans PDF`);
    if (fichierPdf && !fichierPdf.toLowerCase().endsWith(".pdf")) {
        avertir(`le fichier joint n'est pas un PDF (${cheminPdf}) → publié sans PDF`);
        fichierPdf = null;
    }
    if (fichierPdf && statSync(fichierPdf).size > POIDS_MAX_PDF) {
        return refuser(`PDF trop lourd (${enMo(statSync(fichierPdf).size)}, maximum ${enMo(POIDS_MAX_PDF)})`);
    }

    // 2. Ce qui est corrigé ou ignoré
    const date = lireDate(data.date_publication);
    if (!date) avertir("date de publication manquante ou illisible → affiché en fin de liste, sans date");

    const natureBrute = texte(data.nature);
    const nature = Object.hasOwn(NOMS_NATURES, natureBrute) ? natureBrute : null;
    if (!nature) avertir(`nature ${natureBrute ? `inconnue (« ${natureBrute} »)` : "manquante"} → style neutre`);

    const polesBruts = data.poles.map(texte).filter(Boolean);    // déjà une liste (lireChamps)
    const poles = [...new Set(polesBruts.filter((p) => Object.hasOwn(NOMS_POLES, p)))];
    for (const p of polesBruts) if (!Object.hasOwn(NOMS_POLES, p)) avertir(`pôle inconnu ignoré (« ${p} »)`);

    const lienBrut = texte(data.lien);
    const lien = lienBrut ? lireLien(lienBrut) : null;
    if (lienBrut && !lien) avertir(`lien invalide ignoré (« ${lienBrut} »)`);

    // Format déduit : PDF joint → pdf ; sinon lien → lien ; sinon texte
    const format = fichierPdf ? "pdf" : lien ? "lien" : "texte";

    // 3. Fichiers : image réduite, PDF copié dans le site
    let images = null;
    if (fichierImage) {
        try {
            images = await reduireImage(fichierImage);
        } catch (erreur) {
            avertir(`image illisible (${erreur.message}) → image de remplacement`);
        }
    }
    if (format === "pdf") publierPdf(fichierPdf, cheminPdf);

    // 4. Le document prêt à afficher
    const url = adresseDocument(inputPath);
    const natureNom = nature ? NOMS_NATURES[nature] : "";
    const dateAffichee = date ? formatDate.format(new Date(`${date}T00:00:00Z`)) : "";
    const sousTitre = texte(data.sous_titre);
    return {
        publiable: true,
        url,
        urlComplete: ADRESSE_SITE + url,
        titre,
        sousTitre,
        date,                 // "2026-11-02" ou null
        dateAffichee,         // « 2 novembre 2026 » ou ""
        nature,               // "compte-rendu" ou null (= style neutre)
        natureNom,
        poles,                // ["mouvement-social", …], peut être vide
        polesNoms: poles.map((p) => NOMS_POLES[p]),
        epingle: data.epingle === true || data.epingle === "true",
        format,               // "texte", "pdf" ou "lien"
        pdf: format === "pdf" ? cheminPdf : "",
        lien: lien ? lien.href : "",
        lienDomaine: lien ? lien.hostname.replace(/^www\./, "") : "",
        images,               // null = image de remplacement
        // Texte de l'aperçu de partage : le sous-titre, sinon « Compte rendu · 2 novembre 2026 »
        description: sousTitre || [natureNom, dateAffichee].filter(Boolean).join(" · ") || T.nomSite,
    };
}

/* ----------------------------------------------------------
   INDEX LÉGER : seulement ce qu'affichent les previews
   ---------------------------------------------------------- */
export function entreeIndex(r) {
    return {
        url: r.url,
        titre: r.titre,
        date: r.date,
        nature: r.nature,
        poles: r.poles,
        epingle: r.epingle,
        format: r.format,
        vignette: r.images ? r.images.vignette : null,
    };
}

// Ordre de la liste : épinglés d'abord, puis du plus récent au plus ancien,
// les documents sans date à la fin, et à date égale par titre.
export function comparerDocuments(a, b) {
    return (b.epingle - a.epingle)
        || ((b.date ?? "") > (a.date ?? "") ? 1 : (b.date ?? "") < (a.date ?? "") ? -1 : 0)
        || a.titre.localeCompare(b.titre, "fr");
}

/* ----------------------------------------------------------
   DONNÉES COMMUNES À UN DOSSIER DE FICHES
   (utilisées par documents/documents.11tydata.mjs et
   exemples/exemples.11tydata.mjs)
   ---------------------------------------------------------- */
export function donneesDossier() {
    return {
        layout: "document.njk",      // le modèle unique, dans _modeles/
        tags: ["ressource"],         // regroupe toutes les fiches pour l'index
        textes: T,
        eleventyComputed: {
            ressource: (data) => preparerRessource(data, data.page.inputPath),
            // Document non publiable : aucune page n'est fabriquée
            permalink: async (data) => {
                const r = await preparerRessource(data, data.page.inputPath);
                return r.publiable ? `${r.url}index.html` : false;
            },
        },
    };
}
