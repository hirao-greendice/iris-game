import Phaser from "phaser";
import {
  AREA_SIZE,
  PLAYER_SIZE,
  TRANSITION_DURATION,
  WALKER_SIZE,
} from "../config";
import { maskToSegments } from "../segments";
import { TouchControls } from "../ui/TouchControls";
import { AREA_WALLS } from "../world/Area";
import { WorldModel } from "../world/WorldModel";
import type { InputState, StageId, TransitionPlan } from "../world/types";

export class AreaScene extends Phaser.Scene {
  private world!: WorldModel;
  private currentGraphics!: Phaser.GameObjects.Graphics;
  private nextGraphics!: Phaser.GameObjects.Graphics;
  private debugText!: Phaser.GameObjects.Text;
  private touchControls!: TouchControls;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyJump!: Phaser.Input.Keyboard.Key;
  private keyAltJump!: Phaser.Input.Keyboard.Key;

  private viewScale = 1;
  private areaPixels = 0;
  private viewOffset = { x: 0, y: 0 };

  private prevJumpDown = false;
  private transition: { plan: TransitionPlan; startTime: number; duration: number } | null = null;

  constructor() {
    super("AreaScene");
  }

  create(): void {
    this.world = new WorldModel();

    this.currentGraphics = this.add.graphics();
    this.nextGraphics = this.add.graphics().setVisible(false);

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

    const currentArea = currentStage.getArea(currentAreaId);

    if (this.transition) {
      const progress = Phaser.Math.Clamp(
        (this.time.now - this.transition.startTime) / this.transition.duration,
        0,
        1
      );
      const offsets = this.getSlideOffsets(this.transition.plan.direction, progress);

      this.drawArea(this.currentGraphics, currentStage.id, currentArea, true, offsets.current.x, offsets.current.y);

      const nextCoord = this.transition.plan.toStage;
      const nextStage = this.world.getStageAt(nextCoord);
      if (nextStage) {
        const nextArea = nextStage.getArea(this.transition.plan.toArea);
        this.drawArea(this.nextGraphics, nextStage.id, nextArea, false, offsets.next.x, offsets.next.y);
      }
    } else {
      this.drawArea(this.currentGraphics, currentStage.id, currentArea, true, 0, 0);
      this.nextGraphics.clear();
      this.nextGraphics.setPosition(0, 0);
    }
  }

  private drawArea(
    graphics: Phaser.GameObjects.Graphics,
    stageId: StageId,
    area: { walkers: { x: number; y: number }[] },
    drawPlayer: boolean,
    offsetX: number,
    offsetY: number
  ): void {
    graphics.clear();
    graphics.setPosition(this.viewOffset.x + offsetX, this.viewOffset.y + offsetY);

    const size = this.areaPixels;
    const scale = this.viewScale;
    const background = this.stageColor(stageId);

    graphics.fillStyle(background, 1);
    graphics.fillRect(0, 0, size, size);

    graphics.lineStyle(2, 0x0e1726, 1);
    graphics.strokeRect(0, 0, size, size);

    graphics.fillStyle(0x223448, 1);
    for (const wall of AREA_WALLS) {
      graphics.fillRect(wall.x * scale, wall.y * scale, wall.w * scale, wall.h * scale);
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
    const size = Math.min(width, height);
    this.viewScale = size / AREA_SIZE;
    this.areaPixels = AREA_SIZE * this.viewScale;
    this.viewOffset.x = (width - this.areaPixels) / 2;
    this.viewOffset.y = (height - this.areaPixels) / 2;

    this.touchControls.layout(width, height);
  }

  private getSlideOffsets(direction: string, progress: number) {
    const distance = this.areaPixels;
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

  private stageColor(stageId: StageId): number {
    const palette = [
      0x15212f,
      0x1b2a3a,
      0x1d2f36,
      0x203036,
      0x24363a,
      0x223044,
      0x293842,
      0x2a3a4f,
      0x25333a,
      0x1f2933,
      0x2f2b2b,
    ];

    if (stageId === "X") {
      return palette[10];
    }

    const index = Number(stageId);
    return palette[index % 10];
  }
}
