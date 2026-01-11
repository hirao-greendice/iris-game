import { AREA_SIZE, WALKER_SPEED } from "../config";
import { Area } from "./Area";
import { createRng } from "./random";
import type { AreaId, StageId, WalkerState } from "./types";

const AREA_IDS: AreaId[] = ["A", "B", "C", "D", "E", "F"];

export class Stage {
  readonly id: StageId;
  private readonly areas: Record<AreaId, Area>;

  constructor(id: StageId, seed: number) {
    this.id = id;
    const rng = createRng(seed);
    this.areas = Object.fromEntries(
      AREA_IDS.map((areaId) => [areaId, new Area(areaId, createWalkers(rng))])
    ) as Record<AreaId, Area>;
  }

  getArea(id: AreaId): Area {
    return this.areas[id];
  }

  getAreas(): Area[] {
    return AREA_IDS.map((id) => this.areas[id]);
  }
}

function createWalkers(rng: () => number): WalkerState[] {
  const walkers: WalkerState[] = [];
  const count = 1;
  for (let i = 0; i < count; i += 1) {
    const x = 1 + rng() * (AREA_SIZE - 2);
    const y = 1 + rng() * (AREA_SIZE - 2);
    const angle = rng() * Math.PI * 2;
    const speed = WALKER_SPEED * (0.7 + rng() * 0.6);
    walkers.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
    });
  }
  return walkers;
}
