const fs = require('fs');

const filepath = 'D:/workspace/pinbeans/miniprogram/src/components/colorStats/colorStats.js';
let content = fs.readFileSync(filepath, 'utf8');

console.log('Original length:', content.length);

// 1. 在顶部添加 colorHelpers 的 require
const componentPattern = "Component({";
const colorHelpersRequire = "const { isLightColor } = require('../../utils/colorHelpers');\n\n";

content = content.replace(componentPattern, colorHelpersRequire + componentPattern);

// 2. 替换使用处：this.isLightColor -> isLightColor
content = content.replace(/this\.isLightColor/g, 'isLightColor');

console.log('New length after require and replacements:', content.length);

const lines = content.split('\n');
console.log('Total lines before delete:', lines.length);

// 需要删除的行范围 (1-indexed)
// isLightColor: 49-68

const newLines = [];
for (let i = 0; i < lines.length; i++) {
  const lineNum = i + 1; // 1-indexed
  // 跳过 isLightColor 方法 (49-68)
  if (lineNum >= 49 && lineNum <= 68) continue;

  newLines.push(lines[i]);
}

console.log('Total lines after delete:', newLines.length);

const newContent = newLines.join('\n');
fs.writeFileSync(filepath, newContent, 'utf8');
console.log('colorStats.js updated!');
