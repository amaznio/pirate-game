import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_ROOM_OPTIONS,
  ROOM_LIMITS,
  type LobbyState,
  type RoomOptions,
} from '@pirate/game-core/protocol/messages';
import {
  Card,
  MenuLayout,
  Notice,
  PrimaryButton,
  SecondaryButton,
  Segmented,
  Stepper,
} from './MenuLayout';
import { AI_LEVELS, aiLevelBlurb, aiLevelLabel } from './aiLevels';
import { MAP_STYLE_CHOICES, mapStyleBlurb, mapStyleLabel } from './mapStyles';
import { SHIP_CHOICES, shipBlurb, shipLabel } from './shipClasses';
import { VISIBILITY_CHOICES, shareCodeLabel, visibilityBlurb, visibilityLabel } from './visibility';
import { onlineSession, useOnlineSession } from '../../app/onlineSession';
import { DEFAULT_SHIP_TYPE_ID } from '@pirate/game-core/config/shipTypes';
import { humanMessage } from '../../i18n/humanMessage';

const TIMER_SECONDS: readonly (number | null)[] = [null, 20, 30, 45, 60, 90];

/** A room that has not started yet: who is here, the options, and Start. */
export function LobbyScreen({ lobby }: { lobby: LobbyState }) {
  const { t } = useTranslation();
  const session = useOnlineSession();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const me = lobby.seats.find((seat) => seat.seatId === session.seatId);
  const isHost = me?.isHost ?? false;
  const options: RoomOptions = lobby.options ?? DEFAULT_ROOM_OPTIONS;
  const here = lobby.seats.filter((seat) => seat.connected).length;
  const ships = here + options.ais;
  const maxAis = Math.max(0, ROOM_LIMITS.maxShips - lobby.seats.length);
  const messageText = humanMessage(t, session.message);

  const link = `${window.location.origin}${window.location.pathname}?room=${lobby.shareCode}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // No clipboard access: the code is on screen to read out instead.
    }
  }

  async function start() {
    setStarting(true);
    try {
      await onlineSession?.start();
    } finally {
      setStarting(false);
    }
  }

  const set = (patch: Partial<RoomOptions>) => void onlineSession?.configure(patch);

  return (
    <MenuLayout>
      <Card title={shareCodeLabel(t, options.visibility)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span
            className={`select-all font-black text-parchment ${
              lobby.shareCode.length > 6
                ? 'text-3xl tracking-[0.18em]'
                : 'text-4xl tracking-[0.3em]'
            }`}
            aria-label={`${shareCodeLabel(t, options.visibility)} ${lobby.shareCode
              .split('')
              .join(' ')}`}
          >
            {lobby.shareCode}
          </span>
          <SecondaryButton onClick={copyLink}>
            {copied ? t('lobby.copied') : t('lobby.copyLink')}
          </SecondaryButton>
        </div>
        <p className="text-xs text-parchment/50">
          {options.visibility === 'public'
            ? t('lobby.publicDescription')
            : t('lobby.privateDescription')}
        </p>
      </Card>

      <Card title={t('lobby.players', { count: lobby.seats.length })}>
        <ul className="flex flex-col gap-1.5">
          {lobby.seats.map((seat) => (
            <li
              key={seat.seatId}
              className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2"
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  seat.connected ? 'bg-token-forward' : 'bg-parchment/30'
                }`}
                title={seat.connected ? t('lobby.here') : t('lobby.awayTitle')}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-parchment">
                {seat.name}
                {seat.seatId === session.seatId && (
                  <span className="ml-1.5 font-semibold text-parchment/50">{t('lobby.you')}</span>
                )}
              </span>
              <span className="text-xs font-semibold text-parchment/60">
                {shipLabel(t, seat.shipTypeId)}
              </span>
              {seat.isHost && (
                <span className="rounded-full bg-parchment/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-parchment">
                  {t('lobby.host')}
                </span>
              )}
              {!seat.connected && (
                <span className="text-xs font-semibold text-parchment/50">{t('lobby.away')}</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('lobby.yourShip')}>
        <Segmented
          value={me?.shipTypeId ?? DEFAULT_SHIP_TYPE_ID}
          disabled={false}
          onChange={(shipTypeId) => void onlineSession?.chooseShip(shipTypeId)}
          choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
        />
        <p className="text-xs text-parchment/50">
          {shipBlurb(t, me?.shipTypeId ?? DEFAULT_SHIP_TYPE_ID)}
        </p>
      </Card>

      <Card title={isHost ? t('lobby.matchOptions') : t('lobby.matchOptionsHost')}>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('lobby.whoCanJoin')}</span>
          <Segmented
            value={options.visibility}
            disabled={!isHost}
            onChange={(visibility) => set({ visibility })}
            choices={VISIBILITY_CHOICES.map((value) => ({
              label: visibilityLabel(t, value),
              value,
            }))}
          />
          <p className="text-xs text-parchment/50">{visibilityBlurb(t, options.visibility)}</p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-parchment">{t('lobby.aiOpponents')}</span>
          <Stepper
            label={t('lobby.aiOpponents')}
            value={options.ais}
            min={0}
            max={maxAis}
            disabled={!isHost}
            onChange={(ais) => set({ ais })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('lobby.aiSkill')}</span>
          <Segmented
            value={options.aiDifficulty}
            disabled={!isHost}
            onChange={(aiDifficulty) => set({ aiDifficulty })}
            choices={AI_LEVELS.map((level) => ({ label: aiLevelLabel(t, level), value: level }))}
          />
          <p className="text-xs text-parchment/50">{aiLevelBlurb(t, options.aiDifficulty)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('lobby.aiShips')}</span>
          <Segmented
            value={options.aiShipTypeId}
            disabled={!isHost}
            onChange={(aiShipTypeId) => set({ aiShipTypeId })}
            choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
          />
          <p className="text-xs text-parchment/50">{t('common.biggerShipStronger')}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('lobby.seas')}</span>
          <Segmented
            value={options.mapStyle}
            disabled={!isHost}
            onChange={(mapStyle) => set({ mapStyle })}
            choices={MAP_STYLE_CHOICES.map((style) => ({
              label: mapStyleLabel(t, style),
              value: style,
            }))}
          />
          <p className="text-xs text-parchment/50">{mapStyleBlurb(t, options.mapStyle)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('common.loot')}</span>
          <Segmented
            value={options.loot ? 'on' : 'off'}
            disabled={!isHost}
            onChange={(value) => set({ loot: value === 'on' })}
            choices={[
              { label: t('common.lootOff'), value: 'off' as const },
              { label: t('common.lootOn'), value: 'on' as const },
            ]}
          />
          <p className="text-xs text-parchment/50">{t('common.lootBlurb')}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('lobby.teams')}</span>
          <Segmented
            value={options.teamMode}
            disabled={!isHost}
            onChange={(teamMode) => set({ teamMode })}
            choices={[
              { label: t('common.teamFfa'), value: 'ffa' as const },
              { label: t('common.teamTwoTeams'), value: 'teams' as const },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('lobby.planningTime')}</span>
          <Segmented
            value={options.turnDurationSeconds}
            disabled={!isHost}
            onChange={(turnDurationSeconds) => set({ turnDurationSeconds })}
            choices={TIMER_SECONDS.map((seconds) => ({
              label: seconds === null ? t('lobby.timerOff') : t('lobby.timerSeconds', { seconds }),
              value: seconds,
            }))}
          />
        </div>
      </Card>

      {messageText && <Notice>{messageText}</Notice>}
      {session.connection === 'reconnecting' && <Notice>{t('lobby.connectionLost')}</Notice>}

      <div className="flex flex-col gap-2">
        {isHost ? (
          <>
            <PrimaryButton disabled={starting || ships < 2} onClick={start}>
              {starting ? t('lobby.starting') : t('lobby.startMatch', { count: ships })}
            </PrimaryButton>
            {ships < 2 && (
              <p className="text-center text-xs text-parchment/60">{t('lobby.addOpponent')}</p>
            )}
          </>
        ) : (
          <p className="rounded-xl bg-black/20 px-3 py-2.5 text-center text-sm font-semibold text-parchment/70">
            {t('lobby.waitingForHost')}
          </p>
        )}
        <SecondaryButton onClick={() => onlineSession?.leave()}>
          {t('lobby.leaveRoom')}
        </SecondaryButton>
      </div>
    </MenuLayout>
  );
}
