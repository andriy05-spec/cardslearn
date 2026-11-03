import { h, $$ } from './dom.js';
import { clean } from './utils.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  upload: 'M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 15V4M7.5 8.5 12 4l4.5 4.5',
  play: 'M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z',
  edit: 'M4 20h4L19.5 8.5a2.12 2.12 0 0 0-3-3L5 17v3zM14.5 7.5l2 2',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
  back: 'M15 18l-6-6 6-6',
  volume: 'M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  flip: 'M4 12a8 8 0 0 1 13.66-5.66L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.66 5.66L4 15.5M4 20v-4.5h4.5',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
};

export function icon(name, className = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  svg.append(path);
  return svg;
}

export function hydrateIcons(root = document) {
  for (const slot of $$('[data-icon]', root)) slot.replaceWith(icon(slot.dataset.icon));
}

let toastRegion;

export function toast(message, type = 'info') {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const item = h('div', { class: `toast toast--${type}` }, icon(type === 'error' ? 'close' : 'check'), h('span', {}, message));
  toastRegion.append(item);
  setTimeout(() => {
    item.classList.add('is-leaving');
    item.addEventListener('animationend', () => item.remove(), { once: true });
    setTimeout(() => item.remove(), 600);
  }, type === 'error' ? 5000 : 3000);
}

export function modal({ title, message, content, confirmText = 'Гаразд', cancelText = 'Скасувати', danger = false, onConfirm, onOpen }) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'modal', 'aria-labelledby': 'modal-title' });
    const close = (result) => {
      if (!dialog.open) return;
      dialog.close();
      dialog.remove();
      resolve(result);
    };
    const form = h(
      'form',
      { class: 'modal__body', method: 'dialog', novalidate: true },
      h('h2', { class: 'modal__title', id: 'modal-title' }, title),
      message && h('p', { class: 'modal__text' }, message),
      content,
      h(
        'div',
        { class: 'modal__actions' },
        h('button', { type: 'button', class: 'btn btn--ghost', on: { click: () => close(null) } }, cancelText),
        h('button', { type: 'submit', class: `btn ${danger ? 'btn--danger' : 'btn--primary'}` }, confirmText)
      )
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const result = onConfirm ? onConfirm() : true;
      if (result !== false) close(result);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close(null);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) close(null);
    });
    dialog.append(form);
    document.body.append(dialog);
    dialog.showModal();
    onOpen?.(dialog);
  });
}

export const confirmDialog = (options) => modal(options).then(Boolean);

export function promptDialog({ label, value = '', maxLength = 80, extra, ...options }) {
  const input = h('input', { class: 'input', type: 'text', id: 'prompt-input', value, maxlength: maxLength, autocomplete: 'off', required: true });
  const error = h('p', { class: 'field-error', hidden: true });
  const content = [
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'prompt-input' }, label), input, error),
    extra,
  ];
  input.addEventListener('input', () => {
    error.hidden = true;
    input.removeAttribute('aria-invalid');
  });
  return modal({
    ...options,
    content,
    onOpen: () => {
      input.focus();
      input.select();
    },
    onConfirm: () => {
      const result = clean(input.value, maxLength);
      if (result) return result;
      error.textContent = 'Це поле не може бути порожнім';
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return false;
    },
  });
}
