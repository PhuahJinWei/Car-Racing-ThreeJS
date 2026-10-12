// Control prompts for keyboard and controller players (race HUD card, pause menu).
// Keep in step with the bindings in core/input.js.

export const CONTROLS = {
  keyboard: [
    { keys: ['W', 'A', 'S', 'D'], label: 'Drive' },
    { keys: ['SPACE'], label: 'Drift' },
    { keys: ['SHIFT'], label: 'Nitro' },
    { keys: ['C'], label: 'Camera' },
    { keys: ['R'], label: 'Reset car' },
    { keys: ['ESC'], label: 'Pause' },
  ],
  gamepad: [
    { keys: ['LS'], label: 'Steer' },
    { keys: ['RT'], label: 'Throttle' },
    { keys: ['LT'], label: 'Brake' },
    { keys: ['B'], label: 'Drift' },
    { keys: ['A'], label: 'Nitro' },
    { keys: ['Y'], label: 'Camera' },
    { keys: ['VIEW'], label: 'Reset car' },
    { keys: ['MENU'], label: 'Pause' },
  ],
};

/** One key cap: square keyboard keys, round controller face buttons, pill-shaped triggers/sticks. */
export function keyCap(k, pad = false) {
  const cls = pad ? (/^[ABXY]$/.test(k) ? 'k-face' : 'k-pill') : k.length > 1 ? 'k-wide' : '';
  return `<kbd class="${cls}">${k}</kbd>`;
}

/**
 * Grid cells (keys, label, keys, label, ...) for a `.ctl-grid` with `columns` key/label pairs per
 * row. device: 'keyboard' | 'gamepad'.
 */
export function controlsCells(device, columns = 1) {
  const pad = device === 'gamepad';
  const list = CONTROLS[pad ? 'gamepad' : 'keyboard'];
  const rows = Math.ceil(list.length / columns);
  let html = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const it = list[c * rows + r];
      html += it ? `<span class="ctl-keys">${it.keys.map((k) => keyCap(k, pad)).join('')}</span><span class="ctl-lbl">${it.label}</span>` : '<span></span><span></span>';
    }
  }
  return html;
}
