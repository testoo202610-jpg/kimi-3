import { TILE, GameMap } from '../map';
import { unitDef } from '../units';
import { buildingDef } from '../buildings';
import type { World } from '../world';

export interface FogState {
  explored: Uint8Array;
  visible: Uint8Array;
  dirty: boolean; // renderer hint
}

/** Fog of war per player. Vision circles stamped each 4th sim tick. */
export class FogSystem {
  createState(map: GameMap): FogState {
    return {
      explored: new Uint8Array(map.w * map.h),
      visible: new Uint8Array(map.w * map.h),
      dirty: true,
    };
  }

  update(world: World) {
    if (world.tickCount % 4 !== 0) return; // 4 Hz fog refresh is plenty
    for (const p of world.players) {
      p.fog.visible.fill(0);
      for (const u of world.units.values()) {
        if (u.owner !== p.id) continue;
        this.stamp(world, p.fog, Math.floor(u.x / TILE), Math.floor(u.y / TILE), unitDef(u.type).vision);
      }
      // buildings: town centers see a modest radius, towers see far
      for (const b of world.buildings.values()) {
        if (b.owner !== p.id || !b.built) continue;
        const def = buildingDef(b.key);
        const vision = def.visionT ?? (def.projectsTerritory ? 6 : 0);
        if (!vision) continue;
        this.stamp(world, p.fog, b.tx, b.ty, vision);
      }
      p.fog.dirty = true;
    }
  }

  private stamp(world: World, fog: FogState, cx: number, cy: number, radius: number) {
    // ponytail: no line-of-sight occlusion (mountains block movement but not
    // sight); add tile-LOS when terrain height matters for gameplay.
    const { w, h } = world.map;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        fog.visible[i] = 1;
        fog.explored[i] = 1;
      }
    }
  }
}
