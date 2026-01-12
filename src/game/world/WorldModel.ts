import {
  AREA_SIZE,
  GRAVITY,
  JUMP_SPEED,
  MAX_DT,
  MAX_VERTICAL_SPEED,
  MOVE_SPEED,
  PLAYER_HALF,
  PLAYER_SIZE,
} from "../config";
import { segmentsMaskToStageId, segmentToBit } from "../segments";
import type { Segment } from "../segments";
import { Stage } from "./Stage";
import type {
  AreaId,
  Direction,
  InputState,
  PlayerState,
  Rect,
  StageCoord,
  StageId,
  TransitionPlan,
} from "./types";

const AREA_GRID: Record<AreaId, { col: number; row: number }> = {
  A: { col: 0, row: 0 },
  B: { col: 1, row: 0 },
  C: { col: 0, row: 1 },
  D: { col: 1, row: 1 },
  E: { col: 0, row: 2 },
  F: { col: 1, row: 2 },
};

const GRID_AREA: AreaId[][] = [
  ["A", "B"],
  ["C", "D"],
  ["E", "F"],
];

export class WorldModel {
  private readonly stages = new Map<string, Stage>();
  private currentCoord: StageCoord = { sx: 0, sy: 0 };
  private currentStage: Stage;
  private currentAreaId: AreaId = "A";
  private segmentsMask = 0;
  private paused = false;
  private pendingTransition: TransitionPlan | null = null;

  readonly player: PlayerState = {
    x: AREA_SIZE * 0.5,
    y: AREA_SIZE * 0.5,
    vx: 0,
    vy: 0,
    grounded: false,
  };

  constructor() {
    this.currentStage = this.createStage(this.currentCoord, "0");
  }

  step(dt: number, input: InputState): TransitionPlan | null {
    if (this.paused) {
      return null;
    }

    const clampedDt = Math.min(dt, MAX_DT);

    for (const stage of this.stages.values()) {
      for (const area of stage.getAreas()) {
        area.update(clampedDt);
      }
    }

    const transition = this.updatePlayer(clampedDt, input);
    if (transition) {
      this.pendingTransition = transition;
    }
    return transition;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  commitTransition(): void {
    if (!this.pendingTransition) {
      return;
    }

    const plan = this.pendingTransition;
    this.pendingTransition = null;

    if (plan.stageChanged) {
      this.currentCoord = { ...plan.toStage };
      const stage = this.getStage(plan.toStage) ?? this.createStage(plan.toStage, plan.nextStageId);
      this.currentStage = stage;
      this.segmentsMask = 0;
    }

    this.currentAreaId = plan.toArea;
    this.shiftPlayerForEntry(plan.direction);
    this.paused = false;
  }

  getCurrentStageCoord(): StageCoord {
    return { ...this.currentCoord };
  }

  getCurrentStageId(): StageId {
    return this.currentStage.id;
  }

  getCurrentAreaId(): AreaId {
    return this.currentAreaId;
  }

  getSegmentsMask(): number {
    return this.segmentsMask;
  }

  getPredictedStageId(): StageId {
    return segmentsMaskToStageId(this.segmentsMask);
  }

  getStageAt(coord: StageCoord): Stage | undefined {
    return this.getStage(coord);
  }

  getAreaAt(coord: StageCoord, areaId: AreaId) {
    const stage = this.getStage(coord);
    if (!stage) {
      throw new Error("Stage not found");
    }
    return stage.getArea(areaId);
  }

  getPendingTransition(): TransitionPlan | null {
    return this.pendingTransition;
  }

  private updatePlayer(dt: number, input: InputState): TransitionPlan | null {
    const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    this.player.vx = direction * MOVE_SPEED;

    if (input.jumpPressed && this.player.grounded) {
      this.player.vy = -JUMP_SPEED;
      this.player.grounded = false;
    }

    this.player.vy += GRAVITY * dt;
    this.player.vy = Math.max(-MAX_VERTICAL_SPEED, Math.min(MAX_VERTICAL_SPEED, this.player.vy));

    this.player.x += this.player.vx * dt;
    this.resolveHorizontalCollisions();

    this.player.y += this.player.vy * dt;
    this.resolveVerticalCollisions();

    const exitDirection = this.checkExitDirection();
    if (exitDirection) {
      return this.prepareTransition(exitDirection);
    }

    return null;
  }

  private resolveHorizontalCollisions(): void {
    for (const wall of this.getCurrentWalls()) {
      if (!this.overlapsWall(wall)) {
        continue;
      }

      if (this.player.vx > 0) {
        this.player.x = wall.x - PLAYER_HALF;
      } else if (this.player.vx < 0) {
        this.player.x = wall.x + wall.w + PLAYER_HALF;
      }
      this.player.vx = 0;
    }
  }

  private resolveVerticalCollisions(): void {
    this.player.grounded = false;

    for (const wall of this.getCurrentWalls()) {
      if (!this.overlapsWall(wall)) {
        continue;
      }

      if (this.player.vy > 0) {
        this.player.y = wall.y - PLAYER_HALF;
        this.player.grounded = true;
      } else if (this.player.vy < 0) {
        this.player.y = wall.y + wall.h + PLAYER_HALF;
      }
      this.player.vy = 0;
    }
  }

  private overlapsWall(wall: { x: number; y: number; w: number; h: number }): boolean {
    const px = this.player.x - PLAYER_HALF;
    const py = this.player.y - PLAYER_HALF;
    return (
      px < wall.x + wall.w &&
      px + PLAYER_SIZE > wall.x &&
      py < wall.y + wall.h &&
      py + PLAYER_SIZE > wall.y
    );
  }

  private getCurrentWalls(): Rect[] {
    return this.currentStage.getArea(this.currentAreaId).walls;
  }

  private checkExitDirection(): Direction | null {
    if (this.player.x < 0) {
      return "left";
    }
    if (this.player.x > AREA_SIZE) {
      return "right";
    }
    if (this.player.y < 0) {
      return "up";
    }
    if (this.player.y > AREA_SIZE) {
      return "down";
    }
    return null;
  }

  private prepareTransition(direction: Direction): TransitionPlan {
    const fromArea = this.currentAreaId;
    const fromStage = { ...this.currentCoord };
    const fromGrid = AREA_GRID[fromArea];

    let toCol = fromGrid.col;
    let toRow = fromGrid.row;
    let dx = 0;
    let dy = 0;

    switch (direction) {
      case "left":
        if (fromGrid.col === 0) {
          dx = -1;
          toCol = 1;
        } else {
          toCol = 0;
        }
        break;
      case "right":
        if (fromGrid.col === 1) {
          dx = 1;
          toCol = 0;
        } else {
          toCol = 1;
        }
        break;
      case "up":
        if (fromGrid.row === 0) {
          dy = -1;
          toRow = 2;
        } else {
          toRow = fromGrid.row - 1;
        }
        break;
      case "down":
        if (fromGrid.row === 2) {
          dy = 1;
          toRow = 0;
        } else {
          toRow = fromGrid.row + 1;
        }
        break;
    }

    const stageChanged = dx !== 0 || dy !== 0;
    const toStage = stageChanged ? { sx: fromStage.sx + dx, sy: fromStage.sy + dy } : fromStage;
    const toArea = GRID_AREA[toRow][toCol];

    if (!stageChanged) {
      const segment = segmentForMove(fromArea, toArea);
      if (segment) {
        this.segmentsMask |= segmentToBit(segment);
      }
    }

    const nextStageId = stageChanged
      ? this.ensureStage(toStage, segmentsMaskToStageId(this.segmentsMask)).id
      : this.currentStage.id;

    return {
      direction,
      fromStage,
      toStage,
      fromArea,
      toArea,
      stageChanged,
      nextStageId,
    };
  }

  private shiftPlayerForEntry(direction: Direction): void {
    if (direction === "left") {
      this.player.x += AREA_SIZE;
    } else if (direction === "right") {
      this.player.x -= AREA_SIZE;
    } else if (direction === "up") {
      this.player.y += AREA_SIZE;
    } else if (direction === "down") {
      this.player.y -= AREA_SIZE;
    }
  }

  private ensureStage(coord: StageCoord, id: StageId): Stage {
    const existing = this.getStage(coord);
    if (existing) {
      return existing;
    }
    return this.createStage(coord, id);
  }

  private createStage(coord: StageCoord, id: StageId): Stage {
    const seed = createStageSeed(coord, id);
    const stage = new Stage(id, seed);
    this.stages.set(stageKey(coord), stage);
    return stage;
  }

  private getStage(coord: StageCoord): Stage | undefined {
    return this.stages.get(stageKey(coord));
  }
}

function stageKey(coord: StageCoord): string {
  return `${coord.sx},${coord.sy}`;
}

function createStageSeed(coord: StageCoord, id: StageId): number {
  const sx = coord.sx + 1000;
  const sy = coord.sy + 1000;
  let seed = Math.imul(sx, 374761393) ^ Math.imul(sy, 668265263);
  seed ^= id.charCodeAt(0);
  return seed >>> 0;
}

function segmentForMove(from: AreaId, to: AreaId): Segment | null {
  const fromGrid = AREA_GRID[from];
  const toGrid = AREA_GRID[to];

  const colDelta = Math.abs(fromGrid.col - toGrid.col);
  const rowDelta = Math.abs(fromGrid.row - toGrid.row);

  if (colDelta === 1 && rowDelta === 0) {
    if (fromGrid.row === 0) {
      return "a";
    }
    if (fromGrid.row === 1) {
      return "g";
    }
    return "d";
  }

  if (colDelta === 0 && rowDelta === 1) {
    if (fromGrid.col === 0) {
      return fromGrid.row === 0 || toGrid.row === 0 ? "f" : "e";
    }
    return fromGrid.row === 0 || toGrid.row === 0 ? "b" : "c";
  }

  return null;
}
