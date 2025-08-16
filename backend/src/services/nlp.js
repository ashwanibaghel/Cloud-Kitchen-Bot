const nlp = require('compromise');

function extractOrderIntent(text) {
  const doc = nlp(text.toLowerCase());
  const numbers = doc.numbers().out('array').map(Number);
  const qty = numbers.length > 0 ? numbers[0] : 1;
  let item = '';
  const match = text.match(/(\d+)?\s*([a-z ]+)(?: with|$)/i);
  if (match) item = match[2].trim();
  let customization = '';
  const customMatch = text.match(/with (.+)/i);
  if (customMatch) customization = customMatch[1].trim();
  return {
    intent: 'add_to_cart',
    item,
    qty,
    customization
  };
}

module.exports = { extractOrderIntent };
