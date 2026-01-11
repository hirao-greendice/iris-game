import Phaser from "phaser";

export class TouchControls {
  private readonly container: Phaser.GameObjects.Container;
  private readonly leftButton: Phaser.GameObjects.Rectangle;
  private readonly rightButton: Phaser.GameObjects.Rectangle;
  private readonly jumpButton: Phaser.GameObjects.Rectangle;
  private readonly leftLabel: Phaser.GameObjects.Text;
  private readonly rightLabel: Phaser.GameObjects.Text;
  private readonly jumpLabel: Phaser.GameObjects.Text;
  private leftDown = false;
  private rightDown = false;
  private jumpDown = false;

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(20);

    this.leftButton = scene.add.rectangle(0, 0, 80, 80, 0x1b2c3f, 0.5).setOrigin(0.5);
    this.rightButton = scene.add.rectangle(0, 0, 80, 80, 0x1b2c3f, 0.5).setOrigin(0.5);
    this.jumpButton = scene.add.rectangle(0, 0, 80, 80, 0x2b3f2b, 0.5).setOrigin(0.5);

    this.leftLabel = scene.add.text(0, 0, "L", {
      fontFamily: "Consolas, monospace",
      fontSize: "20px",
      color: "#d8e6ff",
    }).setOrigin(0.5);
    this.rightLabel = scene.add.text(0, 0, "R", {
      fontFamily: "Consolas, monospace",
      fontSize: "20px",
      color: "#d8e6ff",
    }).setOrigin(0.5);
    this.jumpLabel = scene.add.text(0, 0, "J", {
      fontFamily: "Consolas, monospace",
      fontSize: "20px",
      color: "#d8ffd8",
    }).setOrigin(0.5);

    this.container.add([
      this.leftButton,
      this.rightButton,
      this.jumpButton,
      this.leftLabel,
      this.rightLabel,
      this.jumpLabel,
    ]);

    this.registerButton(this.leftButton, () => {
      this.leftDown = true;
    }, () => {
      this.leftDown = false;
    });

    this.registerButton(this.rightButton, () => {
      this.rightDown = true;
    }, () => {
      this.rightDown = false;
    });

    this.registerButton(this.jumpButton, () => {
      this.jumpDown = true;
    }, () => {
      this.jumpDown = false;
    });

    this.leftLabel.setData("button", this.leftButton);
    this.rightLabel.setData("button", this.rightButton);
    this.jumpLabel.setData("button", this.jumpButton);
  }

  layout(width: number, height: number): void {
    const size = Math.max(56, Math.min(width, height) * 0.12);
    const padding = Math.max(12, Math.min(width, height) * 0.03);
    const y = height - size / 2 - padding;

    this.leftButton.setSize(size, size);
    this.rightButton.setSize(size, size);
    this.jumpButton.setSize(size, size);

    this.leftButton.setPosition(padding + size / 2, y);
    this.rightButton.setPosition(padding * 2 + size * 1.5, y);
    this.jumpButton.setPosition(width - padding - size / 2, y);

    this.leftLabel.setPosition(this.leftButton.x, this.leftButton.y);
    this.rightLabel.setPosition(this.rightButton.x, this.rightButton.y);
    this.jumpLabel.setPosition(this.jumpButton.x, this.jumpButton.y);
  }

  getState(): { left: boolean; right: boolean; jump: boolean } {
    return {
      left: this.leftDown,
      right: this.rightDown,
      jump: this.jumpDown,
    };
  }

  private registerButton(
    button: Phaser.GameObjects.Rectangle,
    onDown: () => void,
    onUp: () => void
  ): void {
    button.setInteractive({ useHandCursor: false });
    button.on(Phaser.Input.Events.POINTER_DOWN, onDown);
    button.on(Phaser.Input.Events.POINTER_UP, onUp);
    button.on(Phaser.Input.Events.POINTER_OUT, onUp);
    button.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, onUp);
  }
}
