import { h, $, $$ } from './dom.js';
import { getDictionary, saveDictionary, deleteDictionary } from './storage.js';
import { parseWordList } from './csv.js';
import { icon, hydrateIcons, toast, confirmDialog } from './ui.js';
import { LIMITS, clean, wordsLabel, getParam } from './utils.js';

const EMPTY_ROWS = 5;

const form = $('#editor-form');
const nameInput = $('#dict-name');
const nameError = $('#name-error');
const rowsEl = $('#word-rows');
const wordsError = $('#words-error');
const countEl = $('#word-count');
const deleteButton = $('#delete-dict');

const dictionaryId = getParam('id');
const existing = dictionaryId ? getDictionary(dictionaryId) : null;
let initialSnapshot = '';
let leaving = false;

const rows = () => $$('.word-row', rowsEl);
const inputsOf = (row) => [$('[data-field="uk"]', row), $('[data-field="nl"]', row)];
const isRowEmpty = (row) => inputsOf(row).every((input) => !input.value.trim());

function createRow(uk = '', nl = '') {
  const common = { class: 'input', type: 'text', maxlength: LIMITS.word, autocomplete: 'off', enterkeyhint: 'next' };
  return h(
    'li',
    { class: 'word-row' },
    h('span', { class: 'word-row__num', 'aria-hidden': 'true' }),
    h('input', { ...common, value: uk, lang: 'uk', placeholder: 'Українське слово', 'aria-label': 'Українське слово', dataset: { field: 'uk' } }),
    h('input', { ...common, value: nl, lang: 'nl', placeholder: 'Nederlands', 'aria-label': 'Нідерландський переклад', spellcheck: 'false', autocapitalize: 'off', dataset: { field: 'nl' } }),
    h('button', { class: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': 'Видалити слово', title: 'Видалити слово', dataset: { action: 'delete' } }, icon('trash'))
  );
}

function addRow(after = rowsEl.lastElementChild, values = {}) {
  const row = createRow(values.uk, values.nl);
  row.classList.add('is-new');
  if (after) after.after(row);
  else rowsEl.append(row);
  return row;
}

function collect() {
  return rows().map((row) => inputsOf(row).map((input) => clean(input.value, LIMITS.word)));
}

function snapshot() {
  const words = collect().filter(([uk, nl]) => uk || nl);
  return JSON.stringify([clean(nameInput.value, LIMITS.name), words]);
}

const isDirty = () => !leaving && snapshot() !== initialSnapshot;

function updateCount() {
  const count = collect().filter(([uk, nl]) => uk && nl).length;
  countEl.textContent = wordsLabel(count);
}

function showError(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function clearErrors() {
  nameError.hidden = true;
  wordsError.hidden = true;
  for (const input of $$('[aria-invalid]', form)) input.removeAttribute('aria-invalid');
}

function validate() {
  clearErrors();
  const name = clean(nameInput.value, LIMITS.name);
  const words = [];
  let firstInvalid = null;

  for (const row of rows()) {
    const inputs = inputsOf(row);
    const [uk, nl] = inputs.map((input) => clean(input.value, LIMITS.word));
    if (!uk && !nl) continue;
    if (uk && nl) {
      words.push({ uk, nl });
      continue;
    }
    const invalid = uk ? inputs[1] : inputs[0];
    invalid.setAttribute('aria-invalid', 'true');
    firstInvalid ??= invalid;
  }

  if (firstInvalid) showError(wordsError, 'Заповніть обидва поля в позначених рядках або видаліть їх.');
  else if (!words.length) {
    showError(wordsError, 'Додайте хоча б одне слово з перекладом.');
    firstInvalid = $('[data-field="uk"]', rowsEl) ?? addRow().querySelector('input');
  }

  if (!name) {
    showError(nameError, 'Вкажіть назву словника.');
    nameInput.setAttribute('aria-invalid', 'true');
    firstInvalid = nameInput;
  }

  if (firstInvalid) {
    firstInvalid.focus();
    firstInvalid.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return null;
  }
  return { name, words };
}

function save() {
  const data = validate();
  if (!data) return;
  try {
    const saved = saveDictionary({ id: existing?.id, ...data });
    leaving = true;
    location.href = `index.html?saved=${encodeURIComponent(saved.id)}`;
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function removeDictionary() {
  const ok = await confirmDialog({
    title: 'Видалити словник?',
    message: `Словник «${existing.name}» буде видалено без можливості відновлення.`,
    confirmText: 'Видалити',
    danger: true,
  });
  if (!ok) return;
  try {
    deleteDictionary(existing.id);
    leaving = true;
    location.href = 'index.html';
  } catch (error) {
    toast(error.message, 'error');
  }
}

function deleteRow(row) {
  const next = row.nextElementSibling ?? row.previousElementSibling;
  if (rows().length === 1) {
    for (const input of inputsOf(row)) input.value = '';
    inputsOf(row)[0].focus();
  } else {
    row.remove();
    (next ? $('[data-field="uk"]', next) : $('#add-row')).focus();
  }
  updateCount();
}

function handleEnter(event) {
  if (event.key !== 'Enter' || event.isComposing) return;
  const input = event.target.closest('input');
  if (!input) return;
  event.preventDefault();
  const row = input.closest('.word-row');
  if (input.dataset.field === 'uk') {
    $('[data-field="nl"]', row).focus();
    return;
  }
  const next = row.nextElementSibling ?? addRow(row);
  $('[data-field="uk"]', next).focus();
}

function handlePaste(event) {
  const input = event.target.closest('input');
  const text = event.clipboardData?.getData('text/plain') ?? '';
  if (!input || !/[\r\n]/.test(text.trim())) return;
  const { words } = parseWordList(text);
  if (!words.length) return;
  event.preventDefault();
  let row = input.closest('.word-row');
  words.forEach((word, index) => {
    if (index === 0 && isRowEmpty(row)) {
      const [uk, nl] = inputsOf(row);
      uk.value = word.uk;
      nl.value = word.nl;
    } else {
      row = addRow(row, word);
    }
  });
  $('[data-field="nl"]', row).focus();
  updateCount();
  toast(`Вставлено ${wordsLabel(words.length)}`);
}

function bindEvents() {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save();
  });

  rowsEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="delete"]');
    if (button) deleteRow(button.closest('.word-row'));
  });
  rowsEl.addEventListener('keydown', handleEnter);
  rowsEl.addEventListener('paste', handlePaste);
  rowsEl.addEventListener('input', (event) => {
    event.target.removeAttribute('aria-invalid');
    updateCount();
  });

  nameInput.addEventListener('input', () => {
    nameInput.removeAttribute('aria-invalid');
    nameError.hidden = true;
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    $('[data-field="uk"]', rowsEl)?.focus();
  });

  $('#add-row').addEventListener('click', () => {
    const row = addRow();
    $('[data-field="uk"]', row).focus();
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  deleteButton.addEventListener('click', removeDictionary);

  for (const link of $$('[data-leave]')) {
    link.addEventListener('click', async (event) => {
      if (!isDirty()) return;
      event.preventDefault();
      const ok = await confirmDialog({
        title: 'Вийти без збереження?',
        message: 'Зміни в словнику не буде збережено.',
        confirmText: 'Вийти',
        cancelText: 'Залишитися',
        danger: true,
      });
      if (ok) {
        leaving = true;
        location.href = link.href;
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function init() {
  hydrateIcons();

  if (dictionaryId && !existing) {
    form.hidden = true;
    $('#not-found').hidden = false;
    return;
  }

  const title = existing ? 'Редагування словника' : 'Новий словник';
  $('#page-title').textContent = title;
  document.title = `${title} — Woordjes`;

  if (existing) {
    nameInput.value = existing.name;
    rowsEl.append(...existing.words.map((w) => createRow(w.uk, w.nl)));
    deleteButton.hidden = false;
  } else {
    for (let i = 0; i < EMPTY_ROWS; i++) rowsEl.append(createRow());
    nameInput.focus();
  }
  if (!rows().length) rowsEl.append(createRow());

  updateCount();
  initialSnapshot = snapshot();
  bindEvents();
}

init();
