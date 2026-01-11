export type StageId = "X" | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export const STAGES: Record<StageId, { floorY: number }> = {
  X: { floorY: 480 },
  "0": { floorY: 480 },
  "1": { floorY: 440 },
  "2": { floorY: 400 },
  "3": { floorY: 360 },
  "4": { floorY: 320 },
  "5": { floorY: 480 },
  "6": { floorY: 440 },
  "7": { floorY: 400 },
  "8": { floorY: 360 },
  "9": { floorY: 320 },
};
