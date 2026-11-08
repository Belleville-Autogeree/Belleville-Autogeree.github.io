/* ==========================================================
   INDEX LÉGER DES RESSOURCES → /fr/ressources/index.json
   Fabriqué par Eleventy à chaque construction. La page liste
   (ressources.html) lit ce fichier, comme l'agenda lit
   agenda.json : il ne contient que ce qu'affichent les
   previews, jamais le contenu des documents.

   Forme du fichier :
   {
     "natures":   [{ "valeur": "compte-rendu", "nom": "Compte rendu" }, …],
     "poles":     [{ "valeur": "budget", "nom": "Budget" }, …],
     "documents": [{ "url", "titre", "date", "nature", "poles",
                     "epingle", "format", "vignette" }, …]   (déjà triés)
   }
   ========================================================== */
import { preparerRessource, entreeIndex, comparerDocuments } from "./_construction/preparer.mjs";
import { NOMS_NATURES, NOMS_POLES } from "./_construction/reglages.mjs";

export const data = {
    permalink: "/fr/ressources/index.json",
    eleventyExcludeFromCollections: true,
};

// { "budget": "Budget", … } → [{ valeur: "budget", nom: "Budget" }, …] (l'ordre est gardé)
const enListe = (noms) => Object.entries(noms).map(([valeur, nom]) => ({ valeur, nom }));

export async function render(data) {
    const fiches = data.collections.ressource ?? [];
    const prepares = await Promise.all(fiches.map((fiche) => preparerRessource(fiche.data, fiche.inputPath)));
    const documents = prepares.filter((r) => r.publiable).map(entreeIndex).sort(comparerDocuments);

    return JSON.stringify({
        natures: enListe(NOMS_NATURES),
        poles: enListe(NOMS_POLES),
        documents,
    });
}
