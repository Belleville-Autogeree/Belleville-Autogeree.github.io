/* Optionnel : remplace le bruit SVG par un bruit pixel par pixel,
   comme « Ajout de bruit » dans Photoshop. Sans ce fichier,
   grain.css fonctionne seul. */
(() => {
  const SIZE = 256;      // tuile de bruit, en pixels
  const SPREAD = 0.116;  // dispersion du bruit, alignée sur le bruit SVG
                         // (l'intensité se règle ensuite en CSS)

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const px = img.data;

  for (let i = 0; i < px.length; i += 4) {
    // somme de trois tirages : répartition proche d'une loi normale
    const z = (Math.random() + Math.random() + Math.random() - 1.5) * 2;
    const v = Math.max(0, Math.min(255, Math.round(127.5 + z * SPREAD * 255)));
    px[i] = px[i + 1] = px[i + 2] = v; // gris : la couleur vient du mode de fusion
    px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  canvas.toBlob((blob) => {
    if (!blob) return; // on garde le bruit SVG
    const root = document.documentElement.style;
    root.setProperty('--grain-image', `url(${URL.createObjectURL(blob)})`);
    root.setProperty('--grain-tile', `${SIZE}px`);
    root.setProperty('--grain-rendering', 'pixelated'); // pixels nets, pas lissés
  });
})();