import { LIMITS, clean } from './utils.js';

const DELIMITERS = [':', ';', '\t', ','];
const HEADER_UK = /^(українськ|укр|ua|uk|ukrain|слово|word)/i;
const HEADER_NL = /^(нідерланд|голланд|nl|dutch|nederlands|переклад|translation|vertaling)/i;

function splitLine(line, delimiter) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"' && !current.trim()) {
      quoted = true;
      current = '';
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function toPair(line, delimiter) {
  const fields = splitLine(line, delimiter);
  const rest = delimiter === ':' ? fields.slice(1).join(':') : fields[1];
  return { uk: clean(fields[0], LIMITS.word), nl: clean(rest, LIMITS.word) };
}

function detectDelimiter(lines) {
  let best = DELIMITERS[0];
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const score = lines.filter((line) => {
      const { uk, nl } = toPair(line, delimiter);
      return uk && nl;
    }).length;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

export function parseWordList(text) {
  const lines = String(text ?? '')
    .replace(/^﻿/, '')
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'));

  const delimiter = detectDelimiter(lines);
  const seen = new Set();
  const words = [];
  let skipped = 0;
  let duplicates = 0;

  const order = [delimiter, ...DELIMITERS.filter((d) => d !== delimiter)];

  lines.forEach((line, index) => {
    const pair = order.map((d) => toPair(line, d)).find((p) => p.uk && p.nl) ?? {};
    if (!pair.uk || !pair.nl) {
      skipped++;
      return;
    }
    if (index === 0 && HEADER_UK.test(pair.uk) && HEADER_NL.test(pair.nl)) return;
    const key = `${pair.uk.toLocaleLowerCase()}\u0000${pair.nl.toLocaleLowerCase()}`;
    if (seen.has(key)) {
      duplicates++;
      return;
    }
    seen.add(key);
    words.push(pair);
  });

  const truncated = Math.max(0, words.length - LIMITS.words);
  return { words: words.slice(0, LIMITS.words), skipped, duplicates, truncated };
}

export async function readTextFile(file) {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1251').decode(buffer);
  }
}
