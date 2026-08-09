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

  // caravan: cart + two wheels
  g.fillStyle(0xffffff, 1).fillRect(4, 8, 22, 10);
  g.fillRect(18, 4, 6, 6);
  g.fillCircle(9, 20, 4);
  g.fillCircle(21, 20, 4);
  g.generateTexture('unit-caravan', 28, 24);
  g.clear();

  // generic fallback dot
  g.fillStyle(0xffffff, 1).fillCircle(10, 10, 8);
  g.generateTexture('unit-default', 20, 20);
  g.destroy();
}

// building styles per key: [wallColor, roofColor] (original geometric art)
const BLDCOLORS: Record<string, [number, number]> = {
  townCenter: [0xcbb590, 0x8a4a3a],
  house: [0xbfa87c, 0x6a5a6a],
  farm: [0xd8c89a, 0x5a7a4a],
  granary: [0xd8c89a, 0x9a7a2f],
  lumberCamp: [0xbfa87c, 0x4a6a3a],
  stoneCamp: [0xbab5a8, 0x5a5a52],
  mineCamp: [0xa89a8a, 0x4a3a3a],
  warehouse: [0xcbb590, 0x6a6a2f],
  watchtower: [0xbab5a8, 0x8a4a3a],
  wall: [0x8a8578, 0x6e695e],
  gate: [0x9a7a50, 0x5e4630],
  market: [0xcbb590, 0x2f6a6a],
};

export function generateBuildingTextures(scene: Phaser.Scene, defs: Record<string, { w: number; h: number }>, tile: number) {
  for (const [key, def] of Object.entries(defs)) {
    const [wall, roof] = BLDCOLORS[key] ?? [0xcbb590, 0x6a5a6a];
    const w = def.w * tile;
    const h = def.h * tile;
    const g = scene.add.graphics();
    // walls
    g.fillStyle(wall).fillRect(2, Math.floor(h * 0.4), w - 4, Math.ceil(h * 0.6) - 2);
    // roof: trapezoid with upturned eaves
    g.fillStyle(roof);
    g.fillTriangle(2, Math.floor(h * 0.4), w / 2, 2, w - 2, Math.floor(h * 0.4));
    g.lineStyle(2, 0x2a2118, 0.7);
    g.strokeRect(2, Math.floor(h * 0.4), w - 4, Math.ceil(h * 0.6) - 2);
    g.lineBetween(w / 2, 2, w / 2, Math.floor(h * 0.4));
    // door
    g.fillStyle(0x2a2118, 0.85).fillRect(w / 2 - 3, h - 10, 6, 8);
    g.generateTexture(`bld-${key}`, w, h);
    // scaffold version for construction
    g.clear();
    g.fillStyle(0x8a7050, 0.45).fillRect(0, 0, w, h);
    g.lineStyle(2, 0xa08050, 0.9).strokeRect(1, 1, w - 2, h - 2);
    g.lineBetween(0, 0, w, h);
    g.lineBetween(w, 0, 0, h);
    g.lineBetween(0, h / 2, w, h / 2);
    g.lineBetween(w / 2, 0, w / 2, h);
    g.generateTexture(`bld-${key}-scaffold`, w, h);
    g.destroy();
  }
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
  caravan: 'unit-caravan',
};
