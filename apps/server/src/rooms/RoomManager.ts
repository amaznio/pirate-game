import type {
  PublicRoomSummary,
  RoomOptions,
} from '@pirate/game-core/protocol/messages';
import { newRoomCode, newRoomKey } from '../ids';
import { Room, RoomError } from './Room';

export interface RoomManagerOptions {
  readonly maxRooms: number;
  readonly idleRoomMs: number;
  /** Passed to every room: how long a player may be away before an AI steps in. */
  readonly awayGraceMs: number;
}

/** Owns every room: creates them, finds them, and sweeps away dead ones. */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  /** The same rooms by their private key. */
  private readonly keys = new Map<string, Room>();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: RoomManagerOptions) {}

  get size(): number {
    return this.rooms.size;
  }

  create(options: Partial<RoomOptions>): Room {
    if (this.rooms.size >= this.options.maxRooms) {
      throw new RoomError('server_busy', 'The server is full. Try again in a moment.');
    }
    let id = newRoomCode();
    while (this.rooms.has(id)) {
      id = newRoomCode();
    }
    let key = newRoomKey();
    while (this.keys.has(key)) {
      key = newRoomKey();
    }
    const room = new Room(id, key, options, this.options.awayGraceMs);
    this.rooms.set(id, room);
    this.keys.set(key, room);
    return room;
  }

  /**
   * The room a player means by what they typed. A key opens its room whatever
   * its visibility; a short code only opens a public room. A private room's
   * code is therefore not enough, and looks exactly like a room that does not
   * exist.
   */
  findForJoin(code: string): Room | undefined {
    const byKey = this.keys.get(code);
    if (byKey) {
      return byKey;
    }
    const byCode = this.rooms.get(code);
    return byCode?.options.visibility === 'public' ? byCode : undefined;
  }

  /** The public rooms that can still be joined, newest first. */
  publicRooms(limit = 50): PublicRoomSummary[] {
    const open: Array<{ room: Room; summary: PublicRoomSummary }> = [];
    for (const room of this.rooms.values()) {
      const summary = room.publicSummary();
      if (summary) {
        open.push({ room, summary });
      }
    }
    return open
      .sort((a, b) => b.room.createdAt - a.room.createdAt)
      .slice(0, limit)
      .map((entry) => entry.summary);
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  /**
   * Drops rooms nobody is in any more: right away once a match is over, and
   * after `idleRoomMs` otherwise (so a dropped connection can still come back).
   */
  sweep(now: number = Date.now()): number {
    let removed = 0;
    for (const [id, room] of this.rooms) {
      if (room.connectedCount() > 0) {
        continue;
      }
      const abandoned = now - room.lastActivity > this.options.idleRoomMs;
      if (room.status === 'finished' || room.seatCount() === 0 || abandoned) {
        room.close('The room was closed.');
        this.rooms.delete(id);
        this.keys.delete(room.key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Starts the periodic sweep. The timer never keeps the process alive. */
  startSweeping(everyMs = 30_000): void {
    this.sweeper ??= setInterval(() => this.sweep(), everyMs);
    this.sweeper.unref();
  }

  closeAll(reason: string): void {
    if (this.sweeper) {
      clearInterval(this.sweeper);
      this.sweeper = null;
    }
    for (const room of this.rooms.values()) {
      room.close(reason);
    }
    this.rooms.clear();
    this.keys.clear();
  }
}
