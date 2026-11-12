// Animate deliberate navigation only. Routine background refreshes stay still.
export function initInterfaceMotion() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), active = new WeakMap();
  document.addEventListener('click', event => {
    if (reduced.matches || !event.target.closest('button[data-calendar-view], #previous-period, #next-period, #calendar-today')) return;
    for (const view of document.querySelectorAll('#week-view, #month-view, #mobile-month-agenda')) {
      if (!view.getClientRects().length || !view.animate) continue;
      active.get(view)?.cancel();
      active.set(view, view.animate([{ opacity: .82 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' }));
    }
  });
}
