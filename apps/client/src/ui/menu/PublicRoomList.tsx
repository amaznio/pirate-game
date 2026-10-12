import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { PublicRoomSummary } from '@pirate/game-core/protocol/messages';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CardTitle } from '@/kit/Field';
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
    <Card>
      <CardTitle>{t('publicRooms.title')}</CardTitle>
      {loading && <p className="text-sm text-muted-foreground">{t('publicRooms.loading')}</p>}

      {!loading && rooms.length === 0 && !failed && (
        <p className="text-sm text-muted-foreground">{t('publicRooms.empty')}</p>
      )}

      {failed && <p className="text-sm text-muted-foreground">{t('publicRooms.loadFailed')}</p>}

      {rooms.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t('publicRooms.title')}>
          {rooms.map((room) => (
            <li
              key={room.code}
              className="flex items-center gap-3 rounded-btn bg-background/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-base font-bold">{room.hostName}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
                    {room.players}/{room.maxPlayers}
                  </span>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {describe(t, room).join(' · ')}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!canJoin}
                onClick={() => onJoin(room.code)}
                aria-label={t('publicRooms.joinNamed', { name: room.hostName })}
              >
                {t('publicRooms.join')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="link" size="sm" onClick={refresh} className="self-start px-0">
        {t('publicRooms.refresh')}
      </Button>
    </Card>
  );
}
