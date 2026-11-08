/* ==========================================================
   ELEVENTY – configuration de la construction du site
   Ce fichier doit rester à la racine du dépôt.

   Ce que fait Eleventy ici :
   1. il RECOPIE TEL QUEL tout le site existant (accueil, agenda,
      polices, images…) dans le dossier _site/ ;
   2. il FABRIQUE les pages des ressources (une par fiche .md,
      avec le modèle fr/ressources/_modeles/document.njk) et
      l'index léger fr/ressources/index.json.
   Le dossier _site/ est ce qui est publié sur GitHub Pages.

   Règle des fichiers des ressources :
     .mjs → code de construction (tourne ici, jamais publié)
     .js  → code des pages (tourne dans le navigateur, publié)

   Commandes (dans le terminal de VS Code) :
     npm run local       → construit et ouvre le site sur http://localhost:8080
                            (se met à jour tout seul ; montre aussi les exemples)
     npm run construire  → construit seulement, sans les exemples (comme GitHub)
   ========================================================== */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import { DOSSIER_SITE, IMAGES, POIDS_MAX_SITE } from "./fr/ressources/_construction/reglages.mjs";

// « npm run local » = mode "serve" : c'est le seul mode où les exemples sont construits
const MODE_LOCAL = process.env.ELEVENTY_RUN_MODE === "serve";

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
    // (Les images et PDF des ressources ne passent pas par ici : seuls leurs
    // versions réduites et les PDF des documents publiés sont mis en ligne.)
    eleventyConfig.addPassthroughCopy("fr/**/*.{html,css,js,json}");

    // Les fichiers de la page À propos (le communiqué de presse en PDF)
    eleventyConfig.addPassthroughCopy("fr/about/fichiers");

    /* ----------------------------------------------------------
       2. CE QU'ELEVENTY NE DOIT PAS PUBLIER
       (node_modules/ et _site/ sont déjà ignorés d'office)
       ---------------------------------------------------------- */
    eleventyConfig.ignores.add("README.md");
    eleventyConfig.ignores.add(".github/**");

    // Les documents d'exemple : seulement avec « npm run local », jamais sur le vrai site
    if (!MODE_LOCAL) eleventyConfig.ignores.add("fr/ressources/exemples/**");

    /* ----------------------------------------------------------
       3. IMAGES INSÉRÉES DANS LE CORPS D'UN TEXTE
       Chaque <img> des pages de document est remplacée par des
       versions réduites (l'image de preview est déjà traitée par
       _construction/preparer.mjs et marquée eleventy:ignore).
       Une image introuvable ou illisible n'arrête pas la
       construction : elle est simplement retirée de la page.
       ---------------------------------------------------------- */
    eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
        formats: ["webp"],
        widths: IMAGES.texte,
        urlPath: IMAGES.dossier,
        outputDir: path.join(DOSSIER_SITE, IMAGES.dossier),
        failOnError: false,
        htmlOptions: {
            imgAttributes: {
                loading: "lazy",
                decoding: "async",
                sizes: "(min-width: 800px) 700px, 100vw",
            },
        },
    });

    // Markdown → HTML : chaque image du texte est marquée « facultative »
    // (eleventy:optional) pour être retirée proprement si elle est introuvable.
    eleventyConfig.amendLibrary("md", (markdown) => {
        const imageParDefaut = markdown.renderer.rules.image;
        markdown.renderer.rules.image = (jetons, i, options, env, moteur) => {
            jetons[i].attrSet("eleventy:optional", "");
            return imageParDefaut(jetons, i, options, env, moteur);
        };
    });

    /* ----------------------------------------------------------
       4. SÉCURITÉ : POIDS TOTAL DU SITE
       GitHub Pages refuse un site de plus de 1 Go. Au-delà de
       POIDS_MAX_SITE (réglages.mjs), la construction échoue :
       rien n'est publié et le site en ligne ne change pas.
       ---------------------------------------------------------- */
    eleventyConfig.on("eleventy.after", ({ directories }) => {
        const poids = poidsDossier(directories.output);
        const enMo = (octets) => `${Math.round(octets / 1024 / 1024)} Mo`;
        console.log(`[site] Poids du site construit : ${enMo(poids)} (maximum ${enMo(POIDS_MAX_SITE)}).`);
        if (poids > POIDS_MAX_SITE) {
            throw new Error(`[site] Le site construit pèse ${enMo(poids)}, au-delà de la limite de ${enMo(POIDS_MAX_SITE)}. Rien n'est publié.`);
        }
    });

    return {
        // Seuls ces types de fichiers sont des modèles à transformer.
        // Les .html ne sont pas dans la liste : ils restent intacts.
        // "11ty.js" couvre aussi les .11ty.mjs (l'index des ressources).
        templateFormats: ["md", "njk", "11ty.js"],

        // Le Markdown reste du Markdown : un {{ ou un {% tapé dans un texte
        // ne doit pas être pris pour une instruction (et faire échouer la construction).
        markdownTemplateEngine: false,

        dir: {
            input: ".",                               // les sources : tout le dépôt
            output: DOSSIER_SITE,                     // le site construit (_site)
            includes: "fr/ressources/_modeles",       // le modèle des pages de document
        },
    };
}

// Poids total d'un dossier et de ses sous-dossiers, en octets
function poidsDossier(dossier) {
    let total = 0;
    for (const element of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, element.name);
        total += element.isDirectory() ? poidsDossier(chemin) : statSync(chemin).size;
    }
    return total;
}
