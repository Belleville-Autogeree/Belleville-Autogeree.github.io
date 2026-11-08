/* ==========================================================
   ELEVENTY – configuration de la construction du site
   Ce fichier doit rester à la racine du dépôt.

   Ce que fait Eleventy ici :
   1. il RECOPIE TEL QUEL tout le site existant (accueil, agenda,
      polices, images…) dans le dossier _site/ ;
   2. il FABRIQUE les pages qui viennent de modèles (fichiers .md et
      .njk) : plus tard, les pages des ressources et leur index.
   Le dossier _site/ est ce qui est publié sur GitHub Pages.

   Commandes (dans le terminal de VS Code) :
     npm run local       → construit et ouvre le site sur http://localhost:8080
                            (se met à jour tout seul quand tu modifies un fichier)
     npm run construire  → construit seulement (c'est ce que fait GitHub)
   ========================================================== */

export default function (eleventyConfig) {
    /* ----------------------------------------------------------
       1. LE SITE EXISTANT, COPIÉ SANS AUCUNE MODIFICATION
       Les fichiers .html ne sont PAS transformés par Eleventy
       (voir templateFormats en bas) : ils sont recopiés à l'identique.
       ---------------------------------------------------------- */
    eleventyConfig.addPassthroughCopy("index.html");    // la redirection vers fr/home.html
    eleventyConfig.addPassthroughCopy("generalitems");  // polices et images (dont celles de l'agenda)

    // Les pages, styles, scripts et données du dossier fr/.
    // ⚠️ Un fichier d'un autre type ajouté dans fr/ (une image .png par exemple)
    // ne serait pas publié : range les images dans generalitems/, ou ajoute
    // son extension dans la liste ci-dessous.
    eleventyConfig.addPassthroughCopy("fr/**/*.{html,css,js,json}");

    /* ----------------------------------------------------------
       2. CE QU'ELEVENTY NE DOIT PAS PUBLIER
       (node_modules/ et _site/ sont déjà ignorés d'office)
       ---------------------------------------------------------- */
    eleventyConfig.ignores.add("README.md");
    eleventyConfig.ignores.add(".github/**");

    return {
        // Seuls ces types de fichiers sont des modèles à transformer.
        // Les .html ne sont pas dans la liste : ils restent intacts.
        templateFormats: ["md", "njk"],

        dir: {
            input: ".",       // les sources : tout le dépôt
            output: "_site",  // le site construit
        },
    };
}
