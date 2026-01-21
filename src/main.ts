import "./style.css";
import Phaser from "phaser";
import { StageBuilderScene } from "./game/scenes/StageBuilderScene";
import { AreaScene } from "./game/scenes/AreaScene";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#0b0f1a",
  input: {
    activePointers: 3,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [StageBuilderScene, AreaScene],
});
