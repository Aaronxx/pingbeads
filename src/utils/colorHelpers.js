/**
 * Shared color and Mark code helpers.
 */

function isLightColor(hex) {
  if (!hex) return false;
  const normalized = hex.replace('#', '');
  let r;
  let g;
  let b;

  if (normalized.length === 3) {
    r = parseInt(normalized[0] + normalized[0], 16);
    g = parseInt(normalized[1] + normalized[1], 16);
    b = parseInt(normalized[2] + normalized[2], 16);
  } else if (normalized.length === 6) {
    r = parseInt(normalized.substring(0, 2), 16);
    g = parseInt(normalized.substring(2, 4), 16);
    b = parseInt(normalized.substring(4, 6), 16);
  } else {
    return false;
  }

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150;
}

function formatMarkCode(code) {
  if (!code) return '';
  return code.replace(/^([A-Z])0(\d+)$/, '$1$2');
}

function parseMarkCode(input) {
  if (!input) return null;
  const normalized = input.toUpperCase().trim();
  const match = normalized.match(/^([A-Z])(\d+)$/);
  if (!match) return null;
  const letter = match[1];
  const num = parseInt(match[2], 10);
  return num < 10 ? `${letter}0${num}` : `${letter}${num}`;
}

module.exports = {
  isLightColor,
  formatMarkCode,
  parseMarkCode
};
