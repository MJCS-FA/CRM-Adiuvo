const NAMED_HTML_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"'
};

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_match, code) => {
      const codePoint = Number(code);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hexCode) => {
      const codePoint = Number.parseInt(hexCode, 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);?/g, (match, name) => {
      const normalizedName = String(name || '').toLowerCase();
      return NAMED_HTML_ENTITIES[normalizedName] ?? match;
    });
}

export function sanitizeDisplayText(value, fallback = '') {
  const rawValue = String(value || '').trim();

  if (!rawValue) {
    return fallback;
  }

  const withoutTags = rawValue.replace(/<[^>]*>/g, ' ');
  const decodedText = decodeHtmlEntities(withoutTags);
  const cleanText = decodedText
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleanText || fallback;
}
