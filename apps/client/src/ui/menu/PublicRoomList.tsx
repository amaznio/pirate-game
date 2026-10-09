import type { PublicRoomSummary } from '@pirate/game-core/protocol/messages';
import { Card, SecondaryButton } from './MenuLayout';
import { aiLevelLabel } from './aiLevels';
import { usePublicRooms } from './usePublicRooms';

interface PublicRoomListProps {
  serverUrl: string;
  /** Joining needs a name (and no other join under way). */
  canJoin: boolean;
  onJoin: (code: string) => void;
}

function describe(room: PublicRoomSummary): string[] {
  return [
    room.ais === 0
      ? 'No AI'
      : `${room.ais} AI (${aiLevelLabel(room.aiDifficulty)})`,
    room.teamMode === 'teams' ? 'Two teams' : 'Free for all',
    room.turnDurationSeconds === null ? 'No timer' : `${room.turnDurationSeconds}s turns`,
  ];
}

/** Rooms anyone can join, refreshed every few seconds. */
export function PublicRoomList({ serverUrl, canJoin, onJoin }: PublicRoomListProps) {
  const { rooms, loading, error, refresh } = usePublicRooms(serverUrl);

  return (
    <Card title="Public rooms">
      {loading && <p className="text-sm text-parchment/60">Looking for rooms…</p>}

      {!loading && rooms.length === 0 && !error && (
        <p className="text-sm text-parchment/60">
          No public rooms right now. Create one and make it public!
        </p>
      )}

      {error && <p className="text-sm text-parchment/60">{error}</p>}

      {rooms.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Public rooms">
          {rooms.map((room) => (
            <li
              key={room.code}
              className="flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-bold text-parchment">
                    {room.hostName}
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-parchment/60">
                    {room.players}/{room.maxPlayers}
                  </span>
                </div>
                <p className="truncate text-xs text-parchment/60">
                  {describe(room).join(' · ')}
                </p>
              </div>
              <SecondaryButton
                disabled={!canJoin}
                onClick={() => onJoin(room.code)}
                aria-label={`Join ${room.hostName}'s room`}
              >
                Join
              </SecondaryButton>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={refresh}
        className="self-start text-xs font-semibold text-parchment/60 underline-offset-2 hover:text-parchment hover:underline"
      >
        Refresh
      </button>
    </Card>
  );
}
