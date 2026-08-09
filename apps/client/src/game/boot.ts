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
    // ?e2e=1: drive the loop by setTimeout — headless browsers throttle RAF
    // on occluded/background pages, which would freeze the sim otherwise
    fps: { target: 60, forceSetTimeOut: new URLSearchParams(location.search).has('e2e') },
    banner: false,
  });
  // Phaser boots scenes on its first RAF, after this synchronous block
  game.registry.set('bootConfig', config);
  return game;
}
