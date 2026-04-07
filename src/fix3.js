const fs = require('fs');
const path = 'D:\\workspace\\pinbeans\\miniprogram\\src\\components\\mosaicCanvas\\mosaicCanvas.js';

let content = fs.readFileSync(path, 'utf8');
let count = 0;

// Replace setData gridInfo - remove gridData
content = content.replace(
  /gridInfo: \{ gridData: mergedGrid, cols: result\.cols, rows: result\.rows, gridSize: qualityGridSize \}/g,
  () => { count++; return 'gridInfo: { cols: result.cols, rows: result.rows, gridSize: qualityGridSize }'; }
);

fs.writeFileSync(path, content, 'utf8');
console.log('Replacements:', count);