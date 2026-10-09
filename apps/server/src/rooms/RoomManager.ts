import type { RoomOptions } from '@pirate/game-core/protocol/messages';
import { newRoomCode } from '../ids';
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
    const room = new Room(id, options, this.options.awayGraceMs);
    this.rooms.set(id, room);
    return room;
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
  }
}
