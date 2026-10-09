import {
  parseName,
  parseOpaqueId,
  parsePlayerActions,
  parseRoomId,
  parseRoomOptions,
  parseTokenPatch,
} from '@pirate/game-core/protocol/validate';
import type { Ack } from '@pirate/game-core/protocol/messages';
import { Room, RoomError, type GameSocket, type Seat } from './rooms/Room';
import type { RoomManager } from './rooms/RoomManager';

/** More messages than this per second from one connection is abuse, not play. */
const MAX_MESSAGES_PER_SECOND = 120;

/** Runs `work` and answers the client's ack with its result or the refusal. */
function answer<T extends object>(
  ack: unknown,
  work: () => T,
): void {
  if (typeof ack !== 'function') {
    return;
  }
  const reply = ack as (result: Ack<T>) => void;
  try {
    reply({ ok: true, ...work() });
  } catch (error) {
    if (error instanceof RoomError) {
      reply({ ok: false, error: error.code, message: error.message });
    } else {
      console.error('Unexpected error handling a request:', error);
      reply({ ok: false, error: 'bad_request', message: 'Something went wrong.' });
    }
  }
}

function bad(message: string): never {
  throw new RoomError('bad_request', message);
}

/** Wires one socket to the rooms. Everything the client sends is validated here. */
export function handleConnection(socket: GameSocket, rooms: RoomManager): void {
  let binding: { room: Room; seat: Seat } | null = null;

  // Crude flood protection: a connection that spams is dropped.
  let windowStart = Date.now();
  let count = 0;
  socket.use((_packet, next) => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    if (count > MAX_MESSAGES_PER_SECOND) {
      socket.disconnect(true);
      return;
    }
    next();
  });

  const requireBinding = (): { room: Room; seat: Seat } => {
    if (!binding) {
      throw new RoomError('not_in_room', 'Join a room first.');
    }
    return binding;
  };

  const bind = (room: Room, seat: Seat) => {
    binding = { room, seat };
    return {
      roomId: room.id,
      seatId: seat.seatId,
      token: seat.token,
      lobby: room.lobbyState(),
    };
  };

  socket.on('room:create', (request, ack) => {
    answer(ack, () => {
      if (binding) bad('You are already in a room.');
      const name = parseName(request?.name) ?? bad('Enter a name.');
      const options = parseRoomOptions(request?.options) ?? bad('Those room options are not valid.');
      const room = rooms.create(options);
      try {
        return bind(room, room.join(name, socket));
      } catch (error) {
        room.close('The room could not be created.');
        throw error;
      }
    });
  });

  socket.on('room:join', (request, ack) => {
    answer(ack, () => {
      if (binding) bad('You are already in a room.');
      const roomId = parseRoomId(request?.roomId) ?? bad('That is not a room code.');
      const name = parseName(request?.name) ?? bad('Enter a name.');
      const room = rooms.get(roomId);
      if (!room) {
        throw new RoomError('room_not_found', 'No room has that code.');
      }
      return bind(room, room.join(name, socket));
    });
  });

  socket.on('room:rejoin', (request, ack) => {
    answer(ack, () => {
      if (binding) bad('You are already in a room.');
      const roomId = parseRoomId(request?.roomId) ?? bad('That is not a room code.');
      const seatId = parseOpaqueId(request?.seatId);
      const token = parseOpaqueId(request?.token);
      const room = rooms.get(roomId);
      if (!room) {
        throw new RoomError('room_not_found', 'That room no longer exists.');
      }
      const seat = seatId && token ? room.authenticate(seatId, token) : null;
      if (!seat) {
        throw new RoomError('bad_credentials', 'Could not restore your seat.');
      }
      const result = bind(room, seat);
      room.reconnect(seat, socket);
      return { ...result, lobby: room.lobbyState() };
    });
  });

  socket.on('room:configure', (options, ack) => {
    answer(ack, () => {
      const { room, seat } = requireBinding();
      const parsed =
        parseRoomOptions(options, room.options) ?? bad('Those room options are not valid.');
      room.configure(seat.seatId, parsed);
      return { lobby: room.lobbyState() };
    });
  });

  socket.on('room:start', (ack) => {
    answer(ack, () => {
      const { room, seat } = requireBinding();
      room.start(seat.seatId);
      return {};
    });
  });

  // Match messages carry no ack: a bad one is simply ignored (or answered with
  // `game:rejected` when it was well-formed but not allowed).
  const inMatch = (run: (room: Room, seat: Seat) => void) => {
    if (!binding) {
      return;
    }
    try {
      run(binding.room, binding.seat);
    } catch (error) {
      if (!(error instanceof RoomError)) {
        console.error('Unexpected error handling a game message:', error);
      }
    }
  };

  socket.on('game:draft', (raw) => {
    const plan = parsePlayerActions(raw);
    if (plan) inMatch((room, seat) => room.draft(seat.seatId, plan));
  });

  socket.on('game:lockIn', (raw) => {
    const plan = parsePlayerActions(raw);
    if (plan) inMatch((room, seat) => room.lockIn(seat.seatId, plan));
  });

  socket.on('game:tokens', (raw) => {
    const patch = parseTokenPatch(raw);
    if (patch) inMatch((room, seat) => room.tokens(seat.seatId, patch));
  });

  socket.on('game:ack', () => {
    inMatch((room, seat) => room.acknowledge(seat.seatId));
  });

  socket.on('disconnect', () => {
    if (binding) {
      binding.room.disconnect(binding.seat.seatId, socket);
      binding = null;
    }
  });
}
