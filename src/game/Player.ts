import Phaser from "phaser";

export class Player {
  public sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    // 画像なしで四角にしたいので、生成用の簡易textureを作る
    const key = "__player_rect";
    if (!scene.textures.exists(key)) {
      // `add` is not in the typed options; make() already avoids adding to the scene.
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 24, 24);
      g.generateTexture(key, 24, 24);
      g.destroy();
    }

    this.sprite = scene.physics.add.sprite(x, y, key);
    this.sprite.setCollideWorldBounds(true);

    this.cursors = scene.input.keyboard!.createCursorKeys();
  }

  update() {
    const body = this.sprite.body;

    const speed = 220;
    if (this.cursors.left?.isDown) this.sprite.setVelocityX(-speed);
    else if (this.cursors.right?.isDown) this.sprite.setVelocityX(speed);
    else this.sprite.setVelocityX(0);

    // ジャンプ：地面にいる時だけ
    const onGround = body.blocked.down || body.touching.down;
    if (onGround && this.cursors.up?.isDown) {
      this.sprite.setVelocityY(-520);
    }
  }
}
