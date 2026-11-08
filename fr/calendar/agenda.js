/* ==========================================================
   AGENDA – script
   Étape 1 : grille vide (heures + traits)
   Étape 2 : chargement des données et placement des cartes
   Étapes 3 et 4 : navigation (semaines, jours, adresse) et 5 / 3 / 1 jours selon la largeur.
   Le samedi et le dimanche ne sont jamais affichés.
   ========================================================== */
"use strict";

/* ----------------------------------------------------------
   RÉGLAGES (défaut) – modifie ici
   ---------------------------------------------------------- */
const LANGUE = "fr-FR";          // "en-GB" pour la version anglaise
const FUSEAU = "Europe/Paris";   // les heures du fichier sont des heures de Paris
const HEURE_DEBUT = 9;           // première heure de la grille
const HEURE_FIN = 21;            // dernière heure (bas de la grille)
const MINUTES_PAR_TRANCHE = 15;  // finesse de la grille (doit diviser 60)
const DUREE_COMPACTE = 45;       // en minutes : en dessous, carte compacte (titre + horaire)
const TYPES_CONNUS = [
    "reunion", "atelier", "manif", "formation",
    "conference", "table-ronde", "discussion", "intervention",
]; // une classe CSS par type

// Nombre de jours affichés : le plus grand de cette liste pour lequel chaque
// colonne garde au moins LARGEUR_MIN_COLONNE pixels (sinon les cartes deviennent illisibles).
const LARGEUR_MIN_COLONNE = 150;     // en pixels
const JOURS_PAR_SEMAINE = 5;         // du lundi au vendredi (week-end jamais affiché)
const NB_JOURS_POSSIBLES = [5, 3, 1];

// Fichiers de données, dans le même dossier que la page (fr/calendar/).
// Pour utiliser le fichier de test, ajoute ?test à l'adresse : /fr/calendar/agenda.html?test
const FICHIER_DONNEES = "agenda.json";
const FICHIER_TEST = "agenda-test.json";
const MODE_TEST = new URLSearchParams(location.search).has("test");

/* ----------------------------------------------------------
   TEXTES DE L'INTERFACE – tout est regroupé ici.
   Pour l'anglais : ajouter une entrée "en-GB" et changer LANGUE.
   ---------------------------------------------------------- */
const TEXTES = {
    "fr-FR": {
        heure: (h) => `${h}h`,                 // libellé de la colonne des heures : « 9h »
        demiHeure: "30",                       // libellé d'une demi-heure
        horaire: (minutes) => {                // 630 → « 10h30 », 600 → « 10h »
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
        },
        plage: (debut, fin) => `${debut} – ${fin}`, // « 10h – 11h30 »
        quoi: "Quoi ?",
        qui: "Qui ?",
        ou: "Où ?",
        rienDePrevu: "Rien de prévu ce jour-là",
        erreurChargement: "Impossible de charger l'agenda pour le moment. Réessaie dans quelques minutes.",
        modeTest: "Données de test",

        // Popup
        fermer: "Fermer",
        // « lundi 9 novembre, 10h – 11h30 »
        dateEtHoraire: (jour, plage) => `${jour}, ${plage}`,
        // Nom affiché de chaque type (dans la popup)
        types: {
            reunion: "Réunion",
            atelier: "Atelier",
            manif: "Manif",
            formation: "Formation",
            conference: "Conférence",
            "table-ronde": "Table ronde",
            discussion: "Discussion",
            intervention: "Intervention",
        },

        // Page et barres du haut
        titrePage: "Agenda",
        ressources: "Ressources",
        accueil: "Accueil",
        semainePrecedente: "Semaine précédente",
        semaineSuivante: "Semaine suivante",
        aujourdhui: "Aujourd'hui",
        choixDuJour: "Choisir un jour",
        aDesEvenements: "(au moins un événement)",
        // Version courte, pour les petits écrans : « 9 – 13 nov. »
        libelleSemaineCourt: (debut, fin) => {
            const jourMois = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
            if (debut.getMonth() !== fin.getMonth()) return `${jourMois.format(debut)} – ${jourMois.format(fin)}`;
            return `${debut.getDate()} – ${jourMois.format(fin)}`;
        },
        // « Semaine du 9 au 13 novembre 2026 » (debut et fin sont des objets Date)
        libelleSemaine: (debut, fin) => {
            const jourMois = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });
            const complet = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
            if (debut.getFullYear() !== fin.getFullYear()) {
                return `Semaine du ${complet.format(debut)} au ${complet.format(fin)}`; // 28 déc. 2026 → 3 janv. 2027
            }
            if (debut.getMonth() !== fin.getMonth()) {
                return `Semaine du ${jourMois.format(debut)} au ${complet.format(fin)}`; // 30 nov. → 6 déc.
            }
            return `Semaine du ${debut.getDate()} au ${complet.format(fin)}`;
        },
    },
};
const T = TEXTES[LANGUE];

/* ----------------------------------------------------------
   FORMATS DE DATE (Intl.DateTimeFormat, suit LANGUE)
   ---------------------------------------------------------- */
const formatJourCourt = new Intl.DateTimeFormat(LANGUE, { weekday: "short" });               // « lun. »
const formatJourComplet = new Intl.DateTimeFormat(LANGUE, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const formatJourPopup = new Intl.DateTimeFormat(LANGUE, { weekday: "long", day: "numeric", month: "long" }); // « lundi 9 novembre »

const formatMoisCourt = new Intl.DateTimeFormat(LANGUE, { month: "short" });                 // « nov. »

// « lun. » → « Lun » (pour la barre des jours)
function nomCourtJour(date) {
    const nom = formatJourCourt.format(date).replace(".", "");
    return nom.charAt(0).toUpperCase() + nom.slice(1);
}

// « nov. » → « nov », « juil. » → « juil » (au moins les 3 premières lettres du mois)
function moisCourt(date) {
    return formatMoisCourt.format(date).replace(".", "");
}

/* ----------------------------------------------------------
   OUTILS DE DATE
   Un jour est désigné par une « clé » texte "AAAA-MM-JJ"
   (ex. "2026-11-09") : facile à comparer, à trier, et à mettre
   dans l'adresse à l'étape 3. Une heure est un nombre de
   minutes depuis minuit (ex. 10h30 → 630).
   ---------------------------------------------------------- */

const deuxChiffres = (n) => String(n).padStart(2, "0");

// Clé "AAAA-MM-JJ" → objet Date (à minuit), pour l'affichage avec Intl
function dateDepuisCle(cle) {
    const [annee, mois, jour] = cle.split("-").map(Number);
    return new Date(annee, mois - 1, jour);
}

// Ajoute (ou retire) des jours à une clé : ajouterJours("2026-11-30", 1) → "2026-12-01".
// Les calculs se font en UTC pour ne pas être gênés par les changements d'heure.
function ajouterJours(cle, nombre) {
    const [annee, mois, jour] = cle.split("-").map(Number);
    const d = new Date(Date.UTC(annee, mois - 1, jour + nombre));
    return `${d.getUTCFullYear()}-${deuxChiffres(d.getUTCMonth() + 1)}-${deuxChiffres(d.getUTCDate())}`;
}

// Rang du jour dans la semaine : lundi = 0 … vendredi = 4, samedi = 5, dimanche = 6
function rangDansSemaine(cle) {
    const [annee, mois, jour] = cle.split("-").map(Number);
    return (new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay() + 6) % 7;
}

// Un samedi ou un dimanche devient le lundi suivant (le week-end n'est jamais affiché)
function jourOuvre(cle) {
    const rang = rangDansSemaine(cle);
    return rang < JOURS_PAR_SEMAINE ? cle : ajouterJours(cle, 7 - rang);
}

// Les 5 clés de la semaine (lundi → vendredi) qui contient ce jour
function semaineDe(cle) {
    const lundi = ajouterJours(cle, -rangDansSemaine(cle));
    return Array.from({ length: JOURS_PAR_SEMAINE }, (_, i) => ajouterJours(lundi, i));
}

// Le jour et l'heure qu'il est actuellement À PARIS,
// même si le visiteur est dans un autre fuseau horaire.
function maintenantParis() {
    const format = new Intl.DateTimeFormat("en-CA", {
        timeZone: FUSEAU,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
    // formatToParts découpe la date en morceaux : { year: "2026", month: "11", ... }
    const p = {};
    for (const morceau of format.formatToParts(new Date())) p[morceau.type] = morceau.value;
    return {
        cle: `${p.year}-${p.month}-${p.day}`,
        minutes: Number(p.hour) * 60 + Number(p.minute),
    };
}

// Lit "AAAA-MM-JJTHH:mm" → { cle: "AAAA-MM-JJ", minutes } ; null si illisible
function lireDate(texte) {
    const r = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(texte);
    if (!r) return null;
    const [, annee, mois, jour, heure, minute] = r.map(Number);

    // Vérifie que la date existe vraiment (refuse par exemple le 31 novembre)
    const test = new Date(Date.UTC(annee, mois - 1, jour));
    const dateExiste = test.getUTCFullYear() === annee
        && test.getUTCMonth() === mois - 1
        && test.getUTCDate() === jour;
    if (!dateExiste || heure > 23 || minute > 59) return null;

    return {
        cle: `${annee}-${deuxChiffres(mois)}-${deuxChiffres(jour)}`,
        minutes: heure * 60 + minute,
    };
}

/* ----------------------------------------------------------
   PRÉPARATION DES DONNÉES
   Transforme le contenu brut du fichier en une liste propre,
   triée, sans les événements invalides.
   ---------------------------------------------------------- */

// Renvoie un texte nettoyé, ou "" si la valeur n'est pas un texte
const texte = (valeur) => (typeof valeur === "string" ? valeur.trim() : "");

function preparerEvenements(donnees) {
    if (!donnees || !Array.isArray(donnees.evenements)) {
        console.warn("[agenda] Le fichier ne contient pas de liste « evenements ».", donnees);
        return [];
    }

    const debutPlage = HEURE_DEBUT * 60;
    const finPlage = HEURE_FIN * 60;
    const valides = [];

    donnees.evenements.forEach((brut, i) => {
        const nom = `Événement n°${i + 1}` + (texte(brut?.titre) ? ` (« ${texte(brut.titre)} »)` : "");
        const ignorer = (raison) => console.warn(`[agenda] ${nom} ignoré : ${raison}.`, brut);

        if (!brut || typeof brut !== "object") return ignorer("ce n'est pas un objet");
        if (!texte(brut.titre)) return ignorer("titre manquant");
        if (!texte(brut.debut)) return ignorer("début manquant");
        if (!texte(brut.fin)) return ignorer("fin manquante");

        const debut = lireDate(texte(brut.debut));
        const fin = lireDate(texte(brut.fin));
        if (!debut) return ignorer(`date de début illisible (« ${brut.debut} »)`);
        if (!fin) return ignorer(`date de fin illisible (« ${brut.fin} »)`);

        const finAvantDebut = fin.cle < debut.cle || (fin.cle === debut.cle && fin.minutes <= debut.minutes);
        if (finAvantDebut) return ignorer("la fin est avant ou égale au début");
        if (fin.cle !== debut.cle) return ignorer("il passe minuit (pas encore géré)");
        if (fin.minutes <= debutPlage || debut.minutes >= finPlage) {
            return ignorer(`il est entièrement hors de la plage ${HEURE_DEBUT}h–${HEURE_FIN}h`);
        }
        if (rangDansSemaine(debut.cle) >= JOURS_PAR_SEMAINE) return ignorer("il tombe un week-end (jamais affiché)");

        const type = texte(brut.type).toLowerCase();
        valides.push({
            id: i,                  // numéro unique (sa place dans le fichier)
            titre: texte(brut.titre),
            type: TYPES_CONNUS.includes(type) ? type : null, // null = style neutre
            typeBrut: texte(brut.type), // pour afficher quand même un type inconnu dans la popup
            quoi: texte(brut.quoi),
            qui: texte(brut.qui),
            ou: texte(brut.ou),
            description: texte(brut.description),
            image: texte(brut.image),   // chemin écrit par Pages CMS, ex. "/generalitems/images/agenda/affiche.jpg"
            jour: debut.cle,
            debut: debut.minutes,   // vraies heures (pour les textes)
            fin: fin.minutes,
            debutAffiche: Math.max(debut.minutes, debutPlage), // coupées aux bords de la grille
            finAffiche: Math.min(fin.minutes, finPlage),
        });
    });

    // Tri par jour puis par heure de début : l'ordre du fichier n'a pas d'importance
    valides.sort((a, b) => a.jour.localeCompare(b.jour) || a.debut - b.debut || a.fin - b.fin);
    return valides;
}

/* ----------------------------------------------------------
   PLACEMENT DES CARTES DANS UNE COLONNE
   ---------------------------------------------------------- */
const TRANCHES_PAR_HEURE = 60 / MINUTES_PAR_TRANCHE;                      // 4
const NB_TRANCHES = (HEURE_FIN - HEURE_DEBUT) * TRANCHES_PAR_HEURE;       // 48

// Minutes → numéro de ligne CSS Grid (la ligne 1 est le haut de la grille, à HEURE_DEBUT)
const ligneDepuisMinutes = (minutes) => (minutes - HEURE_DEBUT * 60) / MINUTES_PAR_TRANCHE + 1;

// Calcule la place de chaque événement d'un jour (déjà triés par début).
// Renvoie [{ ev, ligneDebut, ligneFin, colonne, nbColonnes }]
function calculerPlacements(evenementsDuJour) {
    // 1. Position verticale, arrondie aux tranches de 15 min (au moins une tranche)
    const placements = evenementsDuJour.map((ev) => {
        const ligneDebut = Math.floor(ligneDepuisMinutes(ev.debutAffiche));
        const ligneFin = Math.max(Math.ceil(ligneDepuisMinutes(ev.finAffiche)), ligneDebut + 1);
        return { ev, ligneDebut, ligneFin, colonne: 0, nbColonnes: 1 };
    });

    // 2. Chevauchements. On forme des « groupes » d'événements qui se touchent
    //    (directement ou en chaîne). Dans un groupe, chaque événement prend la
    //    première sous-colonne libre ; tout le groupe partage la largeur en
    //    autant de parts qu'il y a de sous-colonnes.
    let groupe = [];
    let finGroupe = 0;
    const fermerGroupe = () => {
        const finsDesColonnes = []; // pour chaque sous-colonne : ligne où elle se libère
        for (const p of groupe) {
            let c = finsDesColonnes.findIndex((fin) => fin <= p.ligneDebut);
            if (c === -1) c = finsDesColonnes.length; // aucune libre : nouvelle sous-colonne
            finsDesColonnes[c] = p.ligneFin;
            p.colonne = c;
        }
        for (const p of groupe) p.nbColonnes = finsDesColonnes.length;
        groupe = [];
    };

    for (const p of placements) {
        if (groupe.length && p.ligneDebut >= finGroupe) fermerGroupe(); // ne touche pas le groupe en cours
        if (!groupe.length) finGroupe = p.ligneFin;
        groupe.push(p);
        finGroupe = Math.max(finGroupe, p.ligneFin);
    }
    if (groupe.length) fermerGroupe();

    return placements;
}

/* ----------------------------------------------------------
   CONSTRUCTION DES ÉLÉMENTS
   ---------------------------------------------------------- */

// Petit raccourci : crée un élément avec une classe et (éventuellement) un texte
function creer(balise, classe, contenu) {
    const el = document.createElement(balise);
    if (classe) el.className = classe;
    if (contenu !== undefined) el.textContent = contenu;
    return el;
}

// Colonne de gauche : « 9h », « 30 », « 10h », « 30 »…
function creerColonneHeures() {
    const colonne = creer("div", "agenda-colonne-heures");
    colonne.setAttribute("aria-hidden", "true"); // décoratif : les cartes donnent les horaires en clair

    for (let h = HEURE_DEBUT; h < HEURE_FIN; h++) {
        const ligneHeure = (h - HEURE_DEBUT) * TRANCHES_PAR_HEURE + 1;

        const heure = creer("span", "agenda-heure", T.heure(h));
        heure.style.gridRow = ligneHeure;
        colonne.append(heure);

        // demi-heure, seulement si elle tombe pile sur une tranche
        if (TRANCHES_PAR_HEURE % 2 === 0) {
            const demi = creer("span", "agenda-demi-heure", T.demiHeure);
            demi.style.gridRow = ligneHeure + TRANCHES_PAR_HEURE / 2;
            colonne.append(demi);
        }
    }
    return colonne;
}

// Une ligne « Quoi ? / valeur » de la carte (rien si la valeur est vide)
function creerLigneCarte(etiquette, valeur, modificateur) {
    if (!valeur) return null;
    const ligne = creer("span", `carte-ligne carte-ligne--${modificateur}`);
    ligne.append(creer("span", "carte-etiquette", etiquette), creer("span", "carte-valeur", valeur));
    return ligne;
}

// La carte d'un événement : un bouton qui ouvre la popup.
// Dans un <button> on n'a droit qu'à des <span> : on les passe en display: block en CSS.
function creerCarte({ ev, ligneDebut, ligneFin, colonne, nbColonnes }) {
    const carte = creer("button", `agenda-carte type-${ev.type ?? "neutre"}`);
    carte.type = "button";
    carte.dataset.id = ev.id; // pour rendre le focus à la bonne carte quand la popup se ferme
    carte.addEventListener("click", () => ouvrirPopup(ev));

    // Position : lignes de la grille (vertical) et sous-colonne (horizontal)
    carte.style.gridRow = `${ligneDebut} / ${ligneFin}`;
    carte.style.setProperty("--colonne", colonne);
    carte.style.setProperty("--nb-colonnes", nbColonnes);

    // Coupée par le haut ou le bas de la grille : coins carrés de ce côté
    if (ev.debut < ev.debutAffiche) carte.classList.add("est-coupee-haut");
    if (ev.fin > ev.finAffiche) carte.classList.add("est-coupee-bas");

    const horaire = T.plage(T.horaire(ev.debut), T.horaire(ev.fin));
    carte.append(creer("span", "carte-titre", ev.titre));

    if (ev.finAffiche - ev.debutAffiche < DUREE_COMPACTE) {
        // Version compacte : titre + horaire
        carte.classList.add("est-compacte");
        carte.append(creer("span", "carte-horaire", horaire));
    } else {
        // Version complète : titre + Quoi / Où (Qui et le reste sont dans la popup).
        // L'horaire est lu par les lecteurs d'écran mais pas affiché (la grille le montre).
        carte.append(creer("span", "visuellement-masque", horaire));
        const lignes = [
            creerLigneCarte(T.quoi, ev.quoi, "quoi"),
            creerLigneCarte(T.ou, ev.ou, "ou"),
        ];
        carte.append(...lignes.filter(Boolean));
    }
    return carte;
}

// Colonne d'un jour, avec ses cartes
function creerColonneJour(cle, position) {
    const colonne = creer("div", "agenda-colonne-jour");
    colonne.style.gridColumn = position + 2;
    colonne.dataset.jour = cle; // sert à retrouver la colonne d'aujourd'hui

    const evenementsDuJour = evenements.filter((ev) => ev.jour === cle);
    if (evenementsDuJour.length) {
        calculerPlacements(evenementsDuJour).forEach((p) => colonne.append(creerCarte(p)));
    } else if (etatChargement === "charge") {
        // (pas pendant le chargement, pour ne pas afficher ce message à tort)
        colonne.append(creer("p", "agenda-vide", T.rienDePrevu));
    }
    return colonne;
}

// Trait de l'heure actuelle, dans la colonne d'aujourd'hui si elle est affichée
function placerTraitMaintenant() {
    document.querySelectorAll(".agenda-maintenant").forEach((trait) => trait.remove());

    const { cle, minutes } = maintenantParis();
    const colonne = document.querySelector(`.agenda-colonne-jour[data-jour="${cle}"]`);
    if (!colonne || minutes < HEURE_DEBUT * 60 || minutes > HEURE_FIN * 60) return null;

    const trait = creer("div", "agenda-maintenant");
    trait.setAttribute("aria-hidden", "true");
    // nombre de tranches écoulées depuis le haut de la grille (peut être décimal)
    trait.style.setProperty("--position", (minutes - HEURE_DEBUT * 60) / MINUTES_PAR_TRANCHE);
    colonne.append(trait);
    return trait;
}

/* ----------------------------------------------------------
   ÉTAT DE LA PAGE
   ---------------------------------------------------------- */
let evenements = [];                // liste préparée par preparerEvenements()
let etatChargement = "en-cours";    // "en-cours", "charge" ou "erreur"
let jourSelectionne = jourOuvre(maintenantParis().cle); // jour choisi (aussi dans l'adresse : #2026-11-09)
let nbJours = 1;                    // 5, 3 ou 1 selon la largeur de l'écran
let defilementInitialFait = false;  // sur mobile, on descend une fois vers l'heure actuelle

/* ----------------------------------------------------------
   JOURS AFFICHÉS ET LARGEUR DE L'ÉCRAN
   ---------------------------------------------------------- */

// Vrai quand toute la semaine est visible : la barre des jours sert alors
// d'en-tête aux colonnes et n'est pas cliquable.
const semaineEntiere = () => nbJours >= JOURS_PAR_SEMAINE;

// Combien de jours tiennent côte à côte sans que les colonnes deviennent trop étroites.
// On mesure la barre des jours sans sa marge gauche, et sans tenir compte de sa marge
// droite : celle-ci change selon le mode (place du cercle ou non). Ainsi le calcul
// donne le même résultat dans les deux modes et ne fait pas « ping-pong ».
function calculerNbJours() {
    const barre = document.getElementById("barre-jours");
    const largeurUtile = barre.clientWidth - parseFloat(getComputedStyle(barre).paddingLeft);
    const largeurHeures = document.querySelector(".agenda-colonne-heures")?.offsetWidth || 72;
    const place = largeurUtile - largeurHeures;
    return NB_JOURS_POSSIBLES.find((n) => place / n >= LARGEUR_MIN_COLONNE) ?? 1;
}

// Les jours à afficher, selon nbJours :
// 5 → toute la semaine ; 3 → une fenêtre de 3 jours qui contient le jour choisi,
// sans sortir de la semaine (vendredi → mercredi, jeudi, vendredi) ; 1 → le jour choisi.
function joursAffiches() {
    const semaine = semaineDe(jourSelectionne);
    if (semaineEntiere()) return semaine;
    if (nbJours === 1) return [jourSelectionne];

    const rang = semaine.indexOf(jourSelectionne);
    const premier = Math.min(Math.max(rang - 1, 0), JOURS_PAR_SEMAINE - nbJours); // jour choisi au milieu si possible
    return semaine.slice(premier, premier + nbJours);
}

/* ----------------------------------------------------------
   ADRESSE (#2026-11-09)
   Changer de jour = changer l'adresse. Le navigateur crée une
   entrée d'historique (le bouton retour marche), puis l'événement
   « hashchange » redessine la page.
   ---------------------------------------------------------- */

// Lit le jour dans l'adresse ; s'il manque ou est invalide, on prend aujourd'hui.
// Un samedi ou un dimanche est remplacé par le lundi suivant.
function lireAdresse() {
    const cle = decodeURIComponent(location.hash.slice(1));
    const valide = /^\d{4}-\d{2}-\d{2}$/.test(cle) && lireDate(`${cle}T00:00`) !== null;
    jourSelectionne = jourOuvre(valide ? cle : maintenantParis().cle);
    if (jourSelectionne !== cle) {
        // replaceState : on corrige l'adresse sans créer d'entrée d'historique
        history.replaceState(null, "", `${location.pathname}${location.search}#${jourSelectionne}`);
    }
}

function allerAuJour(cle) {
    if (cle === jourSelectionne) return;
    location.hash = cle; // → hashchange → lireAdresse() + afficher()
}

/* ----------------------------------------------------------
   BARRES DU HAUT
   ---------------------------------------------------------- */

// Textes fixes de la page (tous rangés dans TEXTES)
function remplirTextesFixes() {
    document.getElementById("titre-page").textContent = T.titrePage;
    document.getElementById("texte-ressources").textContent = T.ressources;
    document.getElementById("texte-accueil").textContent = T.accueil;
    document.getElementById("bouton-aujourdhui").textContent = T.aujourdhui;
    const fermer = document.getElementById("popup-fermer");
    fermer.setAttribute("aria-label", T.fermer);
    fermer.title = T.fermer;
    for (const [id, texte] of [["semaine-precedente", T.semainePrecedente], ["semaine-suivante", T.semaineSuivante]]) {
        const bouton = document.getElementById(id);
        bouton.setAttribute("aria-label", texte);
        bouton.title = texte;
    }
}

// Barre 1 : le libellé de la semaine (version longue + version courte pour mobile)
function afficherBarreSemaine() {
    const semaine = semaineDe(jourSelectionne);
    const lundi = dateDepuisCle(semaine[0]);
    const vendredi = dateDepuisCle(semaine[semaine.length - 1]);
    const libelle = document.getElementById("libelle-semaine");
    libelle.replaceChildren(
        creer("span", "libelle-long", T.libelleSemaine(lundi, vendredi)),
        creer("span", "libelle-court", T.libelleSemaineCourt(lundi, vendredi)),
    );
}

// Contenu d'une case de la barre des jours : « Lun » puis « 9 nov »
function remplirCaseJour(element, cle) {
    const date = dateDepuisCle(cle);
    element.dataset.jour = cle;
    element.append(
        creer("span", "jour-nom", nomCourtJour(date)),
        creer("span", "jour-date", `${date.getDate()} ${moisCourt(date)}`),
    );
    if (cle === maintenantParis().cle) {
        element.classList.add("est-aujourdhui");
        element.setAttribute("aria-current", "date");
    }
}

// Barre 2 : les jours.
// - Semaine entière visible (PC) : simples en-têtes alignés sur les colonnes, non cliquables.
// - Sinon (mobile, écran moyen) : boutons pour choisir le jour.
function afficherBarreJours() {
    const barre = document.getElementById("barre-jours");
    const avaitLeFocus = barre.contains(document.activeElement); // pour le rendre après (clavier)
    const semaine = semaineDe(jourSelectionne);

    // Le mode est aussi écrit sur <body> : le CSS adapte la mise en page
    document.body.dataset.mode = semaineEntiere() ? "semaine" : "jour";

    if (semaineEntiere()) {
        barre.removeAttribute("role");
        barre.removeAttribute("aria-label");
        const coin = creer("div", "barre-jours-coin"); // au-dessus de la colonne des heures
        coin.setAttribute("aria-hidden", "true");
        barre.replaceChildren(coin, ...semaine.map((cle) => {
            const entete = creer("div", "case-jour");
            remplirCaseJour(entete, cle);
            return entete;
        }));
        return;
    }

    barre.setAttribute("role", "group");
    barre.setAttribute("aria-label", T.choixDuJour);
    const affiches = joursAffiches();
    const joursAvecEvenements = new Set(evenements.map((ev) => ev.jour));

    barre.replaceChildren(...semaine.map((cle) => {
        const bouton = creer("button", "case-jour bouton-jour");
        bouton.type = "button";
        bouton.title = formatJourComplet.format(dateDepuisCle(cle));
        remplirCaseJour(bouton, cle);

        if (affiches.includes(cle)) bouton.classList.add("est-affiche");
        if (cle === jourSelectionne) bouton.classList.add("est-selectionne");
        bouton.setAttribute("aria-pressed", String(cle === jourSelectionne));
        if (joursAvecEvenements.has(cle)) {
            bouton.classList.add("a-evenements");
            bouton.append(creer("span", "visuellement-masque", T.aDesEvenements));
        }

        bouton.addEventListener("click", () => allerAuJour(cle));
        return bouton;
    }));

    if (avaitLeFocus) barre.querySelector(`[data-jour="${jourSelectionne}"]`)?.focus();
}

/* ----------------------------------------------------------
   AFFICHAGE DE LA GRILLE
   ---------------------------------------------------------- */
function afficherGrille() {
    const grille = document.getElementById("agenda-grille");
    const jours = joursAffiches();

    // Les valeurs de la grille sont transmises au CSS sous forme de variables
    grille.style.setProperty("--nb-jours", jours.length);
    grille.style.setProperty("--nb-tranches", NB_TRANCHES);
    grille.style.setProperty("--tranches-par-heure", TRANCHES_PAR_HEURE);

    // Les noms des jours sont dans la barre des jours : la grille n'a que les colonnes
    grille.replaceChildren(creerColonneHeures(), ...jours.map((cle, i) => creerColonneJour(cle, i)));
    const trait = placerTraitMaintenant();

    // Sur mobile (1 jour), si c'est aujourd'hui : on ouvre la page autour de l'heure actuelle (une seule fois)
    if (!defilementInitialFait && etatChargement !== "en-cours") {
        defilementInitialFait = true;
        if (nbJours === 1 && trait) trait.scrollIntoView({ block: "center" });
    }
}

// Redessine tout (barres + grille)
function afficher() {
    afficherBarreSemaine();
    afficherBarreJours();
    afficherGrille();
}

/* ----------------------------------------------------------
   POPUP (élément <dialog> natif)
   showModal() l'ouvre par-dessus la page ; la touche Échap la
   ferme toute seule. On ajoute : le bouton ×, le clic en dehors,
   et le retour du focus sur la carte.
   ---------------------------------------------------------- */
let idPopupOuverte = null; // id de l'événement affiché, pour rendre le focus à sa carte

// Une ligne « Quoi ? / valeur » de la popup (rien si la valeur est vide)
function ajouterLignePopup(liste, etiquette, valeur, modificateur) {
    if (!valeur) return;
    const ligne = creer("div", `popup-ligne popup-ligne--${modificateur}`);
    ligne.append(creer("dt", "", etiquette), creer("dd", "", valeur));
    liste.append(ligne);
}

// Affiche un élément seulement s'il a un contenu
function remplirOuCacher(id, contenu) {
    const element = document.getElementById(id);
    element.textContent = contenu;
    element.hidden = !contenu;
}

function ouvrirPopup(ev) {
    const popup = document.getElementById("popup");
    popup.className = `popup type-${ev.type ?? "neutre"}`; // même couleur que la carte

    remplirOuCacher("popup-type", ev.type ? T.types[ev.type] : ev.typeBrut);
    remplirOuCacher("popup-titre", ev.titre);
    remplirOuCacher("popup-date", T.dateEtHoraire(
        formatJourPopup.format(dateDepuisCle(ev.jour)),
        T.plage(T.horaire(ev.debut), T.horaire(ev.fin)),
    ));

    const image = document.getElementById("popup-image");
    if (ev.image) {
        image.src = ev.image;
        image.alt = ev.titre;
        image.hidden = false;
    } else {
        image.removeAttribute("src");
        image.hidden = true;
    }

    const infos = document.getElementById("popup-infos");
    infos.replaceChildren();
    ajouterLignePopup(infos, T.quoi, ev.quoi, "quoi");
    ajouterLignePopup(infos, T.qui, ev.qui, "qui");
    ajouterLignePopup(infos, T.ou, ev.ou, "ou");
    infos.hidden = !infos.children.length;

    remplirOuCacher("popup-description", ev.description);

    idPopupOuverte = ev.id;
    popup.showModal();
    popup.scrollTop = 0; // toujours ouverte en haut
}

function preparerPopup() {
    const popup = document.getElementById("popup");

    document.getElementById("popup-fermer").addEventListener("click", () => popup.close());

    // Clic en dehors : le fond grisé fait partie du <dialog> lui-même,
    // alors que le contenu est dans .popup-contenu. Si on clique sur le <dialog>
    // et pas sur un de ses enfants, c'est qu'on a cliqué à côté.
    popup.addEventListener("click", (e) => {
        if (e.target === popup) popup.close();
    });

    // Image introuvable : on la cache plutôt qu'afficher une icône cassée
    document.getElementById("popup-image").addEventListener("error", (e) => {
        e.target.hidden = true;
    });

    // À la fermeture (bouton, Échap ou clic dehors) : le focus revient sur la carte
    popup.addEventListener("close", () => {
        document.querySelector(`.agenda-carte[data-id="${idPopupOuverte}"]`)?.focus();
    });
}

function afficherMessage(contenu) {
    const message = document.getElementById("agenda-message");
    message.textContent = contenu;
    message.hidden = false;
}

/* ----------------------------------------------------------
   CHARGEMENT DES DONNÉES
   ---------------------------------------------------------- */
async function chargerEvenements() {
    const fichier = MODE_TEST ? FICHIER_TEST : FICHIER_DONNEES;
    try {
        // ?v=… change à chaque fois : le serveur de GitHub Pages ne peut pas
        // renvoyer une vieille copie. cache: "no-store" fait pareil côté navigateur.
        const reponse = await fetch(`${fichier}?v=${Date.now()}`, { cache: "no-store" });
        if (!reponse.ok) throw new Error(`réponse HTTP ${reponse.status} pour ${fichier}`);
        evenements = preparerEvenements(await reponse.json());
        etatChargement = "charge";
    } catch (erreur) {
        console.error("[agenda] Chargement impossible :", erreur);
        etatChargement = "erreur";
        afficherMessage(T.erreurChargement);
    }
    afficher();
}

/* ----------------------------------------------------------
   DÉMARRAGE
   ---------------------------------------------------------- */
if (MODE_TEST) {
    const badge = creer("p", "agenda-badge-test", `${T.modeTest} (${FICHIER_TEST})`);
    document.querySelector(".agenda").prepend(badge);
}

remplirTextesFixes();
preparerPopup();
lireAdresse();                               // jour choisi = celui de l'adresse, sinon aujourd'hui
afficher();                                   // grille vide tout de suite
nbJours = calculerNbJours();                  // maintenant que la page existe, on peut la mesurer
afficher();
chargerEvenements();                          // puis les cartes, dès que le fichier arrive

// Boutons de la barre de semaine
document.getElementById("semaine-precedente").addEventListener("click", () => allerAuJour(ajouterJours(jourSelectionne, -7)));
document.getElementById("semaine-suivante").addEventListener("click", () => allerAuJour(ajouterJours(jourSelectionne, 7)));
document.getElementById("bouton-aujourdhui").addEventListener("click", () => allerAuJour(jourOuvre(maintenantParis().cle)));

// Bouton retour / avance du navigateur, ou lien partagé ouvert dans l'onglet
window.addEventListener("hashchange", () => {
    lireAdresse();
    afficher();
});

// Fenêtre redimensionnée : on recalcule 7, 3 ou 1 jour, et on redessine seulement si ça change
new ResizeObserver(() => {
    const n = calculerNbJours();
    if (n !== nbJours) {
        nbJours = n;
        afficher();
    }
}).observe(document.getElementById("barre-jours"));

setInterval(placerTraitMaintenant, 60 * 1000); // le trait de l'heure avance chaque minute
