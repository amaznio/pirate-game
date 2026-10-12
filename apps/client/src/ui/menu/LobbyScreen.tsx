import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_ROOM_OPTIONS,
  ROOM_LIMITS,
  type LobbyState,
  type RoomOptions,
} from '@pirate/game-core/protocol/messages';
import { DEFAULT_SHIP_TYPE_ID } from '@pirate/game-core/config/shipTypes';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CardTitle, Field } from '@/kit/Field';
import { Notice } from '@/kit/Notice';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Segmented } from '@/kit/Segmented';
import { Stepper } from '@/kit/Stepper';
import { onlineSession, useOnlineSession } from '../../app/onlineSession';
import { humanMessage } from '../../i18n/humanMessage';
import { AI_LEVELS, aiLevelBlurb, aiLevelLabel } from './aiLevels';
import { MAP_STYLE_CHOICES, mapStyleBlurb, mapStyleLabel } from './mapStyles';
import { SHIP_CHOICES, shipBlurb, shipLabel } from './shipClasses';
import { VISIBILITY_CHOICES, shareCodeLabel, visibilityBlurb, visibilityLabel } from './visibility';

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
  const myShip = me?.shipTypeId ?? DEFAULT_SHIP_TYPE_ID;
  const codeLabel = shareCodeLabel(t, options.visibility);

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
    <ScreenFrame
      title={t('menu.playFriends')}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={() => onlineSession?.leave()}>
            {t('lobby.leaveRoom')}
          </Button>
          {isHost ? (
            <div className="flex flex-1 flex-col gap-1">
              <Button size="lg" disabled={starting || ships < 2} onClick={start}>
                {starting ? t('lobby.starting') : t('lobby.startMatch', { count: ships })}
              </Button>
              {ships < 2 && (
                <p className="text-center text-sm text-muted-foreground">{t('lobby.addOpponent')}</p>
              )}
            </div>
          ) : (
            <p className="flex flex-1 items-center justify-center rounded-btn bg-background/40 px-3 text-center text-base font-bold text-muted-foreground">
              {t('lobby.waitingForHost')}
            </p>
          )}
        </>
      }
    >
      {messageText && <Notice>{messageText}</Notice>}
      {session.connection === 'reconnecting' && <Notice>{t('lobby.connectionLost')}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <Card>
            <CardTitle>{codeLabel}</CardTitle>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className={`select-all font-black ${
                  lobby.shareCode.length > 6
                    ? 'text-3xl tracking-[0.18em]'
                    : 'text-4xl tracking-[0.3em]'
                }`}
                aria-label={`${codeLabel} ${lobby.shareCode.split('').join(' ')}`}
              >
                {lobby.shareCode}
              </span>
              <Button variant="secondary" onClick={copyLink}>
                {copied ? <Check /> : <Copy />}
                {copied ? t('lobby.copied') : t('lobby.copyLink')}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {options.visibility === 'public'
                ? t('lobby.publicDescription')
                : t('lobby.privateDescription')}
            </p>
          </Card>

          <Card>
            <CardTitle>{t('lobby.players', { count: lobby.seats.length })}</CardTitle>
            <ul className="flex flex-col gap-2">
              {lobby.seats.map((seat) => (
                <li
                  key={seat.seatId}
                  className="flex min-h-12 items-center gap-3 rounded-btn bg-background/40 px-3 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-base font-bold">
                    {seat.name}
                    {seat.seatId === session.seatId && (
                      <span className="ml-1.5 font-semibold text-muted-foreground">
                        {t('lobby.you')}
                      </span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {shipLabel(t, seat.shipTypeId)}
                  </span>
                  {seat.isHost && <Badge>{t('lobby.host')}</Badge>}
                  <Badge variant={seat.connected ? 'secondary' : 'outline'}>
                    {seat.connected ? t('lobby.here') : t('lobby.away')}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <Field label={t('lobby.yourShip')} hint={shipBlurb(t, myShip)}>
              <Segmented
                label={t('lobby.yourShip')}
                value={myShip}
                onChange={(shipTypeId) => void onlineSession?.chooseShip(shipTypeId)}
                choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
              />
            </Field>
          </Card>
        </div>

        <Card className="gap-5">
          <CardTitle>
            {isHost ? t('lobby.matchOptions') : t('lobby.matchOptionsHost')}
          </CardTitle>
          <Field label={t('lobby.whoCanJoin')} hint={visibilityBlurb(t, options.visibility)}>
            <Segmented
              label={t('lobby.whoCanJoin')}
              value={options.visibility}
              disabled={!isHost}
              onChange={(visibility) => set({ visibility })}
              choices={VISIBILITY_CHOICES.map((value) => ({
                label: visibilityLabel(t, value),
                value,
              }))}
            />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold">{t('lobby.aiOpponents')}</span>
            <Stepper
              label={t('lobby.aiOpponents')}
              value={options.ais}
              min={0}
              max={maxAis}
              disabled={!isHost}
              onChange={(ais) => set({ ais })}
            />
          </div>
          <Field label={t('lobby.aiSkill')} hint={aiLevelBlurb(t, options.aiDifficulty)}>
            <Segmented
              label={t('lobby.aiSkill')}
              value={options.aiDifficulty}
              disabled={!isHost}
              onChange={(aiDifficulty) => set({ aiDifficulty })}
              choices={AI_LEVELS.map((level) => ({ label: aiLevelLabel(t, level), value: level }))}
            />
          </Field>
          <Field label={t('lobby.aiShips')} hint={t('common.biggerShipStronger')}>
            <Segmented
              label={t('lobby.aiShips')}
              value={options.aiShipTypeId}
              disabled={!isHost}
              onChange={(aiShipTypeId) => set({ aiShipTypeId })}
              choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
            />
          </Field>
          <Field label={t('lobby.seas')} hint={mapStyleBlurb(t, options.mapStyle)}>
            <Segmented
              label={t('lobby.seas')}
              value={options.mapStyle}
              disabled={!isHost}
              onChange={(mapStyle) => set({ mapStyle })}
              choices={MAP_STYLE_CHOICES.map((style) => ({
                label: mapStyleLabel(t, style),
                value: style,
              }))}
            />
          </Field>
          <Field label={t('common.loot')} hint={t('common.lootBlurb')}>
            <Segmented
              label={t('common.loot')}
              value={options.loot ? 'on' : 'off'}
              disabled={!isHost}
              onChange={(value) => set({ loot: value === 'on' })}
              choices={[
                { label: t('common.lootOff'), value: 'off' as const },
                { label: t('common.lootOn'), value: 'on' as const },
              ]}
            />
          </Field>
          <Field label={t('lobby.teams')}>
            <Segmented
              label={t('lobby.teams')}
              value={options.teamMode}
              disabled={!isHost}
              onChange={(teamMode) => set({ teamMode })}
              choices={[
                { label: t('common.teamFfa'), value: 'ffa' as const },
                { label: t('common.teamTwoTeams'), value: 'teams' as const },
              ]}
            />
          </Field>
          <Field label={t('lobby.planningTime')}>
            <Segmented
              label={t('lobby.planningTime')}
              value={options.turnDurationSeconds}
              disabled={!isHost}
              onChange={(turnDurationSeconds) => set({ turnDurationSeconds })}
              choices={TIMER_SECONDS.map((seconds) => ({
                label:
                  seconds === null ? t('lobby.timerOff') : t('lobby.timerSeconds', { seconds }),
                value: seconds,
              }))}
            />
          </Field>
        </Card>
      </div>
    </ScreenFrame>
  );
}
