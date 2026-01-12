import type { AreaId, Rect, StageId } from "./types";

export const AREA_IDS: AreaId[] = ["A", "B", "C", "D", "E", "F"];
export const STAGE_IDS: StageId[] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "X"];

export type AreaLayout = {
  blocks: Rect[];
};

// Edit AREA_LAYOUTS to define blocks per stage/area.
export const AREA_LAYOUTS: Record<StageId, Record<AreaId, AreaLayout>> = {
  "0": {
    A: { blocks: [] },
    B: { blocks: [] },
    C: { blocks: [] },
    D: { blocks: [] },
    E: { blocks: [] },
    F: { blocks: [] },
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
