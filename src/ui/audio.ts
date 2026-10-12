/** Web Audio clicks for the metronome, count-in and latency check. No samples. */

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** Schedule a click `delaySec` from now. Returns the audio-clock time it will sound at. */
export function scheduleClick(delaySec: number, accent: boolean): number | null {
  const c = audioContext();
  if (!c) return null;
  const at = c.currentTime + Math.max(0, delaySec);
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1568 : 1046;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(gain).connect(c.destination);
  osc.start(at);
  osc.stop(at + 0.06);
  return at;
}

/** Extra delay between scheduling a sound and hearing it. */
export function outputLatencyMs(): number {
  const c = ctx;
  if (!c) return 0;
  return ((c.outputLatency || 0) + (c.baseLatency || 0)) * 1000;
}
