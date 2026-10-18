import { a11yPrefs } from './a11y.ts';

/**
 * Optional sound cues (Setup > Accessibility > Sounds, off by default): short,
 * soft tones made on the fly, so there are no audio files to load. Each one
 * pairs with something already shown on screen and announced to screen readers.
 */
export type Cue = 'place' | 'wrong' | 'complete';

const TONES: Record<Cue, { notes: number[]; type: OscillatorType; length: number }> = {
  place: { notes: [660], type: 'sine', length: 0.07 },
  wrong: { notes: [196], type: 'triangle', length: 0.16 },
  complete: { notes: [523, 784], type: 'sine', length: 0.12 },
};

let audio: AudioContext | null = null;

export function playSound(cue: Cue): void {
  if (!a11yPrefs().sounds || typeof AudioContext === 'undefined') return;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
  const { notes, type, length } = TONES[cue];
  notes.forEach((frequency, i) => {
    const start = audio!.currentTime + i * length;
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    // Quiet, with a soft attack and release so it never clicks.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.08, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(audio!.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  });
}
