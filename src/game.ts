import Phaser from 'phaser';

const TILE = 48;
const PADDING = 16;
const VIEW_TILES_X = 16;
const VIEW_TILES_Y = 12;

const VIEW_WIDTH = PADDING * 2 + VIEW_TILES_X * TILE;
const VIEW_HEIGHT = PADDING * 2 + VIEW_TILES_Y * TILE;

const LEVEL_WIDTH = 100;
const LEVEL_HEIGHT = 100;

const LEVEL_1 = buildLevel(LEVEL_WIDTH, LEVEL_HEIGHT);

type Pos = { x: number; y: number };

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

class GameScene extends Phaser.Scene {
  private layout: Layout = LAYOUT;
  private crates = new Set<string>();
  private crateSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private playerPos: Pos = { x: 0, y: 0 };
  private player!: Phaser.GameObjects.Sprite;
  private infoText!: Phaser.GameObjects.Text;
  private hasWon = false;
  private isAnimating = false;

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
      const keyName = event.key.toLowerCase();
      if (keyName === 'r') {
        this.resetState();
        return;
      }
      if (this.hasWon) {
        return;
      }
      switch (keyName) {
        case 'arrowup':
        case 'w':
          this.tryMove(0, -1);
          break;
        case 'arrowdown':
        case 's':
          this.tryMove(0, 1);
          break;
        case 'arrowleft':
        case 'a':
          this.tryMove(-1, 0);
          break;
        case 'arrowright':
        case 'd':
          this.tryMove(1, 0);
          break;
        default:
          break;
      }
    });
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

  private tryMove(dx: number, dy: number) {
    if (this.isAnimating) {
      return;
    }
    const next = { x: this.playerPos.x + dx, y: this.playerPos.y + dy };
    if (this.isWall(next.x, next.y)) {
      return;
    }

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
    this.playMoveAnimation(next, pushedCrate);
  }

  private playMoveAnimation(
    next: Pos,
    pushedCrate: { sprite: Phaser.GameObjects.Sprite; target: Pos } | null,
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
      duration: 120,
      ease: 'Sine.easeOut',
      onComplete: finish,
    });

    if (pushedCrate) {
      const crateWorld = this.toWorld(pushedCrate.target.x, pushedCrate.target.y);
      this.tweens.add({
        targets: pushedCrate.sprite,
        x: crateWorld.x,
        y: crateWorld.y,
        duration: 120,
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
