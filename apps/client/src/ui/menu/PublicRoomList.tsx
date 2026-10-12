import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
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

function describe(t: TFunction, room: PublicRoomSummary): string[] {
  return [
    room.ais === 0
      ? t('publicRooms.noAi')
      : t('publicRooms.aiCount', { count: room.ais, level: aiLevelLabel(t, room.aiDifficulty) }),
    room.teamMode === 'teams' ? t('common.teamTwoTeams') : t('common.teamFfa'),
    room.turnDurationSeconds === null
      ? t('publicRooms.noTimer')
      : t('publicRooms.turnSeconds', { seconds: room.turnDurationSeconds }),
  ];
}

/** Rooms anyone can join, refreshed every few seconds. */
export function PublicRoomList({ serverUrl, canJoin, onJoin }: PublicRoomListProps) {
  const { t } = useTranslation();
  const { rooms, loading, failed, refresh } = usePublicRooms(serverUrl);

  return (
    <Card title={t('publicRooms.title')}>
      {loading && <p className="text-sm text-parchment/60">{t('publicRooms.loading')}</p>}

      {!loading && rooms.length === 0 && !failed && (
        <p className="text-sm text-parchment/60">{t('publicRooms.empty')}</p>
      )}

      {failed && <p className="text-sm text-parchment/60">{t('publicRooms.loadFailed')}</p>}

      {rooms.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('publicRooms.title')}>
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
                  {describe(t, room).join(' · ')}
                </p>
              </div>
              <SecondaryButton
                disabled={!canJoin}
                onClick={() => onJoin(room.code)}
                aria-label={t('publicRooms.joinNamed', { name: room.hostName })}
              >
                {t('publicRooms.join')}
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
        {t('publicRooms.refresh')}
      </button>
    </Card>
  );
}
