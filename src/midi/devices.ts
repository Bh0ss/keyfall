export interface InputInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}

export interface DeviceSummary {
  connected: boolean;
  name: string | null;
  /** Web MIDI does not expose transport; set only when a name hint says so. */
  transport: 'Bluetooth' | null;
  count: number;
}

/** "FP-30X MIDI Bluetooth" -> "FP-30X". Falls back to the raw name if nothing is left. */
function displayName(raw: string): string {
  const cleaned = raw.replace(/\b(bluetooth|ble|midi)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || raw;
}

export function summarizeInputs(inputs: readonly InputInfo[]): DeviceSummary {
  const live = inputs.filter((i) => i.state === 'connected');
  const first = live[0];
  if (!first) return { connected: false, name: null, transport: null, count: 0 };
  const hint = `${first.name} ${first.manufacturer}`;
  return {
    connected: true,
    name: displayName(first.name),
    transport: /bluetooth|\bble\b/i.test(hint) ? 'Bluetooth' : null,
    count: live.length,
  };
}
