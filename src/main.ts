import './style.css';
import { createGame, type DirectionName } from './game';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app element.');
}

const layout = document.createElement('div');
layout.id = 'layout';

const gameWrap = document.createElement('div');
gameWrap.id = 'game-wrap';

const controls = document.createElement('div');
controls.id = 'controls';
controls.setAttribute('role', 'group');
controls.setAttribute('aria-label', 'Directional controls');

const controlGrid = document.createElement('div');
controlGrid.className = 'control-grid';

type ControlConfig = { dir: DirectionName; label: string; className: string };
const controlButtons: ControlConfig[] = [
  { dir: 'up', label: '^', className: 'dir-up' },
  { dir: 'left', label: '<', className: 'dir-left' },
  { dir: 'right', label: '>', className: 'dir-right' },
  { dir: 'down', label: 'v', className: 'dir-down' },
];

const buttonElements = new Map<DirectionName, HTMLButtonElement>();
controlButtons.forEach((config) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `control-btn ${config.className}`;
  button.dataset.dir = config.dir;
  button.textContent = config.label;
  button.setAttribute('aria-label', config.dir);
  controlGrid.appendChild(button);
  buttonElements.set(config.dir, button);
});

controls.appendChild(controlGrid);
layout.appendChild(gameWrap);
layout.appendChild(controls);
app.appendChild(layout);

const game = createGame(gameWrap);

type TouchScene = { setTouchDirection: (direction: DirectionName | null) => void };

const getTouchScene = () => {
  const scene = game.scene.getScene('game');
  if (!scene) {
    return null;
  }
  return scene as TouchScene;
};

let activePointerId: number | null = null;
let activeDir: DirectionName | null = null;

const isDirection = (value: string | undefined | null): value is DirectionName =>
  value === 'up' || value === 'down' || value === 'left' || value === 'right';

const getDirFromElement = (element: Element | null): DirectionName | null => {
  if (!element) {
    return null;
  }
  const button = element.closest<HTMLButtonElement>('[data-dir]');
  const dir = button?.dataset.dir ?? null;
  return isDirection(dir) ? dir : null;
};

const setActiveDirection = (direction: DirectionName | null) => {
  if (direction === activeDir) {
    return;
  }
  activeDir = direction;
  const scene = getTouchScene();
  scene?.setTouchDirection(direction);

  buttonElements.forEach((button, dir) => {
    button.classList.toggle('is-active', dir === direction);
  });
};

const endPointer = (event: PointerEvent) => {
  if (activePointerId !== event.pointerId) {
    return;
  }
  activePointerId = null;
  setActiveDirection(null);
};

controls.addEventListener('pointerdown', (event) => {
  if (activePointerId !== null) {
    return;
  }
  activePointerId = event.pointerId;
  controls.setPointerCapture(event.pointerId);
  setActiveDirection(getDirFromElement(event.target as Element));
  event.preventDefault();
});

controls.addEventListener('pointermove', (event) => {
  if (activePointerId !== event.pointerId) {
    return;
  }
  const target = document.elementFromPoint(event.clientX, event.clientY);
  setActiveDirection(getDirFromElement(target));
});

controls.addEventListener('pointerup', endPointer);
controls.addEventListener('pointercancel', endPointer);
controls.addEventListener('lostpointercapture', endPointer);
