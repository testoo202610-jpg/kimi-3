// Client<->server WebSocket protocol (phase 8 multiplayer).
// One contract for both sides; payloads are plain JSON.
//
// Model: server-authoritative lockstep. The server runs the reference sim,
// stamps every accepted command with an absolute tick (now + delay) and
// broadcasts it; all peers apply commands at the same tick over the same
// seeded, deterministic world. Snapshots exist for reconnect/late sync.
//
// ponytail: a late-arriving command is applied immediately instead of
// rewinding sim state. Upgrade path: client-side command buffer blocking or
// state rollback if divergence shows up in practice.

import type { Command, SerializedWorld } from '@cr/core';
import type { FactionId } from './factions';

export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 4;

export interface LobbyPlayer {
  slot: number;
  name: string;
  faction: FactionId;
  ready: boolean;
  online: boolean;
}

export type ClientMessage =
  | { t: 'create'; room: string; name: string; seed: number; ai: number }
  | { t: 'join'; room: string; name: string } // rejoin with same name = reconnect
  | { t: 'faction'; faction: FactionId }
  | { t: 'ready'; ready: boolean }
  | { t: 'start' } // host (slot 0) only
  | { t: 'cmd'; cmd: Command }
  | { t: 'ping'; ts: number };

export type ServerMessage =
  | { t: 'lobby'; room: string; you: number; players: LobbyPlayer[]; seed: number; ai: number }
  | {
      t: 'start';
      seed: number;
      factions: string[];
      humanSlots: number[];
      slot: number; // your player slot
      tick: number;
      snapshot: SerializedWorld | null; // null for a fresh game, blob on rejoin
    }
  | { t: 'cmd'; at: number; cmd: Command }
  | { t: 'snapshot'; tick: number; blob: SerializedWorld }
  | { t: 'peer'; slot: number; online: boolean } // player connect/disconnect notice
  | { t: 'reject'; reason: string }
  | { t: 'pong'; ts: number };

const COMMAND_TYPES = new Set([
  'move', 'attackMove', 'stop', 'hold', 'gather', 'build', 'resumeBuild',
  'train', 'attack', 'formation', 'researchEra', 'assignArmy', 'ability', 'setRelation',
]);

/** Cheap structural validation before a command enters the authoritative sim. */
export function isCommandLike(v: unknown): v is Command {
  if (typeof v !== 'object' || v === null) return false;
  const t = (v as { type?: unknown }).type;
  return typeof t === 'string' && COMMAND_TYPES.has(t);
}
