// Client netcode session: one WebSocket per lobby/game. WorldScene attaches
// itself to receive stamped commands; all local input goes through sendCmd
// and is applied only when the server echoes it back (authoritative order).
import type { Command, SerializedWorld } from '@cr/core';
import type { ClientMessage, LobbyPlayer, ServerMessage } from '@cr/shared';
import type { WorldScene } from './scenes/WorldScene';

const WS_URL = ((import.meta as { env?: Record<string, string> }).env?.VITE_WS_URL) ?? `ws://${location.hostname}:4000/ws`;

export class NetSession {
  ws: WebSocket | null = null;
  room = '';
  name = '';
  you = -1; // lobby seat
  players: LobbyPlayer[] = [];
  seed = 0;
  ai = 0;
  // populated on 'start'
  slot = -1; // world player index
  factions: string[] = [];
  humanSlots: number[] = [];
  pendingSnapshot: SerializedWorld | null = null;

  private scene: WorldScene | null = null;
  onLobby: (() => void) | null = null;
  onStart: (() => void) | null = null;
  onReject: ((reason: string) => void) | null = null;
  onPeer: ((slot: number, online: boolean) => void) | null = null;

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private open(): Promise<void> {
    if (this.connected) return Promise.resolve();
    this.ws = new WebSocket(WS_URL);
    this.ws.onmessage = (ev) => this.handle(JSON.parse(ev.data as string) as ServerMessage);
    this.ws.onclose = () => this.scene?.onNetClose();
    return new Promise((resolve, reject) => {
      this.ws!.onopen = () => resolve();
      this.ws!.onerror = () => reject(new Error('server unreachable'));
    });
  }

  private send(m: ClientMessage) {
    if (this.connected) this.ws!.send(JSON.stringify(m));
  }

  async create(room: string, name: string, seed: number, ai: number) {
    await this.open();
    this.room = room;
    this.name = name;
    this.send({ t: 'create', room, name, seed, ai });
  }

  async join(room: string, name: string) {
    await this.open();
    this.room = room;
    this.name = name;
    this.send({ t: 'join', room, name });
  }

  setFaction(faction: LobbyPlayer['faction']) {
    this.send({ t: 'faction', faction });
  }

  setReady(ready: boolean) {
    this.send({ t: 'ready', ready });
  }

  requestStart() {
    this.send({ t: 'start' });
  }

  sendCmd(cmd: Command) {
    this.send({ t: 'cmd', cmd });
  }

  attachScene(scene: WorldScene | null) {
    this.scene = scene;
  }

  leave() {
    this.ws?.close();
    this.ws = null;
    this.scene = null;
    this.onLobby = this.onStart = this.onReject = this.onPeer = null;
    this.slot = -1;
    this.pendingSnapshot = null;
  }

  private handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'lobby':
        this.you = msg.you;
        this.players = msg.players;
        this.seed = msg.seed;
        this.ai = msg.ai;
        this.onLobby?.();
        break;
      case 'start':
        this.slot = msg.slot;
        this.factions = msg.factions;
        this.humanSlots = msg.humanSlots;
        this.pendingSnapshot = msg.snapshot;
        this.onStart?.();
        break;
      case 'cmd':
        this.scene?.applyNetCmd(msg.at, msg.cmd);
        break;
      case 'snapshot':
        this.scene?.applySnapshot(msg.blob);
        break;
      case 'peer':
        this.onPeer?.(msg.slot, msg.online);
        break;
      case 'reject':
        this.onReject?.(msg.reason);
        break;
      case 'pong':
        break;
    }
  }
}

export const net = new NetSession();
