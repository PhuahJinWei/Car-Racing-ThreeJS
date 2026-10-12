// Control prompts for keyboard and controller players (race HUD card, pause menu).
// Keep in step with the bindings in core/input.js.

import { t } from '../core/i18n.js';

// label: a key into the interface text (ctl.*)
export const CONTROLS = {
  keyboard: [
    { keys: ['W', 'A', 'S', 'D'], label: 'drive' },
    { keys: ['SPACE'], label: 'drift' },
    { keys: ['SHIFT'], label: 'nitro' },
    { keys: ['C'], label: 'camera' },
    { keys: ['R'], label: 'reset' },
    { keys: ['ESC'], label: 'pause' },
  ],
  gamepad: [
    { keys: ['LS'], label: 'steer' },
    { keys: ['RT'], label: 'throttle' },
    { keys: ['LT'], label: 'brake' },
    { keys: ['B'], label: 'drift' },
    { keys: ['A'], label: 'nitro' },
    { keys: ['Y'], label: 'camera' },
    { keys: ['VIEW'], label: 'reset' },
    { keys: ['MENU'], label: 'pause' },
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
      html += it ? `<span class="ctl-keys">${it.keys.map((k) => keyCap(k, pad)).join('')}</span><span class="ctl-lbl">${t(`ctl.${it.label}`)}</span>` : '<span></span><span></span>';
    }
  }
  return html;
}
