/* ==========================================================
   PAGE D'UN DOCUMENT PDF – lecteur intégré
   Le lecteur PDF des navigateurs marche bien sur ordinateur,
   mal ou pas du tout sur téléphone et tablette (Android :
   rien ; iPhone : une image figée de la 1re page).
   On ne l'affiche donc que là où il fonctionne ; ailleurs, il
   reste le bouton « Ouvrir le PDF », qui ouvre le lecteur du
   téléphone. Le PDF n'est chargé que si le lecteur est affiché.
   ========================================================== */
"use strict";

const LARGEUR_MIN_LECTEUR = 768; // en pixels (défaut) : en dessous, pas de lecteur intégré

const lecteur = document.querySelector(".doc-pdf-lecteur");
const lecteurDisponible =
    navigator.pdfViewerEnabled !== false                 // le navigateur sait afficher un PDF
    && !matchMedia("(pointer: coarse)").matches           // pas un écran tactile (téléphone, tablette)
    && innerWidth >= LARGEUR_MIN_LECTEUR;

if (lecteur && lecteurDisponible) {
    lecteur.src = lecteur.dataset.src;
    lecteur.hidden = false;
}
