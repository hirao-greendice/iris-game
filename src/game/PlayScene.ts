import Phaser from "phaser";
import { Player } from "./Player";
import { StageManager } from "./StageManager";
import { Seg7Tracker } from "./seg7";

export function start() {
  new Phaser.Game({
    type: Phaser.AUTO,
    width: 960,
    height: 540,
    backgroundColor: "#111111",
    parent: "app",
    physics: {
      default: "arcade",
      // Vector2Like requires both x and y.
      arcade: { gravity: { x: 0, y: 1200 }, debug: false },
    },
    scene: [MainScene],
  });
}

class MainScene extends Phaser.Scene {
  private player!: Player;
  private stage!: StageManager;
  private seg7!: Seg7Tracker;
  private debugText!: Phaser.GameObjects.Text;

  constructor() {
    super("main");
  }

  create() {
    // 1) ステージ
    this.stage = new StageManager(this);
    this.stage.load("X"); // 最初は特別ステージ

    // 2) プレイヤー
    this.player = new Player(this, 120, 120);

    // 3) 6分割 + 7セグ記録
    this.seg7 = new Seg7Tracker(this.scale.width, this.scale.height);

    // 4) デバッグ表示
    this.debugText = this.add.text(16, 12, "", {
      fontFamily: "sans-serif",
      fontSize: "18px",
      color: "#ffffff",
    });

    // 床に当たるように
    this.physics.add.collider(this.player.sprite, this.stage.solids);

    // 6分割ライン描画（デバッグ）
    this.stage.drawGrid();
  }

  update() {
    this.player.update();

    // プレイヤーの現在位置から「区画」を計算
    const p = this.player.sprite;
    const next = this.seg7.update(p.x, p.y);

    // next が数字ならステージ切替
    if (next) {
      this.stage.load(next);
      // ステージ切替時はプレイヤーを初期位置に戻す（仮）
      this.player.sprite.setPosition(120, 120);
      // 記録リセット（仮）
      this.seg7.reset();
    }

    this.debugText.setText(this.seg7.getDebugText(this.stage.currentId));
  }
}
