// Tiny DOM helpers.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function $(root, sel) {
  return root.querySelector(sel);
}

export function $$(root, sel) {
  return Array.from(root.querySelectorAll(sel));
}

/** Delegate clicks on [data-action] descendants to handlers[action](target, event). */
export function delegate(root, handlers, eventName = 'click') {
  root.addEventListener(eventName, (e) => {
    const t = e.target.closest('[data-action]');
    if (!t || !root.contains(t)) return;
    const fn = handlers[t.dataset.action];
    if (fn) fn(t, e);
  });
}

/**
 * Shrink a one-line label until it fits its box, never below `min` of its styled size (past
 * that its ellipsis takes over). Labels that already fit keep their size. Measures, so the
 * label has to be on show.
 */
export function fitText(n, min = 0.75) {
  n.style.fontSize = '';
  // exact (fractional) widths: a text a fraction of a pixel too wide still gets its ellipsis
  const cs = getComputedStyle(n);
  const box = n.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const range = document.createRange();
  range.selectNodeContents(n);
  const width = () => range.getBoundingClientRect().width;
  const w = width();
  if (box <= 0 || w <= box) return;
  const base = parseFloat(cs.fontSize);
  const floor = base * min;
  let size = Math.max(floor, ((base * box) / w) * 0.99);
  n.style.fontSize = `${size}px`;
  // glyphs don't scale exactly with the size: step down until it fits
  while (width() > box && size > floor) {
    size = Math.max(floor, size - 0.25);
    n.style.fontSize = `${size}px`;
  }
}

// 24x24 line icons drawn for the game (stroke = currentColor).
const S = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${body}</svg>`;

export const ICONS = {
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"/></svg>',
  camera: S('<path d="M3.5 8.5h3.2l1.8-2.5h7l1.8 2.5h3.2v10h-17z"/><circle cx="12" cy="13.2" r="3.2"/>'),
  settings: S('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  back: S('<path d="M14.5 5.5L8 12l6.5 6.5"/>', ' stroke-width="2.4"'),
  left: S('<path d="M14.5 5L7.5 12l7 7"/>', ' stroke-width="2.6"'),
  right: S('<path d="M9.5 5l7 7-7 7"/>', ' stroke-width="2.6"'),
  chevron: S('<path d="M9.5 6l6 6-6 6"/>', ' stroke-width="2.4"'),
  fullscreen: S('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  flag: S('<path d="M5.5 21V4"/><path d="M5.5 4.5h12.5l-2.6 4 2.6 4H5.5"/><path d="M9.5 4.5v8M13.5 4.5v8" stroke-width="1.2" opacity=".55"/>'),
  stopwatch: S('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.6 2.2M9.5 2.5h5M12 2.5V6M18.4 6.6l1.4-1.4"/>'),
  calendar: S('<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M12 12.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3z" stroke-width="1.4"/>'),
  car: S('<path d="M2.8 15.5v-2.6c0-.7.4-1.3 1.1-1.5l2.4-.8 2.5-3.3c.4-.5 1-.8 1.6-.8h4.4c.6 0 1.2.3 1.6.7l2.6 3 1.9.5c.7.2 1.2.8 1.2 1.6v3.2"/><path d="M5 15.5h1M10.6 15.5h2.8M17.9 15.5h1.3"/><circle cx="8" cy="15.8" r="2.2"/><circle cx="16" cy="15.8" r="2.2"/>'),
  coin: S('<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.3a3.7 3.7 0 1 0 0 5.4"/>'),
  trophy: S('<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.2a3.3 3.3 0 0 0 3 3.3M16 6h3v1.2a3.3 3.3 0 0 1-3 3.3M12 13.5v3.5M8.5 20.5h7M9.5 17h5"/>'),
  flame: S('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.7 3.1-5.6 3.6-9.4 2.7 1.6 4.1 3.9 4.3 6.1.9-.6 1.6-1.7 1.8-3 1.9 1.7 3.3 4.1 3.3 6.3 0 3.5-2.6 6.1-6.5 6.1z"/>'),
  lock: S('<rect x="5" y="10.5" width="14" height="10" rx="1.6"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>'),
  check: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="2.6"'),
  restart: S('<path d="M4.6 12.5a7.5 7.5 0 1 0 2.3-6"/><path d="M4.5 3.5v4.4h4.4"/>'),
  exit: S('<path d="M13.5 4H19v16h-5.5"/><path d="M9.5 8l-4 4 4 4M5.5 12H15"/>'),
  moon: S('<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>'),
  rain: S('<path d="M7 14.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.4 3.3 3.3 0 0 1-.2 6.6z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>'),
  shuffle: S('<path d="M3.5 7h3c2.2 0 3.6 1.2 4.6 3l1.8 4c1 1.8 2.4 3 4.6 3h3"/><path d="M3.5 17h3c1.5 0 2.6-.6 3.5-1.5M14 8.5c.9-.9 2-1.5 3.5-1.5h3"/><path d="M18 4.5L20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5"/>'),
  forward: S('<path d="M4 12h15M14 7l5 5-5 5"/>'),
  reverse: S('<path d="M20 12H5M10 7l-5 5 5 5"/>'),
  mirror: S('<path d="M12 3.5v17" stroke-dasharray="2 2.5"/><path d="M9 7.5L4 17h5zM15 7.5L20 17h-5z"/>'),
  laps: S('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v4h-4"/><path d="M12 8.5V12l2 1.5" stroke-width="1.6"/>'),
  target: S('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.6 2.5L5.2 13.4h5.6l-1.4 8.1 8.4-10.9h-5.6z"/></svg>',
  display: S('<rect x="3" y="4.5" width="18" height="12" rx="1.6"/><path d="M8.5 20h7M12 16.5V20"/>'),
  audio: S('<path d="M4 9.5h3.4L12 5.6v12.8l-4.6-3.9H4z"/><path d="M15.6 9.2a4.2 4.2 0 0 1 0 5.6M18.2 6.6a8 8 0 0 1 0 10.8"/>'),
  gamepad: S('<path d="M7.2 8h9.6a4 4 0 0 1 3.9 4.9l-.9 3.8a2.2 2.2 0 0 1-3.8 1L14.5 16h-5L8 17.7a2.2 2.2 0 0 1-3.8-1l-.9-3.8A4 4 0 0 1 7.2 8z"/><path d="M8.2 10.6v3M6.7 12.1h3"/><circle cx="15.6" cy="11.4" r=".6" fill="currentColor"/><circle cx="17.4" cy="13.2" r=".6" fill="currentColor"/>'),
  profile: S('<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>'),
  globe: S('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5s1.2-6.1 3.6-8.5z"/>'),
  info: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>'),
  rotate: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><rect x="20" y="8" width="24" height="48" rx="4"/><circle cx="32" cy="50" r="1.6" fill="currentColor"/></svg>',
};
