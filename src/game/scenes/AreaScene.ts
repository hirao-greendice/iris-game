import Phaser from "phaser";
import {
  AREA_SIZE,
  PLAYER_SIZE,
  WALKER_SIZE,
} from "../config";
import { maskToSegments } from "../segments";
import { TouchControls } from "../ui/TouchControls";
import { ZoomControls } from "../ui/ZoomControls";
import { AREA_LAYOUTS, STAGE_PALETTES, type Palette } from "../world/AreaLayouts";
import type { Stage } from "../world/Stage";
import { WorldModel } from "../world/WorldModel";
import type { AreaId, InputState, Rect, StageCoord, StageId, TransitionPlan } from "../world/types";

type ZoomLevel = 0 | 1 | 2;

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
const CAMERA_VIEW_SCALE = 1.5;

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
  private cameraOffset = { x: 0, y: 0 };
  private cameraInitialized = false;

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
    this.input.keyboard?.on("keydown-B", () => {
      this.scene.start("StageBuilderScene");
    });

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
        this.startTransition();
      }
    }

    if (this.zoomLevel === 0 && !this.transition) {
      this.updateCameraOffset(dt);
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

  private startTransition(): void {
    this.world.commitTransition();
  }

  private updateTransition(time: number): void {
    if (!this.transition) {
      return;
    }
    const elapsed = time - this.transition.startTime;
    if (elapsed >= this.transition.duration) {
      const toArea = this.transition.plan.toArea;
      this.transition = null;
      this.nextGraphics.setVisible(false);
      this.world.commitTransition();
      if (this.zoomLevel === 0) {
        this.syncCameraOffset(toArea);
      }
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
      const currentBaseOffset = this.zoomLevel === 0 ? { ...this.cameraOffset } : undefined;
      const nextBaseOffset = currentBaseOffset;

      this.drawView(
        this.currentGraphics,
        currentCoord,
        currentStage,
        currentAreaId,
        true,
        offsets.current.x,
        offsets.current.y,
        currentBaseOffset
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
          offsets.next.y,
          nextBaseOffset
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
    offsetY: number,
    baseOffset?: { x: number; y: number }
  ): void {
    if (this.zoomLevel === 0) {
      this.drawStageFollow(graphics, areaId, drawPlayer, offsetX, offsetY, baseOffset);
      return;
    }

    if (this.zoomLevel === 1) {
      this.drawStageOverview(graphics, stage.id, areaId, drawPlayer, offsetX, offsetY);
      return;
    }

    this.drawWorldOverview(graphics, coord, stage.id, areaId, drawPlayer, offsetX, offsetY);
  }

  private drawStageFollow(
    graphics: Phaser.GameObjects.Graphics,
    areaId: AreaId,
    drawPlayer: boolean,
    offsetX: number,
    offsetY: number,
    baseOffset?: { x: number; y: number }
  ): void {
    graphics.clear();
    const cameraBase = baseOffset ?? this.cameraOffset;
    const baseX = cameraBase.x + offsetX;
    const baseY = cameraBase.y + offsetY;
    graphics.setPosition(baseX, baseY);

    const stageWidth = this.stagePixels.width;
    const stageHeight = this.stagePixels.height;
    const areaSize = this.areaPixels;
    const scale = this.viewScale;

    const viewLeft = this.renderArea.x - baseX;
    const viewTop = this.renderArea.y - baseY;
    const viewRight = viewLeft + this.renderArea.size;
    const viewBottom = viewTop + this.renderArea.size;

    const minStageX = Math.floor(viewLeft / stageWidth);
    const maxStageX = Math.floor((viewRight - 1) / stageWidth);
    const minStageY = Math.floor(viewTop / stageHeight);
    const maxStageY = Math.floor((viewBottom - 1) / stageHeight);

    const predictedStageId = this.world.getPredictedStageId();

    for (let sy = minStageY; sy <= maxStageY; sy += 1) {
      for (let sx = minStageX; sx <= maxStageX; sx += 1) {
        const coord = { sx, sy };
        const stage = this.world.getStageAt(coord);
        const stageId = stage ? stage.id : predictedStageId;
        const originX = sx * stageWidth;
        const originY = sy * stageHeight;
        const stagePalette = this.stagePalette(stageId);

        graphics.fillStyle(stagePalette.floor, stage ? 1 : 0.35);
        graphics.fillRect(originX, originY, stageWidth, stageHeight);

        if (stage) {
          for (const id of AREA_IDS) {
            const areaPos = AREA_GRID[id];
            const areaOriginX = originX + areaPos.col * areaSize;
            const areaOriginY = originY + areaPos.row * areaSize;
            const areaPalette = this.areaPalette(stageId, id);
            graphics.fillStyle(areaPalette.floor, 1);
            graphics.fillRect(areaOriginX, areaOriginY, areaSize, areaSize);
          }
        }

        graphics.lineStyle(2, stagePalette.ceiling, stage ? 0.9 : 0.3);
        graphics.strokeRect(originX, originY, stageWidth, stageHeight);

        graphics.lineStyle(1, stagePalette.ceiling, stage ? 0.2 : 0.15);
        graphics.lineBetween(originX + areaSize, originY, originX + areaSize, originY + stageHeight);
        graphics.lineBetween(originX, originY + areaSize, originX + stageWidth, originY + areaSize);
        graphics.lineBetween(originX, originY + areaSize * 2, originX + stageWidth, originY + areaSize * 2);

        if (!stage) {
          continue;
        }

        for (const id of AREA_IDS) {
          const areaPos = AREA_GRID[id];
          const areaOriginX = originX + areaPos.col * areaSize;
          const areaOriginY = originY + areaPos.row * areaSize;
          const areaPalette = this.areaPalette(stageId, id);
          const edgeWallColor = this.brightenColor(areaPalette.wall, 0.45);

          graphics.lineStyle(1, areaPalette.ceiling, 0.25);
          graphics.strokeRect(areaOriginX, areaOriginY, areaSize, areaSize);
          const area = stage.getArea(id);
          for (const wall of area.boundaryWalls) {
            const wallColor = this.isStageEdgeWall(id, wall) ? edgeWallColor : areaPalette.wall;
            graphics.fillStyle(wallColor, 1);
            graphics.fillRect(
              areaOriginX + wall.x * scale,
              areaOriginY + wall.y * scale,
              wall.w * scale,
              wall.h * scale
            );
          }

          if (area.blocks.length > 0) {
            graphics.fillStyle(areaPalette.wall, 1);
            for (const block of area.blocks) {
              graphics.fillRect(
                areaOriginX + block.x * scale,
                areaOriginY + block.y * scale,
                block.w * scale,
                block.h * scale
              );
            }
          }

          graphics.fillStyle(0xf1c40f, 1);
          for (const walker of area.walkers) {
            const half = (WALKER_SIZE / 2) * scale;
            graphics.fillRect(
              areaOriginX + walker.x * scale - half,
              areaOriginY + walker.y * scale - half,
              WALKER_SIZE * scale,
              WALKER_SIZE * scale
            );
          }
        }
      }
    }

    if (drawPlayer) {
      const playerPosition = this.getWorldPlayerPixels(areaId);
      const half = (PLAYER_SIZE / 2) * scale;
      graphics.fillStyle(0x66f0ff, 1);
      graphics.fillRect(
        playerPosition.x - half,
        playerPosition.y - half,
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

    const stagePalette = this.stagePalette(stageId);
    const stageWidth = this.stagePixels.width;
    const stageHeight = this.stagePixels.height;
    const areaSize = this.areaPixels;

    graphics.fillStyle(stagePalette.floor, 1);
    graphics.fillRect(0, 0, stageWidth, stageHeight);

    for (const id of AREA_IDS) {
      const areaPos = AREA_GRID[id];
      const areaPalette = this.areaPalette(stageId, id);
      const areaOriginX = areaPos.col * areaSize;
      const areaOriginY = areaPos.row * areaSize;
      graphics.fillStyle(areaPalette.floor, 1);
      graphics.fillRect(areaOriginX, areaOriginY, areaSize, areaSize);
      graphics.lineStyle(1, areaPalette.ceiling, 0.35);
      graphics.strokeRect(areaOriginX, areaOriginY, areaSize, areaSize);
    }

    graphics.lineStyle(2, stagePalette.ceiling, 0.9);
    graphics.strokeRect(0, 0, stageWidth, stageHeight);

    const edgeColor = this.brightenColor(stagePalette.wall, 0.45);
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

        const stagePalette = this.stagePalette(stage.id);
        graphics.fillStyle(stagePalette.floor, 0.95);
        graphics.fillRect(originX, originY, stageWidth, stageHeight);

        for (const id of AREA_IDS) {
          const areaPos = AREA_GRID[id];
          const areaPalette = this.areaPalette(stage.id, id);
          const areaOriginX = originX + areaPos.col * areaSize;
          const areaOriginY = originY + areaPos.row * areaSize;
          graphics.fillStyle(areaPalette.floor, 0.95);
          graphics.fillRect(areaOriginX, areaOriginY, areaSize, areaSize);
          graphics.lineStyle(1, areaPalette.ceiling, 0.25);
          graphics.strokeRect(areaOriginX, areaOriginY, areaSize, areaSize);
        }

        graphics.lineStyle(1, stagePalette.ceiling, 0.55);
        graphics.strokeRect(originX, originY, stageWidth, stageHeight);

        const edgeColor = this.brightenColor(stagePalette.wall, 0.45);
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
        "Press B: Builder",
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

    this.viewScale =
      Math.min(renderSize / targetWidthUnits, renderSize / targetHeightUnits) / CAMERA_VIEW_SCALE;
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

    if (this.zoomLevel === 0) {
      this.syncCameraOffset();
    }
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
    if (!plan.stageChanged) {
      return 0;
    }

    const horizontal = plan.direction === "left" || plan.direction === "right";
    if (this.zoomLevel === 0) {
      return horizontal
        ? this.stagePixels.width / STAGE_COLS
        : this.stagePixels.height / STAGE_ROWS;
    }

    return horizontal ? this.stagePixels.width : this.stagePixels.height;
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
    if (this.zoomLevel === 0) {
      this.syncCameraOffset();
    }
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

  private updateCameraOffset(dt: number): void {
    const areaId = this.world.getCurrentAreaId();
    const target = this.getWorldCameraTarget(areaId, this.world.player.x, this.world.player.y);
    if (!this.cameraInitialized) {
      this.cameraOffset = target;
      this.cameraInitialized = true;
      return;
    }
    const t = 1 - Math.pow(0.001, dt);
    this.cameraOffset.x = Phaser.Math.Linear(this.cameraOffset.x, target.x, t);
    this.cameraOffset.y = Phaser.Math.Linear(this.cameraOffset.y, target.y, t);
  }

  private syncCameraOffset(areaId?: AreaId): void {
    const resolvedArea = areaId ?? this.world.getCurrentAreaId();
    this.cameraOffset = this.getWorldCameraTarget(resolvedArea, this.world.player.x, this.world.player.y);
    this.cameraInitialized = true;
  }

  private getWorldCameraTarget(areaId: AreaId, playerX: number, playerY: number): { x: number; y: number } {
    const playerPixels = this.getWorldPlayerPixels(areaId, playerX, playerY);
    const viewportSize = this.renderArea.size;
    const focusY = this.renderArea.y + viewportSize * 0.75;
    return {
      x: this.renderArea.x + viewportSize / 2 - playerPixels.x,
      y: focusY - playerPixels.y,
    };
  }

  private getWorldPlayerPixels(areaId: AreaId, playerX?: number, playerY?: number): { x: number; y: number } {
    const coord = this.world.getCurrentStageCoord();
    const areaPos = AREA_GRID[areaId];
    const stageWidthUnits = AREA_SIZE * STAGE_COLS;
    const stageHeightUnits = AREA_SIZE * STAGE_ROWS;
    const resolvedX = playerX ?? this.world.player.x;
    const resolvedY = playerY ?? this.world.player.y;
    const worldX = coord.sx * stageWidthUnits + areaPos.col * AREA_SIZE + resolvedX;
    const worldY = coord.sy * stageHeightUnits + areaPos.row * AREA_SIZE + resolvedY;
    return { x: worldX * this.viewScale, y: worldY * this.viewScale };
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

  private areaPalette(stageId: StageId, areaId: AreaId): Palette {
    const base = this.stagePalette(stageId);
    const override = AREA_LAYOUTS[stageId]?.[areaId]?.palette;
    if (!override) {
      return base;
    }
    return { ...base, ...override };
  }

  private stagePalette(stageId: StageId): Palette {
    return STAGE_PALETTES[stageId];
  }
}
