import Phaser from 'phaser';
import { TILE, TICK_MS, Tile, World, isBlocked, unitDef, type UnitState } from '@cr/core';
import { FACTION_BY_ID, type FactionId } from '@cr/shared';
import { useHud } from '../../store';
import { UNIT_TEXTURE, generateTextures } from '../textures';

const OWNER_FACTION: FactionId[] = ['dominion', 'river', 'hills'];

interface UnitView {
  container: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Graphics;
  prevX: number;
  prevY: number;
  curX: number;
  curY: number;
}

export class WorldScene extends Phaser.Scene {
  world!: World;
  readonly playerId = 0;
  factionId: FactionId = 'dominion';

  private views = new Map<number, UnitView>();
  private selected = new Set<number>();
  private groups = new Map<number, number[]>();

  private simAcc = 0;
  private fogBlack!: Phaser.GameObjects.RenderTexture;
  private fogGray!: Phaser.GameObjects.Graphics;
  private dragRect!: Phaser.GameObjects.Graphics;
  private dragStart: { x: number; y: number } | null = null;
  private dragging = false;
  private middleDrag: { px: number; py: number } | null = null;
  private lastClick = { id: -1, time: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hudTimer = 0;
  private seed: number;

  constructor() {
    super('world');
    this.seed = (Date.now() % 100000) | 1;
  }

  create() {
    this.world = new World(this.seed, OWNER_FACTION);
    const start = this.world.map.starts[this.playerId];
    // initial forces: 6 workers + 3 militia around town center
    for (let i = 0; i < 6; i++) {
      const t = scatter(start.tx, start.ty, i);
      const u = this.world.spawnUnit(this.playerId, 'worker', t.tx, t.ty);
      if (u) u.hp = unitDef('worker').hp;
    }
    for (let i = 0; i < 3; i++) {
      const t = scatter(start.tx + 2, start.ty + 2, i);
      const u = this.world.spawnUnit(this.playerId, 'militia', t.tx, t.ty);
      if (u) u.hp = unitDef('militia').hp;
    }
    // enemy scouts so fog/combat visuals can be seen (stripped-down phase 1 AI)
    for (let p = 1; p < OWNER_FACTION.length; p++) {
      const s = this.world.map.starts[p];
      for (let i = 0; i < 4; i++) {
        const t = scatter(s.tx, s.ty, i);
        const u = this.world.spawnUnit(p, i % 2 ? 'militia' : 'worker', t.tx, t.ty);
        if (u) u.hp = unitDef(u.type).hp;
      }
    }

    generateTextures(this);
    this.paintTerrain();
    this.buildFogLayers();
    this.setupInput();
    this.dragRect = this.add.graphics().setDepth(9000).setScrollFactor(0);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.map.w * TILE, this.world.map.h * TILE);
    cam.centerOn(start.tx * TILE, start.ty * TILE);
    cam.setZoom(1);

    (window as any).__cr_scene = this; // HUD bridge (selection details)
  }

  // ---------- terrain ----------
  private paintTerrain() {
    const { w, h, tiles, deposits, woodAmount } = this.world.map;
    const rt = this.add.renderTexture(0, 0, w * TILE, h * TILE).setOrigin(0).setDepth(-10);
    const g = this.add.graphics();
    let n = 0;
    const jitter = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) % 8) - 4;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[y * w + x];
        const px = x * TILE;
        const py = y * TILE;
        const j = jitter();
        switch (t) {
          case Tile.Grass:
            g.fillStyle(shade(0x55793c, j)).fillRect(px, py, TILE, TILE);
            break;
          case Tile.Farmland:
            g.fillStyle(shade(0xa8894c, j)).fillRect(px, py, TILE, TILE);
            g.fillStyle(0x8a6d3a, 0.8);
            g.fillRect(px + 4, py + 4, TILE - 8, 3);
            g.fillRect(px + 4, py + 14, TILE - 8, 3);
            g.fillRect(px + 4, py + 24, TILE - 8, 3);
            break;
          case Tile.Forest:
            g.fillStyle(shade(0x3f5c33, j)).fillRect(px, py, TILE, TILE);
            g.fillStyle(0x24401f);
            g.fillCircle(px + 9, py + 10, 6);
            g.fillCircle(px + 22, py + 20, 6);
            g.fillCircle(px + 20, py + 8, 5);
            break;
          case Tile.Mountain:
            g.fillStyle(shade(0x8a8578, j)).fillRect(px, py, TILE, TILE);
            g.fillStyle(0x6e695e);
            g.fillTriangle(px + 2, py + TILE - 2, px + 16, py + 6, px + TILE - 2, py + TILE - 2);
            g.fillStyle(0xcfcabf);
            g.fillTriangle(px + 12, py + 14, px + 16, py + 6, px + 20, py + 14);
            break;
          case Tile.River:
            g.fillStyle(shade(0x33608c, j)).fillRect(px, py, TILE, TILE);
            g.fillStyle(0x3f76a6, 0.9).fillRect(px, py + 6, TILE, 4).fillRect(px, py + 22, TILE, 4);
            break;
          case Tile.Road:
            g.fillStyle(shade(0xa7895f, j)).fillRect(px, py, TILE, TILE);
            g.fillStyle(0x93754c, 0.6).fillRect(px + 2, py + 14, TILE - 4, 4);
            break;
          case Tile.Bridge:
            g.fillStyle(0x33608c).fillRect(px, py, TILE, TILE);
            g.fillStyle(0x7a5c3a).fillRect(px, py + 4, TILE, TILE - 8);
            g.fillStyle(0x5e4630, 0.9).fillRect(px, py + 4, 3, TILE - 8).fillRect(px + TILE - 3, py + 4, 3, TILE - 8);
            break;
        }
      }
    }
    // deposits
    for (const d of deposits) {
      const px = d.tx * TILE;
      const py = d.ty * TILE;
      const colors: Record<string, number> = {
        stone: 0x9a9a94, iron: 0x7a4a3a, gold: 0xd8b13a, fish: 0x77c0c8, game: 0xa0562f,
      };
      const c = colors[d.kind];
      if (d.kind === 'fish') {
        g.fillStyle(c, 0.9).fillEllipse(px + 16, py + 16, 16, 8);
      } else {
        g.fillStyle(c).fillCircle(px + 10, py + 12, 5).fillCircle(px + 20, py + 18, 6).fillCircle(px + 14, py + 22, 4);
        g.fillStyle(0x000000, 0.2).fillCircle(px + 20, py + 18, 3);
      }
    }
    // forest wood density marker omitted (visual already varies)
    void woodAmount;
    rt.draw(g);
    g.destroy();
  }

  private buildFogLayers() {
    const { w, h } = this.world.map;
    this.fogBlack = this.add.renderTexture(0, 0, w * TILE, h * TILE).setOrigin(0).setDepth(8000);
    this.fogBlack.fill(0x000000, 1);
    this.fogGray = this.add.graphics().setDepth(7900);
    this.updateFog();
  }

  private updateFog() {
    const fog = this.world.players[this.playerId].fog;
    const { w, h } = this.world.map;
    // layer 1: permanently erase explored areas from black RT
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (fog.explored[i] === 1 && fog.visible[i] !== 2) {
          this.fogBlack.erase('fog-brush', x * TILE, y * TILE);
        }
      }
    // layer 2: dim explored-but-not-visible (redrawn; ponytail: cheap at 128²,
    // upgrade to RT-diff when map grows beyond 256²)
    this.fogGray.clear();
    this.fogGray.fillStyle(0x000000, 0.45);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (fog.explored[i] === 1 && fog.visible[i] !== 1) {
          this.fogGray.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
  }

  // ---------- input ----------
  private setupInput() {
    this.input.mouse?.disableContextMenu();
    this.keys = this.input.keyboard!.addKeys(
      'W,A,S,D,UP,DOWN,LEFT,RIGHT,Q,E,H,R',
    ) as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      if (p.middleButtonDown()) {
        this.middleDrag = { px: p.x, py: p.y };
        return;
      }
      if (p.rightButtonDown()) {
        this.issueMoveOrder(world);
        return;
      }
      if (p.leftButtonDown()) {
        const hit = this.pickUnit(world);
        if (hit) {
          const now = this.time.now;
          const dbl = now - this.lastClick.time < 400 && this.lastClick.id === hit.id;
          this.lastClick = { id: hit.id, time: now };
          if (dbl) this.selectSameTypeOnScreen(hit.type);
          else if (p.event.shiftKey) this.toggleSelected(hit.id);
          else this.setSelected([hit.id]);
        } else {
          this.dragStart = { x: world.x, y: world.y };
          this.dragging = true;
        }
      }
    });

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.middleDrag && p.middleButtonDown()) {
        const cam = this.cameras.main;
        cam.scrollX -= (p.x - this.middleDrag.px) / cam.zoom;
        cam.scrollY -= (p.y - this.middleDrag.py) / cam.zoom;
        this.middleDrag = { px: p.x, py: p.y };
      }
      if (this.dragging && p.leftButtonDown() && this.dragStart) {
        const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
        this.drawDragBox(this.dragStart, world);
      }
    });

    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.middleButtonDown()) this.middleDrag = null;
      if (this.dragging && this.dragStart) {
        const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
        this.finishDragBox(this.dragStart, world, p.event.shiftKey);
        this.dragStart = null;
        this.dragging = false;
        this.dragRect.clear();
      }
    });

    this.input.on('wheel', (_p: any, _o: any, _dx: number, dy: number) => {
      const cam = this.cameras.main;
      const factor = dy > 0 ? 0.9 : 1.1;
      const zoom = Phaser.Math.Clamp(cam.zoom * factor, 0.45, 2.6);
      const pointer = this.input.activePointer;
      const before = pointer.positionToCamera(cam) as Phaser.Math.Vector2;
      cam.setZoom(zoom);
      const after = pointer.positionToCamera(cam) as Phaser.Math.Vector2;
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.setSelected([]);
      if ((e.key === 's' || e.key === 'S') && this.selected.size) {
        this.world.enqueue({ type: 'stop', player: this.playerId, unitIds: [...this.selected] });
      }
      if ((e.key === 'h' || e.key === 'H') && this.selected.size) {
        this.world.enqueue({ type: 'hold', player: this.playerId, unitIds: [...this.selected] });
      }
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) {
        if (e.ctrlKey || e.metaKey) {
          this.groups.set(digit, [...this.selected]);
          e.preventDefault();
        } else if (this.groups.has(digit)) {
          const ids = this.groups.get(digit)!.filter((id) => this.world.units.has(id));
          if (ids.length) {
            this.setSelected(ids);
            const u = this.world.units.get(ids[0])!;
            this.cameras.main.centerOn(u.x, u.y);
          }
        }
      }
    });
  }

  private pickUnit(world: Phaser.Math.Vector2): UnitState | null {
    let best: UnitState | null = null;
    let bestD = 20 * 20;
    for (const u of this.world.units.values()) {
      const dx = u.x - world.x;
      const dy = u.y - world.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        best = u;
        bestD = d;
      }
    }
    return best;
  }

  private setSelected(ids: number[]) {
    this.selected = new Set(ids);
    for (const [id, v] of this.views) v.ring.visible = this.selected.has(id);
    useHud.getState().setSelection(ids);
  }

  private toggleSelected(id: number) {
    const next = [...this.selected];
    const i = next.indexOf(id);
    if (i >= 0) next.splice(i, 1);
    else next.push(id);
    this.setSelected(next);
  }

  private selectSameTypeOnScreen(type: string) {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const ids = [...this.world.units.values()]
      .filter((u) => u.type === type && view.contains(u.x, u.y))
      .map((u) => u.id);
    this.setSelected(ids);
  }

  private drawDragBox(a: { x: number; y: number }, b: { x: number; y: number }) {
    const cam = this.cameras.main;
    this.dragRect.clear();
    this.dragRect.lineStyle(1, 0x8fd08f, 0.9);
    const x0 = (Math.min(a.x, b.x) - cam.scrollX) * cam.zoom;
    const y0 = (Math.min(a.y, b.y) - cam.scrollY) * cam.zoom;
    const w = Math.abs(a.x - b.x) * cam.zoom;
    const h = Math.abs(a.y - b.y) * cam.zoom;
    this.dragRect.strokeRect(x0, y0, w, h);
    this.dragRect.fillStyle(0x8fd08f, 0.08).fillRect(x0, y0, w, h);
  }

  private finishDragBox(a: { x: number; y: number }, b: { x: number; y: number }, additive: boolean) {
    const r = new Phaser.Geom.Rectangle(
      Math.min(a.x, b.x),
      Math.min(a.y, b.y),
      Math.abs(a.x - b.x),
      Math.abs(a.y - b.y),
    );
    const ids = [...this.world.units.values()]
      .filter((u) => u.owner === this.playerId && r.contains(u.x, u.y))
      .map((u) => u.id);
    if (additive) this.setSelected([...new Set([...this.selected, ...ids])]);
    else this.setSelected(ids);
  }

  private issueMoveOrder(world: Phaser.Math.Vector2) {
    if (!this.selected.size) return;
    const tx = Math.floor(world.x / TILE);
    const ty = Math.floor(world.y / TILE);
    if (isBlocked(this.world.map, tx, ty)) return;
    this.world.enqueue({ type: 'move', player: this.playerId, unitIds: [...this.selected], tx, ty });
    // move marker
    const m = this.add.graphics().setDepth(5000);
    m.lineStyle(2, 0xd8b13a, 1);
    m.strokeCircle(world.x, world.y, 10);
    m.lineBetween(world.x - 14, world.y, world.x + 14, world.y);
    m.lineBetween(world.x, world.y - 14, world.x, world.y + 14);
    this.tweens.add({ targets: m, alpha: 0, scale: 1.6, duration: 500, onComplete: () => m.destroy() });
  }

  // ---------- frame ----------
  override update(_time: number, delta: number) {
    const speed = useHud.getState().speed;
    if (speed > 0) {
      this.simAcc += delta * speed;
      while (this.simAcc >= TICK_MS) {
        this.simAcc -= TICK_MS;
        this.snapPrevious();
        this.world.tick(TICK_MS);
      }
    }
    const alpha = speed > 0 ? this.simAcc / TICK_MS : 1;

    this.handleCamera(delta);
    this.syncViews(alpha);

    const fog = this.world.players[this.playerId].fog;
    if (fog.dirty) {
      fog.dirty = false;
      this.updateFog();
    }

    this.hudTimer += delta;
    if (this.hudTimer > 250) {
      this.hudTimer = 0;
      // drop dead ids from selection
      const alive = [...this.selected].filter((id) => this.world.units.has(id));
      if (alive.length !== this.selected.size) this.setSelected(alive);
    }
  }

  private snapPrevious() {
    for (const [id, v] of this.views) {
      const u = this.world.units.get(id);
      if (!u) continue;
      v.prevX = v.curX;
      v.prevY = v.curY;
      v.curX = u.x;
      v.curY = u.y;
    }
  }

  private syncViews(alpha: number) {
    const fog = this.world.players[this.playerId].fog;
    const { w } = this.world.map;
    const seen = new Set<number>();
    for (const u of this.world.units.values()) {
      const tx = Math.floor(u.x / TILE);
      const ty = Math.floor(u.y / TILE);
      const idx = ty * w + tx;
      const visibleToPlayer = u.owner === this.playerId ? fog.explored[idx] === 1 : fog.visible[idx] === 1;
      seen.add(u.id);
      let v = this.views.get(u.id);
      if (!v) {
        v = this.makeView(u);
        this.views.set(u.id, v);
      }
      v.container.visible = visibleToPlayer;
      if (!visibleToPlayer) continue;
      const x = v.prevX + (v.curX - v.prevX) * alpha;
      const y = v.prevY + (v.curY - v.prevY) * alpha;
      v.container.setPosition(x, y);
      v.container.setDepth(100 + y * 0.001);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        v.container.destroy();
        this.views.delete(id);
        if (this.selected.has(id)) this.setSelected([...this.selected].filter((s) => s !== id));
      }
    }
  }

  private makeView(u: UnitState): UnitView {
    const faction = FACTION_BY_ID[OWNER_FACTION[u.owner]];
    const ring = this.add.graphics();
    ring.lineStyle(2, 0xffffff, 0.9);
    ring.strokeEllipse(0, 8, 26, 10);
    ring.visible = this.selected.has(u.id);
    const body = this.add.image(0, -6, UNIT_TEXTURE[u.type] ?? 'unit-default');
    body.setTint(faction.color);
    const c = this.add.container(u.x, u.y, [ring, body]);
    c.setDepth(100 + u.y * 0.001);
    return { container: c, ring, prevX: u.x, prevY: u.y, curX: u.x, curY: u.y };
  }

  private handleCamera(delta: number) {
    const cam = this.cameras.main;
    const dt = delta / 1000;
    const speed = 700 / cam.zoom;
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    // edge scroll (disabled while middle-dragging)
    const p = this.input.activePointer;
    if (!this.middleDrag && p && this.input.manager.canvas) {
      const M = 20;
      if (p.x >= 0 && p.x < M) dx -= 1;
      if (p.x <= cam.width && p.x > cam.width - M) dx += 1;
      if (p.y >= 0 && p.y < M) dy -= 1;
      if (p.y <= cam.height && p.y > cam.height - M) dy += 1;
    }
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      cam.scrollX += (dx / len) * speed * dt;
      cam.scrollY += (dy / len) * speed * dt;
    }
    cam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, this.world.map.w * TILE - cam.width / cam.zoom);
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, this.world.map.h * TILE - cam.height / cam.zoom);
  }
}

function scatter(cx: number, cy: number, i: number): { tx: number; ty: number } {
  // small deterministic spiral around the start point
  let x = 0;
  let y = 0;
  let dx = 0;
  let dy = -1;
  for (let s = 0; s < i; s++) {
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) [dx, dy] = [-dy, dx];
    x += dx;
    y += dy;
  }
  return { tx: cx + x, ty: cy + y };
}

function shade(color: number, j: number): number {
  const r = Phaser.Display.Color.ValueToColor(color);
  const c = (v: number) => Phaser.Math.Clamp(v + j * 3, 0, 255);
  return Phaser.Display.Color.GetColor(c(r.red), c(r.green), c(r.blue));
}
