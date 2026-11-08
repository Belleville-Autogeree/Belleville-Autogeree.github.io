/* ==========================================================
   RESSOURCES – script de la page liste
   Étape 5 : chargement de l'index, previews, tri, épinglés,
             affichage par lots (« Voir plus »).
   Étape 6 : bandeaux de filtres (nature, pôle), inscrits dans
             l'adresse pour pouvoir partager une sélection.
   (Recherche par mots-clés : mise de côté, peut-être pour une
   future mise à jour. Elle se brancherait dans correspond().)

   La page ne lit qu'un fichier : index.json, fabriqué par
   Eleventy à chaque publication (voir index.11ty.mjs). Il ne
   contient que ce qu'affichent les previews, jamais le
   contenu des documents. Le filtrage se fait en mémoire,
   sans nouvelle requête.
   ========================================================== */
"use strict";

/* ----------------------------------------------------------
   RÉGLAGES (défaut) – modifie ici
   ---------------------------------------------------------- */
const LANGUE = "fr-FR";          // "en-GB" pour la version anglaise
const TAILLE_LOT = 24;           // nombre de previews affichées d'un coup (puis « Voir plus »)
const FICHIER_INDEX = "index.json"; // dans le même dossier que la page (fr/ressources/)

// Noms des filtres dans l'adresse : ressources.html?nature=manifeste,analyse&pole=budget
const PARAMETRE_NATURE = "nature";
const PARAMETRE_POLE = "pole";

/* ----------------------------------------------------------
   TEXTES DE L'INTERFACE – tout est regroupé ici.
   Pour l'anglais : ajouter une entrée "en-GB" et changer LANGUE.
   (Les noms des natures et des pôles viennent de index.json.)
   ---------------------------------------------------------- */
const TEXTES = {
    "fr-FR": {
        titrePage: "Ressources",
        accueil: "Accueil",
        calendrier: "Calendrier",
        epingle: "Épinglé",
        nature: "Nature :",                     // lus par les lecteurs d'écran devant les infos de la preview
        poles: "Pôles :",
        // Filtres
        bandeauNatures: "Nature",
        bandeauPoles: "Pôle",
        effacerFiltres: "Effacer les filtres",
        // Liste
        voirPlus: "Voir plus",
        // « 24 documents affichés sur 57 », « 1 document »
        compteur: (affiches, total) => {
            if (total === 0) return "";
            if (affiches === total) return total === 1 ? "1 document" : `${total} documents`;
            return `${affiches} documents affichés sur ${total}`;
        },
        chargement: "Chargement des ressources…",
        aucunDocument: "Aucun document pour le moment.",
        aucunResultat: "Aucun document ne correspond à ces filtres.",
        erreurChargement: "Impossible de charger les ressources pour le moment. Réessaie dans quelques minutes.",
    },
};
const T = TEXTES[LANGUE];

/* ----------------------------------------------------------
   FORMATS DE DATE (Intl.DateTimeFormat, suit LANGUE)
   Les dates sont des jours "AAAA-MM-JJ" lus à minuit UTC :
   on les affiche en UTC pour ne jamais tomber la veille.
   ---------------------------------------------------------- */
// « 2 nov. 2026 » : format court, pour tenir sur le socle fin des previews
const formatDate = new Intl.DateTimeFormat(LANGUE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/* ----------------------------------------------------------
   PRÉPARATION DES DONNÉES
   index.json est déjà vérifié et trié à la construction ; on
   revérifie quand même ici, pour que la page ne casse jamais
   (fichier abîmé, ancienne version en cache…).
   ---------------------------------------------------------- */

// Renvoie un texte nettoyé, ou "" si la valeur n'est pas un texte
const texte = (valeur) => (typeof valeur === "string" ? valeur.trim() : "");

// "AAAA-MM-JJ" valide → le même texte ; sinon null
function lireDate(valeur) {
    const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte(valeur));
    if (!r) return null;
    const [annee, mois, jour] = r.slice(1).map(Number);
    const test = new Date(Date.UTC(annee, mois - 1, jour));
    const existe = test.getUTCFullYear() === annee && test.getUTCMonth() === mois - 1 && test.getUTCDate() === jour;
    return existe ? r[0] : null;
}

// Une adresse du site (commence par « / ») ; sinon "" (on refuse javascript:, http://ailleurs…)
const adresseDuSite = (valeur) => (/^\/(?!\/)/.test(texte(valeur)) ? texte(valeur) : "");

// [{ valeur, nom }, …] → Map valeur → nom, en gardant l'ordre (c'est l'ordre des boutons de filtre)
function lireListe(liste) {
    const resultat = new Map();
    if (!Array.isArray(liste)) return resultat;
    for (const element of liste) {
        if (texte(element?.valeur) && texte(element?.nom)) resultat.set(texte(element.valeur), texte(element.nom));
    }
    return resultat;
}

// Vignette { src, srcset, largeur, hauteur } valide → nettoyée ; sinon null (image de remplacement)
function lireVignette(v) {
    if (!v || !adresseDuSite(v.src)) return null;
    return {
        src: adresseDuSite(v.src),
        srcset: texte(v.srcset),
        largeur: Number(v.largeur) || null,
        hauteur: Number(v.hauteur) || null,
    };
}

// Ordre de la liste : épinglés d'abord, puis du plus récent au plus ancien,
// les documents sans date à la fin, et à date égale par titre.
function comparerDocuments(a, b) {
    return (b.epingle - a.epingle)
        || (b.date ?? "").localeCompare(a.date ?? "")
        || a.titre.localeCompare(b.titre, LANGUE);
}

function preparerIndex(donnees) {
    natures = lireListe(donnees?.natures);
    poles = lireListe(donnees?.poles);

    if (!Array.isArray(donnees?.documents)) {
        console.warn("[ressources] Le fichier ne contient pas de liste « documents ».", donnees);
        return [];
    }

    const valides = [];
    donnees.documents.forEach((brut, i) => {
        const nom = `Document n°${i + 1}` + (texte(brut?.titre) ? ` (« ${texte(brut.titre)} »)` : "");
        const ignorer = (raison) => console.warn(`[ressources] ${nom} ignoré : ${raison}.`, brut);

        if (!brut || typeof brut !== "object") return ignorer("ce n'est pas un objet");
        if (!texte(brut.titre)) return ignorer("titre manquant");
        if (!adresseDuSite(brut.url)) return ignorer("adresse de la page manquante ou invalide");

        const nature = texte(brut.nature);
        valides.push({
            id: i,
            url: adresseDuSite(brut.url),
            titre: texte(brut.titre),
            date: lireDate(brut.date),                                   // null = sans date (en fin de liste)
            nature: natures.has(nature) ? nature : null,                  // null = style neutre
            poles: (Array.isArray(brut.poles) ? brut.poles : []).map(texte).filter((p) => poles.has(p)),
            epingle: brut.epingle === true,
            format: texte(brut.format),
            vignette: lireVignette(brut.vignette),                       // null = image de remplacement
        });
    });

    valides.sort(comparerDocuments);
    return valides;
}

/* ----------------------------------------------------------
   CONSTRUCTION DES PREVIEWS
   ---------------------------------------------------------- */

// Petit raccourci : crée un élément avec une classe et (éventuellement) un texte
function creer(balise, classe, contenu) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (contenu !== undefined) el.textContent = contenu;
    return el;
}

// Image de remplacement : aplat de la couleur de la nature, avec le titre
function creerRemplacement(doc) {
    const remplacement = creer("span", "preview-remplacement");
    remplacement.append(creer("span", "preview-remplacement-titre", doc.titre));
    remplacement.setAttribute("aria-hidden", "true"); // le titre est déjà lu juste avant
    return remplacement;
}

// L'image de la preview : version réduite, chargée seulement quand elle arrive à l'écran
function creerImage(doc) {
    const image = document.createElement("img");
    image.src = doc.vignette.src;
    if (doc.vignette.srcset) {
        image.srcset = doc.vignette.srcset;
        // largeur affichée : au plus 340 px sur ordinateur (--largeur-max-image), environ un tiers de l'écran sur téléphone
        image.sizes = "(min-width: 768px) 340px, 35vw";
    }
    if (doc.vignette.largeur && doc.vignette.hauteur) {
        image.width = doc.vignette.largeur;   // réserve la place avant le chargement (la page ne saute pas)
        image.height = doc.vignette.hauteur;
    }
    image.alt = "";                // décorative : le titre est écrit juste à côté
    image.loading = "lazy";        // chargée seulement à l'approche de l'écran
    image.decoding = "async";
    // Image introuvable : remplacement plutôt qu'une icône cassée
    image.addEventListener("error", () => image.replaceWith(creerRemplacement(doc)), { once: true });
    return image;
}

// Repère « épinglé » : une punaise (tête ronde + pointe), dessinée en SVG.
// Le mot « Épinglé » reste lisible par les lecteurs d'écran.
function creerPunaise() {
    const repere = creer("span", "preview-epingle");
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const tete = document.createElementNS(ns, "circle");
    tete.setAttribute("cx", "12");
    tete.setAttribute("cy", "8");
    tete.setAttribute("r", "6");
    const pointe = document.createElementNS(ns, "path");
    pointe.setAttribute("d", "M10.6 13.4h2.8L12 23z");
    svg.append(tete, pointe);
    repere.append(svg, creer("span", "visuellement-masque", T.epingle));
    return repere;
}

// Une info du socle (nature, pôles) ; l'étiquette n'est lue que par les lecteurs d'écran
function creerInfo(classe, etiquette, contenu) {
    const info = creer("span", classe);
    if (etiquette) info.append(creer("span", "visuellement-masque", `${etiquette} `));
    info.append(contenu);
    return info;
}

// Les infos écrites sur le socle, en 2 lignes : « NATURE · date », puis les pôles
function creerInfos(doc) {
    const infos = creer("span", "preview-infos");
    const bloc = creer("span", "preview-infos-texte");

    const ligne1 = creer("span", "preview-ligne");
    if (doc.nature) ligne1.append(creerInfo("preview-nature", T.nature, natures.get(doc.nature)));
    if (doc.nature && doc.date) ligne1.append(" · ");
    if (doc.date) {
        const date = creer("time", "preview-date", formatDate.format(new Date(`${doc.date}T00:00:00Z`)));
        date.dateTime = doc.date;
        ligne1.append(date);
    }
    if (ligne1.childNodes.length) bloc.append(ligne1);
    if (doc.poles.length) bloc.append(creerInfo("preview-poles", T.poles, doc.poles.map((p) => poles.get(p)).join(" · ")));

    infos.append(bloc);
    return infos;
}

// Une preview : un lien vers la page du document.
// Dans le HTML : titre, infos, image (ordre de lecture). À l'écran (CSS) : le cadre
// (le socle des infos, et l'image posée dessus), puis le titre en dessous.
// Au survol, l'image glisse et découvre le socle (voir ressources.css).
function creerPreview(doc) {
    const element = creer("li", `preview nature-${doc.nature ?? "neutre"}`);
    if (doc.epingle) element.classList.add("est-epingle");

    const lien = creer("a", "preview-lien");
    lien.href = doc.url;

    // Le texte est dans un <span> à part : c'est lui qui est coupé après 2 lignes
    // (si on coupait le <h2>, la 3e ligne déborderait dans sa marge intérieure)
    const titre = creer("h2", "preview-titre");
    titre.append(creer("span", "preview-titre-texte", doc.titre));

    const visuel = creer("span", "preview-visuel");
    visuel.append(doc.vignette ? creerImage(doc) : creerRemplacement(doc));
    if (doc.epingle) visuel.append(creerPunaise());

    const cadre = creer("span", "preview-cadre");
    cadre.append(creerInfos(doc), visuel);

    lien.append(titre, cadre);
    element.append(lien);
    return element;
}

/* ----------------------------------------------------------
   ÉTAT DE LA PAGE
   ---------------------------------------------------------- */
let documents = [];               // liste préparée par preparerIndex(), déjà triée
let natures = new Map();          // valeur → nom affiché (« compte-rendu » → « Compte rendu »)
let poles = new Map();
let etatChargement = "en-cours";  // "en-cours", "charge" ou "erreur"
let visibles = [];                // documents qui passent les filtres (recalculé à chaque clic)
let nbAffiches = 0;               // combien de previews sont dans la page

// Filtres choisis (aussi dans l'adresse). Un ensemble vide = ce bandeau ne filtre rien.
const filtres = {
    natures: new Set(),
    poles: new Set(),
};

/* ----------------------------------------------------------
   FILTRES
   Logique (défaut) :
   - dans un même bandeau, un document passe s'il correspond à
     L'UNE des valeurs choisies ;
   - entre les deux bandeaux, il doit correspondre AUX DEUX ;
   - un bandeau sans sélection ne filtre rien.
   ---------------------------------------------------------- */
function correspond(doc) {
    const natureOk = filtres.natures.size === 0 || filtres.natures.has(doc.nature);
    const poleOk = filtres.poles.size === 0 || doc.poles.some((p) => filtres.poles.has(p));
    return natureOk && poleOk;
}

const filtresActifs = () => filtres.natures.size > 0 || filtres.poles.size > 0;

// Un bandeau de boutons : un bouton par valeur, qui s'allume et s'éteint au clic
function remplirBandeau(idConteneur, valeurs, choix) {
    const conteneur = document.getElementById(idConteneur);
    conteneur.replaceChildren(...[...valeurs].map(([valeur, nom]) => {
        const bouton = creer("button", "filtre", nom);
        bouton.type = "button";
        bouton.dataset.valeur = valeur;
        bouton.addEventListener("click", () => {
            if (choix.has(valeur)) choix.delete(valeur);
            else choix.add(valeur);
            filtresModifies();
        });
        return bouton;
    }));
}

// Allume les boutons choisis (aria-pressed : « enfoncé » pour les lecteurs d'écran)
function afficherEtatFiltres() {
    for (const [idConteneur, choix] of [["bandeau-natures", filtres.natures], ["bandeau-poles", filtres.poles]]) {
        for (const bouton of document.getElementById(idConteneur).children) {
            bouton.setAttribute("aria-pressed", String(choix.has(bouton.dataset.valeur)));
        }
    }
    document.getElementById("effacer-filtres").hidden = !filtresActifs();
}

// Après chaque clic : adresse, boutons, puis la liste repart du début
function filtresModifies() {
    ecrireAdresse();
    afficherEtatFiltres();
    afficherListe();
}

function effacerFiltres() {
    filtres.natures.clear();
    filtres.poles.clear();
    filtresModifies();
    document.querySelector(".filtre")?.focus(); // le bouton « Effacer » disparaît : le clavier va au premier filtre
}

function preparerFiltres() {
    remplirBandeau("bandeau-natures", natures, filtres.natures);
    remplirBandeau("bandeau-poles", poles, filtres.poles);
    afficherEtatFiltres();
    document.getElementById("filtres").hidden = false;
}

/* ----------------------------------------------------------
   ADRESSE (?nature=manifeste,analyse&pole=budget)
   Les filtres choisis sont écrits dans l'adresse, pour qu'on
   puisse partager un lien vers une sélection. On remplace
   l'adresse (replaceState) sans créer d'entrée d'historique :
   le bouton retour ramène à la page précédente, pas au filtre
   précédent.
   ---------------------------------------------------------- */

// Lit les filtres dans l'adresse. Les valeurs inconnues sont ignorées.
function lireAdresse() {
    const parametres = new URLSearchParams(location.search);
    const lire = (nom, connues, choix) => {
        choix.clear();
        for (const valeur of (parametres.get(nom) ?? "").split(",")) {
            if (connues.has(valeur.trim())) choix.add(valeur.trim());
        }
    };
    lire(PARAMETRE_NATURE, natures, filtres.natures);
    lire(PARAMETRE_POLE, poles, filtres.poles);
    ecrireAdresse(); // nettoie l'adresse si elle contenait des valeurs inconnues
}

function ecrireAdresse() {
    const parametres = new URLSearchParams(location.search);
    parametres.delete(PARAMETRE_NATURE);
    parametres.delete(PARAMETRE_POLE);
    // Dans l'ordre des bandeaux, séparées par des virgules (plus lisible que %2C)
    const enTexte = (connues, choix) => [...connues.keys()].filter((v) => choix.has(v)).map(encodeURIComponent).join(",");
    const morceaux = [parametres.toString()];
    if (filtres.natures.size) morceaux.push(`${PARAMETRE_NATURE}=${enTexte(natures, filtres.natures)}`);
    if (filtres.poles.size) morceaux.push(`${PARAMETRE_POLE}=${enTexte(poles, filtres.poles)}`);
    const recherche = morceaux.filter(Boolean).join("&");
    history.replaceState(null, "", `${location.pathname}${recherche ? `?${recherche}` : ""}${location.hash}`);
}

/* ----------------------------------------------------------
   AFFICHAGE DE LA LISTE
   ---------------------------------------------------------- */

function afficherMessage(contenu) {
    const message = document.getElementById("ressources-message");
    message.textContent = contenu;
    message.hidden = !contenu;
}

// Compteur et bouton « Voir plus », sous la liste
function afficherPied() {
    const total = visibles.length;
    document.getElementById("ressources-compteur").textContent = T.compteur(nbAffiches, total);
    document.getElementById("bouton-voir-plus").hidden = nbAffiches >= total;
}

// Ajoute le lot suivant de previews à la fin de la liste.
// Renvoie le premier élément ajouté (pour y mettre le focus après « Voir plus »).
function ajouterLot() {
    const liste = document.getElementById("liste-ressources");
    const lot = visibles.slice(nbAffiches, nbAffiches + TAILLE_LOT);
    const elements = lot.map(creerPreview);
    liste.append(...elements);
    nbAffiches += lot.length;
    afficherPied();
    return elements[0] ?? null;
}

// Redessine toute la liste depuis le début (au chargement et à chaque changement de filtre)
function afficherListe() {
    visibles = documents.filter(correspond);
    document.getElementById("liste-ressources").replaceChildren();
    nbAffiches = 0;

    if (etatChargement === "charge") {
        if (!documents.length) afficherMessage(T.aucunDocument);
        else afficherMessage(visibles.length ? "" : T.aucunResultat);
    }
    ajouterLot();
}

// « Voir plus » : le lot suivant, et le clavier passe directement au premier nouveau document
function voirPlus() {
    const premierAjoute = ajouterLot();
    premierAjoute?.querySelector("a")?.focus();
}

// Textes fixes de la page (tous rangés dans TEXTES)
function remplirTextesFixes() {
    document.getElementById("titre-page").textContent = T.titrePage;
    document.getElementById("texte-accueil").textContent = T.accueil;
    document.getElementById("texte-calendrier").textContent = T.calendrier;
    document.getElementById("titre-natures").textContent = T.bandeauNatures;
    document.getElementById("titre-poles").textContent = T.bandeauPoles;
    document.getElementById("effacer-filtres").textContent = T.effacerFiltres;
    document.getElementById("bouton-voir-plus").textContent = T.voirPlus;
}

/* ----------------------------------------------------------
   CHARGEMENT DE L'INDEX
   ---------------------------------------------------------- */
async function chargerIndex() {
    afficherMessage(T.chargement);
    try {
        // ?v=… change à chaque fois : le serveur de GitHub Pages ne peut pas
        // renvoyer une vieille copie. cache: "no-store" fait pareil côté navigateur.
        const reponse = await fetch(`${FICHIER_INDEX}?v=${Date.now()}`, { cache: "no-store" });
        if (!reponse.ok) throw new Error(`réponse HTTP ${reponse.status} pour ${FICHIER_INDEX}`);
        documents = preparerIndex(await reponse.json());
        etatChargement = "charge";
    } catch (erreur) {
        console.error("[ressources] Chargement impossible :", erreur);
        etatChargement = "erreur";
        afficherMessage(T.erreurChargement);
        return;
    }
    lireAdresse();       // filtres d'un lien partagé (il faut connaître les natures et pôles d'abord)
    preparerFiltres();
    afficherListe();
}

/* ----------------------------------------------------------
   DÉMARRAGE
   ---------------------------------------------------------- */
remplirTextesFixes();
document.getElementById("bouton-voir-plus").addEventListener("click", voirPlus);
document.getElementById("effacer-filtres").addEventListener("click", effacerFiltres);
chargerIndex();

// Hauteur de l'en-tête, transmise au CSS (--hauteur-entete) : elle sert à calculer
// la taille des previews pour que 2 lignes tiennent à l'écran (voir ressources.css).
// Recalculée quand l'en-tête change de taille (filtres, largeur de la fenêtre).
const entete = document.getElementById("ressources-entete");
new ResizeObserver(() => {
    document.documentElement.style.setProperty("--hauteur-entete", `${entete.offsetHeight}px`);
}).observe(entete);
