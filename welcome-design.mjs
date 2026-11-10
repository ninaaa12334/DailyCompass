import { storage } from './runtime.mjs';
const scenes = {
  football: { title: 'Football practice', subtitle: 'A little less screen. A little more team.', category: 'Time to move', icon: '\u26bd', note: 'Your time to switch gears.' },
  study: { title: 'A little maths practice', subtitle: 'Big ideas start with one small question.', category: 'Find your focus', icon: '\u270e', note: 'A little curiosity goes a long way.' },
  rest: { title: 'A moment for yourself', subtitle: 'No catching up. Just catching your breath.', category: 'Room to recharge', icon: '\u263d', note: 'You do not have to fill every minute.' }
};
const stage = document.querySelector('.flow-stage');
document.querySelectorAll('[data-scene-choice]').forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.sceneChoice, scene = scenes[key]; stage.dataset.scene = key;
  for (const [id, value] of Object.entries({ 'sample-title': scene.title, 'sample-subtitle': scene.subtitle, 'sample-category': scene.category, 'sample-icon': scene.icon, 'sample-row-title': scene.title, 'sample-row-note': scene.note, 'sample-row-symbol': scene.icon })) document.getElementById(id).textContent = value;
  document.querySelectorAll('[data-scene-choice]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
const reduced = matchMedia('(prefers-reduced-motion: reduce)'), motionButton = document.querySelector('#toggle-motion');
let paused = false; try { paused = storage.getItem('day-compass.welcome-motion.v1') === 'paused'; } catch {}
function updateMotion() {
  document.body.dataset.motion = paused || reduced.matches ? 'paused' : 'playing';
  motionButton.setAttribute('aria-pressed', String(paused || reduced.matches));
  motionButton.textContent = reduced.matches ? 'Motion off' : paused ? 'Play motion' : 'Pause motion';
  motionButton.disabled = reduced.matches;
}
motionButton.addEventListener('click', () => { paused = !paused; updateMotion(); try { storage.setItem('day-compass.welcome-motion.v1', paused ? 'paused' : 'playing'); } catch {} });
reduced.addEventListener('change', updateMotion); updateMotion();
