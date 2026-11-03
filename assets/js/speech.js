const LANG = 'nl-NL';
const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
let voice = null;

function pickVoice() {
  const voices = synth.getVoices();
  const dutch = voices.filter((v) => v.lang?.replace('_', '-').toLowerCase().startsWith('nl'));
  voice =
    dutch.find((v) => v.lang.replace('_', '-').toLowerCase() === 'nl-nl' && !v.localService) ??
    dutch.find((v) => v.lang.replace('_', '-').toLowerCase() === 'nl-nl') ??
    dutch[0] ??
    null;
}

if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

export const isSpeechSupported = () => Boolean(synth) && typeof SpeechSynthesisUtterance !== 'undefined';

export function speak(text, { onStart, onEnd } = {}) {
  if (!isSpeechSupported() || !text) return false;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = LANG;
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  utterance.onstart = () => onStart?.();
  utterance.onend = utterance.onerror = () => onEnd?.();
  synth.speak(utterance);
  return true;
}

export const stopSpeaking = () => synth?.cancel();
