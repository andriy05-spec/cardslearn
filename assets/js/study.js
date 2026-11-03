import { $, $$ } from './dom.js';
import { getDictionary } from './storage.js';
import { hydrateIcons } from './ui.js';
import { speak, stopSpeaking, isSpeechSupported } from './speech.js';
import { shuffle, formatDuration, getParam, plural, wordsLabel } from './utils.js';

const LEAVE_DURATION = matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 300;

const el = {
  name: $('#dict-name'),
  roundInfo: $('#round-info'),
  timer: $('#timer'),
  timerValue: $('#timer-value'),
  progress: $('#progress'),
  known: $('#progress-known'),
  total: $('#progress-total'),
  percent: $('#progress-percent'),
  bar: $('#progress-bar'),
  fill: $('#progress-fill'),
  stage: $('#card-stage'),
  card: $('#card'),
  front: $('#card-front'),
  back: $('#card-back'),
  faces: $$('.card__face'),
  speak: $('#speak'),
  know: $('#btn-know'),
  dont: $('#btn-dont'),
  flip: $('#btn-flip'),
  announcer: $('#announcer'),
};

const views = {
  study: $('#study-view'),
  round: $('#round-view'),
  done: $('#done-view'),
  missing: $('#missing-view'),
};

let words = [];
let session = null;
let currentView = null;
let timerId = null;
let drag = null;

const currentWord = () => session.deck[session.index];
const sizeFor = (text) => (text.length > 28 ? 's' : text.length > 14 ? 'm' : 'l');

function showView(name) {
  currentView = name;
  for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
  const inSession = name !== 'missing';
  el.progress.hidden = !inSession;
  el.timer.hidden = !inSession;
}

function announce(text) {
  el.announcer.textContent = text;
}

function updateProgress() {
  const { known, total } = session;
  const percent = total ? Math.round((known / total) * 100) : 0;
  el.known.textContent = known;
  el.total.textContent = total;
  el.percent.textContent = `${percent}%`;
  el.fill.style.width = `${percent}%`;
  el.bar.setAttribute('aria-valuenow', percent);
  el.bar.setAttribute('aria-valuetext', `${known} з ${total}`);
}

function updateTimer() {
  const end = session.finishedAt ?? Date.now();
  el.timerValue.textContent = formatDuration(end - session.startedAt);
}

function startTimer() {
  clearInterval(timerId);
  updateTimer();
  timerId = setInterval(updateTimer, 500);
}

function setSwipeFeedback(value) {
  el.card.style.setProperty('--know', Math.max(0, value).toFixed(3));
  el.card.style.setProperty('--dont', Math.max(0, -value).toFixed(3));
  el.know.classList.toggle('is-active', value > 0.6);
  el.dont.classList.toggle('is-active', value < -0.6);
}

function setFlipped(flipped, instant = false) {
  session.flipped = flipped;
  if (instant) el.card.classList.add('no-anim');
  el.card.classList.toggle('is-flipped', flipped);
  el.faces[0].setAttribute('aria-hidden', String(flipped));
  el.faces[1].setAttribute('aria-hidden', String(!flipped));
  el.speak.tabIndex = flipped ? 0 : -1;
  if (instant) {
    void el.card.offsetWidth;
    el.card.classList.remove('no-anim');
  }
}

function renderCard() {
  const word = currentWord();
  const remaining = session.deck.length - session.index;

  el.card.classList.add('no-anim');
  el.card.classList.remove('is-dragging', 'is-leaving');
  el.card.style.transform = '';
  el.card.style.opacity = '';
  setSwipeFeedback(0);

  el.front.textContent = word.uk;
  el.back.textContent = word.nl;
  el.front.dataset.size = sizeFor(word.uk);
  el.back.dataset.size = sizeFor(word.nl);
  setFlipped(false, true);

  el.stage.dataset.stack = Math.min(remaining, 3);
  el.roundInfo.textContent = `Раунд ${session.round} · картка ${session.index + 1} з ${session.deck.length}`;

  void el.card.offsetWidth;
  el.card.classList.remove('no-anim');
  el.card.classList.remove('is-entering');
  void el.card.offsetWidth;
  el.card.classList.add('is-entering');
  announce(`Нова картка: ${word.uk}`);
}

function startSession() {
  stopSpeaking();
  session = {
    total: words.length,
    known: 0,
    round: 1,
    deck: shuffle(words),
    index: 0,
    missed: [],
    roundKnown: 0,
    startedAt: Date.now(),
    finishedAt: null,
    flipped: false,
    busy: false,
  };
  showView('study');
  updateProgress();
  renderCard();
  startTimer();
}

function flip() {
  if (!session || session.busy || currentView !== 'study') return;
  setFlipped(!session.flipped);
  if (session.flipped) announce(`Переклад: ${currentWord().nl}`);
}

function flyOut(direction) {
  el.card.classList.remove('is-dragging', 'is-entering');
  el.card.classList.add('is-leaving');
  setSwipeFeedback(direction);
  const distance = window.innerWidth * 0.6 + el.card.offsetWidth;
  el.card.style.transform = `translate(${direction * distance}px, -20px) rotate(${direction * 18}deg)`;
  el.card.style.opacity = '0';
  return new Promise((resolve) => setTimeout(resolve, LEAVE_DURATION));
}

async function answer(known) {
  if (!session || session.busy || currentView !== 'study') return;
  session.busy = true;
  stopSpeaking();
  const word = currentWord();
  if (known) {
    session.known++;
    session.roundKnown++;
  } else {
    session.missed.push(word);
  }
  updateProgress();
  await flyOut(known ? 1 : -1);
  session.busy = false;
  session.index++;
  if (session.index < session.deck.length) renderCard();
  else endRound();
}

function endRound() {
  if (!session.missed.length) {
    finish();
    return;
  }
  $('#round-title').textContent = `Раунд ${session.round} завершено`;
  $('#round-text').textContent = `Ще ${wordsLabel(session.missed.length)} для повторення. Наступна колода буде перемішана.`;
  $('#round-known').textContent = session.roundKnown;
  $('#round-missed').textContent = session.missed.length;
  $('#next-round').textContent = `Почати раунд ${session.round + 1}`;
  el.roundInfo.textContent = `Раунд ${session.round} завершено`;
  showView('round');
  $('#next-round').focus();
}

function startNextRound() {
  if (currentView !== 'round') return;
  const last = session.deck[session.deck.length - 1];
  const deck = shuffle(session.missed);
  if (deck.length > 1 && deck[0] === last) {
    const swap = 1 + Math.floor(Math.random() * (deck.length - 1));
    [deck[0], deck[swap]] = [deck[swap], deck[0]];
  }
  Object.assign(session, { deck, index: 0, missed: [], roundKnown: 0, round: session.round + 1 });
  showView('study');
  renderCard();
  el.card.focus({ preventScroll: true });
}

function finish() {
  session.finishedAt = Date.now();
  clearInterval(timerId);
  updateTimer();
  $('#done-score').textContent = `${session.known} / ${session.total}`;
  $('#done-words').textContent = session.known;
  $('#done-time').textContent = formatDuration(session.finishedAt - session.startedAt);
  $('#done-rounds').textContent = session.round;
  $('#done-rounds-label').textContent = plural(session.round, ['раунд', 'раунди', 'раундів']);
  el.roundInfo.textContent = 'Усі слова вивчено';
  showView('done');
  $('#restart').focus();
}

function speakCurrent() {
  if (!session || currentView !== 'study') return;
  speak(currentWord().nl, {
    onStart: () => el.speak.classList.add('is-speaking'),
    onEnd: () => el.speak.classList.remove('is-speaking'),
  });
}

function swipeThreshold() {
  return Math.min(120, el.card.offsetWidth * 0.28);
}

function resetDrag() {
  el.card.classList.remove('is-dragging');
  el.card.style.transform = '';
  setSwipeFeedback(0);
}

function bindSwipe() {
  const { card } = el;

  card.addEventListener('pointerdown', (event) => {
    if (!session || session.busy || currentView !== 'study') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const now = performance.now();
    drag = { onButton: Boolean(event.target.closest('button')), id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false, lastX: event.clientX, lastT: now, vx: 0 };
  });

  card.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.dx = event.clientX - drag.x;
    drag.dy = event.clientY - drag.y;
    const now = performance.now();
    const dt = Math.max(1, now - drag.lastT);
    drag.vx = drag.vx * 0.5 + ((event.clientX - drag.lastX) / dt) * 0.5;
    drag.lastX = event.clientX;
    drag.lastT = now;

    if (!drag.moved) {
      if (Math.abs(drag.dx) < 8) {
        if (Math.abs(drag.dy) > 12) drag = null;
        return;
      }
      drag.moved = true;
      card.setPointerCapture?.(event.pointerId);
      card.classList.remove('is-entering');
      card.classList.add('is-dragging');
    }
    card.style.transform = `translate(${drag.dx}px, ${drag.dy * 0.2}px) rotate(${drag.dx * 0.05}deg)`;
    setSwipeFeedback(Math.max(-1, Math.min(1, drag.dx / swipeThreshold())));
  });

  card.addEventListener('pointerup', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const gesture = drag;
    drag = null;
    if (!gesture.moved) {
      if (!gesture.onButton) flip();
      return;
    }
    card.classList.remove('is-dragging');
    const fling = Math.abs(gesture.vx) > 0.6 && Math.abs(gesture.dx) > 40 && Math.sign(gesture.vx) === Math.sign(gesture.dx);
    if (Math.abs(gesture.dx) >= swipeThreshold() || fling) answer(gesture.dx > 0);
    else resetDrag();
  });

  card.addEventListener('pointercancel', () => {
    drag = null;
    resetDrag();
  });

  card.addEventListener('animationend', () => card.classList.remove('is-entering'));
}

function bindKeyboard() {
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || document.querySelector('dialog[open]')) return;

    if (currentView === 'study') {
      if (event.code === 'Space' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        if (!event.repeat) flip();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (!event.repeat) answer(true);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (!event.repeat) answer(false);
      } else if (event.key === 'Enter' && event.target === el.card) {
        event.preventDefault();
        flip();
      } else if (event.code === 'KeyS' && !event.repeat) {
        speakCurrent();
      }
    } else if (currentView === 'round' && (event.key === 'Enter' || event.code === 'Space')) {
      event.preventDefault();
      if (!event.repeat) startNextRound();
    }
  });

  document.addEventListener('keyup', (event) => {
    if (currentView === 'study' && event.code === 'Space') event.preventDefault();
  });
}

function bindButtons() {
  el.know.addEventListener('click', () => answer(true));
  el.dont.addEventListener('click', () => answer(false));
  el.flip.addEventListener('click', flip);
  el.speak.addEventListener('click', speakCurrent);
  $('#next-round').addEventListener('click', startNextRound);
  $('#restart').addEventListener('click', startSession);
}

function showMissing(title, text) {
  $('#missing-title').textContent = title;
  $('#missing-text').textContent = text;
  showView('missing');
}

function init() {
  hydrateIcons();
  const id = getParam('id');
  const dict = id ? getDictionary(id) : null;

  if (!dict) {
    showMissing('Словник не знайдено', 'Можливо, його було видалено або посилання неправильне.');
    return;
  }

  el.name.textContent = dict.name;
  document.title = `${dict.name} — навчання · Woordjes`;

  if (!dict.words.length) {
    showMissing('У словнику немає слів', 'Додайте слова в редакторі, щоб почати навчання.');
    return;
  }

  words = dict.words;
  el.speak.hidden = !isSpeechSupported();
  bindSwipe();
  bindKeyboard();
  bindButtons();
  startSession();
}

init();
