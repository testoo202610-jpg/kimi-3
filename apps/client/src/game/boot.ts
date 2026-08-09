import Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';

export function bootGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#14100c',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
    },
    scene: [WorldScene],
    fps: { target: 60 },
    banner: false,
  });
}
