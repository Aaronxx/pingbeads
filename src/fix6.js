const fs = require('fs');
const path = 'D:/workspace/pinbeans/miniprogram/src/components/mosaicCanvas/mosaicCanvas.js';

let content = fs.readFileSync(path, 'utf8');
let count = 0;

// Replace triggerEvent to add flatCells
content = content.replace(
  /this\.triggerEvent\('mosaicGenerated', \{ \n        gridInfo: \{ cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \} \n      \}\);/g,
  () => { count++; return `this.triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells
      });`; }
);

fs.writeFileSync(path, content, 'utf8');
console.log('Added flatCells to triggerEvent:', count);