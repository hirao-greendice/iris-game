import type { AreaId, Rect, StageId } from "./types";

export const AREA_IDS: AreaId[] = ["A", "B", "C", "D", "E", "F"];
export const STAGE_IDS: StageId[] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "X"];

export type Palette = {
  floor: number;
  wall: number;
  ceiling: number;
};

export type DoorSide = "top" | "bottom" | "left" | "right";
export type DoorAlign = "start" | "center" | "end";

export type DoorSpec = {
  align?: DoorAlign;
  // Fraction of AREA_SIZE (0..1). Defaults to DOOR_FRACTION.
  size?: number;
  // Optional start offset as a fraction of AREA_SIZE (0..1).
  offset?: number;
};

export type DoorConfig = Partial<Record<DoorSide, DoorSpec[]>>;

export type AreaLayout = {
  blocks: Rect[];
  palette?: Partial<Palette>;
  // Doors control openings on stage edges; interior edges keep default openings.
  doors?: DoorConfig;
};

// Edit STAGE_PALETTES to define stage default colors.
export const STAGE_PALETTES: Record<StageId, Palette> = {
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

// Edit AREA_LAYOUTS to define blocks/palette/doors per stage/area.
export const AREA_LAYOUTS: Record<StageId, Record<AreaId, AreaLayout>> = {
  "0": {
    A: { blocks: [], doors: { top: [{ align: "start" }] } },
    B: { blocks: [], doors: {} },
    C: { blocks: [], doors: {} },
    D: { blocks: [], doors: {} },
    E: { blocks: [], doors: { bottom: [{ align: "start" }] } },
    F: { blocks: [], doors: {} },
  },
  "1": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  "2": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  "3": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  "4": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  "5": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  "6": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  "7": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  "8": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  "9": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
  X: {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
  },
};
