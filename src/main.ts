import './style.css';
import { createGame, type BrushName, type CrateColor, type DirectionName } from './game';

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

const editor = document.createElement('div');
editor.id = 'editor';

const editorHeader = document.createElement('div');
editorHeader.className = 'editor-header';

const editToggle = document.createElement('button');
editToggle.type = 'button';
editToggle.className = 'editor-toggle';
editToggle.textContent = 'Edit: OFF (E)';

const brushRow = document.createElement('div');
brushRow.className = 'editor-row';

type BrushConfig = { brush: BrushName; label: string };
const brushOptions: BrushConfig[] = [
  { brush: 'wall', label: 'Wall' },
  { brush: 'floor', label: 'Floor' },
  { brush: 'goal', label: 'Goal' },
  { brush: 'crate', label: 'Crate' },
  { brush: 'player', label: 'Player' },
  { brush: 'erase', label: 'Erase' },
];

const brushButtons = new Map<BrushName, HTMLButtonElement>();
brushOptions.forEach((option) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-btn';
  button.dataset.brush = option.brush;
  button.textContent = option.label;
  brushRow.appendChild(button);
  brushButtons.set(option.brush, button);
});

const colorRow = document.createElement('div');
colorRow.className = 'editor-row';

type ColorConfig = { color: CrateColor; label: string; swatch: string };
const colorOptions: ColorConfig[] = [
  { color: 'purple', label: 'Purple', swatch: '#8e44ad' },
  { color: 'red', label: 'Red', swatch: '#e74c3c' },
  { color: 'green', label: 'Green', swatch: '#2ecc71' },
  { color: 'blue', label: 'Blue', swatch: '#3498db' },
  { color: 'yellow', label: 'Yellow', swatch: '#f1c40f' },
];

const colorButtons = new Map<CrateColor, HTMLButtonElement>();
colorOptions.forEach((option) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'editor-btn color-btn';
  button.dataset.color = option.color;
  button.textContent = option.label;
  button.style.setProperty('--swatch', option.swatch);
  colorRow.appendChild(button);
  colorButtons.set(option.color, button);
});

const actionRow = document.createElement('div');
actionRow.className = 'editor-row';

const saveButton = document.createElement('button');
saveButton.type = 'button';
saveButton.className = 'editor-btn';
saveButton.textContent = 'Save';

const loadButton = document.createElement('button');
loadButton.type = 'button';
loadButton.className = 'editor-btn';
loadButton.textContent = 'Load';

const clearButton = document.createElement('button');
clearButton.type = 'button';
clearButton.className = 'editor-btn';
clearButton.textContent = 'Clear';

actionRow.appendChild(saveButton);
actionRow.appendChild(loadButton);
actionRow.appendChild(clearButton);

editorHeader.appendChild(editToggle);
editor.appendChild(editorHeader);
editor.appendChild(brushRow);
editor.appendChild(colorRow);
editor.appendChild(actionRow);

const hud = document.createElement('div');
hud.id = 'hud';
hud.appendChild(controls);
hud.appendChild(editor);

layout.appendChild(gameWrap);
layout.appendChild(hud);
app.appendChild(layout);

const game = createGame(gameWrap);

type GameSceneApi = {
  setTouchDirection: (direction: DirectionName | null) => void;
  setEditMode: (enabled: boolean) => void;
  setBrush: (brush: BrushName) => void;
  setCrateColor: (color: CrateColor) => void;
  saveLayoutToStorage: () => void;
  loadLayoutFromStorage: () => void;
  clearLayout: () => void;
  isEditMode: () => boolean;
  getBrush: () => BrushName;
  getCrateColor: () => CrateColor;
};

const getScene = () => {
  const scene = game.scene.getScene('game');
  if (!scene) {
    return null;
  }
  return scene as GameSceneApi;
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
  const scene = getScene();
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

let editEnabled = false;
let activeBrush: BrushName = 'wall';
let activeCrateColor: CrateColor = 'purple';

const setEditEnabled = (enabled: boolean) => {
  editEnabled = enabled;
  const scene = getScene();
  scene?.setEditMode(enabled);
  editor.classList.toggle('is-active', enabled);
  editToggle.textContent = enabled ? 'Edit: ON (E)' : 'Edit: OFF (E)';
};

const setActiveBrush = (brush: BrushName) => {
  activeBrush = brush;
  const scene = getScene();
  scene?.setBrush(brush);
  brushButtons.forEach((button, key) => {
    button.classList.toggle('is-active', key === brush);
  });
};

const setActiveCrateColor = (color: CrateColor) => {
  activeCrateColor = color;
  const scene = getScene();
  scene?.setCrateColor(color);
  colorButtons.forEach((button, key) => {
    button.classList.toggle('is-active', key === color);
  });
};

editToggle.addEventListener('click', () => {
  setEditEnabled(!editEnabled);
});

brushButtons.forEach((button, brush) => {
  button.addEventListener('click', () => {
    setActiveBrush(brush);
  });
});

colorButtons.forEach((button, color) => {
  button.addEventListener('click', () => {
    setActiveCrateColor(color);
  });
});

saveButton.addEventListener('click', () => {
  getScene()?.saveLayoutToStorage();
});

loadButton.addEventListener('click', () => {
  getScene()?.loadLayoutFromStorage();
});

clearButton.addEventListener('click', () => {
  if (window.confirm('Clear the level? This cannot be undone.')) {
    getScene()?.clearLayout();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }
  if (event.key.toLowerCase() === 'e') {
    setEditEnabled(!editEnabled);
    event.preventDefault();
  }
});

setEditEnabled(editEnabled);
setActiveBrush(activeBrush);
setActiveCrateColor(activeCrateColor);
