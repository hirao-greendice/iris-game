import Phaser from "phaser";

type ZoomHandler = () => void;

export class ZoomControls {
  private readonly container: Phaser.GameObjects.Container;
  private readonly zoomInButton: Phaser.GameObjects.Rectangle;
  private readonly zoomOutButton: Phaser.GameObjects.Rectangle;
  private readonly zoomInLabel: Phaser.GameObjects.Text;
  private readonly zoomOutLabel: Phaser.GameObjects.Text;
  private readonly onZoomIn: ZoomHandler;
  private readonly onZoomOut: ZoomHandler;
  private canZoomIn = true;
  private canZoomOut = true;

  constructor(scene: Phaser.Scene, onZoomIn: ZoomHandler, onZoomOut: ZoomHandler) {
    this.onZoomIn = onZoomIn;
    this.onZoomOut = onZoomOut;

    this.container = scene.add.container(0, 0).setDepth(25);

    this.zoomInButton = scene.add.rectangle(0, 0, 44, 44, 0x1b2c3f, 0.7).setOrigin(0.5);
    this.zoomOutButton = scene.add.rectangle(0, 0, 44, 44, 0x1b2c3f, 0.7).setOrigin(0.5);

    this.zoomInLabel = scene.add.text(0, 0, "+", {
      fontFamily: "Consolas, monospace",
      fontSize: "20px",
      color: "#d8e6ff",
    }).setOrigin(0.5);
    this.zoomOutLabel = scene.add.text(0, 0, "-", {
      fontFamily: "Consolas, monospace",
      fontSize: "20px",
      color: "#d8e6ff",
    }).setOrigin(0.5);

    this.container.add([
      this.zoomInButton,
      this.zoomOutButton,
      this.zoomInLabel,
      this.zoomOutLabel,
    ]);

    this.registerButton(this.zoomInButton, () => {
      if (this.canZoomIn) {
        this.onZoomIn();
      }
    });
    this.registerButton(this.zoomOutButton, () => {
      if (this.canZoomOut) {
        this.onZoomOut();
      }
    });

    this.zoomInLabel.setData("button", this.zoomInButton);
    this.zoomOutLabel.setData("button", this.zoomOutButton);
  }

  layout(width: number, height: number): void {
    const size = Math.max(36, Math.min(width, height) * 0.06);
    const padding = Math.max(10, Math.min(width, height) * 0.02);
    const gap = Math.max(6, size * 0.15);
    const x = width - padding - size / 2;
    const yTop = padding + size / 2;

    const fontSize = Math.max(16, Math.round(size * 0.55));

    this.zoomInButton.setSize(size, size);
    this.zoomOutButton.setSize(size, size);

    this.zoomInButton.setPosition(x, yTop);
    this.zoomOutButton.setPosition(x, yTop + size + gap);

    this.zoomInLabel.setFontSize(fontSize);
    this.zoomOutLabel.setFontSize(fontSize);
    this.zoomInLabel.setPosition(this.zoomInButton.x, this.zoomInButton.y);
    this.zoomOutLabel.setPosition(this.zoomOutButton.x, this.zoomOutButton.y);
  }

  setState(zoomLevel: number): void {
    this.canZoomIn = zoomLevel > 0;
    this.canZoomOut = zoomLevel < 2;
    this.setVisualState(this.zoomInButton, this.zoomInLabel, this.canZoomIn);
    this.setVisualState(this.zoomOutButton, this.zoomOutLabel, this.canZoomOut);
  }

  private setVisualState(
    button: Phaser.GameObjects.Rectangle,
    label: Phaser.GameObjects.Text,
    enabled: boolean
  ): void {
    button.setAlpha(enabled ? 0.8 : 0.35);
    label.setAlpha(enabled ? 1 : 0.5);
  }

  private registerButton(button: Phaser.GameObjects.Rectangle, onDown: () => void): void {
    button.setInteractive({ useHandCursor: false });
    button.on(Phaser.Input.Events.POINTER_DOWN, onDown);
  }
}
