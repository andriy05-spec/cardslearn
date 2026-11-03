import { LIMITS, clean, createId } from './utils.js';

export const STORAGE_KEY = 'woordjes:dictionaries:v1';

export class StorageError extends Error {}

function normalizeWords(words) {
  if (!Array.isArray(words)) return [];
  return words
    .map((w) => ({ uk: clean(w?.uk, LIMITS.word), nl: clean(w?.nl, LIMITS.word) }))
    .filter((w) => w.uk && w.nl)
    .slice(0, LIMITS.words);
}

function normalizeDictionary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = clean(raw.name, LIMITS.name);
  if (!name) return null;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : createId();
  return { id, name, words: normalizeWords(raw.words) };
}

function readAll() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.map(normalizeDictionary).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError' || error?.code === 22;
    throw new StorageError(
      quota
        ? 'Недостатньо місця в LocalStorage. Видаліть зайві словники.'
        : 'LocalStorage недоступний. Перевірте налаштування браузера.'
    );
  }
}

export const getDictionaries = () => readAll();

export const getDictionary = (id) => readAll().find((d) => d.id === id) ?? null;

export function saveDictionary({ id, name, words }) {
  const dict = normalizeDictionary({ id: id || createId(), name, words });
  if (!dict) throw new StorageError('Вкажіть назву словника.');
  if (!dict.words.length) throw new StorageError('Словник повинен містити хоча б одне слово.');
  const list = readAll();
  const index = list.findIndex((d) => d.id === dict.id);
  if (index >= 0) list[index] = dict;
  else list.unshift(dict);
  writeAll(list);
  return dict;
}

export function deleteDictionary(id) {
  writeAll(readAll().filter((d) => d.id !== id));
}
