// Room/lobby + authoritative match state. Pure logic — no socket code here,
// so vitest can drive it directly (net.ts is a thin adapter over this).
import { spawnStartingForces, TICK_MS, World, type Command, type SerializedWorld } from '@cr/core';
import { FACTIONS, MAX_PLAYERS, type FactionId, type LobbyPlayer } from '@cr/shared';

/** ticks of input-latency buffer between stamp and application (lockstep) */
export const CMD_DELAY = 3;
/** broadcast a full snapshot this often (reconnect anchor + drift guard) */
export const SNAPSHOT_EVERY = 100;

interface Seat {
  name: string;
  faction: FactionId;
  ready: boolean;
  online: boolean;
}

export class Room {
  readonly seats: (Seat | null)[] = new Array(MAX_PLAYERS).fill(null);
  world: World | null = null;
  /** AI opponents appended after the human slots */
  ai: number;

  constructor(
    public readonly id: string,
    public readonly seed: number,
    ai = 0,
  ) {
    this.ai = Math.max(0, Math.min(MAX_PLAYERS - 1, ai));
  }

  get humans(): number {
    return this.seats.filter((s): s is Seat => s !== null).length;
  }

  /** Join the lobby, or reclaim a seat by name (reconnect). -1 = refused. */
  join(name: string): number {
    const existing = this.seats.findIndex((s) => s?.name === name);
    if (existing >= 0) {
      this.seats[existing]!.online = true;
      return existing;
    }
    if (this.world) return -1; // mid-game: rejoin by name only
    const free = this.seats.findIndex((s) => s === null);
    if (free < 0) return -1;
    const used = new Set(this.seats.filter((s): s is Seat => s !== null).map((s) => s.faction));
    const faction = (FACTIONS.map((f) => f.id).find((id) => !used.has(id)) ?? FACTIONS[0].id) as FactionId;
    this.seats[free] = { name, faction, ready: false, online: true };
    return free;
  }

  /** Disconnect. Lobby seat is freed; running-game seat stays for reconnect. */
  leave(seat: number) {
    if (!this.seats[seat]) return;
    if (this.world) this.seats[seat]!.online = false;
    else this.seats[seat] = null;
  }

  setFaction(seat: number, faction: FactionId) {
    if (!this.world && this.seats[seat]) this.seats[seat]!.faction = faction;
  }

  setReady(seat: number, ready: boolean) {
    if (this.seats[seat]) this.seats[seat]!.ready = ready;
  }

  /** All human slots after compaction: [0..humans). AI slots come after. */
  humanSlots(): number[] {
    return Array.from({ length: this.humans }, (_, i) => i);
  }

  factions(): string[] {
    const humanFactions = this.seats.filter((s): s is Seat => s !== null).map((s) => s.faction);
    const used = new Set<string>(humanFactions);
    const aiFactions = FACTIONS.map((f) => f.id).filter((id) => !used.has(id)).slice(0, this.ai);
    return [...humanFactions, ...aiFactions];
  }

  canStart(seat: number): boolean {
    if (this.world || seat !== 0) return false;
    const humans = this.seats.filter((s): s is Seat => s !== null);
    return humans.length >= 1 && humans.every((s) => s.ready) && humans.length + this.ai >= 2;
  }

  lobby(): LobbyPlayer[] {
    return this.seats.flatMap((s, i) =>
      s ? [{ slot: i, name: s.name, faction: s.faction, ready: s.ready, online: s.online }] : [],
    );
  }

  /** Build the authoritative world. Compacts seats so seat index == player slot. */
  start(): World {
    const compact = this.seats.filter((s): s is Seat => s !== null);
    this.seats.fill(null);
    compact.forEach((s, i) => (this.seats[i] = s));
    const factions = this.factions();
    const w = new World(this.seed | 1, factions);
    spawnStartingForces(w, factions, new Set(this.humanSlots()));
    for (let i = compact.length; i < factions.length; i++) w.ai.add(i, 'normal');
    this.world = w;
    return w;
  }

  /** Validate + stamp + schedule a command in the authoritative sim. */
  stamp(seat: number, cmd: Command): number | null {
    if (!this.world || !this.seats[seat]) return null;
    cmd.player = seat; // never trust the client's claimed player
    const at = this.world.tickCount + CMD_DELAY;
    this.world.enqueueAt(cmd, at);
    return at;
  }

  step() {
    this.world?.tick(TICK_MS);
  }

  snapshot(): { tick: number; blob: SerializedWorld } {
    return { tick: this.world!.tickCount, blob: this.world!.serialize() };
  }
}

export class Rooms {
  private rooms = new Map<string, Room>();

  create(id: string, seed: number, ai: number): Room | null {
    if (this.rooms.has(id)) return null;
    const room = new Room(id, seed, ai);
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  /** Drop lobbies with nobody left. Running games stay alive for reconnects.
   *  ponytail: running games with all players offline live until process
   *  restart. Upgrade path: idle timeout + save-to-DB teardown. */
  sweep() {
    for (const [id, room] of this.rooms) {
      if (!room.world && room.seats.every((s) => s === null || !s.online)) this.rooms.delete(id);
    }
  }

  get size() {
    return this.rooms.size;
  }
}
