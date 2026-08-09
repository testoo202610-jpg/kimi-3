import Phaser from 'phaser';

/** All art is generated in-code — original placeholder art only (see AGENTS.md). */
export function generateTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics();

  // fog eraser brush
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 32, 32);
  g.generateTexture('fog-brush', 32, 32);
  g.clear();

  // worker: round-backed peasant shape (white — tinted by faction color)
  g.fillStyle(0xffffff, 1);
  g.fillCircle(12, 14, 8);
  g.fillRect(6, 20, 12, 6);
  g.generateTexture('unit-worker', 24, 26);
  g.clear();

  // militia: square body + spear
  g.fillStyle(0xffffff, 1).fillRect(4, 10, 14, 14);
  g.lineStyle(2, 0xffffff, 1).lineBetween(18, 6, 22, 22);
  g.generateTexture('unit-militia', 26, 26);
  g.clear();

  // spearman
  g.fillStyle(0xffffff, 1).fillRect(5, 11, 13, 13);
  g.lineStyle(2, 0xffffff, 1).lineBetween(19, 2, 23, 24);
  g.generateTexture('unit-spearman', 26, 26);
  g.clear();

  // swordsman / heavyInfantry
  g.fillStyle(0xffffff, 1).fillRect(5, 9, 14, 15);
  g.fillRect(2, 9, 4, 15);
  g.generateTexture('unit-swordsman', 26, 26);
  g.clear();
  g.fillStyle(0xffffff, 1).fillRect(3, 7, 18, 17);
  g.generateTexture('unit-heavyInfantry', 26, 26);
  g.clear();

  // archers: body + bow arc
  g.fillStyle(0xffffff, 1).fillRect(6, 11, 12, 13);
  g.lineStyle(2, 0xffffff, 1).arc(14, 14, 10, -1.2, 1.2, false);
  g.generateTexture('unit-archer', 26, 26);
  g.clear();
  g.fillStyle(0xffffff, 1).fillRect(6, 11, 12, 13);
  g.fillRect(10, 4, 8, 4);
  g.generateTexture('unit-crossbowman', 26, 26);
  g.clear();

  // cavalry: elongated diamond
  g.fillStyle(0xffffff, 1);
  for (const [key, w, h] of [['unit-scoutCavalry', 34, 18], ['unit-lightCavalry', 36, 20], ['unit-heavyCavalry', 38, 22]] as const) {
    g.fillStyle(0xffffff, 1);
    g.beginPath();
    g.moveTo(2, h / 2);
    g.lineTo(w / 2, 2);
    g.lineTo(w - 2, h / 2);
    g.lineTo(w / 2, h - 2);
    g.closePath();
    g.fillPath();
    g.generateTexture(key, w, h);
    g.clear();
  }

  // siege: box on wheels
  g.fillStyle(0xffffff, 1).fillRect(4, 10, 26, 12);
  g.fillCircle(9, 24, 4);
  g.fillCircle(25, 24, 4);
  g.generateTexture('unit-batteringRam', 34, 28);
  g.clear();
  g.fillStyle(0xffffff, 1).fillRect(6, 12, 22, 10);
  g.fillTriangle(6, 12, 17, 2, 28, 12);
  g.generateTexture('unit-catapult', 34, 28);
  g.clear();

  // generic fallback dot
  g.fillStyle(0xffffff, 1).fillCircle(10, 10, 8);
  g.generateTexture('unit-default', 20, 20);
  g.destroy();
}

export const UNIT_TEXTURE: Record<string, string> = {
  worker: 'unit-worker',
  militia: 'unit-militia',
  spearman: 'unit-spearman',
  swordsman: 'unit-swordsman',
  heavyInfantry: 'unit-heavyInfantry',
  archer: 'unit-archer',
  crossbowman: 'unit-crossbowman',
  scoutCavalry: 'unit-scoutCavalry',
  lightCavalry: 'unit-lightCavalry',
  heavyCavalry: 'unit-heavyCavalry',
  batteringRam: 'unit-batteringRam',
  catapult: 'unit-catapult',
};
