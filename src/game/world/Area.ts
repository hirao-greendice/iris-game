import {
  AREA_SIZE,
  DOOR_FRACTION,
  WALL_THICKNESS,
  WALKER_SIZE,
} from "../config";
import type { DoorConfig, DoorSide, DoorSpec } from "./AreaLayouts";
import type { AreaId, Rect, WalkerState } from "./types";

const AREA_GRID: Record<AreaId, { col: number; row: number }> = {
  A: { col: 0, row: 0 },
  B: { col: 1, row: 0 },
  C: { col: 0, row: 1 },
  D: { col: 1, row: 1 },
  E: { col: 0, row: 2 },
  F: { col: 1, row: 2 },
};


const STAGE_COLS = 2;
const STAGE_ROWS = 3;

export class Area {
  readonly id: AreaId;
  readonly walkers: WalkerState[];
  readonly blocks: Rect[];
  readonly boundaryWalls: Rect[];
  readonly walls: Rect[];

  constructor(id: AreaId, walkers: WalkerState[], blocks: Rect[] = [], doors?: DoorConfig) {
    this.id = id;
    this.walkers = walkers;
    this.blocks = blocks;
    this.boundaryWalls = buildBoundaryWalls(id, doors);
    this.walls = [...this.boundaryWalls, ...blocks];
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

type Range = { start: number; end: number };

function buildBoundaryWalls(areaId: AreaId, doors?: DoorConfig): Rect[] {
  const thickness = WALL_THICKNESS;
  const areaPos = AREA_GRID[areaId];
  const topEdge = areaPos.row === 0;
  const bottomEdge = areaPos.row === STAGE_ROWS - 1;
  const leftEdge = areaPos.col === 0;
  const rightEdge = areaPos.col === STAGE_COLS - 1;

  const useCustomDoors = doors !== undefined;
  const defaultDoor: DoorSpec = { align: "center" };

  const resolveDoors = (side: DoorSide, isEdge: boolean): DoorSpec[] => {
    if (!useCustomDoors) {
      return [defaultDoor];
    }
    if (!isEdge) {
      return [defaultDoor];
    }
    return doors?.[side] ?? [];
  };

  return [
    ...buildSideWalls("top", resolveDoors("top", topEdge), thickness),
    ...buildSideWalls("bottom", resolveDoors("bottom", bottomEdge), thickness),
    ...buildSideWalls("left", resolveDoors("left", leftEdge), thickness),
    ...buildSideWalls("right", resolveDoors("right", rightEdge), thickness),
  ];
}

function buildSideWalls(side: DoorSide, doors: DoorSpec[], thickness: number): Rect[] {
  const ranges = mergeRanges(
    doors
      .map((door) => doorRange(door))
      .filter((range) => range.end > range.start)
  );
  const segments: Rect[] = [];
  let cursor = 0;

  for (const range of ranges) {
    if (range.start > cursor) {
      segments.push(createWallSegment(side, cursor, range.start - cursor, thickness));
    }
    cursor = Math.max(cursor, range.end);
  }

  if (cursor < AREA_SIZE) {
    segments.push(createWallSegment(side, cursor, AREA_SIZE - cursor, thickness));
  }

  return segments;
}

function createWallSegment(side: DoorSide, start: number, length: number, thickness: number): Rect {
  switch (side) {
    case "top":
      return { x: start, y: 0, w: length, h: thickness };
    case "bottom":
      return { x: start, y: AREA_SIZE - thickness, w: length, h: thickness };
    case "left":
      return { x: 0, y: start, w: thickness, h: length };
    case "right":
      return { x: AREA_SIZE - thickness, y: start, w: thickness, h: length };
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}

function doorRange(spec: DoorSpec): Range {
  const length = AREA_SIZE;
  const rawSize = spec.size ?? DOOR_FRACTION;
  const size = clamp(rawSize <= 1 ? rawSize * length : rawSize, 0, length);
  if (size <= 0) {
    return { start: 0, end: 0 };
  }

  let start: number;
  if (spec.offset !== undefined) {
    start = clamp(spec.offset, 0, 1) * length;
  } else {
    const align = spec.align ?? "center";
    if (align === "start") {
      start = 0;
    } else if (align === "end") {
      start = length - size;
    } else {
      start = (length - size) / 2;
    }
  }

  start = clamp(start, 0, length - size);
  return { start, end: start + size };
}

function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) {
    return [];
  }
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Range[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }

  return merged;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
