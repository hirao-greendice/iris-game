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
type QueuedMove = { dx: number; dy: number; moveMs: number };
type UndoState = { playerPos: Pos; crates: Set<string> };

const MOVE_MS = 120;
const MOVE_FAST_MS = 70;
const HOLD_DELAY_MS = 220;
const HOLD_REPEAT_MS = 90;
const HOLD_FAST_AFTER_MS = 600;
const HOLD_FAST_REPEAT_MS = 60;
const MAX_QUEUE = 6;

type Layout = {
  width: number;
  height: number;
  walls: boolean[][];
  goals: boolean[][];
  startCrates: Set<string>;
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
  const startCrates = new Set<string>();
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
          startCrates.add(key(x, y));
          break;
        case '@':
          startPlayer = { x, y };
          break;
        case '*':
          goals[y][x] = true;
          startCrates.add(key(x, y));
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

const LAYOUT = parseLevel(LEVEL_1);

const WORLD_WIDTH = PADDING * 2 + LAYOUT.width * TILE;
const WORLD_HEIGHT = PADDING * 2 + LAYOUT.height * TILE;

export class GameScene extends Phaser.Scene {
  private layout: Layout = LAYOUT;
  private crates = new Set<string>();
  private crateSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private playerPos: Pos = { x: 0, y: 0 };
  private player!: Phaser.GameObjects.Sprite;
  private infoText!: Phaser.GameObjects.Text;
  private hasWon = false;
  private isAnimating = false;
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
  }

  create() {
    this.createTextures();
    this.drawBoard();
    this.resetState();
    this.setupCamera();

    this.infoText = this.add
      .text(8, 8, '', {
        fontFamily: 'Trebuchet MS, Yu Gothic, Meiryo, sans-serif',
        fontSize: '16px',
        color: '#f5f5f5',
      })
      .setDepth(10);

    this.updateInfoText();

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

    g.fillStyle(0x8e44ad, 1);
    g.fillRoundedRect(6, 6, TILE - 12, TILE - 12, 6);
    g.generateTexture('tile-crate', TILE, TILE);
    g.clear();

    g.fillStyle(0x00d2d3, 1);
    g.fillCircle(TILE / 2, TILE / 2, TILE * 0.3);
    g.lineStyle(2, 0x0c2461, 1);
    g.strokeCircle(TILE / 2, TILE / 2, TILE * 0.3);
    g.generateTexture('tile-player', TILE, TILE);
    g.destroy();
  }

  private drawBoard() {
    for (let y = 0; y < this.layout.height; y += 1) {
      for (let x = 0; x < this.layout.width; x += 1) {
        const world = this.toWorld(x, y);
        const hasGoal = this.layout.goals[y][x];
        this.add.sprite(world.x, world.y, hasGoal ? 'tile-goal' : 'tile-floor').setDepth(0);

        if (this.layout.walls[y][x]) {
          this.add.sprite(world.x, world.y, 'tile-wall').setDepth(2);
        }
      }
    }
  }

  private resetState() {
    this.crateSprites.forEach((sprite) => sprite.destroy());
    this.crateSprites.clear();

    this.crates = new Set(this.layout.startCrates);
    this.playerPos = { ...this.layout.startPlayer };

    this.crates.forEach((posKey) => {
      const [x, y] = posKey.split(',').map((value) => Number(value));
      const world = this.toWorld(x, y);
      const crate = this.add.sprite(world.x, world.y, 'tile-crate').setDepth(3);
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
    this.crates.forEach((posKey) => {
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
      this.crates.add(beyondKey);
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
      crates: new Set(this.crates),
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
    this.crates = new Set(state.crates);
    this.syncCrateSprites();

    const playerWorld = this.toWorld(this.playerPos.x, this.playerPos.y);
    this.player.setPosition(playerWorld.x, playerWorld.y);

    this.hasWon = this.countCratesOnGoals() === this.countGoals();
    this.updateInfoText();
  }

  private syncCrateSprites() {
    const desiredKeys = new Set(this.crates);

    this.crateSprites.forEach((sprite, posKey) => {
      if (!desiredKeys.has(posKey)) {
        sprite.destroy();
        this.crateSprites.delete(posKey);
      }
    });

    this.crates.forEach((posKey) => {
      let sprite = this.crateSprites.get(posKey);
      const [x, y] = posKey.split(',').map((value) => Number(value));
      const world = this.toWorld(x, y);
      if (!sprite) {
        sprite = this.add.sprite(world.x, world.y, 'tile-crate').setDepth(3);
        this.crateSprites.set(posKey, sprite);
      } else {
        sprite.setPosition(world.x, world.y);
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
