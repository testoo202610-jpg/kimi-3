// Thin WebSocket adapter over Rooms (rooms.ts holds all match logic).
import type { FastifyInstance } from 'fastify';
import websocketPlugin from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { TICK_MS } from '@cr/core';
import { isCommandLike, type ClientMessage, type ServerMessage } from '@cr/shared';
import { Room, Rooms, SNAPSHOT_EVERY } from './rooms.js';

interface Ctx {
  room: Room;
  seat: number;
}

export async function registerNet(app: FastifyInstance) {
  await app.register(websocketPlugin);
  const rooms = new Rooms();
  const sockets = new Map<WebSocket, Ctx>();
  const timers = new Map<string, NodeJS.Timeout>();

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const roomSockets = (room: Room) => [...sockets.entries()].filter(([, c]) => c.room === room);
  const broadcast = (room: Room, msg: ServerMessage) => {
    for (const [ws] of roomSockets(room)) send(ws, msg);
  };
  const pushLobby = (room: Room) => {
    for (const [ws, c] of roomSockets(room)) {
      send(ws, { t: 'lobby', room: room.id, you: c.seat, players: room.lobby(), seed: room.seed, ai: room.ai });
    }
  };

  const startSim = (room: Room) => {
    if (timers.has(room.id)) return;
    timers.set(
      room.id,
      setInterval(() => {
        room.step();
        if (room.world && room.world.tickCount % SNAPSHOT_EVERY === 0) {
          const { tick, blob } = room.snapshot();
          broadcast(room, { t: 'snapshot', tick, blob });
        }
      }, TICK_MS),
    );
  };

  app.get('/ws', { websocket: true }, (socket) => {
    socket.on('message', (raw: Buffer | string) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        send(socket, { t: 'reject', reason: 'bad json' });
        return;
      }
      const ctx = sockets.get(socket);

      switch (msg.t) {
        case 'create': {
          if (ctx) break;
          const room = rooms.create(msg.room, msg.seed >>> 0, msg.ai);
          if (!room) return send(socket, { t: 'reject', reason: 'room exists' });
          const seat = room.join(msg.name);
          sockets.set(socket, { room, seat });
          pushLobby(room);
          break;
        }
        case 'join': {
          if (ctx) break;
          const room = rooms.get(msg.room);
          if (!room) return send(socket, { t: 'reject', reason: 'no such room' });
          const seat = room.join(msg.name);
          if (seat < 0) return send(socket, { t: 'reject', reason: 'room full' });
          sockets.set(socket, { room, seat });
          if (room.world) {
            // reconnect mid-game: catch the player up with a fresh snapshot
            send(socket, {
              t: 'start',
              seed: room.seed,
              factions: room.factions(),
              humanSlots: room.humanSlots(),
              slot: seat,
              tick: room.world.tickCount,
              snapshot: room.snapshot().blob,
            });
            broadcast(room, { t: 'peer', slot: seat, online: true });
          } else {
            pushLobby(room);
          }
          break;
        }
        case 'faction':
          if (ctx) {
            ctx.room.setFaction(ctx.seat, msg.faction);
            pushLobby(ctx.room);
          }
          break;
        case 'ready':
          if (ctx) {
            ctx.room.setReady(ctx.seat, msg.ready);
            pushLobby(ctx.room);
          }
          break;
        case 'start': {
          if (!ctx || !ctx.room.canStart(ctx.seat)) return send(socket, { t: 'reject', reason: 'cannot start' });
          ctx.room.start();
          for (const [ws, c] of roomSockets(ctx.room)) {
            send(ws, {
              t: 'start',
              seed: ctx.room.seed,
              factions: ctx.room.factions(),
              humanSlots: ctx.room.humanSlots(),
              slot: c.seat,
              tick: 0,
              snapshot: null,
            });
          }
          startSim(ctx.room);
          break;
        }
        case 'cmd': {
          if (!ctx || !isCommandLike(msg.cmd)) return send(socket, { t: 'reject', reason: 'bad command' });
          const at = ctx.room.stamp(ctx.seat, msg.cmd);
          if (at == null) return send(socket, { t: 'reject', reason: 'not in a running game' });
          broadcast(ctx.room, { t: 'cmd', at, cmd: msg.cmd });
          break;
        }
        case 'ping':
          send(socket, { t: 'pong', ts: msg.ts });
          break;
      }
    });

    socket.on('close', () => {
      const ctx = sockets.get(socket);
      sockets.delete(socket);
      if (!ctx) return;
      ctx.room.leave(ctx.seat);
      if (ctx.room.world) broadcast(ctx.room, { t: 'peer', slot: ctx.seat, online: false });
      rooms.sweep();
    });
  });
}
