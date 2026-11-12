// Animate deliberate navigation only. Routine background refreshes stay still.
export function initInterfaceMotion() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), active = new WeakMap();
  document.addEventListener('click', event => {
    if (reduced.matches || !event.target.closest('button[data-calendar-view], #previous-period, #next-period, #calendar-today')) return;
    for (const view of document.querySelectorAll('#week-grid, #calendar-days, #mobile-agenda-list')) {
      if (!view.getClientRects().length || !view.animate) continue;
      active.get(view)?.cancel();
      active.set(view, view.animate([{ opacity: .65, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    }
  });
}
