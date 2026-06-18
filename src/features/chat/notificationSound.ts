/**
 * Tiny synthesized notification chime for the chat panel. Two-note rise
 * (A5 → D6) over ~300 ms. Web Audio rather than a baked asset so we don't
 * ship an mp3.
 *
 * The AudioContext is lazily created and reused. Browsers block playback
 * until the first user gesture, so the very first ping on a fresh tab may
 * be silent — every notification after the user has clicked anywhere on
 * the page will play normally.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  } catch {
    return null;
  }
}

export function playPingSound() {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') {
    // Best-effort resume — silently fails when the page hasn't seen a
    // user gesture yet.
    void c.resume().catch(() => {});
  }
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = 'sine';

  const now = c.currentTime;
  osc.frequency.setValueAtTime(880, now);              // A5
  osc.frequency.exponentialRampToValueAtTime(1175, now + 0.1); // D6

  // Tiny attack-decay envelope so we don't get a click.
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

  osc.start(now);
  osc.stop(now + 0.31);
}
