import Phaser from 'phaser';

const TILE = 48;
const PADDING = 16;
const VIEW_TILES_X = 10;
const VIEW_TILES_Y = 10;

const VIEW_WIDTH = PADDING * 2 + VIEW_TILES_X * TILE;
const VIEW_HEIGHT = PADDING * 2 + VIEW_TILES_Y * TILE;

const LEVEL_WIDTH = 100;
const LEVEL_HEIGHT = 100;

const LEVEL_1 = buildLevel(LEVEL_WIDTH, LEVEL_HEIGHT);

type Pos = { x: number; y: number };
type Dir = { dx: number; dy: number };
export type DirectionName = 'up' | 'down' | 'left' | 'right';
export type BrushName = 'wall' | 'floor' | 'goal' | 'crate' | 'player' | 'erase';
export type CrateColor = 'purple' | 'red' | 'green' | 'blue' | 'yellow';
type QueuedMove = { dx: number; dy: number; moveMs: number };
type UndoState = { playerPos: Pos; crates: Map<string, CrateColor> };

const MOVE_MS = 120;
const MOVE_FAST_MS = 70;
const HOLD_DELAY_MS = 220;
const HOLD_REPEAT_MS = 90;
const HOLD_FAST_AFTER_MS = 600;
const HOLD_FAST_REPEAT_MS = 60;
const MAX_QUEUE = 6;
const STORAGE_KEY = 'iris-game:level-v1';
const DEFAULT_CRATE_COLOR: CrateColor = 'purple';
const CRATE_COLORS: Record<CrateColor, number> = {
  purple: 0x8e44ad,
  red: 0xe74c3c,
  green: 0x2ecc71,
  blue: 0x3498db,
  yellow: 0xf1c40f,
};

type Layout = {
  width: number;
  height: number;
  walls: boolean[][];
  goals: boolean[][];
  startCrates: Map<string, CrateColor>;
  startPlayer: Pos;
};

const key = (x: number, y: number) => `${x},${y}`;

function buildLevel(width: number, height: number): string[] {
  const grid: string[][] = Array.from({ length: height }, () => Array<string>(width).fill(' '));

  for (let x = 0; x < width; x += 1) {
    grid[0][x] = '#';
    grid[height - 1][x] = '#';
  }
  for (let y = 0; y < height; y += 1) {
    grid[y][0] = '#';
    grid[y][width - 1] = '#';
  }

  const setChar = (x: number, y: number, ch: string) => {
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) {
      return;
    }
    grid[y][x] = ch;
  };

  for (let x = 2; x <= 14; x += 1) {
    setChar(x, 7, '#');
  }
  for (let y = 3; y <= 10; y += 1) {
    setChar(14, y, '#');
  }
  setChar(8, 7, ' ');

  setChar(5, 5, '@');
  setChar(6, 5, '$');
  setChar(9, 5, '.');

  setChar(6, 9, '$');
  setChar(10, 9, '.');

  return grid.map((row) => row.join(''));
}

function parseLevel(lines: string[]): Layout {
  const height = lines.length;
  const width = lines[0]?.length ?? 0;
  if (width === 0 || height === 0) {
    throw new Error('Level is empty.');
  }

  const walls = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  const goals = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
  const startCrates = new Map<string, CrateColor>();
  let startPlayer: Pos | null = null;

  lines.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error('All level rows must have the same length.');
    }
    [...row].forEach((ch, x) => {
      switch (ch) {
        case '#':
          walls[y][x] = true;
          break;
        case '.':
          goals[y][x] = true;
          break;
        case '$':
          startCrates.set(key(x, y), DEFAULT_CRATE_COLOR);
          break;
        case '@':
          startPlayer = { x, y };
          break;
        case '*':
          goals[y][x] = true;
          startCrates.set(key(x, y), DEFAULT_CRATE_COLOR);
          break;
        case '+':
          goals[y][x] = true;
          startPlayer = { x, y };
          break;
        case ' ':
          break;
        default:
          throw new Error(`Unknown tile: ${ch}`);
      }
    });
  });

  if (!startPlayer) {
    throw new Error('Level must include a player start (@ or +).');
  }

  return { width, height, walls, goals, startCrates, startPlayer };
}

const DEFAULT_LAYOUT = parseLevel(LEVEL_1);

const getStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
};

const cloneLayout = (layout: Layout): Layout => ({
  width: layout.width,
  height: layout.height,
  walls: layout.walls.map((row) => [...row]),
  goals: layout.goals.map((row) => [...row]),
  startCrates: new Map(layout.startCrates),
  startPlayer: { ...layout.startPlayer },
});

type LayoutPayloadV2 = {
  version: 2;
  width: number;
  height: number;
  walls: boolean[][];
  goals: boolean[][];
  startPlayer: Pos;
  crates: Array<{ x: number; y: number; color: CrateColor }>;
};

const isCrateColor = (value: unknown): value is CrateColor =>
  value === 'purple' || value === 'red' || value === 'green' || value === 'blue' || value === 'yellow';

const serializeLayout = (layout: Layout): LayoutPayloadV2 => {
  const crates: Array<{ x: number; y: number; color: CrateColor }> = [];
  layout.startCrates.forEach((color, posKey) => {
    const [x, y] = posKey.split(',').map((value) => Number(value));
    if (Number.isNaN(x) || Number.isNaN(y)) {
      return;
    }
    crates.push({ x, y, color });
  });

  return {
    version: 2,
    width: layout.width,
    height: layout.height,
    walls: layout.walls.map((row) => [...row]),
    goals: layout.goals.map((row) => [...row]),
    startPlayer: { ...layout.startPlayer },
    crates,
  };
};

const layoutFromPayload = (payload: LayoutPayloadV2): Layout => {
  const walls = payload.walls.map((row) => [...row]);
  const goals = payload.goals.map((row) => [...row]);
  const startCrates = new Map<string, CrateColor>();
  payload.crates.forEach((crate) => {
    if (!isCrateColor(crate.color)) {
      return;
    }
    if (crate.x < 0 || crate.y < 0 || crate.x >= payload.width || crate.y >= payload.height) {
      return;
    }
    if (payload.walls[crate.y]?.[crate.x]) {
      return;
    }
    startCrates.set(key(crate.x, crate.y), crate.color);
  });

  const startPlayer =
    payload.startPlayer &&
    Number.isFinite(payload.startPlayer.x) &&
    Number.isFinite(payload.startPlayer.y)
      ? { ...payload.startPlayer }
      : { ...DEFAULT_LAYOUT.startPlayer };

  return {
    width: payload.width,
    height: payload.height,
    walls,
    goals,
    startCrates,
    startPlayer,
  };
};

const saveLayoutToStorage = (layout: Layout) => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  const payload = serializeLayout(layout);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    return;
  }
};

const loadLayoutFromStorage = (): Layout => {
  const storage = getStorage();
  if (!storage) {
    return cloneLayout(DEFAULT_LAYOUT);
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return cloneLayout(DEFAULT_LAYOUT);
  }
  try {
    const parsed = JSON.parse(raw) as {
      version?: number;
      lines?: string[];
      width?: number;
      height?: number;
      walls?: boolean[][];
      goals?: boolean[][];
      startPlayer?: Pos;
      crates?: Array<{ x: number; y: number; color: CrateColor }>;
    };

    if (
      parsed?.version === 2 &&
      parsed.width &&
      parsed.height &&
      parsed.walls &&
      parsed.goals &&
      parsed.startPlayer &&
      Array.isArray(parsed.crates)
    ) {
      return layoutFromPayload(parsed as LayoutPayloadV2);
    }

    if (parsed?.lines && parsed.lines.length > 0) {
      return parseLevel(parsed.lines);
    }

    return cloneLayout(DEFAULT_LAYOUT);
  } catch (error) {
    storage.removeItem(STORAGE_KEY);
    return cloneLayout(DEFAULT_LAYOUT);
  }
};

const WORLD_WIDTH = PADDING * 2 + DEFAULT_LAYOUT.width * TILE;
const WORLD_HEIGHT = PADDING * 2 + DEFAULT_LAYOUT.height * TILE;

export class GameScene extends Phaser.Scene {
  private layout: Layout;
  private crates = new Map<string, CrateColor>();
  private crateSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private floorSprites: Phaser.GameObjects.Sprite[][] = [];
  private wallSprites: Array<Array<Phaser.GameObjects.Sprite | null>> = [];
  private playerPos: Pos = { x: 0, y: 0 };
  private player!: Phaser.GameObjects.Sprite;
  private infoText!: Phaser.GameObjects.Text;
  private bgm?: Phaser.Sound.BaseSound;
  private hasWon = false;
  private isAnimating = false;
  private editMode = false;
  private activeBrush: BrushName = 'wall';
  private activeCrateColor: CrateColor = DEFAULT_CRATE_COLOR;
  private isPainting = false;
  private lastPaintedKey: string | null = null;
  private isPanning = false;
  private panStart: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  private inputQueue: QueuedMove[] = [];
  private undoStack: UndoState[] = [];
  private pendingUndo = 0;
  private keyDownAt = new Map<string, number>();
  private activeKeys: string[] = [];
  private heldKey: string | null = null;
  private heldDir: Dir | null = null;
  private holdStart = 0;
  private nextRepeatAt = 0;
  private touchHeldDir: Dir | null = null;
  private touchHoldStart = 0;
  private touchNextRepeatAt = 0;

  constructor() {
    super('game');
    this.layout = loadLayoutFromStorage();
  }

  preload() {
    const musicUrl = new URL('./assets/audio/music.mp3', import.meta.url);
    this.load.audio('bgm', musicUrl.toString());
  }

  create() {
    this.createTextures();
    this.drawBoard();
    this.resetState();
    this.setupCamera();
    this.setupBgm();

    this.infoText = this.add
      .text(8, 8, '', {
        fontFamily: 'Trebuchet MS, Yu Gothic, Meiryo, sans-serif',
        fontSize: '16px',
        color: '#f5f5f5',
      })
      .setDepth(10);

    this.updateInfoText();
    this.setupEditorInput();

    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      const keyName = event.key.toLowerCase();
      if (keyName === 'r') {
        this.resetState();
        return;
      }
      if (keyName === 'u') {
        this.enqueueUndo();
        return;
      }
      if (this.editMode) {
        const dir = this.keyToDir(keyName);
        if (dir) {
          const step = event.shiftKey ? 4 : 1;
          this.panCamera(dir.dx * step, dir.dy * step);
        }
        return;
      }
      if (this.hasWon) {
        return;
      }

      const dir = this.keyToDir(keyName);
      if (!dir) {
        return;
      }

      if (!this.keyDownAt.has(keyName)) {
        this.keyDownAt.set(keyName, this.time.now);
        this.activeKeys.push(keyName);
      }

      this.heldKey = keyName;
      this.heldDir = dir;
      this.holdStart = this.keyDownAt.get(keyName) ?? this.time.now;
      this.nextRepeatAt = this.time.now + HOLD_DELAY_MS;
      this.enqueueMove(dir, MOVE_MS);
    });

    this.input.keyboard?.on('keyup', (event: KeyboardEvent) => {
      const keyName = event.key.toLowerCase();
      if (!this.keyDownAt.has(keyName)) {
        return;
      }
      this.keyDownAt.delete(keyName);
      this.activeKeys = this.activeKeys.filter((name) => name !== keyName);

      if (this.heldKey === keyName) {
        const nextHeld = this.activeKeys[this.activeKeys.length - 1] ?? null;
        this.heldKey = nextHeld;
        this.heldDir = nextHeld ? this.keyToDir(nextHeld) : null;
        if (nextHeld) {
          this.holdStart = this.keyDownAt.get(nextHeld) ?? this.time.now;
          this.nextRepeatAt = this.time.now + HOLD_DELAY_MS;
        } else {
          this.holdStart = 0;
          this.nextRepeatAt = 0;
        }
      }
    });
  }

  update(time: number) {
    if (this.isAnimating) {
      return;
    }
    if (this.editMode) {
      return;
    }

    if (this.pendingUndo > 0) {
      this.performUndo();
      return;
    }

    if (this.inputQueue.length > 0) {
      const move = this.inputQueue.shift();
      if (move) {
        this.tryMove(move.dx, move.dy, move.moveMs);
      }
      return;
    }

    const usingTouch = Boolean(this.touchHeldDir);
    const heldDir = usingTouch ? this.touchHeldDir : this.heldDir;
    if (!heldDir || this.hasWon) {
      return;
    }

    const nextRepeatAt = usingTouch ? this.touchNextRepeatAt : this.nextRepeatAt;
    if (time < nextRepeatAt) {
      return;
    }

    this.tryMove(heldDir.dx, heldDir.dy, MOVE_FAST_MS);
    const holdStart = usingTouch ? this.touchHoldStart : this.holdStart;
    const heldFor = time - holdStart;
    const interval = heldFor >= HOLD_FAST_AFTER_MS ? HOLD_FAST_REPEAT_MS : HOLD_REPEAT_MS;
    if (usingTouch) {
      this.touchNextRepeatAt = time + interval;
    } else {
      this.nextRepeatAt = time + interval;
    }
  }

  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.startFollow(this.player, true, 0.12, 0.12);
  }

  public setEditMode(enabled: boolean) {
    if (this.editMode === enabled) {
      return;
    }
    this.editMode = enabled;
    if (enabled) {
      this.resetState();
    }
    this.inputQueue = [];
    this.pendingUndo = 0;
    this.keyDownAt.clear();
    this.activeKeys = [];
    this.heldKey = null;
    this.heldDir = null;
    this.holdStart = 0;
    this.nextRepeatAt = 0;
    this.touchHeldDir = null;
    this.touchHoldStart = 0;
    this.touchNextRepeatAt = 0;
    this.isPainting = false;
    this.isPanning = false;
    this.lastPaintedKey = null;
    this.panStart = null;
    const cam = this.cameras.main;
    if (enabled) {
      cam.stopFollow();
    } else {
      cam.startFollow(this.player, true, 0.12, 0.12);
    }
    this.updateInfoText();
  }

  public isEditMode() {
    return this.editMode;
  }

  public setBrush(brush: BrushName) {
    this.activeBrush = brush;
    this.updateInfoText();
  }

  public setCrateColor(color: CrateColor) {
    if (!isCrateColor(color)) {
      return;
    }
    this.activeCrateColor = color;
    this.updateInfoText();
  }

  public getCrateColor() {
    return this.activeCrateColor;
  }

  public getBrush() {
    return this.activeBrush;
  }

  public saveLayoutToStorage() {
    saveLayoutToStorage(this.layout);
  }

  public loadLayoutFromStorage() {
    const layout = loadLayoutFromStorage();
    this.applyLayout(layout);
  }

  public clearLayout() {
    const walls = Array.from({ length: this.layout.height }, () =>
      Array<boolean>(this.layout.width).fill(false),
    );
    const goals = Array.from({ length: this.layout.height }, () =>
      Array<boolean>(this.layout.width).fill(false),
    );
    const cleared: Layout = {
      width: this.layout.width,
      height: this.layout.height,
      walls,
      goals,
      startCrates: new Map<string, CrateColor>(),
      startPlayer: { ...this.playerPos },
    };
    this.applyLayout(cleared);
    saveLayoutToStorage(this.layout);
  }

  private setupEditorInput() {
    this.input.mouse?.disableContextMenu();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.editMode) {
        return;
      }
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        this.isPanning = true;
        const cam = this.cameras.main;
        this.panStart = {
          x: pointer.x,
          y: pointer.y,
          scrollX: cam.scrollX,
          scrollY: cam.scrollY,
        };
        return;
      }
      this.isPainting = true;
      this.lastPaintedKey = null;
      this.paintAtPointer(pointer);
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.editMode) {
        return;
      }
      if (this.isPanning && this.panStart) {
        const cam = this.cameras.main;
        const dx = pointer.x - this.panStart.x;
        const dy = pointer.y - this.panStart.y;
        cam.scrollX = Phaser.Math.Clamp(
          this.panStart.scrollX - dx,
          0,
          WORLD_WIDTH - cam.width,
        );
        cam.scrollY = Phaser.Math.Clamp(
          this.panStart.scrollY - dy,
          0,
          WORLD_HEIGHT - cam.height,
        );
        return;
      }
      if (this.isPainting && pointer.isDown) {
        this.paintAtPointer(pointer);
      }
    });

    const endPaint = () => {
      if (!this.editMode) {
        return;
      }
      this.isPainting = false;
      this.isPanning = false;
      this.lastPaintedKey = null;
      this.panStart = null;
    };

    this.input.on('pointerup', endPaint);
    this.input.on('pointerout', endPaint);
  }

  private paintAtPointer(pointer: Phaser.Input.Pointer) {
    const tile = this.pointerToTile(pointer);
    if (!tile) {
      return;
    }
    const posKey = key(tile.x, tile.y);
    if (this.lastPaintedKey === posKey) {
      return;
    }
    this.lastPaintedKey = posKey;
    this.applyBrush(tile.x, tile.y);
  }

  private pointerToTile(pointer: Phaser.Input.Pointer): Pos | null {
    const cam = this.cameras.main;
    const worldPoint = pointer.positionToCamera(cam) as Phaser.Math.Vector2;
    const x = Math.floor((worldPoint.x - PADDING) / TILE);
    const y = Math.floor((worldPoint.y - PADDING) / TILE);
    if (x < 0 || y < 0 || x >= this.layout.width || y >= this.layout.height) {
      return null;
    }
    return { x, y };
  }

  private panCamera(dxTiles: number, dyTiles: number) {
    const cam = this.cameras.main;
    cam.scrollX = Phaser.Math.Clamp(
      cam.scrollX + dxTiles * TILE,
      0,
      WORLD_WIDTH - cam.width,
    );
    cam.scrollY = Phaser.Math.Clamp(
      cam.scrollY + dyTiles * TILE,
      0,
      WORLD_HEIGHT - cam.height,
    );
  }

  private setupBgm() {
    const start = () => {
      if (this.bgm?.isPlaying) {
        return;
      }
      if (!this.bgm) {
        this.bgm = this.sound.add('bgm', { loop: true, volume: 0.6 });
      }
      if (!this.sound.locked) {
        this.bgm.play();
      }
    };

    this.input.once('pointerdown', start);
    this.input.keyboard?.once('keydown', start);
    this.sound.once(Phaser.Sound.Events.UNLOCKED, start);
    start();
  }

  private createTextures() {
    const g = this.add.graphics();

    g.fillStyle(0x2f3542, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.generateTexture('tile-floor', TILE, TILE);
    g.clear();

    g.fillStyle(0x57606f, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.generateTexture('tile-wall', TILE, TILE);
    g.clear();

    g.fillStyle(0x2f3542, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.fillStyle(0xf1c40f, 1);
    g.fillCircle(TILE / 2, TILE / 2, TILE * 0.18);
    g.generateTexture('tile-goal', TILE, TILE);
    g.clear();

    (Object.keys(CRATE_COLORS) as CrateColor[]).forEach((colorName) => {
      g.fillStyle(CRATE_COLORS[colorName], 1);
      g.fillRoundedRect(0, 0, TILE, TILE, 8);
      g.lineStyle(3, 0x0b0b0b, 1);
      g.strokeRoundedRect(1.5, 1.5, TILE - 3, TILE - 3, 8);
      g.generateTexture(`tile-crate-${colorName}`, TILE, TILE);
      g.clear();
    });

    g.fillStyle(0x00d2d3, 1);
    g.fillRect(0, 0, TILE, TILE);
    g.lineStyle(3, 0x0c2461, 1);
    g.strokeRect(1.5, 1.5, TILE - 3, TILE - 3);
    g.generateTexture('tile-player', TILE, TILE);
    g.destroy();
  }

  private drawBoard() {
    this.floorSprites = Array.from({ length: this.layout.height }, () =>
      Array<Phaser.GameObjects.Sprite>(this.layout.width),
    );
    this.wallSprites = Array.from({ length: this.layout.height }, () =>
      Array<Phaser.GameObjects.Sprite | null>(this.layout.width).fill(null),
    );

    for (let y = 0; y < this.layout.height; y += 1) {
      for (let x = 0; x < this.layout.width; x += 1) {
        const world = this.toWorld(x, y);
        const hasGoal = this.layout.goals[y][x];
        const floor = this.add
          .sprite(world.x, world.y, hasGoal ? 'tile-goal' : 'tile-floor')
          .setDepth(0);
        this.floorSprites[y][x] = floor;

        if (this.layout.walls[y][x]) {
          const wall = this.add.sprite(world.x, world.y, 'tile-wall').setDepth(2);
          this.wallSprites[y][x] = wall;
        }
      }
    }
  }

  private resetState() {
    this.crateSprites.forEach((sprite) => sprite.destroy());
    this.crateSprites.clear();

    this.crates = new Map(this.layout.startCrates);
    this.playerPos = { ...this.layout.startPlayer };

    this.crates.forEach((color, posKey) => {
      const [x, y] = posKey.split(',').map((value) => Number(value));
      const world = this.toWorld(x, y);
      const crate = this.add.sprite(world.x, world.y, `tile-crate-${color}`).setDepth(3);
      this.crateSprites.set(posKey, crate);
    });

    if (!this.player) {
      const world = this.toWorld(this.playerPos.x, this.playerPos.y);
      this.player = this.add.sprite(world.x, world.y, 'tile-player').setDepth(4);
    } else {
      const world = this.toWorld(this.playerPos.x, this.playerPos.y);
      this.player.setPosition(world.x, world.y);
    }

    this.hasWon = false;
    this.inputQueue = [];
    this.undoStack = [];
    this.pendingUndo = 0;
    this.keyDownAt.clear();
    this.activeKeys = [];
    this.heldKey = null;
    this.heldDir = null;
    this.holdStart = 0;
    this.nextRepeatAt = 0;
    this.touchHeldDir = null;
    this.touchHoldStart = 0;
    this.touchNextRepeatAt = 0;
    this.updateInfoText();
  }

  private updateInfoText() {
    if (!this.infoText) {
      return;
    }
    if (this.editMode) {
      const brushLabel =
        this.activeBrush === 'crate' ? `${this.activeBrush} (${this.activeCrateColor})` : this.activeBrush;
      this.infoText.setText(`Edit mode: ${brushLabel}  E: toggle`);
      return;
    }
    const goalCount = this.countGoals();
    const filled = this.countCratesOnGoals();
    if (this.hasWon) {
      this.infoText.setText(`Clear! (${filled}/${goalCount})  R: reset`);
    } else {
      this.infoText.setText(`Crates on goals: ${filled}/${goalCount}  R: reset`);
    }
  }

  private countGoals() {
    let total = 0;
    for (let y = 0; y < this.layout.height; y += 1) {
      for (let x = 0; x < this.layout.width; x += 1) {
        if (this.layout.goals[y][x]) {
          total += 1;
        }
      }
    }
    return total;
  }

  private countCratesOnGoals() {
    let total = 0;
    this.crates.forEach((_color, posKey) => {
      const [x, y] = posKey.split(',').map((value) => Number(value));
      if (this.layout.goals[y][x]) {
        total += 1;
      }
    });
    return total;
  }

  private tryMove(dx: number, dy: number, moveMs = MOVE_MS) {
    if (this.isAnimating) {
      return;
    }
    const next = { x: this.playerPos.x + dx, y: this.playerPos.y + dy };
    if (this.isWall(next.x, next.y)) {
      return;
    }

    this.pushUndoState();

    const nextKey = key(next.x, next.y);
    let pushedCrate: { sprite: Phaser.GameObjects.Sprite; target: Pos } | null = null;
    if (this.crates.has(nextKey)) {
      const crateColor = this.crates.get(nextKey);
      if (!crateColor) {
        return;
      }
      const beyond = { x: next.x + dx, y: next.y + dy };
      if (this.isWall(beyond.x, beyond.y)) {
        return;
      }
      const beyondKey = key(beyond.x, beyond.y);
      if (this.crates.has(beyondKey)) {
        return;
      }

      const crateSprite = this.crateSprites.get(nextKey);
      if (!crateSprite) {
        return;
      }

      this.crates.delete(nextKey);
      this.crates.set(beyondKey, crateColor);
      this.crateSprites.delete(nextKey);
      this.crateSprites.set(beyondKey, crateSprite);
      pushedCrate = { sprite: crateSprite, target: beyond };
    }

    this.playerPos = next;
    this.playMoveAnimation(next, pushedCrate, moveMs);
  }

  private playMoveAnimation(
    next: Pos,
    pushedCrate: { sprite: Phaser.GameObjects.Sprite; target: Pos } | null,
    moveMs: number,
  ) {
    this.isAnimating = true;

    const playerWorld = this.toWorld(next.x, next.y);
    let remaining = pushedCrate ? 2 : 1;
    const finish = () => {
      remaining -= 1;
      if (remaining > 0) {
        return;
      }
      this.isAnimating = false;
      this.checkWin();
      this.updateInfoText();
    };

    this.tweens.add({
      targets: this.player,
      x: playerWorld.x,
      y: playerWorld.y,
      duration: moveMs,
      ease: 'Sine.easeOut',
      onComplete: finish,
    });

    if (pushedCrate) {
      const crateWorld = this.toWorld(pushedCrate.target.x, pushedCrate.target.y);
      this.tweens.add({
        targets: pushedCrate.sprite,
        x: crateWorld.x,
        y: crateWorld.y,
        duration: moveMs,
        ease: 'Sine.easeOut',
        onComplete: finish,
      });
    }
  }

  private checkWin() {
    this.hasWon = this.countCratesOnGoals() === this.countGoals();
  }

  private isWall(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.layout.width || y >= this.layout.height) {
      return true;
    }
    return this.layout.walls[y][x];
  }

  private toWorld(x: number, y: number) {
    return {
      x: PADDING + x * TILE + TILE / 2,
      y: PADDING + y * TILE + TILE / 2,
    };
  }

  private applyLayout(layout: Layout) {
    this.layout = layout;
    this.crates = new Map(layout.startCrates);
    this.playerPos = { ...layout.startPlayer };

    if (this.floorSprites.length > 0) {
      this.refreshTiles();
    }

    this.syncCrateSprites();

    if (this.player) {
      const playerWorld = this.toWorld(this.playerPos.x, this.playerPos.y);
      this.player.setPosition(playerWorld.x, playerWorld.y);
    }

    this.hasWon = false;
    this.updateInfoText();
  }

  private refreshTiles() {
    for (let y = 0; y < this.layout.height; y += 1) {
      for (let x = 0; x < this.layout.width; x += 1) {
        this.updateTileSprite(x, y);
      }
    }
  }

  private updateTileSprite(x: number, y: number) {
    const floor = this.floorSprites[y]?.[x];
    if (floor) {
      floor.setTexture(this.layout.goals[y][x] ? 'tile-goal' : 'tile-floor');
    }

    const needsWall = this.layout.walls[y][x];
    const existingWall = this.wallSprites[y]?.[x] ?? null;
    if (needsWall) {
      if (!existingWall) {
        const world = this.toWorld(x, y);
        const wall = this.add.sprite(world.x, world.y, 'tile-wall').setDepth(2);
        this.wallSprites[y][x] = wall;
      }
    } else if (existingWall) {
      existingWall.destroy();
      this.wallSprites[y][x] = null;
    }
  }

  private applyBrush(x: number, y: number) {
    const posKey = key(x, y);
    let tileChanged = false;
    let cratesChanged = false;
    let playerChanged = false;

    switch (this.activeBrush) {
      case 'wall': {
        if ((this.playerPos.x === x && this.playerPos.y === y) || this.crates.has(posKey)) {
          return;
        }
        if (!this.layout.walls[y][x]) {
          this.layout.walls[y][x] = true;
          tileChanged = true;
        }
        if (this.layout.goals[y][x]) {
          this.layout.goals[y][x] = false;
          tileChanged = true;
        }
        break;
      }
      case 'floor': {
        if (this.playerPos.x === x && this.playerPos.y === y) {
          return;
        }
        if (this.layout.walls[y][x]) {
          this.layout.walls[y][x] = false;
          tileChanged = true;
        }
        if (this.layout.goals[y][x]) {
          this.layout.goals[y][x] = false;
          tileChanged = true;
        }
        if (this.crates.delete(posKey)) {
          this.layout.startCrates.delete(posKey);
          cratesChanged = true;
        }
        break;
      }
      case 'goal': {
        if (this.layout.walls[y][x]) {
          this.layout.walls[y][x] = false;
          tileChanged = true;
        }
        if (!this.layout.goals[y][x]) {
          this.layout.goals[y][x] = true;
          tileChanged = true;
        }
        break;
      }
      case 'crate': {
        if (this.layout.walls[y][x]) {
          return;
        }
        if (this.playerPos.x === x && this.playerPos.y === y) {
          return;
        }
        const currentColor = this.crates.get(posKey);
        if (currentColor !== this.activeCrateColor) {
          this.crates.set(posKey, this.activeCrateColor);
          this.layout.startCrates.set(posKey, this.activeCrateColor);
          cratesChanged = true;
        }
        break;
      }
      case 'player': {
        if (this.layout.walls[y][x] || this.crates.has(posKey)) {
          return;
        }
        if (this.playerPos.x !== x || this.playerPos.y !== y) {
          this.playerPos = { x, y };
          this.layout.startPlayer = { x, y };
          playerChanged = true;
        }
        break;
      }
      case 'erase': {
        if (this.playerPos.x === x && this.playerPos.y === y) {
          return;
        }
        if (this.layout.walls[y][x]) {
          this.layout.walls[y][x] = false;
          tileChanged = true;
        }
        if (this.layout.goals[y][x]) {
          this.layout.goals[y][x] = false;
          tileChanged = true;
        }
        if (this.crates.delete(posKey)) {
          this.layout.startCrates.delete(posKey);
          cratesChanged = true;
        }
        break;
      }
      default:
        break;
    }

    if (tileChanged) {
      this.updateTileSprite(x, y);
    }
    if (cratesChanged) {
      this.syncCrateSprites();
    }
    if (playerChanged) {
      const playerWorld = this.toWorld(this.playerPos.x, this.playerPos.y);
      this.player.setPosition(playerWorld.x, playerWorld.y);
    }

    if (tileChanged || cratesChanged || playerChanged) {
      this.hasWon = false;
      this.updateInfoText();
      saveLayoutToStorage(this.layout);
    }
  }

  private keyToDir(keyName: string): Dir | null {
    switch (keyName) {
      case 'arrowup':
      case 'w':
        return { dx: 0, dy: -1 };
      case 'arrowdown':
      case 's':
        return { dx: 0, dy: 1 };
      case 'arrowleft':
      case 'a':
        return { dx: -1, dy: 0 };
      case 'arrowright':
      case 'd':
        return { dx: 1, dy: 0 };
      default:
        return null;
    }
  }

  private dirFromName(direction: DirectionName): Dir | null {
    switch (direction) {
      case 'up':
        return { dx: 0, dy: -1 };
      case 'down':
        return { dx: 0, dy: 1 };
      case 'left':
        return { dx: -1, dy: 0 };
      case 'right':
        return { dx: 1, dy: 0 };
      default:
        return null;
    }
  }

  private enqueueMove(dir: Dir, moveMs: number) {
    if (this.inputQueue.length >= MAX_QUEUE) {
      return;
    }
    this.inputQueue.push({ dx: dir.dx, dy: dir.dy, moveMs });
  }

  public setTouchDirection(direction: DirectionName | null) {
    if (this.editMode) {
      return;
    }
    if (!direction) {
      this.touchHeldDir = null;
      this.touchHoldStart = 0;
      this.touchNextRepeatAt = 0;
      return;
    }

    const dir = this.dirFromName(direction);
    if (!dir) {
      return;
    }

    const isSame =
      this.touchHeldDir &&
      this.touchHeldDir.dx === dir.dx &&
      this.touchHeldDir.dy === dir.dy;

    this.touchHeldDir = dir;
    if (isSame) {
      return;
    }

    const now = this.time.now;
    this.touchHoldStart = now;
    this.touchNextRepeatAt = now + HOLD_DELAY_MS;
    this.inputQueue = [];
    this.enqueueMove(dir, MOVE_MS);
  }

  private enqueueUndo() {
    this.pendingUndo = Math.min(this.pendingUndo + 1, MAX_QUEUE);
    this.inputQueue = [];
  }

  private pushUndoState() {
    const snapshot: UndoState = {
      playerPos: { ...this.playerPos },
      crates: new Map(this.crates),
    };
    this.undoStack.push(snapshot);
  }

  private performUndo() {
    if (this.undoStack.length === 0) {
      this.pendingUndo = 0;
      return;
    }
    const state = this.undoStack.pop();
    if (!state) {
      this.pendingUndo = 0;
      return;
    }

    this.pendingUndo = Math.max(0, this.pendingUndo - 1);
    this.playerPos = { ...state.playerPos };
    this.crates = new Map(state.crates);
    this.syncCrateSprites();

    const playerWorld = this.toWorld(this.playerPos.x, this.playerPos.y);
    this.player.setPosition(playerWorld.x, playerWorld.y);

    this.hasWon = this.countCratesOnGoals() === this.countGoals();
    this.updateInfoText();
  }

  private syncCrateSprites() {
    const desiredKeys = new Set(this.crates.keys());

    this.crateSprites.forEach((sprite, posKey) => {
      if (!desiredKeys.has(posKey)) {
        sprite.destroy();
        this.crateSprites.delete(posKey);
      }
    });

    this.crates.forEach((color, posKey) => {
      let sprite = this.crateSprites.get(posKey);
      const [x, y] = posKey.split(',').map((value) => Number(value));
      const world = this.toWorld(x, y);
      if (!sprite) {
        sprite = this.add.sprite(world.x, world.y, `tile-crate-${color}`).setDepth(3);
        this.crateSprites.set(posKey, sprite);
      } else {
        sprite.setPosition(world.x, world.y);
        const targetTexture = `tile-crate-${color}`;
        if (sprite.texture.key !== targetTexture) {
          sprite.setTexture(targetTexture);
        }
      }
    });
  }
}

export function createGame(container: HTMLElement) {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: VIEW_WIDTH,
      height: VIEW_HEIGHT,
    },
    backgroundColor: '#11151c',
    scene: [GameScene],
  });
}
