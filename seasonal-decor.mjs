import { PRESETS } from './appearance.mjs';

// Winter decorations for the winter themes: a garland with a bow and twinkling lights along the top,
// gently falling snow, snow resting on the cards, a snowman and a decorated tree with gifts.
// All artwork is drawn here as SVG. It is decorative only (hidden from screen readers, never clickable),
// and the falling snow stops for people who prefer reduced motion.
const SVG = 'http://www.w3.org/2000/svg';
const root = document.documentElement;
let layer = null;

// A seeded random so the garland looks the same every time.
function seeded(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }

function garland() {
  const width = 1600, rnd = seeded(7), swag = 200, parts = [];
  const y = x => 14 + 20 * Math.sin(Math.PI * ((x % swag) / swag));
  // Pine needles: many short strokes along the drooping line, in a few greens.
  for (let x = -10; x <= width + 10; x += 2.2) {
    const cy = y(x);
    for (let k = 0; k < 3; k++) {
      const angle = rnd() * Math.PI * 2, length = 9 + rnd() * 9, ox = (rnd() - .5) * 8, oy = (rnd() - .5) * 8;
      const color = ['#1e5a3a', '#2a7049', '#357f53', '#14462c'][Math.floor(rnd() * 4)];
      parts.push(`<line x1="${(x + ox).toFixed(1)}" y1="${(cy + oy).toFixed(1)}" x2="${(x + ox + Math.cos(angle) * length).toFixed(1)}" y2="${(cy + oy + Math.sin(angle) * length).toFixed(1)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`);
    }
  }
  // Frost on the needles, red berries and pine cones.
  for (let x = 6; x < width; x += 13) if (rnd() > .45) parts.push(`<circle cx="${x}" cy="${(y(x) - 6 + rnd() * 4).toFixed(1)}" r="${(1 + rnd() * 1.6).toFixed(1)}" fill="#ffffff" opacity=".85"/>`);
  for (let x = 30; x < width; x += 47) { const cy = y(x) + 4; for (const [dx, dy] of [[0, 0], [5, 3], [-4, 4]]) parts.push(`<circle cx="${x + dx}" cy="${cy + dy}" r="3.4" fill="#c01a2c"/><circle cx="${x + dx - 1}" cy="${cy + dy - 1}" r="1" fill="#ff8a8a"/>`); }
  for (let x = 75; x < width; x += 140) parts.push(`<ellipse cx="${x}" cy="${y(x) + 10}" rx="5" ry="8" fill="#7a4a2a"/><path d="M${x - 5} ${y(x) + 8}h10M${x - 4} ${y(x) + 12}h8" stroke="#5a3418" stroke-width="1.2"/>`);
  // Twinkling lights hanging from the garland.
  let lights = '';
  for (let x = 18, i = 0; x < width; x += 38, i++) {
    const cy = y(x) + 12, colour = ['#ffd36b', '#ffe9a8', '#ffc24a'][i % 3];
    lights += `<line x1="${x}" y1="${cy - 6}" x2="${x}" y2="${cy - 1}" stroke="#3b3b3b" stroke-width="1.4"/><circle class="decor-light" style="animation-delay:${(i % 7) * .45}s" cx="${x}" cy="${cy + 4}" r="4.2" fill="${colour}"/>`;
  }
  return `<svg class="decor-garland" viewBox="0 0 ${width} 70" preserveAspectRatio="xMidYMin slice" xmlns="${SVG}" aria-hidden="true"><defs><filter id="decor-glow"><feGaussianBlur stdDeviation="2.2"/></filter></defs><g>${parts.join('')}</g><g filter="url(#decor-glow)" opacity=".85">${lights}</g><g>${lights}</g></svg>`;
}

const BOW = `<svg class="decor-bow" viewBox="0 0 120 110" xmlns="${SVG}" aria-hidden="true">
  <defs><linearGradient id="bow-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2343f"/><stop offset="1" stop-color="#9e0f1f"/></linearGradient></defs>
  <path d="M56 46 C 40 70, 30 88, 26 104 L 40 98 L 46 108 C 50 88, 56 70, 60 50 Z" fill="url(#bow-red)"/>
  <path d="M64 46 C 80 70, 90 88, 94 104 L 80 98 L 74 108 C 70 88, 64 70, 60 50 Z" fill="url(#bow-red)"/>
  <path d="M60 40 C 40 10, 6 14, 10 34 C 12 50, 40 52, 58 46 Z" fill="url(#bow-red)"/>
  <path d="M60 40 C 80 10, 114 14, 110 34 C 108 50, 80 52, 62 46 Z" fill="url(#bow-red)"/>
  <path d="M22 30 C 30 24, 44 28, 54 40" stroke="#ff8f96" stroke-width="2.5" fill="none" opacity=".7"/>
  <path d="M98 30 C 90 24, 76 28, 66 40" stroke="#ff8f96" stroke-width="2.5" fill="none" opacity=".7"/>
  <rect x="50" y="34" width="20" height="18" rx="7" fill="#c3172a"/><rect x="54" y="37" width="7" height="5" rx="2.5" fill="#ff8f96" opacity=".7"/>
</svg>`;

const SNOWMAN = `<svg class="decor-snowman" viewBox="0 0 220 260" xmlns="${SVG}" aria-hidden="true">
  <defs><radialGradient id="snow-ball" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#eaf0f8"/><stop offset="1" stop-color="#b9c9dd"/></radialGradient></defs>
  <ellipse cx="110" cy="246" rx="96" ry="14" fill="#ffffff" opacity=".95"/>
  <path d="M60 140 L 18 108 M 30 117 L 22 98 M 160 140 L 204 104 M 192 113 L 204 96" stroke="#5b3a22" stroke-width="5" stroke-linecap="round"/>
  <circle cx="110" cy="198" r="52" fill="url(#snow-ball)" stroke="#a9bcd3" stroke-width="2"/>
  <circle cx="110" cy="132" r="38" fill="url(#snow-ball)" stroke="#a9bcd3" stroke-width="2"/>
  <circle cx="110" cy="78" r="30" fill="url(#snow-ball)" stroke="#a9bcd3" stroke-width="2"/>
  <circle cx="110" cy="122" r="4" fill="#2b2b2b"/><circle cx="110" cy="140" r="4" fill="#2b2b2b"/><circle cx="110" cy="190" r="4.5" fill="#2b2b2b"/>
  <circle cx="99" cy="74" r="3.6" fill="#1f1f1f"/><circle cx="121" cy="74" r="3.6" fill="#1f1f1f"/>
  <path d="M110 82 L 140 88 L 110 90 Z" fill="#f08a24"/>
  <path d="M97 94 q 13 8 26 0" stroke="#2b2b2b" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-dasharray=".1 5"/>
  <path d="M78 100 q 32 16 64 0 l 2 12 q -34 14 -68 0 z" fill="#c4162b"/>
  <path d="M128 106 l 10 44 l -16 2 l -6 -42 z" fill="#c4162b"/>
  <path d="M84 104 l 4 9 M96 108 l 3 9 M108 110 l 1 9 M120 109 l -1 9 M132 105 l -3 9 M124 124 l 13 -2 M126 136 l 13 -2" stroke="#ffffff" stroke-width="3" opacity=".9"/>
  <path d="M80 62 q 30 -54 60 0 z" fill="#c4162b"/>
  <path d="M86 52 q 24 -30 48 0" stroke="#ffffff" stroke-width="3" fill="none" opacity=".75" stroke-dasharray="4 5"/>
  <rect x="76" y="58" width="68" height="13" rx="6.5" fill="#f4f1ec"/>
  <path d="M80 64h60" stroke="#c4162b" stroke-width="2" stroke-dasharray="3 4"/>
  <circle cx="110" cy="12" r="11" fill="#ffffff"/><circle cx="106" cy="9" r="3" fill="#e9eef5"/>
</svg>`;

const TREE = `<svg class="decor-tree" viewBox="0 0 240 300" xmlns="${SVG}" aria-hidden="true">
  <defs><filter id="tree-glow"><feGaussianBlur stdDeviation="1.8"/></filter></defs>
  <ellipse cx="120" cy="286" rx="112" ry="13" fill="#ffffff" opacity=".95"/>
  <rect x="108" y="236" width="24" height="34" rx="4" fill="#6b4226"/>
  <path d="M120 150 L 214 244 Q 120 262 26 244 Z" fill="#1d6b45"/>
  <path d="M120 96 L 194 186 Q 120 202 46 186 Z" fill="#23794f"/>
  <path d="M120 44 L 172 124 Q 120 138 68 124 Z" fill="#2a8a5a"/>
  <path d="M26 244 Q 120 262 214 244 Q 196 236 176 240 Q 150 232 120 240 Q 90 232 64 240 Q 44 236 26 244 Z" fill="#ffffff" opacity=".9"/>
  <path d="M46 186 Q 120 202 194 186 Q 176 178 160 182 Q 140 174 120 182 Q 98 174 80 182 Q 62 178 46 186 Z" fill="#ffffff" opacity=".9"/>
  <path d="M68 124 Q 120 138 172 124 Q 158 118 146 121 Q 132 114 120 120 Q 106 114 94 121 Q 80 118 68 124 Z" fill="#ffffff" opacity=".9"/>
  <path d="M54 230 Q 120 214 186 200 M 72 170 Q 120 158 168 146 M 88 112 Q 120 104 150 96" stroke="#e9c46a" stroke-width="1.6" fill="none" opacity=".8"/>
  <g filter="url(#tree-glow)">${[[70, 224], [100, 218], [134, 211], [166, 205], [86, 166], [116, 160], [146, 153], [100, 110], [130, 104]].map(([x, y], i) => `<circle class="decor-light" style="animation-delay:${i * .37}s" cx="${x}" cy="${y}" r="4" fill="#ffd36b"/>`).join('')}</g>
  ${[[60, 236, '#c4162b'], [150, 230, '#e3a72f'], [92, 196, '#3a7bd5'], [178, 196, '#c4162b'], [72, 150, '#e3a72f'], [156, 140, '#c4162b'], [112, 132, '#ffffff'], [96, 82, '#c4162b'], [140, 76, '#e3a72f']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="7" fill="${c}"/><circle cx="${x - 2.4}" cy="${y - 2.4}" r="2" fill="#ffffff" opacity=".7"/>`).join('')}
  <path d="M120 14 l 7.6 15.4 17 2.5 -12.3 12 2.9 16.9 -15.2 -8 -15.2 8 2.9 -16.9 -12.3 -12 17 -2.5 z" fill="#f2c14e" stroke="#e0a526" stroke-width="1.5"/>
  <g><rect x="18" y="246" width="44" height="34" rx="3" fill="#f3ead8"/><rect x="36" y="246" width="8" height="34" fill="#c4162b"/><rect x="18" y="258" width="44" height="8" fill="#c4162b"/><path d="M40 246 q -14 -14 -18 -2 q 6 6 18 2 q 14 -14 18 -2 q -6 6 -18 2" fill="#d42639"/></g>
  <g><rect x="170" y="254" width="52" height="28" rx="3" fill="#c4162b"/><rect x="192" y="254" width="8" height="28" fill="#f2c14e"/><path d="M196 254 q -12 -12 -16 -2 q 6 5 16 2 q 12 -12 16 -2 q -6 5 -16 2" fill="#f2c14e"/></g>
  <g><rect x="146" y="262" width="26" height="20" rx="2" fill="#f3ead8"/><rect x="156" y="262" width="6" height="20" fill="#2c7a51"/></g>
</svg>`;

const CANDY = `<svg viewBox="0 0 24 40" xmlns="${SVG}" aria-hidden="true"><defs><pattern id="cane" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="8" height="8" fill="#ffffff"/><rect width="4" height="8" fill="#d0182c"/></pattern></defs><path d="M6 38 V 12 a 6 6 0 0 1 12 0" stroke="url(#cane)" stroke-width="6" fill="none" stroke-linecap="round"/></svg>`;

function snowfall(count) {
  let flakes = '';
  for (let i = 0; i < count; i++) {
    const size = 2 + Math.random() * 4, left = Math.random() * 100, duration = 9 + Math.random() * 12, delay = -Math.random() * duration, drift = (Math.random() - .5) * 60;
    flakes += `<i style="left:${left.toFixed(2)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;animation-duration:${duration.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s;--drift:${drift.toFixed(0)}px;opacity:${(.5 + Math.random() * .5).toFixed(2)}"></i>`;
  }
  return `<div class="decor-snow">${flakes}</div>`;
}
function bigFlakes() {
  const spots = [[3, 18], [27, 9], [44, 46], [21, 74], [83, 9], [96, 19], [88, 82], [63, 92], [9, 52], [99, 55]];
  return spots.map(([x, y], i) => `<span class="decor-flake" style="left:${x}%;top:${y}%;font-size:${16 + (i % 3) * 6}px">❄</span>`).join('');
}

function render(kind) {
  layer?.remove(); layer = null;
  document.querySelectorAll('.decor-candy').forEach(el => el.remove());
  if (!kind) return;
  layer = document.createElement('div'); layer.className = 'seasonal-decor'; layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = kind === 'christmas'
    ? `${snowfall(45)}${bigFlakes()}<div class="decor-top">${garland()}${BOW}</div><div class="decor-ground"></div>${SNOWMAN}${TREE}`
    : `${snowfall(55)}${bigFlakes()}<div class="decor-ground"></div>`;
  document.body.prepend(layer);
  if (kind === 'christmas') { const card = document.querySelector('.now-widget'); if (card) { const cane = document.createElement('span'); cane.className = 'decor-candy'; cane.setAttribute('aria-hidden', 'true'); cane.innerHTML = CANDY; card.append(cane); } }
}

function update() {
  const kind = PRESETS[root.dataset.theme]?.decor || '';
  if (root.dataset.decor === kind && (kind ? layer : true)) return;
  if (kind) root.dataset.decor = kind; else delete root.dataset.decor;
  render(kind);
}
new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
if (document.body) update(); else addEventListener('DOMContentLoaded', update);
// The "Right now" card is built after the planner loads; add the candy cane once it exists.
addEventListener('load', () => { if (root.dataset.decor === 'christmas' && !document.querySelector('.decor-candy')) render('christmas'); });
