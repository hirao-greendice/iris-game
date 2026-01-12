import Phaser from "phaser";
import {
  AREA_SIZE,
  PLAYER_SIZE,
  TRANSITION_DURATION,
  WALKER_SIZE,
} from "../config";
import { maskToSegments } from "../segments";
import { TouchControls } from "../ui/TouchControls";
import { ZoomControls } from "../ui/ZoomControls";
import { AREA_WALLS } from "../world/Area";
import type { Stage } from "../world/Stage";
import { WorldModel } from "../world/WorldModel";
import type { AreaId, InputState, Rect, StageCoord, StageId, TransitionPlan } from "../world/types";

type ZoomLevel = 0 | 1 | 2;

const STAGE_PALETTES: Record<StageId, { floor: number; wall: number; ceiling: number }> = {
  "0": { floor: 0x112233, wall: 0x1c3a5a, ceiling: 0x355b78 },
  "1": { floor: 0x14251d, wall: 0x23503a, ceiling: 0x3f6b55 },
  "2": { floor: 0x2b1d18, wall: 0x4f2d22, ceiling: 0x6b4a38 },
  "3": { floor: 0x241a2b, wall: 0x3f2752, ceiling: 0x5f4a74 },
  "4": { floor: 0x1c2228, wall: 0x2d3b47, ceiling: 0x4a5a6b },
  "5": { floor: 0x2b1818, wall: 0x4f2020, ceiling: 0x6b3636 },
  "6": { floor: 0x21261a, wall: 0x3a4f1f, ceiling: 0x5a6b3a },
  "7": { floor: 0x191f2e, wall: 0x273458, ceiling: 0x41507a },
  "8": { floor: 0x182629, wall: 0x205055, ceiling: 0x3a7378 },
  "9": { floor: 0x2b2416, wall: 0x4f3d1f, ceiling: 0x6b5833 },
  X: { floor: 0x1b1b24, wall: 0x2f2f44, ceiling: 0x4f4f6b },
};

const AREA_GRID: Record<AreaId, { col: number; row: number }> = {
  A: { col: 0, row: 0 },
  B: { col: 1, row: 0 },
  C: { col: 0, row: 1 },
  D: { col: 1, row: 1 },
  E: { col: 0, row: 2 },
  F: { col: 1, row: 2 },
};

const AREA_IDS: AreaId[] = ["A", "B", "C", "D", "E", "F"];
const STAGE_COLS = 2;
const STAGE_ROWS = 3;
const WORLD_RADIUS = 2;
const WORLD_SIZE = WORLD_RADIUS * 2 + 1;
const WALL_EDGE_EPSILON = 1e-6;

export class AreaScene extends Phaser.Scene {
  private world!: WorldModel;
  private currentGraphics!: Phaser.GameObjects.Graphics;
  private nextGraphics!: Phaser.GameObjects.Graphics;
  private renderMaskGraphics!: Phaser.GameObjects.Graphics;
  private renderMask!: Phaser.Display.Masks.GeometryMask;
  private debugText!: Phaser.GameObjects.Text;
  private touchControls!: TouchControls;
  private zoomControls!: ZoomControls;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyJump!: Phaser.Input.Keyboard.Key;
  private keyAltJump!: Phaser.Input.Keyboard.Key;
  private zoomLevel: ZoomLevel = 0;

  private viewScale = 1;
  private areaPixels = 0;
  private stagePixels = { width: 0, height: 0 };
  private worldPixels = { width: 0, height: 0 };
  private viewOffset = { x: 0, y: 0 };
  private renderArea = { x: 0, y: 0, size: 0 };

  private prevJumpDown = false;
  private transition: { plan: TransitionPlan; startTime: number; duration: number } | null = null;

  constructor() {
    super("AreaScene");
  }

  create(): void {
    this.world = new WorldModel();

    this.currentGraphics = this.add.graphics();
    this.nextGraphics = this.add.graphics().setVisible(false);
    this.renderMaskGraphics = this.add.graphics().setVisible(false);
    this.renderMask = this.renderMaskGraphics.createGeometryMask();
    this.currentGraphics.setMask(this.renderMask);
    this.nextGraphics.setMask(this.renderMask);

    this.debugText = this.add
      .text(12, 12, "", {
        fontFamily: "Consolas, monospace",
        fontSize: "14px",
        color: "#e6f0ff",
      })
      .setDepth(30);

    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.keyLeft = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A) as Phaser.Input.Keyboard.Key;
    this.keyRight = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D) as Phaser.Input.Keyboard.Key;
    this.keyJump = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W) as Phaser.Input.Keyboard.Key;
    this.keyAltJump = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) as Phaser.Input.Keyboard.Key;

    this.touchControls = new TouchControls(this);
    this.zoomControls = new ZoomControls(
      this,
      () => this.changeZoom(-1),
      () => this.changeZoom(1)
    );
    this.registerZoomKeys();
    this.updateZoomControls();

    this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize: Phaser.Structs.Size) => {
      this.handleResize(gameSize.width, gameSize.height);
    });
    this.handleResize(this.scale.width, this.scale.height);
  }

  update(time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.transition) {
      this.updateTransition(time);
    } else {
      const input = this.readInput();
      const plan = this.world.step(dt, input);
      if (plan) {
        this.startTransition(plan, time);
      }
    }

    this.render();
    this.updateDebug();
  }

  private readInput(): InputState {
    const touch = this.touchControls.getState();
    const left = Boolean(this.cursors.left?.isDown || this.keyLeft.isDown || touch.left);
    const right = Boolean(this.cursors.right?.isDown || this.keyRight.isDown || touch.right);

    const jumpDown = Boolean(
      this.cursors.up?.isDown ||
        this.keyJump.isDown ||
        this.keyAltJump.isDown ||
        touch.jump
    );
    const jumpPressed = jumpDown && !this.prevJumpDown;
    this.prevJumpDown = jumpDown;

    return { left, right, jumpPressed };
  }

  private startTransition(plan: TransitionPlan, time: number): void {
    if (this.zoomLevel > 0 && !plan.stageChanged) {
      this.world.commitTransition();
      return;
    }
    this.transition = {
      plan,
      startTime: time,
      duration: TRANSITION_DURATION * 1000,
    };
    this.world.pause();
    this.nextGraphics.setVisible(true);
  }

  private updateTransition(time: number): void {
    if (!this.transition) {
      return;
    }
    const elapsed = time - this.transition.startTime;
    if (elapsed >= this.transition.duration) {
      this.transition = null;
      this.nextGraphics.setVisible(false);
      this.world.commitTransition();
    }
  }

  private render(): void {
    const currentCoord = this.world.getCurrentStageCoord();
    const currentAreaId = this.world.getCurrentAreaId();
    const currentStage = this.world.getStageAt(currentCoord);
    if (!currentStage) {
      return;
    }

    if (this.transition) {
      const progress = Phaser.Math.Clamp(
        (this.time.now - this.transition.startTime) / this.transition.duration,
        0,
        1
      );
      const offsets = this.getSlideOffsets(this.transition.plan, progress);

      this.drawView(
        this.currentGraphics,
        currentCoord,
        currentStage,
        currentAreaId,
        true,
        offsets.current.x,
        offsets.current.y
      );

      const nextCoord = this.transition.plan.toStage;
      const nextStage = this.world.getStageAt(nextCoord);
      if (nextStage) {
        this.drawView(
          this.nextGraphics,
          nextCoord,
          nextStage,
          this.transition.plan.toArea,
          false,
          offsets.next.x,
          offsets.next.y
        );
      }
    } else {
      this.drawView(this.currentGraphics, currentCoord, currentStage, currentAreaId, true, 0, 0);
      this.nextGraphics.clear();
      this.nextGraphics.setPosition(0, 0);
    }
  }

  private drawView(
    graphics: Phaser.GameObjects.Graphics,
    coord: StageCoord,
    stage: Stage,
    areaId: AreaId,
    drawPlayer: boolean,
    offsetX: number,
    offsetY: number
  ): void {
    if (this.zoomLevel === 0) {
      const area = stage.getArea(areaId);
      this.drawArea(graphics, stage.id, areaId, area, drawPlayer, offsetX, offsetY);
      return;
    }

    if (this.zoomLevel === 1) {
      this.drawStageOverview(graphics, stage.id, areaId, drawPlayer, offsetX, offsetY);
      return;
    }

    this.drawWorldOverview(graphics, coord, stage.id, areaId, drawPlayer, offsetX, offsetY);
  }

  private drawArea(
    graphics: Phaser.GameObjects.Graphics,
    stageId: StageId,
    areaId: AreaId,
    area: { walkers: { x: number; y: number }[]; blocks: Rect[] },
    drawPlayer: boolean,
    offsetX: number,
    offsetY: number
  ): void {
    graphics.clear();
    graphics.setPosition(this.viewOffset.x + offsetX, this.viewOffset.y + offsetY);

    const size = this.areaPixels;
    const scale = this.viewScale;
    const palette = this.stagePalette(stageId);

    graphics.fillStyle(palette.floor, 1);
    graphics.fillRect(0, 0, size, size);

    graphics.lineStyle(2, palette.ceiling, 1);
    graphics.strokeRect(0, 0, size, size);

    const edgeWallColor = this.brightenColor(palette.wall, 0.45);
    for (const wall of AREA_WALLS) {
      const wallColor = this.isStageEdgeWall(areaId, wall) ? edgeWallColor : palette.wall;
      graphics.fillStyle(wallColor, 1);
      graphics.fillRect(wall.x * scale, wall.y * scale, wall.w * scale, wall.h * scale);
    }
    if (area.blocks.length > 0) {
      graphics.fillStyle(palette.wall, 1);
      for (const block of area.blocks) {
        graphics.fillRect(block.x * scale, block.y * scale, block.w * scale, block.h * scale);
      }
    }

    graphics.fillStyle(0xf1c40f, 1);
    for (const walker of area.walkers) {
      const half = (WALKER_SIZE / 2) * scale;
      graphics.fillRect(walker.x * scale - half, walker.y * scale - half, WALKER_SIZE * scale, WALKER_SIZE * scale);
    }

    if (drawPlayer) {
      const player = this.world.player;
      const half = (PLAYER_SIZE / 2) * scale;
      graphics.fillStyle(0x66f0ff, 1);
      graphics.fillRect(
        player.x * scale - half,
        player.y * scale - half,
        PLAYER_SIZE * scale,
        PLAYER_SIZE * scale
      );
    }
  }

  private drawStageOverview(
    graphics: Phaser.GameObjects.Graphics,
    stageId: StageId,
    areaId: AreaId,
    drawPlayer: boolean,
    offsetX: number,
    offsetY: number
  ): void {
    graphics.clear();
    graphics.setPosition(this.viewOffset.x + offsetX, this.viewOffset.y + offsetY);

    const palette = this.stagePalette(stageId);
    const stageWidth = this.stagePixels.width;
    const stageHeight = this.stagePixels.height;
    const areaSize = this.areaPixels;

    graphics.fillStyle(palette.floor, 1);
    graphics.fillRect(0, 0, stageWidth, stageHeight);

    graphics.lineStyle(2, palette.ceiling, 0.9);
    graphics.strokeRect(0, 0, stageWidth, stageHeight);

    graphics.lineStyle(1, palette.ceiling, 0.35);
    graphics.lineBetween(areaSize, 0, areaSize, stageHeight);
    graphics.lineBetween(0, areaSize, stageWidth, areaSize);
    graphics.lineBetween(0, areaSize * 2, stageWidth, areaSize * 2);

    const edgeColor = this.brightenColor(palette.wall, 0.45);
    this.drawStageEdgeHighlights(graphics, 0, 0, areaSize, AREA_IDS, edgeColor);

    const areaPos = AREA_GRID[areaId];
    graphics.lineStyle(2, 0xf5d76e, 1);
    graphics.strokeRect(areaPos.col * areaSize, areaPos.row * areaSize, areaSize, areaSize);

    if (drawPlayer) {
      const player = this.world.player;
      const px = (areaPos.col * AREA_SIZE + player.x) * this.viewScale;
      const py = (areaPos.row * AREA_SIZE + player.y) * this.viewScale;
      const size = Math.max(2, PLAYER_SIZE * this.viewScale);
      graphics.fillStyle(0x66f0ff, 1);
      graphics.fillRect(px - size / 2, py - size / 2, size, size);
    }
  }

  private drawWorldOverview(
    graphics: Phaser.GameObjects.Graphics,
    centerCoord: StageCoord,
    currentStageId: StageId,
    areaId: AreaId,
    drawPlayer: boolean,
    offsetX: number,
    offsetY: number
  ): void {
    graphics.clear();
    graphics.setPosition(this.viewOffset.x + offsetX, this.viewOffset.y + offsetY);

    const stageWidth = this.stagePixels.width;
    const stageHeight = this.stagePixels.height;
    const areaSize = this.areaPixels;
    const emptyStageLine = 0x2b3240;

    for (let dy = -WORLD_RADIUS; dy <= WORLD_RADIUS; dy += 1) {
      for (let dx = -WORLD_RADIUS; dx <= WORLD_RADIUS; dx += 1) {
        const coord = { sx: centerCoord.sx + dx, sy: centerCoord.sy + dy };
        const stage = this.world.getStageAt(coord);
        const gridX = dx + WORLD_RADIUS;
        const gridY = dy + WORLD_RADIUS;
        const originX = gridX * stageWidth;
        const originY = gridY * stageHeight;

        if (!stage) {
          graphics.lineStyle(1, emptyStageLine, 0.55);
          graphics.strokeRect(originX, originY, stageWidth, stageHeight);

          graphics.lineStyle(1, emptyStageLine, 0.2);
          graphics.lineBetween(originX + areaSize, originY, originX + areaSize, originY + stageHeight);
          graphics.lineBetween(originX, originY + areaSize, originX + stageWidth, originY + areaSize);
          graphics.lineBetween(originX, originY + areaSize * 2, originX + stageWidth, originY + areaSize * 2);
          continue;
        }

        const palette = this.stagePalette(stage.id);
        graphics.fillStyle(palette.floor, 0.95);
        graphics.fillRect(originX, originY, stageWidth, stageHeight);

        graphics.lineStyle(1, palette.ceiling, 0.55);
        graphics.strokeRect(originX, originY, stageWidth, stageHeight);

        graphics.lineStyle(1, palette.ceiling, 0.25);
        graphics.lineBetween(originX + areaSize, originY, originX + areaSize, originY + stageHeight);
        graphics.lineBetween(originX, originY + areaSize, originX + stageWidth, originY + areaSize);
        graphics.lineBetween(originX, originY + areaSize * 2, originX + stageWidth, originY + areaSize * 2);

        const edgeColor = this.brightenColor(palette.wall, 0.45);
        this.drawStageEdgeHighlights(graphics, originX, originY, areaSize, AREA_IDS, edgeColor);
      }
    }

    const centerStageOriginX = WORLD_RADIUS * stageWidth;
    const centerStageOriginY = WORLD_RADIUS * stageHeight;
    const highlight = this.stagePalette(currentStageId).ceiling;

    graphics.lineStyle(2, highlight, 1);
    graphics.strokeRect(centerStageOriginX, centerStageOriginY, stageWidth, stageHeight);

    const areaPos = AREA_GRID[areaId];
    graphics.lineStyle(2, 0xf5d76e, 1);
    graphics.strokeRect(
      centerStageOriginX + areaPos.col * areaSize,
      centerStageOriginY + areaPos.row * areaSize,
      areaSize,
      areaSize
    );

    if (drawPlayer) {
      const player = this.world.player;
      const px =
        centerStageOriginX + (areaPos.col * AREA_SIZE + player.x) * this.viewScale;
      const py =
        centerStageOriginY + (areaPos.row * AREA_SIZE + player.y) * this.viewScale;
      const size = Math.max(2, PLAYER_SIZE * this.viewScale);
      graphics.fillStyle(0x66f0ff, 1);
      graphics.fillRect(px - size / 2, py - size / 2, size, size);
    }
  }

  private updateDebug(): void {
    const coord = this.world.getCurrentStageCoord();
    const segments = maskToSegments(this.world.getSegmentsMask());
    const segmentText = segments.length > 0 ? segments.join("") : "-";
    const predicted = this.world.getPredictedStageId();

    this.debugText.setText(
      [
        `Stage: (${coord.sx}, ${coord.sy})`,
        `Stage ID: ${this.world.getCurrentStageId()}`,
        `Area: ${this.world.getCurrentAreaId()}`,
        `Segments: ${segmentText}`,
        `Predicted: ${predicted}`,
      ].join("\n")
    );
  }

  private handleResize(width: number, height: number): void {
    const renderSize = Math.min(width, height) * 0.9;
    this.renderArea = {
      size: renderSize,
      x: (width - renderSize) / 2,
      y: (height - renderSize) / 2,
    };
    this.updateRenderMask();

    const stageWidthUnits = AREA_SIZE * STAGE_COLS;
    const stageHeightUnits = AREA_SIZE * STAGE_ROWS;
    const worldWidthUnits = stageWidthUnits * WORLD_SIZE;
    const worldHeightUnits = stageHeightUnits * WORLD_SIZE;

    let targetWidthUnits = AREA_SIZE;
    let targetHeightUnits = AREA_SIZE;

    if (this.zoomLevel === 1) {
      targetWidthUnits = stageWidthUnits;
      targetHeightUnits = stageHeightUnits;
    } else if (this.zoomLevel === 2) {
      targetWidthUnits = worldWidthUnits;
      targetHeightUnits = worldHeightUnits;
    }

    this.viewScale = Math.min(renderSize / targetWidthUnits, renderSize / targetHeightUnits);
    this.areaPixels = AREA_SIZE * this.viewScale;
    this.stagePixels = { width: this.areaPixels * STAGE_COLS, height: this.areaPixels * STAGE_ROWS };
    this.worldPixels = {
      width: this.stagePixels.width * WORLD_SIZE,
      height: this.stagePixels.height * WORLD_SIZE,
    };

    const targetWidth =
      this.zoomLevel === 0
        ? this.areaPixels
        : this.zoomLevel === 1
          ? this.stagePixels.width
          : this.worldPixels.width;
    const targetHeight =
      this.zoomLevel === 0
        ? this.areaPixels
        : this.zoomLevel === 1
          ? this.stagePixels.height
          : this.worldPixels.height;

    this.viewOffset.x = this.renderArea.x + (renderSize - targetWidth) / 2;
    this.viewOffset.y = this.renderArea.y + (renderSize - targetHeight) / 2;

    this.touchControls.layout(width, height);
    this.zoomControls.layout(width, height);
  }

  private getSlideOffsets(plan: TransitionPlan, progress: number) {
    const distance = this.getTransitionDistance(plan);
    const direction = plan.direction;
    switch (direction) {
      case "left":
        return {
          current: { x: progress * distance, y: 0 },
          next: { x: -distance + progress * distance, y: 0 },
        };
      case "right":
        return {
          current: { x: -progress * distance, y: 0 },
          next: { x: distance - progress * distance, y: 0 },
        };
      case "up":
        return {
          current: { x: 0, y: progress * distance },
          next: { x: 0, y: -distance + progress * distance },
        };
      case "down":
        return {
          current: { x: 0, y: -progress * distance },
          next: { x: 0, y: distance - progress * distance },
        };
      default:
        return { current: { x: 0, y: 0 }, next: { x: 0, y: 0 } };
    }
  }

  private getTransitionDistance(plan: TransitionPlan): number {
    if (this.zoomLevel === 0) {
      return this.areaPixels;
    }
    if (!plan.stageChanged) {
      return 0;
    }

    return plan.direction === "left" || plan.direction === "right"
      ? this.stagePixels.width
      : this.stagePixels.height;
  }

  private registerZoomKeys(): void {
    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      if (event.key === "+" || event.key === "=" || event.code === "NumpadAdd") {
        this.changeZoom(-1);
        return;
      }
      if (event.key === "-" || event.key === "_" || event.code === "NumpadSubtract") {
        this.changeZoom(1);
      }
    });
  }

  private changeZoom(delta: number): void {
    if (this.transition) {
      return;
    }
    const nextLevel = Phaser.Math.Clamp(this.zoomLevel + delta, 0, 2) as ZoomLevel;
    if (nextLevel === this.zoomLevel) {
      return;
    }
    this.zoomLevel = nextLevel;
    this.updateZoomControls();
    this.handleResize(this.scale.width, this.scale.height);
  }

  private updateZoomControls(): void {
    this.zoomControls.setState(this.zoomLevel);
  }

  private updateRenderMask(): void {
    this.renderMaskGraphics.clear();
    this.renderMaskGraphics.fillStyle(0xffffff, 1);
    this.renderMaskGraphics.fillRect(
      this.renderArea.x,
      this.renderArea.y,
      this.renderArea.size,
      this.renderArea.size
    );
  }

  private drawStageEdgeHighlights(
    graphics: Phaser.GameObjects.Graphics,
    originX: number,
    originY: number,
    areaSize: number,
    areaIds: AreaId[],
    color: number
  ): void {
    graphics.lineStyle(3, color, 0.95);
    for (const areaId of areaIds) {
      const areaPos = AREA_GRID[areaId];
      const x0 = originX + areaPos.col * areaSize;
      const y0 = originY + areaPos.row * areaSize;
      const x1 = x0 + areaSize;
      const y1 = y0 + areaSize;

      if (areaPos.row === 0) {
        graphics.lineBetween(x0, y0, x1, y0);
      }
      if (areaPos.row === STAGE_ROWS - 1) {
        graphics.lineBetween(x0, y1, x1, y1);
      }
      if (areaPos.col === 0) {
        graphics.lineBetween(x0, y0, x0, y1);
      }
      if (areaPos.col === STAGE_COLS - 1) {
        graphics.lineBetween(x1, y0, x1, y1);
      }
    }
  }

  private isStageEdgeWall(areaId: AreaId, wall: Rect): boolean {
    const areaPos = AREA_GRID[areaId];
    const topEdge = areaPos.row === 0;
    const bottomEdge = areaPos.row === STAGE_ROWS - 1;
    const leftEdge = areaPos.col === 0;
    const rightEdge = areaPos.col === STAGE_COLS - 1;

    const isHorizontal = wall.w >= wall.h;
    const isTop = isHorizontal && wall.y <= WALL_EDGE_EPSILON;
    const isBottom = isHorizontal && Math.abs(wall.y + wall.h - AREA_SIZE) <= WALL_EDGE_EPSILON;
    const isLeft = !isHorizontal && wall.x <= WALL_EDGE_EPSILON;
    const isRight = !isHorizontal && Math.abs(wall.x + wall.w - AREA_SIZE) <= WALL_EDGE_EPSILON;

    return (topEdge && isTop) || (bottomEdge && isBottom) || (leftEdge && isLeft) || (rightEdge && isRight);
  }

  private brightenColor(color: number, amount: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const nr = Math.min(255, Math.round(r + (255 - r) * amount));
    const ng = Math.min(255, Math.round(g + (255 - g) * amount));
    const nb = Math.min(255, Math.round(b + (255 - b) * amount));
    return (nr << 16) | (ng << 8) | nb;
  }

  private stagePalette(stageId: StageId): { floor: number; wall: number; ceiling: number } {
    return STAGE_PALETTES[stageId];
  }
}
