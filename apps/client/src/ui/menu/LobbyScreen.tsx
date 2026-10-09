import { useState } from 'react';
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
  Stepper,
} from './MenuLayout';
import { onlineSession, useOnlineSession } from '../../app/onlineSession';

const TIMER_CHOICES: ReadonlyArray<{ label: string; seconds: number | null }> = [
  { label: 'Off', seconds: null },
  { label: '20s', seconds: 20 },
  { label: '30s', seconds: 30 },
  { label: '45s', seconds: 45 },
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
];

function Segmented<T extends string | number | null>({
  value,
  choices,
  onChange,
  disabled,
}: {
  value: T;
  choices: ReadonlyArray<{ label: string; value: T }>;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((choice) => (
        <button
          key={choice.label}
          type="button"
          disabled={disabled}
          aria-pressed={choice.value === value}
          onClick={() => onChange(choice.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:cursor-default ${
            choice.value === value
              ? 'bg-parchment text-ink'
              : 'bg-parchment/10 text-parchment hover:bg-parchment/20 disabled:hover:bg-parchment/10'
          }`}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

/** A room that has not started yet: who is here, the options, and Start. */
export function LobbyScreen({ lobby }: { lobby: LobbyState }) {
  const session = useOnlineSession();
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);

  const me = lobby.seats.find((seat) => seat.seatId === session.seatId);
  const isHost = me?.isHost ?? false;
  const options: RoomOptions = lobby.options ?? DEFAULT_ROOM_OPTIONS;
  const here = lobby.seats.filter((seat) => seat.connected).length;
  const ships = here + options.ais;
  const maxAis = Math.max(0, ROOM_LIMITS.maxShips - lobby.seats.length);

  const link = `${window.location.origin}${window.location.pathname}?room=${lobby.roomId}`;

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
      <Card title="Room code">
        <div className="flex items-center justify-between gap-3">
          <span
            className="select-all text-4xl font-black tracking-[0.3em] text-parchment"
            aria-label={`Room code ${lobby.roomId.split('').join(' ')}`}
          >
            {lobby.roomId}
          </span>
          <SecondaryButton onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </SecondaryButton>
        </div>
        <p className="text-xs text-parchment/50">
          Friends can enter this code, or open the link, to join.
        </p>
      </Card>

      <Card title={`Players (${lobby.seats.length})`}>
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
                title={seat.connected ? 'Here' : 'Away'}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-parchment">
                {seat.name}
                {seat.seatId === session.seatId && (
                  <span className="ml-1.5 font-semibold text-parchment/50">(you)</span>
                )}
              </span>
              {seat.isHost && (
                <span className="rounded-full bg-parchment/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-parchment">
                  Host
                </span>
              )}
              {!seat.connected && (
                <span className="text-xs font-semibold text-parchment/50">away</span>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={isHost ? 'Match options' : 'Match options (set by the host)'}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-parchment">AI opponents</span>
          <Stepper
            label="AI opponents"
            value={options.ais}
            min={0}
            max={maxAis}
            disabled={!isHost}
            onChange={(ais) => set({ ais })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">Teams</span>
          <Segmented
            value={options.teamMode}
            disabled={!isHost}
            onChange={(teamMode) => set({ teamMode })}
            choices={[
              { label: 'Free for all', value: 'ffa' as const },
              { label: 'Two teams', value: 'teams' as const },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">Planning time</span>
          <Segmented
            value={options.turnDurationSeconds}
            disabled={!isHost}
            onChange={(turnDurationSeconds) => set({ turnDurationSeconds })}
            choices={TIMER_CHOICES.map((choice) => ({
              label: choice.label,
              value: choice.seconds,
            }))}
          />
        </div>
      </Card>

      {session.message && <Notice>{session.message}</Notice>}
      {session.connection === 'reconnecting' && (
        <Notice>Connection lost — trying to reconnect…</Notice>
      )}

      <div className="flex flex-col gap-2">
        {isHost ? (
          <>
            <PrimaryButton disabled={starting || ships < 2} onClick={start}>
              {starting ? 'Starting…' : `Start match (${ships} ships)`}
            </PrimaryButton>
            {ships < 2 && (
              <p className="text-center text-xs text-parchment/60">
                Add an AI opponent or wait for a friend to join.
              </p>
            )}
          </>
        ) : (
          <p className="rounded-xl bg-black/20 px-3 py-2.5 text-center text-sm font-semibold text-parchment/70">
            Waiting for the host to start…
          </p>
        )}
        <SecondaryButton onClick={() => onlineSession?.leave()}>
          Leave room
        </SecondaryButton>
      </div>
    </MenuLayout>
  );
}
