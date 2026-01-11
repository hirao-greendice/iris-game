export type StageId = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "X";

export type AreaId = "A" | "B" | "C" | "D" | "E" | "F";

export type Direction = "left" | "right" | "up" | "down";

export interface StageCoord {
  sx: number;
  sy: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  jumpPressed: boolean;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
}

export interface WalkerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface TransitionPlan {
  direction: Direction;
  fromStage: StageCoord;
  toStage: StageCoord;
  fromArea: AreaId;
  toArea: AreaId;
  stageChanged: boolean;
  nextStageId: StageId;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
