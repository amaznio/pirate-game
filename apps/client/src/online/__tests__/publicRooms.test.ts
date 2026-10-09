import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicRooms } from '../publicRooms';

afterEach(() => {
  vi.useRealTimers();
});

const room = {
  code: 'ABCDE',
  hostName: 'Anne',
  players: 1,
  maxPlayers: 8,
  ais: 1,
  aiDifficulty: 'normal',
  teamMode: 'ffa',
  turnDurationSeconds: 30,
};

const respond = (body: unknown, init: ResponseInit = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), init)) as unknown as typeof fetch;

describe('fetchPublicRooms', () => {
  it('asks the server for /rooms', async () => {
    const fetchImpl = respond({ rooms: [] });

    await fetchPublicRooms('https://game.example.com/', { fetchImpl });

    const [url] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://game.example.com/rooms');
  });

  it('returns the rooms the server listed', async () => {
    const rooms = await fetchPublicRooms('http://localhost:3001', {
      fetchImpl: respond({ rooms: [room] }),
    });

    expect(rooms).toEqual([room]);
  });

  it('leaves out anything malformed instead of showing it', async () => {
    const rooms = await fetchPublicRooms('http://localhost:3001', {
      fetchImpl: respond({ rooms: [room, { ...room, code: '<script>' }, { nonsense: true }] }),
    });

    expect(rooms).toEqual([room]);
  });

  it('is empty when the reply is not a room list at all', async () => {
    const rooms = await fetchPublicRooms('http://localhost:3001', {
      fetchImpl: respond('hello'),
    });

    expect(rooms).toEqual([]);
  });

  it('fails when the server answers with an error', async () => {
    await expect(
      fetchPublicRooms('http://localhost:3001', {
        fetchImpl: respond({ rooms: [] }, { status: 502 }),
      }),
    ).rejects.toThrow(/502/);
  });

  it('fails when the server cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(
      fetchPublicRooms('http://localhost:3001', { fetchImpl }),
    ).rejects.toThrow(/Failed to fetch/);
  });

  it('gives up when the server never answers', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;

    const result = fetchPublicRooms('http://localhost:3001', { fetchImpl, timeoutMs: 1000 });
    const assertion = expect(result).rejects.toThrow(/aborted/);
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
  });
});
