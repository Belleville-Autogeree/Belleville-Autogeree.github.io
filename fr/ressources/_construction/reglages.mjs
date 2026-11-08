/* ==========================================================
   RESSOURCES – réglages et textes de la CONSTRUCTION du site
   (lus par Eleventy sur GitHub, jamais envoyés aux visiteurs :
   les fichiers .mjs ne sont pas publiés).

   ⚠️ Les valeurs des natures et des pôles doivent rester
   identiques à celles de .pages.yml (champs nature et poles).
   ========================================================== */

/* ----------------------------------------------------------
   RÉGLAGES (défaut) – modifie ici
   ---------------------------------------------------------- */
export const LANGUE = "fr-FR";                                   // "en-GB" pour la version anglaise
export const ADRESSE_SITE = "https://belleville-autogeree.github.io"; // pour les aperçus de partage (WhatsApp…)
export const DOSSIER_SITE = "_site";                             // dossier du site construit (= eleventy.config.js)

// Poids maximum des fichiers envoyés : au-delà, le document n'est PAS publié
// (le reste du site l'est normalement ; la raison est écrite dans le journal Actions).
export const POIDS_MAX_IMAGE = 2 * 1024 * 1024;    // 2 Mo
export const POIDS_MAX_PDF = 10 * 1024 * 1024;     // 10 Mo

// Sécurité globale : GitHub Pages refuse un site de plus de 1 Go.
// Au-delà de cette limite, la construction échoue et rien n'est publié.
export const POIDS_MAX_SITE = 900 * 1024 * 1024;   // 900 Mo

// Images réduites fabriquées à partir de l'image envoyée (largeurs en pixels).
// Elles sont rangées dans _site/fr/ressources/img/ ; les originaux ne sont jamais publiés.
export const IMAGES = {
    dossier: "/fr/ressources/img/",
    vignette: [360, 720],     // preview de la liste (1 colonne sur 3 ; 720 pour les écrans haute définition)
    page: [540, 1080],        // image en haut de la page d'un document
    partage: 720,             // image des aperçus WhatsApp, Instagram… (en JPG : mieux reconnu)
    texte: [700, 1400],       // images insérées dans le corps d'un texte
};

/* ----------------------------------------------------------
   NATURES ET PÔLES (valeur → nom affiché)
   L'ordre ici est l'ordre des boutons de filtre.
   ---------------------------------------------------------- */
export const NATURES = {
    "fr-FR": {
        "compte-rendu": "Compte rendu",
        manifeste: "Manifeste",
        organisation: "Organisation",
        evenement: "Événement",
        presse: "Presse (ils parlent de nous)",
        analyse: "Analyse",
    },
};

export const POLES = {
    "fr-FR": {
        "section-pilote": "Section pilote",
        releve: "Relevé",
        "mouvement-social": "Mouvement social",
        graphisme: "Graphisme",
        budget: "Budget",
        "occupation-ecole": "Occupation de l'école",
        communication: "Communication",
    },
};

/* ----------------------------------------------------------
   TEXTES DES PAGES DE DOCUMENT – tout est regroupé ici.
   Pour l'anglais : ajouter une entrée "en-GB" et changer LANGUE.
   ---------------------------------------------------------- */
export const TEXTES = {
    "fr-FR": {
        nomSite: "Mobilisation ENSA Paris-Belleville",
        retour: "Toutes les ressources",
        poles: "Pôles",
        ouvrirPdf: "Ouvrir le PDF",
        lecteurPdf: (titre) => `${titre} (PDF)`,              // nom du lecteur, pour les lecteurs d'écran
        ouvrirLien: "Ouvrir le lien",
        lienExterne: (domaine) => `Sur ${domaine}`,
        nouvelOnglet: "(s'ouvre dans un nouvel onglet)",
    },
};

// Raccourcis pour la langue choisie
export const T = TEXTES[LANGUE];
export const NOMS_NATURES = NATURES[LANGUE];
export const NOMS_POLES = POLES[LANGUE];

// « 2 novembre 2026 ». Les dates sont lues à minuit UTC : on les affiche en UTC
// pour ne jamais tomber la veille.
export const formatDate = new Intl.DateTimeFormat(LANGUE, {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});
