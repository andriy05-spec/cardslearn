import { h, $, $$ } from './dom.js';
import { STORAGE_KEY, getDictionaries, saveDictionary, deleteDictionary } from './storage.js';
import { parseWordList, readTextFile } from './csv.js';
import { icon, hydrateIcons, toast, confirmDialog, promptDialog } from './ui.js';
import { LIMITS, plural, wordsLabel, getParam } from './utils.js';
import { SAMPLE_DICTIONARY } from './sample.js';

const MAX_FILE_SIZE = 2 * 1024 * 1024;

const listEl = $('#dict-list');
const emptyEl = $('#empty-state');
const summaryEl = $('#summary');
const fileInput = $('#csv-input');

const encode = encodeURIComponent;

function dictionaryCard(dict) {
  const count = dict.words.length;
  const preview = dict.words.slice(0, 8).map((w) => w.nl).join(' · ');
  const studyLink = count
    ? h('a', { class: 'btn btn--primary', href: `study.html?id=${encode(dict.id)}` }, icon('play'), 'Вчити')
    : h('a', { class: 'btn btn--primary', href: `editor.html?id=${encode(dict.id)}` }, icon('plus'), 'Додати слова');

  return h(
    'article',
    { class: 'dict-card', dataset: { id: dict.id } },
    h(
      'div',
      { class: 'dict-card__body' },
      h('span', { class: 'dict-card__count' }, wordsLabel(count)),
      h('h2', { class: 'dict-card__title' }, dict.name),
      preview && h('p', { class: 'dict-card__preview', lang: 'nl' }, preview)
    ),
    h(
      'div',
      { class: 'dict-card__actions' },
      studyLink,
      h(
        'a',
        { class: 'btn btn--secondary', href: `editor.html?id=${encode(dict.id)}`, title: 'Редагувати' },
        icon('edit'),
        h('span', { class: 'btn__label' }, 'Редагувати')
      ),
      h(
        'button',
        { class: 'btn btn--secondary btn--danger-hover', type: 'button', title: 'Видалити', on: { click: () => removeDictionary(dict) } },
        icon('trash'),
        h('span', { class: 'btn__label' }, 'Видалити')
      )
    )
  );
}

function render() {
  const dictionaries = getDictionaries();
  const totalWords = dictionaries.reduce((sum, d) => sum + d.words.length, 0);
  listEl.replaceChildren(...dictionaries.map(dictionaryCard));
  listEl.hidden = !dictionaries.length;
  emptyEl.hidden = Boolean(dictionaries.length);
  summaryEl.textContent = dictionaries.length
    ? `${dictionaries.length} ${plural(dictionaries.length, ['словник', 'словники', 'словників'])} · ${wordsLabel(totalWords)}`
    : 'Картки для вивчення нідерландських слів';
}

function highlight(id) {
  const card = $$('.dict-card', listEl).find((el) => el.dataset.id === id);
  if (!card) return;
  card.classList.add('is-highlighted');
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  card.addEventListener('animationend', () => card.classList.remove('is-highlighted'), { once: true });
}

function persist(data, message) {
  try {
    const dict = saveDictionary(data);
    render();
    highlight(dict.id);
    toast(message);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function removeDictionary(dict) {
  const ok = await confirmDialog({
    title: 'Видалити словник?',
    message: `Словник «${dict.name}» (${wordsLabel(dict.words.length)}) буде видалено без можливості відновлення.`,
    confirmText: 'Видалити',
    danger: true,
  });
  if (!ok) return;
  try {
    deleteDictionary(dict.id);
    render();
    toast('Словник видалено');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function importSummary({ words, skipped, duplicates, truncated }) {
  const parts = [`Знайдено ${wordsLabel(words.length)}.`];
  if (skipped) parts.push(`Пропущено некоректних рядків: ${skipped}.`);
  if (duplicates) parts.push(`Дублікатів: ${duplicates}.`);
  if (truncated) parts.push(`Обрізано до ${LIMITS.words} слів.`);
  return parts.join(' ');
}

function importPreview(words) {
  return h(
    'ul',
    { class: 'import-preview' },
    words.slice(0, 5).map((w) => h('li', {}, h('span', {}, w.uk), h('span', { lang: 'nl' }, w.nl))),
    words.length > 5 && h('li', { class: 'import-preview__more' }, `і ще ${words.length - 5}…`)
  );
}

async function importFile(file) {
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    toast('Файл завеликий. Максимальний розмір — 2 МБ.', 'error');
    return;
  }
  let parsed;
  try {
    parsed = parseWordList(await readTextFile(file));
  } catch {
    toast('Не вдалося прочитати файл.', 'error');
    return;
  }
  if (!parsed.words.length) {
    toast('У файлі не знайдено жодної пари слів. Очікуваний формат: «будинок: huis».', 'error');
    return;
  }
  const name = await promptDialog({
    title: 'Імпорт словника',
    message: importSummary(parsed),
    label: 'Назва словника',
    value: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, LIMITS.name),
    maxLength: LIMITS.name,
    confirmText: 'Зберегти словник',
    extra: importPreview(parsed.words),
  });
  if (name) persist({ name, words: parsed.words }, `Імпортовано ${wordsLabel(parsed.words.length)}`);
}

function setupDragAndDrop() {
  let depth = 0;
  const hasFiles = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');
  document.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    depth++;
    document.body.classList.add('is-dropping');
  });
  document.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('is-dropping');
  });
  document.addEventListener('dragover', (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  document.addEventListener('drop', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth = 0;
    document.body.classList.remove('is-dropping');
    importFile(event.dataTransfer.files[0]);
  });
}

function init() {
  hydrateIcons();
  render();

  for (const button of $$('[data-action="import"]')) button.addEventListener('click', () => fileInput.click());
  $('[data-action="sample"]').addEventListener('click', () => persist(SAMPLE_DICTIONARY, 'Приклад словника додано'));

  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    importFile(file);
  });

  setupDragAndDrop();

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === null) render();
  });

  const savedId = getParam('saved');
  if (savedId) {
    history.replaceState(null, '', location.pathname);
    highlight(savedId);
    toast('Словник збережено');
  }
}

init();
