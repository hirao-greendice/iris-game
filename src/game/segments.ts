import type { StageId } from "./world/types";

export type Segment = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const SEGMENTS: Segment[] = ["a", "b", "c", "d", "e", "f", "g"];

const DIGIT_SEGMENTS: Record<number, Segment[]> = {
  0: ["a", "b", "c", "d", "e", "f"],
  1: ["b", "c"],
  2: ["a", "b", "g", "e", "d"],
  3: ["a", "b", "g", "c", "d"],
  4: ["f", "g", "b", "c"],
  5: ["a", "f", "g", "c", "d"],
  6: ["a", "f", "g", "e", "c", "d"],
  7: ["a", "b", "c"],
  8: ["a", "b", "c", "d", "e", "f", "g"],
  9: ["a", "b", "c", "d", "f", "g"],
};

const DIGIT_MASKS: Record<number, number> = Object.fromEntries(
  Object.entries(DIGIT_SEGMENTS).map(([digit, segments]) => [
    digit,
    segments.reduce((mask, segment) => mask | segmentToBit(segment), 0),
  ])
);

const MASK_TO_DIGIT = new Map<number, number>(
  Object.entries(DIGIT_MASKS).map(([digit, mask]) => [mask, Number(digit)])
);

export function segmentToBit(segment: Segment): number {
  return 1 << SEGMENTS.indexOf(segment);
}

export function segmentsToDigit(mask: number): number | null {
  return MASK_TO_DIGIT.has(mask) ? (MASK_TO_DIGIT.get(mask) as number) : null;
}

export function maskToSegments(mask: number): Segment[] {
  return SEGMENTS.filter((segment) => (mask & segmentToBit(segment)) !== 0);
}

export function segmentsMaskToStageId(mask: number): StageId {
  const digit = segmentsToDigit(mask);
  return digit === null ? "X" : (String(digit) as StageId);
}
