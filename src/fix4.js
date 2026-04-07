const fs = require('fs');
const path = 'D:\\workspace\\pinbeans\\miniprogram\\src\\components\\mosaicCanvas\\mosaicCanvas.js';

let content = fs.readFileSync(path, 'utf8');
let count = 0;

// Add flatCells to triggerEvent
content = content.replace(
  /triggerEvent\('mosaicGenerated', \{ \n        gridInfo: \{ cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \} \n      \}\);/g,
  () => { count++; return `triggerEvent('mosaicGenerated', { 
        gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize },
        flatCells: flatCells
      });`; }
);

fs.writeFileSync(path, content, 'utf8');
console.log('Added flatCells to triggerEvent:', count);