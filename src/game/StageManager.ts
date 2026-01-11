import Phaser from "phaser";
import { STAGES, type StageId } from "./stageData"; // type-only import for verbatimModuleSyntax

export class StageManager {
  public solids!: Phaser.Physics.Arcade.StaticGroup;
  public currentId: StageId = "X";
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    // Parameter properties are disallowed by erasableSyntaxOnly.
    this.scene = scene;
    this.solids = this.scene.physics.add.staticGroup();
  }

  load(id: StageId) {
    this.currentId = id;

    // いったん床だけ作り直す（最小）
    this.solids.clear(true, true);

    const W = this.scene.scale.width;

    const floorY = STAGES[id].floorY;

    const floor = this.scene.add.rectangle(W / 2, floorY, W, 40, 0x333333);
    this.scene.physics.add.existing(floor, true);
    this.solids.add(floor as any);

    // ステージ名表示（仮）
    this.scene.add.text(16, 36, `Stage: ${id}`, {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: "#ffffff",
    });
  }

  drawGrid() {
    const g = this.scene.add.graphics();
    g.lineStyle(2, 0xffffff, 0.2);

    const W = this.scene.scale.width;
    const H = this.scene.scale.height;

    g.strokeLineShape(new Phaser.Geom.Line(W / 2, 0, W / 2, H));
    g.strokeLineShape(new Phaser.Geom.Line(0, H / 3, W, H / 3));
    g.strokeLineShape(new Phaser.Geom.Line(0, (2 * H) / 3, W, (2 * H) / 3));
  }
}
