import { useState } from 'react';
import {
  Card,
  MenuLayout,
  Notice,
  PrimaryButton,
  SecondaryButton,
  Segmented,
  Stepper,
} from './MenuLayout';
import { AI_LEVELS, aiLevelBlurb } from './aiLevels';
import { useStoredDifficulty } from './useStoredDifficulty';
import { useStoredName } from './useStoredName';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import { onlineSession, useOnlineSession } from '../../app/onlineSession';

interface MainMenuProps {
  /** A room code from the page link (?room=ABCDE), to prefill the join box. */
  initialRoomCode?: string;
  onPlayOffline: (opponents: number, name: string, difficulty: AiDifficulty) => void;
}

/** The first screen: play against the computer, or play with friends online. */
export function MainMenu({ initialRoomCode = '', onPlayOffline }: MainMenuProps) {
  const session = useOnlineSession();
  const [name, setName] = useStoredName();
  const [opponents, setOpponents] = useState(1);
  const [difficulty, setDifficulty] = useStoredDifficulty();
  const [code, setCode] = useState(initialRoomCode.toUpperCase());
  const [busy, setBusy] = useState(false);

  const cleanName = name.trim();
  const online = onlineSession;
  const working = busy || session.resuming;

  async function run(action: () => Promise<boolean>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <MenuLayout>
      <Card title="Your name">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={20}
          placeholder="Captain"
          aria-label="Your name"
          className="rounded-xl bg-black/25 px-3 py-2.5 text-base font-semibold text-parchment placeholder:text-parchment/30 focus:outline-none focus:ring-2 focus:ring-parchment/50"
        />
      </Card>

      <Card title="Play against the computer">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-parchment">Opponents</span>
          <Stepper
            label="opponents"
            value={opponents}
            min={1}
            max={7}
            onChange={setOpponents}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">Skill</span>
          <Segmented
            value={difficulty}
            disabled={false}
            onChange={setDifficulty}
            choices={AI_LEVELS.map((level) => ({ label: level.label, value: level.value }))}
          />
          <p className="text-xs text-parchment/50">{aiLevelBlurb(difficulty)}</p>
        </div>
        <PrimaryButton onClick={() => onPlayOffline(opponents, cleanName, difficulty)}>
          Set sail
        </PrimaryButton>
      </Card>

      <Card title="Play with friends">
        {online ? (
          <>
            <PrimaryButton
              disabled={working || !cleanName}
              onClick={() => run(() => online.createRoom(cleanName))}
            >
              {working ? 'Connecting…' : 'Create a room'}
            </PrimaryButton>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={8}
                placeholder="Room code"
                aria-label="Room code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xl bg-black/25 px-3 py-2.5 text-base font-bold uppercase tracking-widest text-parchment placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-parchment/30 focus:outline-none focus:ring-2 focus:ring-parchment/50"
              />
              <SecondaryButton
                disabled={working || !cleanName || code.length < 3}
                onClick={() => run(() => online.joinRoom(code, cleanName))}
              >
                Join
              </SecondaryButton>
            </div>
            {!cleanName && (
              <p className="text-xs text-parchment/50">Enter a name to play online.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-parchment/60">
            Online play is not set up for this site.
          </p>
        )}
      </Card>

      {session.resuming && <Notice>Returning to your match…</Notice>}
      {session.message && !session.resuming && <Notice>{session.message}</Notice>}
    </MenuLayout>
  );
}
