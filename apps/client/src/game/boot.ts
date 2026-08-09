import Phaser from 'phaser';
import { WorldScene } from './scenes/WorldScene';
import type { BootConfig } from '../store';

export function bootGame(parent: HTMLElement, config: BootConfig): Phaser.Game {
  const game = new Phaser.Game({
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
  // Phaser boots scenes on its first RAF, after this synchronous block
  game.registry.set('bootConfig', config);
  return game;
}
