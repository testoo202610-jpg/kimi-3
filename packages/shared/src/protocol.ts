// Client<->server protocol types (WebSocket lands in Phase 8).
// Defined now so client/server share one contract from day one.

import type { FactionId } from './factions';

export type ClientMessage =
  | { t: 'hello'; name: string }
  | { t: 'create_room'; map: string }
  | { t: 'join_room'; roomId: string }
  | { t: 'ready'; ready: boolean; faction: FactionId }
  | { t: 'cmd'; seq: number; payload: unknown } // payload validated server-side
  | { t: 'ping'; ts: number };

export type ServerMessage =
  | { t: 'room'; roomId: string; players: { name: string; ready: boolean; faction: FactionId }[] }
  | { t: 'start'; seed: number; tickRate: number }
  | { t: 'snapshot'; tick: number; blob: string } // serialized world
  | { t: 'cmd_reject'; seq: number; reason: string }
  | { t: 'pong'; ts: number };

export const PROTOCOL_VERSION = 1;
