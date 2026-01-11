import {
  AREA_SIZE,
  DOOR_FRACTION,
  WALL_THICKNESS,
  WALKER_SIZE,
} from "../config";
import type { AreaId, Rect, WalkerState } from "./types";

export const AREA_WALLS: Rect[] = buildBoundaryWalls();

export class Area {
  readonly id: AreaId;
  readonly walkers: WalkerState[];

  constructor(id: AreaId, walkers: WalkerState[]) {
    this.id = id;
    this.walkers = walkers;
  }

  update(dt: number): void {
    const half = WALKER_SIZE / 2;
    for (const walker of this.walkers) {
      walker.x += walker.vx * dt;
      walker.y += walker.vy * dt;

      if (walker.x < half) {
        walker.x = half;
        walker.vx = Math.abs(walker.vx);
      } else if (walker.x > AREA_SIZE - half) {
        walker.x = AREA_SIZE - half;
        walker.vx = -Math.abs(walker.vx);
      }

      if (walker.y < half) {
        walker.y = half;
        walker.vy = Math.abs(walker.vy);
      } else if (walker.y > AREA_SIZE - half) {
        walker.y = AREA_SIZE - half;
        walker.vy = -Math.abs(walker.vy);
      }
    }
  }
}

function buildBoundaryWalls(): Rect[] {
  const thickness = WALL_THICKNESS;
  const gap = AREA_SIZE * DOOR_FRACTION;
  const gapStart = (AREA_SIZE - gap) / 2;
  const gapEnd = gapStart + gap;

  return [
    { x: 0, y: 0, w: gapStart, h: thickness },
    { x: gapEnd, y: 0, w: AREA_SIZE - gapEnd, h: thickness },
    { x: 0, y: AREA_SIZE - thickness, w: gapStart, h: thickness },
    { x: gapEnd, y: AREA_SIZE - thickness, w: AREA_SIZE - gapEnd, h: thickness },
    { x: 0, y: 0, w: thickness, h: gapStart },
    { x: 0, y: gapEnd, w: thickness, h: AREA_SIZE - gapEnd },
    { x: AREA_SIZE - thickness, y: 0, w: thickness, h: gapStart },
    { x: AREA_SIZE - thickness, y: gapEnd, w: thickness, h: AREA_SIZE - gapEnd },
  ];
}
