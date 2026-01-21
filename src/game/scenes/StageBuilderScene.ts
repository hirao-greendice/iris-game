import Phaser from "phaser";
import {
  GRAVITY,
  JUMP_SPEED,
  MAX_VERTICAL_SPEED,
  MOVE_SPEED,
  PLAYER_HALF,
  PLAYER_SIZE,
} from "../config";
import { STAGE_IDS } from "../world/AreaLayouts";
import type { AreaId, Rect, StageId } from "../world/types";

type BuilderTool = "wall" | "platform" | "box" | "switch";
type Rotation = 0 | 90 | 180 | 270;
type ViewMode = "stage" | "area";

type BuilderElement = {
  id: number;
  type: BuilderTool;
  x: number;
  y: number;
  rotation: Rotation;
};

type StageData = {
  id: StageId;
  elements: BuilderElement[];
};

type PanelRect = { x: number; y: number; w: number; h: number };
type StageButton = { id: StageId; rect: PanelRect };
type ToolButton = { id: BuilderTool; rect: PanelRect };

type Layout = {
  width: number;
  height: number;
  leftPanel: PanelRect;
  rightPanel: PanelRect;
  grid: {
    x: number;
    y: number;
    w: number;
    h: number;
    scale: number;
  };
  stageButtons: StageButton[];
  toolButtons: ToolButton[];
  map: {
    x: number;
    y: number;
    size: number;
    cellSize: number;
    cols: number;
    rows: number;
  };
};

type PlayerState = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
};

type BoxState = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
};

const GRID_COLS = 24;
const GRID_ROWS = 36;
const AREA_BLOCK = 12;
const STAGE_COLS = 2;
const STAGE_ROWS = 3;
const GRID_STEP = 1;
const MAP_COLS = 5;
const MAP_ROWS = 5;
const MAP_ASSET_COUNT = 5;

const TOOL_ORDER: BuilderTool[] = ["wall", "platform", "box", "switch"];

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

const TOOL_DEFS: Record<
  BuilderTool,
  { w: number; h: number; color: number; label: string }
> = {
  wall: { w: 1, h: 1, color: 0x6b7280, label: "Wall 1x1" },
  platform: { w: 1, h: 0.3, color: 0x2dd4bf, label: "Platform 1x0.3" },
  box: { w: 0.9, h: 0.9, color: 0xf59e0b, label: "Box 0.9x0.9" },
  switch: { w: 0.7, h: 0.3, color: 0x10b981, label: "Switch 0.7x0.3" },
};

const STORAGE_KEY = "iris-stage-builder-v1";

const UI_COLORS = {
  panel: 0x0f172a,
  panelBorder: 0x1f2937,
  gridBg: 0x111827,
  gridLine: 0x1f2937,
  gridBold: 0x334155,
  selection: 0xf8fafc,
  preview: 0x94a3b8,
  mapLine: 0x475569,
};

export class StageBuilderScene extends Phaser.Scene {
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private uiGraphics!: Phaser.GameObjects.Graphics;
  private infoText!: Phaser.GameObjects.Text;
  private headerStageText!: Phaser.GameObjects.Text;
  private headerToolsText!: Phaser.GameObjects.Text;
  private stageLabelTexts: Phaser.GameObjects.Text[] = [];
  private toolLabelTexts: Phaser.GameObjects.Text[] = [];
  private mapLabelTexts: Phaser.GameObjects.Text[][] = [];

  private stages: Record<StageId, StageData> = {} as Record<StageId, StageData>;
  private currentStageId: StageId = "0";
  private viewMode: ViewMode = "stage";
  private currentAreaId: AreaId = "A";
  private currentTool: BuilderTool = "wall";
  private currentRotation: Rotation = 0;
  private selectedElementId: number | null = null;
  private draggingElementId: number | null = null;
  private dragOffset = { x: 0, y: 0 };
  private paintActive = false;
  private lastPaintKey: string | null = null;
  private deleteActive = false;
  private nextElementId = 1;

  private layout!: Layout;
  private mapAssets: Record<string, StageId>[] = [];
  private mapAssetIndex = 0;
  private mapFocus = { col: 0, row: 0 };
  private testMode = false;
  private testPlayer: PlayerState | null = null;
  private testBoxes: BoxState[] = [];
  private testBoxWorlds: Map<string, BoxState[]>[] = [];
  private currentBoxStageKey: string | null = null;
  private nextTestBoxId = 1;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keyJump!: Phaser.Input.Keyboard.Key;
  private keyAltJump!: Phaser.Input.Keyboard.Key;

  constructor() {
    super("StageBuilderScene");
  }

  create(): void {
    this.gridGraphics = this.add.graphics();
    this.uiGraphics = this.add.graphics();
    this.infoText = this.add
      .text(0, 0, "", {
        fontFamily: "Consolas, monospace",
        fontSize: "13px",
        color: "#e2e8f0",
      })
      .setDepth(10);

    this.input.mouse?.disableContextMenu();

    this.initializeStages();
    this.initializeMap();
    this.loadFromStorage();

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.handlePointerDown(pointer);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.handlePointerMove(pointer);
    });
    this.input.on("pointerup", () => {
      this.handlePointerUp();
    });

    this.cursors = this.input.keyboard?.createCursorKeys() as Phaser.Types.Input.Keyboard.CursorKeys;
    this.keyLeft = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A) as Phaser.Input.Keyboard.Key;
    this.keyRight = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D) as Phaser.Input.Keyboard.Key;
    this.keyJump = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W) as Phaser.Input.Keyboard.Key;
    this.keyAltJump = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) as Phaser.Input.Keyboard.Key;

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.repeat) {
        return;
      }
      this.handleKeyDown(event);
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, (gameSize: Phaser.Structs.Size) => {
      this.handleResize(gameSize.width, gameSize.height);
    });
    this.handleResize(this.scale.width, this.scale.height);
    this.createUIText();
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    if (this.testMode) {
      this.updateTest(dt);
    }
    this.draw();
  }

  private initializeStages(): void {
    const stages = {} as Record<StageId, StageData>;
    for (const id of STAGE_IDS) {
      stages[id] = { id, elements: [] };
    }
    this.stages = stages;
  }

  private initializeMap(): void {
    this.mapAssets = Array.from({ length: MAP_ASSET_COUNT }, () => ({}));
    this.mapAssetIndex = 0;
    this.mapFocus = { col: 0, row: 0 };
    this.setMapStageAt(0, 0, "0");
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw) as {
        stages?: Record<string, BuilderElement[]>;
        map?: (StageId | null)[][];
        mapSets?: Record<string, StageId>[];
        activeMap?: number;
        mapFocus?: { col: number; row: number };
      };

      if (data?.stages && typeof data.stages === "object") {
        for (const id of STAGE_IDS) {
          const elements = Array.isArray(data.stages[id]) ? data.stages[id] : [];
          this.stages[id].elements = elements.filter((element) => isValidElement(element));
        }
      }

      if (Array.isArray(data?.mapSets)) {
        this.mapAssets = Array.from({ length: MAP_ASSET_COUNT }, (_, index) =>
          sanitizeMapSet(data.mapSets?.[index])
        );
        if (typeof data.activeMap === "number") {
          this.mapAssetIndex = clamp(Math.floor(data.activeMap), 0, MAP_ASSET_COUNT - 1);
        }
        if (data.mapFocus && typeof data.mapFocus.col === "number" && typeof data.mapFocus.row === "number") {
          this.mapFocus = { col: Math.floor(data.mapFocus.col), row: Math.floor(data.mapFocus.row) };
        }
      } else if (Array.isArray(data?.map)) {
        this.mapAssets = Array.from({ length: MAP_ASSET_COUNT }, () => ({}));
        for (let r = 0; r < MAP_ROWS; r += 1) {
          const row = data.map[r];
          if (!Array.isArray(row)) {
            continue;
          }
          for (let c = 0; c < MAP_COLS; c += 1) {
            const value = row[c];
            if (isStageId(value) && value !== "X") {
              this.mapAssets[0][mapKey(c, r)] = value;
            }
          }
        }
        const center = this.getMapCenterOffset();
        this.mapFocus = { col: center.col, row: center.row };
      }

      this.rebuildNextElementId();
    } catch {
      // Ignore malformed storage data.
    }
  }

  private saveToStorage(): void {
    try {
      const payload = {
        stages: Object.fromEntries(
          STAGE_IDS.map((id) => [id, this.stages[id].elements])
        ),
        mapSets: this.mapAssets,
        activeMap: this.mapAssetIndex,
        mapFocus: this.mapFocus,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage write failures.
    }
  }

  private rebuildNextElementId(): void {
    let maxId = 0;
    for (const id of STAGE_IDS) {
      for (const element of this.stages[id].elements) {
        maxId = Math.max(maxId, element.id);
      }
    }
    this.nextElementId = maxId + 1;
  }

  private handleResize(width: number, height: number): void {
    const margin = 16;
    const panelWidth = Math.min(220, Math.max(140, Math.floor(width * 0.18)));

    const leftPanel: PanelRect = {
      x: margin,
      y: margin,
      w: panelWidth,
      h: height - margin * 2,
    };
    const rightPanel: PanelRect = {
      x: width - panelWidth - margin,
      y: margin,
      w: panelWidth,
      h: height - margin * 2,
    };

    const gridArea: PanelRect = {
      x: leftPanel.x + leftPanel.w + margin,
      y: margin,
      w: width - leftPanel.w - rightPanel.w - margin * 3,
      h: height - margin * 2,
    };

    const viewDims = this.getViewDimensions();
    const scale = Math.min(gridArea.w / viewDims.cols, gridArea.h / viewDims.rows);
    const gridWidth = viewDims.cols * scale;
    const gridHeight = viewDims.rows * scale;
    const gridX = gridArea.x + (gridArea.w - gridWidth) / 2;
    const gridY = gridArea.y + (gridArea.h - gridHeight) / 2;

    const stageButtons = this.layoutStageButtons(leftPanel);
    const toolButtons = this.layoutToolButtons(rightPanel);
    const mapLayout = this.layoutMapPanel(rightPanel, toolButtons);

    this.layout = {
      width,
      height,
      leftPanel,
      rightPanel,
      grid: {
        x: gridX,
        y: gridY,
        w: gridWidth,
        h: gridHeight,
        scale,
      },
      stageButtons,
      toolButtons,
      map: mapLayout,
    };

    this.infoText.setPosition(rightPanel.x + 12, mapLayout.y + mapLayout.size + 16);
    this.updateUITextLayout();
  }

  private createUIText(): void {
    if (this.headerStageText) {
      return;
    }
    const headerStyle = { fontFamily: "Consolas, monospace", fontSize: "12px", color: "#e2e8f0" };
    const labelStyle = { fontFamily: "Consolas, monospace", fontSize: "12px", color: "#cbd5f5" };

    this.headerStageText = this.add.text(0, 0, "Stages", headerStyle).setDepth(10);
    this.headerToolsText = this.add.text(0, 0, "Tools & Map", headerStyle).setDepth(10);

    this.stageLabelTexts = this.layout.stageButtons.map(() =>
      this.add.text(0, 0, "", labelStyle).setDepth(10)
    );
    this.toolLabelTexts = this.layout.toolButtons.map(() =>
      this.add.text(0, 0, "", labelStyle).setDepth(10)
    );

    this.mapLabelTexts = Array.from({ length: MAP_ROWS }, () =>
      Array.from({ length: MAP_COLS }, () =>
        this.add
          .text(0, 0, "", { fontFamily: "Consolas, monospace", fontSize: "12px", color: "#e2e8f0" })
          .setOrigin(0.5, 0.5)
          .setDepth(10)
      )
    );

    this.updateUITextLayout();
  }

  private updateUITextLayout(): void {
    if (!this.headerStageText || !this.headerToolsText) {
      return;
    }
    const { leftPanel, rightPanel, stageButtons, toolButtons, map } = this.layout;
    this.headerStageText.setPosition(leftPanel.x + 16, leftPanel.y + 12);
    this.headerToolsText.setPosition(rightPanel.x + 16, rightPanel.y + 12);

    stageButtons.forEach((button, index) => {
      const text = this.stageLabelTexts[index];
      text.setPosition(button.rect.x + 8, button.rect.y + 6);
    });

    toolButtons.forEach((button, index) => {
      const text = this.toolLabelTexts[index];
      text.setPosition(button.rect.x + 8, button.rect.y + 6);
    });

    for (let r = 0; r < map.rows; r += 1) {
      for (let c = 0; c < map.cols; c += 1) {
        const text = this.mapLabelTexts[r][c];
        text.setPosition(map.x + c * map.cellSize + map.cellSize * 0.5, map.y + r * map.cellSize + map.cellSize * 0.5);
      }
    }
  }

  private updateUITextContent(): void {
    const { stageButtons, toolButtons } = this.layout;
    stageButtons.forEach((button, index) => {
      const text = this.stageLabelTexts[index];
      const label = button.id === "X" ? "VOID" : `Stage ${button.id}`;
      text.setText(label);
      text.setColor(button.id === this.currentStageId ? "#f8fafc" : "#cbd5f5");
    });

    toolButtons.forEach((button, index) => {
      const text = this.toolLabelTexts[index];
      text.setText(TOOL_DEFS[button.id].label);
      text.setColor(button.id === this.currentTool ? "#f8fafc" : "#cbd5f5");
    });

    const center = this.getMapCenterOffset();
    const originCol = this.mapFocus.col - center.col;
    const originRow = this.mapFocus.row - center.row;
    for (let r = 0; r < this.mapLabelTexts.length; r += 1) {
      for (let c = 0; c < this.mapLabelTexts[r].length; c += 1) {
        const text = this.mapLabelTexts[r][c];
        const worldCol = originCol + c;
        const worldRow = originRow + r;
        const id = this.getMapStageAt(worldCol, worldRow);
        if (!id) {
          text.setText("");
          continue;
        }
        text.setText(id === "X" ? "VOID" : id);
      }
    }
  }

  private layoutStageButtons(panel: PanelRect): StageButton[] {
    const headerHeight = 32;
    const gap = 6;
    const available = panel.h - headerHeight - 24;
    const buttonHeight = Math.max(18, Math.min(28, Math.floor((available - gap * (STAGE_IDS.length - 1)) / STAGE_IDS.length)));
    const buttons: StageButton[] = [];
    let y = panel.y + headerHeight;
    const x = panel.x + 12;
    const w = panel.w - 24;
    for (const id of STAGE_IDS) {
      buttons.push({ id, rect: { x, y, w, h: buttonHeight } });
      y += buttonHeight + gap;
    }
    return buttons;
  }

  private layoutToolButtons(panel: PanelRect): ToolButton[] {
    const headerHeight = 32;
    const gap = 8;
    const buttonHeight = 28;
    const buttons: ToolButton[] = [];
    let y = panel.y + headerHeight;
    const x = panel.x + 12;
    const w = panel.w - 24;
    for (const id of TOOL_ORDER) {
      buttons.push({ id, rect: { x, y, w, h: buttonHeight } });
      y += buttonHeight + gap;
    }
    return buttons;
  }

  private layoutMapPanel(panel: PanelRect, toolButtons: ToolButton[]): Layout["map"] {
    const lastTool = toolButtons[toolButtons.length - 1];
    const top = lastTool.rect.y + lastTool.rect.h + 26;
    const available = Math.max(80, panel.h - (top - panel.y) - 80);
    const size = Math.min(panel.w - 24, available);
    const cellSize = Math.max(6, Math.floor(size / MAP_COLS));
    const finalSize = cellSize * MAP_COLS;
    const x = panel.x + (panel.w - finalSize) / 2;
    const y = top;
    return {
      x,
      y,
      size: finalSize,
      cellSize,
      cols: MAP_COLS,
      rows: MAP_ROWS,
    };
  }

  private getMapCenterOffset(): { col: number; row: number } {
    return { col: Math.floor(MAP_COLS / 2), row: Math.floor(MAP_ROWS / 2) };
  }

  private getCurrentMap(): Record<string, StageId> {
    return this.mapAssets[this.mapAssetIndex];
  }

  private getMapStageAt(col: number, row: number): StageId | null {
    const key = mapKey(col, row);
    const stageId = this.getCurrentMap()[key];
    if (!stageId || stageId === "X") {
      return null;
    }
    return stageId;
  }

  private setMapStageAt(col: number, row: number, stageId: StageId | null): void {
    const key = mapKey(col, row);
    const map = this.getCurrentMap();
    if (stageId) {
      map[key] = stageId;
    } else {
      delete map[key];
    }
  }

  private getMapPointerTarget(pointer: Phaser.Input.Pointer): { col: number; row: number } | null {
    const map = this.layout.map;
    if (!pointInRect(pointer.x, pointer.y, { x: map.x, y: map.y, w: map.size, h: map.size })) {
      return null;
    }
    const viewCol = Math.floor((pointer.x - map.x) / map.cellSize);
    const viewRow = Math.floor((pointer.y - map.y) / map.cellSize);
    if (viewCol < 0 || viewCol >= map.cols || viewRow < 0 || viewRow >= map.rows) {
      return null;
    }
    const center = this.getMapCenterOffset();
    return {
      col: this.mapFocus.col + (viewCol - center.col),
      row: this.mapFocus.row + (viewRow - center.row),
    };
  }

  private getStageIdAt(col: number, row: number): StageId {
    return this.getMapStageAt(col, row) ?? "X";
  }

  private ensureTestBoxWorlds(): void {
    if (this.testBoxWorlds.length === MAP_ASSET_COUNT) {
      return;
    }
    this.testBoxWorlds = Array.from({ length: MAP_ASSET_COUNT }, () => new Map());
  }

  private getTestBoxWorld(): Map<string, BoxState[]> {
    this.ensureTestBoxWorlds();
    return this.testBoxWorlds[this.mapAssetIndex];
  }

  private syncTestBoxesToFocus(force = false): void {
    if (!this.testMode) {
      return;
    }
    const key = mapKey(this.mapFocus.col, this.mapFocus.row);
    if (!force && this.currentBoxStageKey === key) {
      return;
    }
    const boxes = this.getOrCreateBoxesForStage(this.mapFocus.col, this.mapFocus.row);
    this.testBoxes = boxes;
    this.currentBoxStageKey = key;
  }

  private createBoxesForStage(stageId: StageId): BoxState[] {
    const stage = this.stages[stageId];
    return stage.elements
      .filter((element) => element.type === "box")
      .map((element) => {
        const size = this.getElementSize(element.type, element.rotation);
        return {
          id: this.nextTestBoxId++,
          x: element.x,
          y: element.y,
          w: size.w,
          h: size.h,
          vx: 0,
          vy: 0,
        };
      });
  }

  private getOrCreateBoxesForStage(col: number, row: number): BoxState[] {
    const world = this.getTestBoxWorld();
    const key = mapKey(col, row);
    let boxes = world.get(key);
    if (!boxes) {
      const stageId = this.getStageIdAt(col, row);
      boxes = this.createBoxesForStage(stageId);
      world.set(key, boxes);
    }
    return boxes;
  }

  private getViewDimensions(): { cols: number; rows: number } {
    if (this.viewMode === "area") {
      return { cols: AREA_BLOCK, rows: AREA_BLOCK };
    }
    return { cols: GRID_COLS, rows: GRID_ROWS };
  }

  private getViewOrigin(): { x: number; y: number } {
    if (this.viewMode === "area") {
      const areaPos = AREA_GRID[this.currentAreaId];
      return { x: areaPos.col * AREA_BLOCK, y: areaPos.row * AREA_BLOCK };
    }
    return { x: 0, y: 0 };
  }

  private getViewBounds(): { x: number; y: number; w: number; h: number } {
    const origin = this.getViewOrigin();
    const dims = this.getViewDimensions();
    return { x: origin.x, y: origin.y, w: dims.cols, h: dims.rows };
  }

  private findStageInMap(id: StageId): { col: number; row: number } | null {
    const map = this.getCurrentMap();
    for (const [key, value] of Object.entries(map)) {
      if (value !== id) {
        continue;
      }
      const parts = key.split(",");
      if (parts.length !== 2) {
        continue;
      }
      const col = Number(parts[0]);
      const row = Number(parts[1]);
      if (Number.isFinite(col) && Number.isFinite(row)) {
        return { col, row };
      }
    }
    return null;
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.testMode) {
      return;
    }

    if (this.handleStageButtonClick(pointer)) {
      return;
    }
    if (this.handleToolButtonClick(pointer)) {
      return;
    }
    if (this.handleMapClick(pointer)) {
      return;
    }

    const world = this.screenToWorld(pointer.x, pointer.y);
    if (!world) {
      return;
    }

    const stage = this.getCurrentStage();
    const hit = this.findElementAt(stage, world.x, world.y);
    const shiftDown = Boolean(pointer.event?.shiftKey);

    if (hit) {
      this.selectElement(hit.id);
      if (pointer.leftButtonDown() && shiftDown) {
        this.deleteActive = true;
        this.removeElement(stage, hit.id);
        return;
      }
      if (pointer.leftButtonDown()) {
        this.draggingElementId = hit.id;
        this.dragOffset = { x: world.x - hit.x, y: world.y - hit.y };
        this.bringElementToFront(stage, hit.id);
      }
      if (pointer.rightButtonDown()) {
        this.removeElement(stage, hit.id);
      }
      return;
    }

    if (pointer.leftButtonDown() && !shiftDown) {
      this.paintActive = true;
      this.lastPaintKey = null;
      const placed = this.paintAt(world.x, world.y);
      if (placed) {
        this.selectElement(placed.id);
      }
    } else if (pointer.leftButtonDown() && shiftDown) {
      this.deleteActive = true;
      this.eraseAt(world.x, world.y);
    }
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.testMode) {
      return;
    }
    if (this.deleteActive) {
      if (!pointer.leftButtonDown() || !pointer.event?.shiftKey) {
        return;
      }
      const world = this.screenToWorld(pointer.x, pointer.y);
      if (!world) {
        return;
      }
      this.eraseAt(world.x, world.y);
      return;
    }
    if (!this.draggingElementId) {
      if (this.paintActive && pointer.leftButtonDown()) {
        const world = this.screenToWorld(pointer.x, pointer.y);
        if (!world) {
          return;
        }
        this.paintAt(world.x, world.y);
      }
      return;
    }

    const stage = this.getCurrentStage();
    const element = stage.elements.find((item) => item.id === this.draggingElementId);
    if (!element) {
      return;
    }

    const world = this.screenToWorld(pointer.x, pointer.y);
    if (!world) {
      return;
    }

    const nextX = world.x - this.dragOffset.x;
    const nextY = world.y - this.dragOffset.y;
    const clamped = this.clampElementPosition(nextX, nextY, element.type, element.rotation);
    element.x = clamped.x;
    element.y = clamped.y;
  }

  private handlePointerUp(): void {
    if (this.draggingElementId) {
      this.saveToStorage();
    }
    this.paintActive = false;
    this.lastPaintKey = null;
    this.deleteActive = false;
    this.draggingElementId = null;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (key === "escape") {
      this.scene.start("AreaScene");
      return;
    }
    if (key === "t") {
      this.toggleTestMode();
      return;
    }
    if (key === "m") {
      this.toggleViewMode();
      return;
    }

    if (this.testMode) {
      return;
    }

    if (event.ctrlKey && !event.altKey && !event.metaKey && key >= "1" && key <= "5") {
      this.setMapAsset(Number(key) - 1);
      return;
    }

    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
      if (this.tryMapKeyPlacement(key)) {
        return;
      }
    }

    if (event.altKey && key >= "0" && key <= "9") {
      this.setCurrentStage(key as StageId);
      return;
    }
    if (event.altKey && key === "x") {
      this.setCurrentStage("X");
      return;
    }
    if (key === "q") {
      this.rotateSelection(-90);
      return;
    }
    if (key === "e") {
      this.rotateSelection(90);
      return;
    }
    if (key === "delete" || key === "backspace") {
      this.deleteSelection();
      return;
    }
    if (key === "1") {
      this.currentTool = "wall";
      return;
    }
    if (key === "2") {
      this.currentTool = "platform";
      return;
    }
    if (key === "3") {
      this.currentTool = "box";
      return;
    }
    if (key === "4") {
      this.currentTool = "switch";
      return;
    }

    if (["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      if (event.ctrlKey) {
        this.nudgeSelection(GRID_STEP, key);
      } else {
        this.handleViewArrow(key);
      }
    }
  }

  private handleStageButtonClick(pointer: Phaser.Input.Pointer): boolean {
    const hit = this.layout.stageButtons.find((button) =>
      pointInRect(pointer.x, pointer.y, button.rect)
    );
    if (!hit) {
      return false;
    }
    this.setCurrentStage(hit.id);
    return true;
  }

  private handleToolButtonClick(pointer: Phaser.Input.Pointer): boolean {
    const hit = this.layout.toolButtons.find((button) =>
      pointInRect(pointer.x, pointer.y, button.rect)
    );
    if (!hit) {
      return false;
    }
    this.currentTool = hit.id;
    return true;
  }

  private handleMapClick(pointer: Phaser.Input.Pointer): boolean {
    const target = this.getMapPointerTarget(pointer);
    if (!target) {
      return false;
    }

    this.mapFocus = { col: target.col, row: target.row };

    if (pointer.rightButtonDown()) {
      this.setMapStageAt(target.col, target.row, null);
      this.saveToStorage();
      this.setCurrentStage("X", { syncFocus: false });
      return true;
    }

    this.placeStageInMap(this.currentStageId, target.col, target.row);
    this.setCurrentStage(this.currentStageId, { syncFocus: false });
    return true;
  }

  private setCurrentStage(
    id: StageId,
    options?: { syncFocus?: boolean; resetPlayer?: boolean; syncBoxes?: boolean }
  ): void {
    this.currentStageId = id;
    this.selectedElementId = null;
    if (options?.syncFocus !== false) {
      const focus = this.findStageInMap(id);
      if (focus) {
        this.mapFocus = focus;
      }
    }
    if (this.testMode && options?.resetPlayer !== false) {
      this.resetTestPlayer();
    }
    if (this.testMode && options?.syncBoxes !== false) {
      this.syncTestBoxesToFocus(true);
    }
  }

  private toggleTestMode(): void {
    this.testMode = !this.testMode;
    this.selectedElementId = null;
    this.draggingElementId = null;
    if (this.testMode) {
      this.nextTestBoxId = 1;
      const focus = this.findStageInMap(this.currentStageId);
      if (focus) {
        this.mapFocus = focus;
      }
      this.resetTestPlayer();
      this.syncTestBoxesToFocus(true);
    } else {
      this.testBoxes = [];
      this.testBoxWorlds = [];
      this.currentBoxStageKey = null;
      this.nextTestBoxId = 1;
    }
  }

  private toggleViewMode(): void {
    this.viewMode = this.viewMode === "stage" ? "area" : "stage";
    this.handleResize(this.scale.width, this.scale.height);
  }

  private handleViewArrow(key: string): void {
    if (this.viewMode === "stage") {
      const delta = arrowToDelta(key);
      const nextCol = this.mapFocus.col + delta.dx;
      const nextRow = this.mapFocus.row + delta.dy;
      this.mapFocus = { col: nextCol, row: nextRow };
      const nextId = this.getMapStageAt(nextCol, nextRow) ?? "X";
      this.setCurrentStage(nextId, { syncFocus: false });
      return;
    }

    const delta = arrowToDelta(key);
    const current = AREA_GRID[this.currentAreaId];
    const nextCol = clamp(current.col + delta.dx, 0, STAGE_COLS - 1);
    const nextRow = clamp(current.row + delta.dy, 0, STAGE_ROWS - 1);
    this.currentAreaId = GRID_AREA[nextRow][nextCol];
    this.handleResize(this.scale.width, this.scale.height);
  }

  private setMapAsset(index: number): void {
    const nextIndex = clamp(index, 0, MAP_ASSET_COUNT - 1);
    if (nextIndex === this.mapAssetIndex) {
      return;
    }
    this.mapAssetIndex = nextIndex;
    const stageId = this.getMapStageAt(this.mapFocus.col, this.mapFocus.row) ?? "X";
    this.setCurrentStage(stageId, { syncFocus: false });
    if (this.testMode) {
      this.syncTestBoxesToFocus(true);
    }
    this.saveToStorage();
  }

  private tryMapKeyPlacement(key: string): boolean {
    const target = this.getMapPointerTarget(this.input.activePointer);
    if (!target) {
      return false;
    }
    this.mapFocus = { col: target.col, row: target.row };

    if (key === "x") {
      this.setMapStageAt(target.col, target.row, null);
      this.saveToStorage();
      this.setCurrentStage("X", { syncFocus: false });
      return true;
    }

    if (key >= "0" && key <= "9") {
      const stageId = key as StageId;
      this.placeStageInMap(stageId, target.col, target.row);
      this.setCurrentStage(stageId, { syncFocus: false });
      return true;
    }

    return false;
  }

  private resetTestPlayer(): void {
    this.testPlayer = {
      x: GRID_COLS * 0.5,
      y: GRID_ROWS * 0.25,
      vx: 0,
      vy: 0,
      grounded: false,
    };
  }

  private updateTest(dt: number): void {
    if (!this.testPlayer) {
      this.resetTestPlayer();
      return;
    }
    this.syncTestBoxesToFocus();

    const left = Boolean(this.cursors.left?.isDown || this.keyLeft.isDown);
    const right = Boolean(this.cursors.right?.isDown || this.keyRight.isDown);
    const jumpDown = Boolean(this.cursors.up?.isDown || this.keyJump.isDown || this.keyAltJump.isDown);

    const direction = (right ? 1 : 0) - (left ? 1 : 0);
    this.testPlayer.vx = direction * MOVE_SPEED;

    if (jumpDown && this.testPlayer.grounded) {
      this.testPlayer.vy = -JUMP_SPEED;
      this.testPlayer.grounded = false;
    }

    this.testPlayer.vy += GRAVITY * dt;
    this.testPlayer.vy = Math.max(-MAX_VERTICAL_SPEED, Math.min(MAX_VERTICAL_SPEED, this.testPlayer.vy));

    const staticWalls = this.getStaticWalls();
    this.updateBoxesForStage(this.testBoxes, staticWalls, dt);

    this.testPlayer.x += this.testPlayer.vx * dt;
    this.resolvePlayerHorizontal(staticWalls);
    this.testPlayer.y += this.testPlayer.vy * dt;
    this.resolvePlayerVertical(staticWalls);
    this.testBoxes = this.transferOutOfBoundsForStage(this.testBoxes, this.mapFocus.col, this.mapFocus.row);
    this.updateOffscreenBoxes(dt);
    this.handleTestStageExit();
  }

  private resolvePlayerHorizontal(staticWalls: Rect[]): void {
    if (!this.testPlayer) {
      return;
    }
    for (const wall of staticWalls) {
      if (!overlaps(this.testPlayer, wall)) {
        continue;
      }
      if (this.testPlayer.vx > 0) {
        this.testPlayer.x = wall.x - PLAYER_HALF;
      } else if (this.testPlayer.vx < 0) {
        this.testPlayer.x = wall.x + wall.w + PLAYER_HALF;
      }
      this.testPlayer.vx = 0;
    }

    for (const box of this.testBoxes) {
      if (!overlaps(this.testPlayer, box)) {
        continue;
      }
      if (this.testPlayer.vx === 0) {
        const playerCenter = this.testPlayer.x;
        const boxCenter = box.x + box.w * 0.5;
        if (playerCenter < boxCenter) {
          this.testPlayer.x = box.x - PLAYER_HALF;
        } else {
          this.testPlayer.x = box.x + box.w + PLAYER_HALF;
        }
        continue;
      }
      const direction = this.testPlayer.vx > 0 ? 1 : -1;
      const playerRectX = this.testPlayer.x - PLAYER_HALF;
      const overlap =
        direction > 0
          ? playerRectX + PLAYER_SIZE - box.x
          : box.x + box.w - playerRectX;
      if (overlap <= 0) {
        continue;
      }
      const moved = this.moveBoxBy(box, overlap * direction, this.testBoxes, staticWalls);
      if (Math.abs(moved) >= overlap - 1e-6) {
        box.vx = this.testPlayer.vx;
      } else {
        if (direction > 0) {
          this.testPlayer.x = box.x - PLAYER_HALF;
        } else {
          this.testPlayer.x = box.x + box.w + PLAYER_HALF;
        }
        this.testPlayer.vx = 0;
      }
    }
  }

  private resolvePlayerVertical(staticWalls: Rect[]): void {
    if (!this.testPlayer) {
      return;
    }
    this.testPlayer.grounded = false;
    for (const wall of staticWalls) {
      if (!overlaps(this.testPlayer, wall)) {
        continue;
      }
      if (this.testPlayer.vy > 0) {
        this.testPlayer.y = wall.y - PLAYER_HALF;
        this.testPlayer.grounded = true;
      } else if (this.testPlayer.vy < 0) {
        this.testPlayer.y = wall.y + wall.h + PLAYER_HALF;
      }
      this.testPlayer.vy = 0;
    }

    for (const box of this.testBoxes) {
      if (!overlaps(this.testPlayer, box)) {
        continue;
      }
      if (this.testPlayer.vy > 0) {
        this.testPlayer.y = box.y - PLAYER_HALF;
        this.testPlayer.grounded = true;
      } else if (this.testPlayer.vy < 0) {
        this.testPlayer.y = box.y + box.h + PLAYER_HALF;
      }
      this.testPlayer.vy = 0;
    }
  }

  private handleTestStageExit(): void {
    if (!this.testPlayer) {
      return;
    }

    if (this.testPlayer.x < 0) {
      this.testPlayer.x += GRID_COLS;
      this.moveTestStage(-1, 0);
      return;
    }
    if (this.testPlayer.x > GRID_COLS) {
      this.testPlayer.x -= GRID_COLS;
      this.moveTestStage(1, 0);
      return;
    }
    if (this.testPlayer.y < 0) {
      this.testPlayer.y += GRID_ROWS;
      this.moveTestStage(0, -1);
      return;
    }
    if (this.testPlayer.y > GRID_ROWS) {
      this.testPlayer.y -= GRID_ROWS;
      this.moveTestStage(0, 1);
    }
  }

  private moveTestStage(dx: number, dy: number): void {
    const nextCol = this.mapFocus.col + dx;
    const nextRow = this.mapFocus.row + dy;
    this.mapFocus = { col: nextCol, row: nextRow };

    const nextId = this.getMapStageAt(nextCol, nextRow) ?? "X";
    this.setCurrentStage(nextId, { syncFocus: false, resetPlayer: false, syncBoxes: true });
  }

  private updateBoxesForStage(boxes: BoxState[], staticWalls: Rect[], dt: number): void {
    for (const box of boxes) {
      box.vy += GRAVITY * dt;
      box.vy = Math.max(-MAX_VERTICAL_SPEED, Math.min(MAX_VERTICAL_SPEED, box.vy));

      box.x += box.vx * dt;
      this.resolveBoxHorizontal(box, boxes, staticWalls);

      box.y += box.vy * dt;
      this.resolveBoxVertical(box, boxes, staticWalls);

      if (Math.abs(box.vx) < 0.01) {
        box.vx = 0;
      }
    }
  }

  private updateOffscreenBoxes(dt: number): void {
    const world = this.getTestBoxWorld();
    const currentKey = mapKey(this.mapFocus.col, this.mapFocus.row);
    for (const [key, boxes] of Array.from(world.entries())) {
      if (key === currentKey || boxes.length === 0) {
        continue;
      }
      const coords = parseMapKey(key);
      if (!coords) {
        continue;
      }
      const stageId = this.getStageIdAt(coords.col, coords.row);
      const staticWalls = this.getStaticWallsForStage(stageId);
      this.updateBoxesForStage(boxes, staticWalls, dt);
      this.transferOutOfBoundsForStage(boxes, coords.col, coords.row);
    }
  }

  private transferOutOfBoundsForStage(
    boxes: BoxState[],
    stageCol: number,
    stageRow: number
  ): BoxState[] {
    if (boxes.length === 0) {
      return boxes;
    }
    const transfers: { box: BoxState; toCol: number; toRow: number }[] = [];
    for (const box of boxes) {
      let shiftX = 0;
      let shiftY = 0;
      while (box.x < 0) {
        box.x += GRID_COLS;
        shiftX -= 1;
      }
      while (box.x > GRID_COLS) {
        box.x -= GRID_COLS;
        shiftX += 1;
      }
      while (box.y < 0) {
        box.y += GRID_ROWS;
        shiftY -= 1;
      }
      while (box.y > GRID_ROWS) {
        box.y -= GRID_ROWS;
        shiftY += 1;
      }
      if (shiftX !== 0 || shiftY !== 0) {
        transfers.push({
          box,
          toCol: stageCol + shiftX,
          toRow: stageRow + shiftY,
        });
      }
    }

    if (transfers.length === 0) {
      return boxes;
    }

    const removed = new Set(transfers.map((entry) => entry.box));
    const remaining = boxes.filter((box) => !removed.has(box));
    const world = this.getTestBoxWorld();
    world.set(mapKey(stageCol, stageRow), remaining);

    for (const transfer of transfers) {
      const target = this.getOrCreateBoxesForStage(transfer.toCol, transfer.toRow);
      target.push(transfer.box);
    }

    return remaining;
  }

  private resolveBoxHorizontal(box: BoxState, boxes: BoxState[], staticWalls: Rect[]): void {
    const obstacles = this.getBoxObstacles(staticWalls, boxes, box.id);
    for (const obstacle of obstacles) {
      if (!rectIntersects(box, obstacle)) {
        continue;
      }
      if (box.vx > 0) {
        box.x = obstacle.x - box.w;
      } else if (box.vx < 0) {
        box.x = obstacle.x + obstacle.w;
      }
      box.vx = 0;
    }
  }

  private resolveBoxVertical(box: BoxState, boxes: BoxState[], staticWalls: Rect[]): void {
    const obstacles = this.getBoxObstacles(staticWalls, boxes, box.id);
    for (const obstacle of obstacles) {
      if (!rectIntersects(box, obstacle)) {
        continue;
      }
      if (box.vy > 0) {
        box.y = obstacle.y - box.h;
      } else if (box.vy < 0) {
        box.y = obstacle.y + obstacle.h;
      }
      box.vy = 0;
    }
  }

  private moveBoxBy(box: BoxState, dx: number, boxes: BoxState[], staticWalls: Rect[]): number {
    if (dx === 0) {
      return 0;
    }
    const startX = box.x;
    box.x += dx;
    const obstacles = this.getBoxObstacles(staticWalls, boxes, box.id);
    for (const obstacle of obstacles) {
      if (!rectIntersects(box, obstacle)) {
        continue;
      }
      if (dx > 0) {
        box.x = obstacle.x - box.w;
      } else {
        box.x = obstacle.x + obstacle.w;
      }
      box.vx = 0;
      break;
    }
    return box.x - startX;
  }

  private getBoxObstacles(staticWalls: Rect[], boxes: BoxState[], excludeId: number): Rect[] {
    const boxRects = boxes
      .filter((item) => item.id !== excludeId)
      .map((item) => ({ x: item.x, y: item.y, w: item.w, h: item.h }));
    return [...staticWalls, ...boxRects];
  }

  private getStaticWalls(): Rect[] {
    return this.getStaticWallsForStage(this.currentStageId);
  }

  private getStaticWallsForStage(stageId: StageId): Rect[] {
    const stage = this.stages[stageId];
    return stage.elements
      .filter((element) => element.type !== "box")
      .map((element) => {
        const size = this.getElementSize(element.type, element.rotation);
        return { x: element.x, y: element.y, w: size.w, h: size.h };
      });
  }

  private placeStageInMap(stageId: StageId, col: number, row: number): void {
    if (stageId === "X") {
      this.setMapStageAt(col, row, null);
    } else {
      this.setMapStageAt(col, row, stageId);
    }
    this.saveToStorage();
  }

  private draw(): void {
    this.gridGraphics.clear();
    this.uiGraphics.clear();

    this.drawPanels();
    this.drawGrid();
    this.drawElements();
    this.drawPreview();
    this.drawMap();
    this.drawUI();
    this.updateUITextContent();
    this.updateInfoText();
  }

  private drawPanels(): void {
    const { leftPanel, rightPanel } = this.layout;
    this.uiGraphics.fillStyle(UI_COLORS.panel, 1);
    this.uiGraphics.fillRect(leftPanel.x, leftPanel.y, leftPanel.w, leftPanel.h);
    this.uiGraphics.fillRect(rightPanel.x, rightPanel.y, rightPanel.w, rightPanel.h);
    this.uiGraphics.lineStyle(1, UI_COLORS.panelBorder, 1);
    this.uiGraphics.strokeRect(leftPanel.x, leftPanel.y, leftPanel.w, leftPanel.h);
    this.uiGraphics.strokeRect(rightPanel.x, rightPanel.y, rightPanel.w, rightPanel.h);
  }

  private drawGrid(): void {
    const { grid } = this.layout;
    const dims = this.getViewDimensions();
    this.gridGraphics.fillStyle(UI_COLORS.gridBg, 1);
    this.gridGraphics.fillRect(grid.x, grid.y, grid.w, grid.h);

    this.gridGraphics.lineStyle(1, UI_COLORS.gridLine, 0.6);
    for (let c = 0; c <= dims.cols; c += 1) {
      const x = grid.x + c * grid.scale;
      this.gridGraphics.lineBetween(x, grid.y, x, grid.y + grid.h);
    }
    for (let r = 0; r <= dims.rows; r += 1) {
      const y = grid.y + r * grid.scale;
      this.gridGraphics.lineBetween(grid.x, y, grid.x + grid.w, y);
    }

    if (this.viewMode === "stage") {
      this.gridGraphics.lineStyle(2, UI_COLORS.gridBold, 0.9);
      for (let c = 0; c <= dims.cols; c += AREA_BLOCK) {
        const x = grid.x + c * grid.scale;
        this.gridGraphics.lineBetween(x, grid.y, x, grid.y + grid.h);
      }
      for (let r = 0; r <= dims.rows; r += AREA_BLOCK) {
        const y = grid.y + r * grid.scale;
        this.gridGraphics.lineBetween(grid.x, y, grid.x + grid.w, y);
      }

      const areaPos = AREA_GRID[this.currentAreaId];
      const highlight = this.worldToScreen(areaPos.col * AREA_BLOCK, areaPos.row * AREA_BLOCK);
      this.gridGraphics.lineStyle(2, UI_COLORS.selection, 1);
      this.gridGraphics.strokeRect(
        highlight.x,
        highlight.y,
        AREA_BLOCK * grid.scale,
        AREA_BLOCK * grid.scale
      );
    }
  }

  private drawElements(): void {
    const stage = this.getCurrentStage();
    const viewBounds = this.getViewBounds();
    for (const element of stage.elements) {
      if (this.testMode && element.type === "box") {
        continue;
      }
      const size = this.getElementSize(element.type, element.rotation);
      if (!rectIntersects(viewBounds, { x: element.x, y: element.y, w: size.w, h: size.h })) {
        continue;
      }
      const screen = this.worldToScreen(element.x, element.y);
      const color = TOOL_DEFS[element.type].color;
      this.gridGraphics.fillStyle(color, 0.9);
      this.gridGraphics.fillRect(
        screen.x,
        screen.y,
        size.w * this.layout.grid.scale,
        size.h * this.layout.grid.scale
      );
      if (element.id === this.selectedElementId) {
        this.gridGraphics.lineStyle(2, UI_COLORS.selection, 1);
        this.gridGraphics.strokeRect(
          screen.x,
          screen.y,
          size.w * this.layout.grid.scale,
          size.h * this.layout.grid.scale
        );
      }
    }

    if (this.testMode) {
      for (const box of this.testBoxes) {
        if (!rectIntersects(viewBounds, { x: box.x, y: box.y, w: box.w, h: box.h })) {
          continue;
        }
        const screen = this.worldToScreen(box.x, box.y);
        this.gridGraphics.fillStyle(TOOL_DEFS.box.color, 0.9);
        this.gridGraphics.fillRect(
          screen.x,
          screen.y,
          box.w * this.layout.grid.scale,
          box.h * this.layout.grid.scale
        );
      }
    }

    if (this.testMode && this.testPlayer) {
      const playerScreen = this.worldToScreen(
        this.testPlayer.x - PLAYER_HALF,
        this.testPlayer.y - PLAYER_HALF
      );
      this.gridGraphics.fillStyle(0x60a5fa, 1);
      this.gridGraphics.fillRect(
        playerScreen.x,
        playerScreen.y,
        PLAYER_SIZE * this.layout.grid.scale,
        PLAYER_SIZE * this.layout.grid.scale
      );
    }
  }

  private drawPreview(): void {
    if (this.testMode || this.draggingElementId) {
      return;
    }
    const pointer = this.input.activePointer;
    const world = this.screenToWorld(pointer.x, pointer.y);
    if (!world) {
      return;
    }

    const stage = this.getCurrentStage();
    const hit = this.findElementAt(stage, world.x, world.y);
    if (hit) {
      return;
    }

    const size = this.getElementSize(this.currentTool, this.currentRotation);
    const clamped = this.clampElementPosition(world.x, world.y, this.currentTool, this.currentRotation);
    const screen = this.worldToScreen(clamped.x, clamped.y);

    this.gridGraphics.lineStyle(1, UI_COLORS.preview, 0.9);
    this.gridGraphics.strokeRect(
      screen.x,
      screen.y,
      size.w * this.layout.grid.scale,
      size.h * this.layout.grid.scale
    );
  }

  private drawUI(): void {
    const { stageButtons, toolButtons, leftPanel, rightPanel, map } = this.layout;

    this.uiGraphics.lineStyle(1, UI_COLORS.panelBorder, 1);
    this.uiGraphics.strokeRect(leftPanel.x + 8, leftPanel.y + 8, leftPanel.w - 16, 28);
    this.uiGraphics.strokeRect(rightPanel.x + 8, rightPanel.y + 8, rightPanel.w - 16, 28);

    this.uiGraphics.fillStyle(UI_COLORS.panelBorder, 1);
    this.uiGraphics.fillRect(leftPanel.x + 8, leftPanel.y + 8, leftPanel.w - 16, 28);
    this.uiGraphics.fillRect(rightPanel.x + 8, rightPanel.y + 8, rightPanel.w - 16, 28);

    for (const button of stageButtons) {
      const active = button.id === this.currentStageId;
      this.uiGraphics.fillStyle(active ? 0x1e293b : 0x0f172a, 1);
      this.uiGraphics.fillRect(button.rect.x, button.rect.y, button.rect.w, button.rect.h);
      this.uiGraphics.lineStyle(1, UI_COLORS.panelBorder, 1);
      this.uiGraphics.strokeRect(button.rect.x, button.rect.y, button.rect.w, button.rect.h);
    }

    for (const button of toolButtons) {
      const active = button.id === this.currentTool;
      this.uiGraphics.fillStyle(active ? 0x1e293b : 0x0f172a, 1);
      this.uiGraphics.fillRect(button.rect.x, button.rect.y, button.rect.w, button.rect.h);
      this.uiGraphics.lineStyle(1, UI_COLORS.panelBorder, 1);
      this.uiGraphics.strokeRect(button.rect.x, button.rect.y, button.rect.w, button.rect.h);
    }

    this.uiGraphics.lineStyle(1, UI_COLORS.panelBorder, 1);
    this.uiGraphics.strokeRect(map.x, map.y, map.size, map.size);
  }

  private drawMap(): void {
    const { map } = this.layout;
    const cell = map.cellSize;
    const center = this.getMapCenterOffset();
    const originCol = this.mapFocus.col - center.col;
    const originRow = this.mapFocus.row - center.row;
    this.uiGraphics.lineStyle(1, UI_COLORS.mapLine, 0.8);
    for (let c = 0; c <= map.cols; c += 1) {
      const x = map.x + c * cell;
      this.uiGraphics.lineBetween(x, map.y, x, map.y + map.size);
    }
    for (let r = 0; r <= map.rows; r += 1) {
      const y = map.y + r * cell;
      this.uiGraphics.lineBetween(map.x, y, map.x + map.size, y);
    }

    for (let r = 0; r < map.rows; r += 1) {
      for (let c = 0; c < map.cols; c += 1) {
        const worldCol = originCol + c;
        const worldRow = originRow + r;
        const id = this.getMapStageAt(worldCol, worldRow);
        const centerX = map.x + c * cell + cell * 0.5;
        const centerY = map.y + r * cell + cell * 0.5;

        if (!id) {
          continue;
        }

        if (c + 1 < map.cols && this.getMapStageAt(worldCol + 1, worldRow)) {
          const nx = map.x + (c + 1) * cell + cell * 0.5;
          this.uiGraphics.lineStyle(2, UI_COLORS.mapLine, 1);
          this.uiGraphics.lineBetween(centerX, centerY, nx, centerY);
        }
        if (r + 1 < map.rows && this.getMapStageAt(worldCol, worldRow + 1)) {
          const ny = map.y + (r + 1) * cell + cell * 0.5;
          this.uiGraphics.lineStyle(2, UI_COLORS.mapLine, 1);
          this.uiGraphics.lineBetween(centerX, centerY, centerX, ny);
        }
      }
    }

    const focusX = map.x + center.col * cell;
    const focusY = map.y + center.row * cell;
    this.uiGraphics.lineStyle(2, UI_COLORS.selection, 1);
    this.uiGraphics.strokeRect(focusX + 2, focusY + 2, cell - 4, cell - 4);
  }

  private updateInfoText(): void {
    const stage = this.getCurrentStage();
    const tool = TOOL_DEFS[this.currentTool];
    const rotation = this.currentRotation;
    const status = this.testMode ? "TEST MODE" : "EDIT MODE";
    const mapSet = this.mapAssetIndex + 1;
    const view = this.viewMode === "stage" ? "STAGE" : `AREA ${this.currentAreaId}`;
    const selection = this.selectedElementId ? `Selected: ${this.selectedElementId}` : "Selected: -";
    const controls = [
      "Click: place/select",
      "Drag: move",
      "Shift+Click: delete",
      "Shift+Drag: delete",
      "Q/E: rotate",
      "Del: delete",
      "1-4: tools",
      "Alt+0-9/X: stage",
      "Arrows: switch view",
      "Ctrl+Arrows: nudge",
      "M: view mode",
      "Ctrl+1-5: map asset",
      "Map: 0-9/X place (hover)",
      "Map: click place, RMB clear",
      "T: test",
      "Esc: back",
    ];
    this.infoText.setText(
      [
        "Stage Builder",
        `Stage: ${stage.id === "X" ? "VOID" : stage.id} | Elements: ${stage.elements.length}`,
        `View: ${view} | Map: ${mapSet} | Tool: ${tool.label} | Rotation: ${rotation} deg`,
        `${status} | ${selection}`,
        "",
        ...controls,
      ].join("\n")
    );
  }

  private getCurrentStage(): StageData {
    return this.stages[this.currentStageId];
  }

  private getElementSize(type: BuilderTool, rotation: Rotation): { w: number; h: number } {
    const def = TOOL_DEFS[type];
    const rotate = rotation === 90 || rotation === 270;
    return rotate ? { w: def.h, h: def.w } : { w: def.w, h: def.h };
  }

  private getRotationOffset(type: BuilderTool, rotation: Rotation): { x: number; y: number } {
    const def = TOOL_DEFS[type];
    const size = this.getElementSize(type, rotation);
    const center = 0.5;
    const dx = def.w * 0.5 - center;
    const dy = def.h * 0.5 - center;
    let rdx = dx;
    let rdy = dy;
    if (rotation === 90) {
      rdx = -dy;
      rdy = dx;
    } else if (rotation === 180) {
      rdx = -dx;
      rdy = -dy;
    } else if (rotation === 270) {
      rdx = dy;
      rdy = -dx;
    }
    const centerX = center + rdx;
    const centerY = center + rdy;
    return { x: centerX - size.w * 0.5, y: centerY - size.h * 0.5 };
  }

  private getCellOriginFromPosition(
    x: number,
    y: number,
    type: BuilderTool,
    rotation: Rotation
  ): { x: number; y: number } {
    const offset = this.getRotationOffset(type, rotation);
    return {
      x: snap(x - offset.x, GRID_STEP),
      y: snap(y - offset.y, GRID_STEP),
    };
  }

  private clampCellOrigin(
    cellX: number,
    cellY: number,
    type: BuilderTool,
    rotation: Rotation
  ): { x: number; y: number } {
    const size = this.getElementSize(type, rotation);
    const offset = this.getRotationOffset(type, rotation);
    const bounds = this.getViewBounds();
    const minX = Math.ceil(bounds.x - offset.x);
    const maxX = Math.floor(bounds.x + bounds.w - size.w - offset.x);
    const minY = Math.ceil(bounds.y - offset.y);
    const maxY = Math.floor(bounds.y + bounds.h - size.h - offset.y);
    return {
      x: clamp(cellX, minX, maxX),
      y: clamp(cellY, minY, maxY),
    };
  }

  private positionFromCell(
    cellX: number,
    cellY: number,
    type: BuilderTool,
    rotation: Rotation
  ): { x: number; y: number } {
    const offset = this.getRotationOffset(type, rotation);
    return {
      x: snap(cellX + offset.x, 0.001),
      y: snap(cellY + offset.y, 0.001),
    };
  }

  private screenToWorld(screenX: number, screenY: number): { x: number; y: number } | null {
    const { grid } = this.layout;
    if (!pointInRect(screenX, screenY, { x: grid.x, y: grid.y, w: grid.w, h: grid.h })) {
      return null;
    }
    const origin = this.getViewOrigin();
    const x = (screenX - grid.x) / grid.scale + origin.x;
    const y = (screenY - grid.y) / grid.scale + origin.y;
    return { x, y };
  }

  private worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const { grid } = this.layout;
    const origin = this.getViewOrigin();
    return {
      x: grid.x + (worldX - origin.x) * grid.scale,
      y: grid.y + (worldY - origin.y) * grid.scale,
    };
  }

  private findElementAt(stage: StageData, x: number, y: number): BuilderElement | null {
    for (let i = stage.elements.length - 1; i >= 0; i -= 1) {
      const element = stage.elements[i];
      const size = this.getElementSize(element.type, element.rotation);
      if (x >= element.x && x <= element.x + size.w && y >= element.y && y <= element.y + size.h) {
        return element;
      }
    }
    return null;
  }

  private selectElement(id: number | null): void {
    this.selectedElementId = id;
  }

  private bringElementToFront(stage: StageData, id: number): void {
    const index = stage.elements.findIndex((item) => item.id === id);
    if (index === -1 || index === stage.elements.length - 1) {
      return;
    }
    const [item] = stage.elements.splice(index, 1);
    stage.elements.push(item);
  }

  private removeElement(stage: StageData, id: number): void {
    stage.elements = stage.elements.filter((element) => element.id !== id);
    if (this.selectedElementId === id) {
      this.selectedElementId = null;
    }
    this.saveToStorage();
  }

  private eraseAt(worldX: number, worldY: number): void {
    const stage = this.getCurrentStage();
    const hit = this.findElementAt(stage, worldX, worldY);
    if (!hit) {
      return;
    }
    this.removeElement(stage, hit.id);
  }

  private paintAt(worldX: number, worldY: number): BuilderElement | null {
    const stage = this.getCurrentStage();
    const clamped = this.clampElementPosition(worldX, worldY, this.currentTool, this.currentRotation);
    const key = `${clamped.x}|${clamped.y}|${this.currentTool}|${this.currentRotation}`;
    if (key === this.lastPaintKey) {
      return null;
    }
    this.lastPaintKey = key;

    const hit = this.findElementAt(stage, clamped.x + 0.001, clamped.y + 0.001);
    if (hit) {
      return null;
    }

    return this.placeElement(clamped.x, clamped.y);
  }

  private placeElement(worldX: number, worldY: number): BuilderElement | null {
    const clamped = this.clampElementPosition(worldX, worldY, this.currentTool, this.currentRotation);
    const element: BuilderElement = {
      id: this.nextElementId++,
      type: this.currentTool,
      x: clamped.x,
      y: clamped.y,
      rotation: this.currentRotation,
    };
    const stage = this.getCurrentStage();
    stage.elements.push(element);
    this.saveToStorage();
    return element;
  }

  private clampElementPosition(
    x: number,
    y: number,
    type: BuilderTool,
    rotation: Rotation
  ): { x: number; y: number } {
    const cell = this.getCellOriginFromPosition(x, y, type, rotation);
    const clampedCell = this.clampCellOrigin(cell.x, cell.y, type, rotation);
    return this.positionFromCell(clampedCell.x, clampedCell.y, type, rotation);
  }

  private rotateSelection(delta: number): void {
    const next = normalizeRotation(this.currentRotation + delta);
    if (this.selectedElementId) {
      const stage = this.getCurrentStage();
      const element = stage.elements.find((item) => item.id === this.selectedElementId);
      if (element) {
        const cell = this.getCellOriginFromPosition(element.x, element.y, element.type, element.rotation);
        element.rotation = normalizeRotation(element.rotation + delta);
        this.currentRotation = element.rotation;
        const clampedCell = this.clampCellOrigin(cell.x, cell.y, element.type, element.rotation);
        const nextPosition = this.positionFromCell(clampedCell.x, clampedCell.y, element.type, element.rotation);
        element.x = nextPosition.x;
        element.y = nextPosition.y;
        this.saveToStorage();
      }
    } else {
      this.currentRotation = next;
    }
  }

  private deleteSelection(): void {
    if (!this.selectedElementId) {
      return;
    }
    const stage = this.getCurrentStage();
    this.removeElement(stage, this.selectedElementId);
  }

  private nudgeSelection(step: number, direction: string): void {
    if (!this.selectedElementId) {
      return;
    }
    const stage = this.getCurrentStage();
    const element = stage.elements.find((item) => item.id === this.selectedElementId);
    if (!element) {
      return;
    }
    let x = element.x;
    let y = element.y;
    if (direction === "arrowup") {
      y -= step;
    } else if (direction === "arrowdown") {
      y += step;
    } else if (direction === "arrowleft") {
      x -= step;
    } else if (direction === "arrowright") {
      x += step;
    }
    const clamped = this.clampElementPosition(x, y, element.type, element.rotation);
    element.x = clamped.x;
    element.y = clamped.y;
    this.saveToStorage();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snap(value: number, step: number): number {
  const snapped = Math.round(value / step) * step;
  return Number(snapped.toFixed(3));
}

function normalizeRotation(rotation: number): Rotation {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized as Rotation;
  }
  return 0;
}

function arrowToDelta(key: string): { dx: number; dy: number } {
  if (key === "arrowup") {
    return { dx: 0, dy: -1 };
  }
  if (key === "arrowdown") {
    return { dx: 0, dy: 1 };
  }
  if (key === "arrowleft") {
    return { dx: -1, dy: 0 };
  }
  if (key === "arrowright") {
    return { dx: 1, dy: 0 };
  }
  return { dx: 0, dy: 0 };
}

function mapKey(col: number, row: number): string {
  return `${col},${row}`;
}

function parseMapKey(key: string): { col: number; row: number } | null {
  const parts = key.split(",");
  if (parts.length !== 2) {
    return null;
  }
  const col = Number(parts[0]);
  const row = Number(parts[1]);
  if (!Number.isFinite(col) || !Number.isFinite(row)) {
    return null;
  }
  return { col: Math.trunc(col), row: Math.trunc(row) };
}

function isStageId(value: unknown): value is StageId {
  return typeof value === "string" && STAGE_IDS.includes(value as StageId);
}

function sanitizeMapSet(raw: unknown): Record<string, StageId> {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const result: Record<string, StageId> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isStageId(value) || value === "X") {
      continue;
    }
    const parts = key.split(",");
    if (parts.length !== 2) {
      continue;
    }
    const col = Number(parts[0]);
    const row = Number(parts[1]);
    if (!Number.isFinite(col) || !Number.isFinite(row)) {
      continue;
    }
    result[mapKey(Math.trunc(col), Math.trunc(row))] = value;
  }
  return result;
}

function isValidElement(value: unknown): value is BuilderElement {
  if (!value || typeof value !== "object") {
    return false;
  }
  const element = value as BuilderElement;
  return (
    typeof element.id === "number" &&
    typeof element.x === "number" &&
    typeof element.y === "number" &&
    (element.rotation === 0 || element.rotation === 90 || element.rotation === 180 || element.rotation === 270) &&
    (element.type === "wall" || element.type === "platform" || element.type === "box" || element.type === "switch")
  );
}

function pointInRect(x: number, y: number, rect: PanelRect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function rectIntersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function overlaps(player: PlayerState, wall: Rect): boolean {
  const px = player.x - PLAYER_HALF;
  const py = player.y - PLAYER_HALF;
  return (
    px < wall.x + wall.w &&
    px + PLAYER_SIZE > wall.x &&
    py < wall.y + wall.h &&
    py + PLAYER_SIZE > wall.y
  );
}
