import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { MapStyle } from '@pirate/game-core/board/generateBoard';
import { MAP_STYLE_CHOICES, mapStyleBlurb, mapStyleLabel } from './mapStyles';
import { useStoredDifficulty } from './useStoredDifficulty';
import { useStoredMapStyle } from './useStoredMapStyle';
import { useStoredName } from './useStoredName';
import type { AiDifficulty } from '@pirate/game-core/domain/GameState';
import type { RoomVisibility } from '@pirate/game-core/protocol/messages';
import { onlineSession, serverUrl, useOnlineSession } from '../../app/onlineSession';
import { SHIP_CHOICES, shipBlurb, shipLabel } from './shipClasses';
import type { OfflineShips } from '../../app/offlineMatch';
import { DEFAULT_SHIP_TYPE_ID } from '@pirate/game-core/config/shipTypes';
import { PublicRoomList } from './PublicRoomList';
import { LanguageSwitcher } from './LanguageSwitcher';
import { humanMessage } from '../../i18n/humanMessage';
import {
  VISIBILITY_CHOICES,
  loadVisibility,
  saveVisibility,
  visibilityBlurb,
  visibilityLabel,
} from './visibility';

interface MainMenuProps {
  /** A room code from the page link (?room=ABCDE), to prefill the join box. */
  initialRoomCode?: string;
  onPlayOffline: (
    opponents: number,
    name: string,
    difficulty: AiDifficulty,
    mapStyle: MapStyle,
    loot: boolean,
    ships: OfflineShips,
  ) => void;
}

/** The first screen: play against the computer, or play with friends online. */
export function MainMenu({ initialRoomCode = '', onPlayOffline }: MainMenuProps) {
  const { t } = useTranslation();
  const session = useOnlineSession();
  const [name, setName] = useStoredName();
  const [opponents, setOpponents] = useState(1);
  const [difficulty, setDifficulty] = useStoredDifficulty();
  const [mapStyle, setMapStyle] = useStoredMapStyle();
  const [loot, setLoot] = useState(false);
  const [yourShip, setYourShip] = useState(DEFAULT_SHIP_TYPE_ID);
  const [theirShip, setTheirShip] = useState(DEFAULT_SHIP_TYPE_ID);
  const [code, setCode] = useState(initialRoomCode.toUpperCase());
  const [visibility, setVisibilityState] = useState<RoomVisibility>(loadVisibility);
  const setVisibility = (value: RoomVisibility) => {
    setVisibilityState(value);
    saveVisibility(value);
  };
  const [busy, setBusy] = useState(false);

  const cleanName = name.trim();
  const online = onlineSession;
  const working = busy || session.resuming;
  const messageText = humanMessage(t, session.message);

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
      <Card title={t('menu.yourName')}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={20}
          placeholder={t('menu.namePlaceholder')}
          aria-label={t('menu.yourName')}
          className="rounded-xl bg-black/25 px-3 py-2.5 text-base font-semibold text-parchment placeholder:text-parchment/30 focus:outline-none focus:ring-2 focus:ring-parchment/50"
        />
      </Card>

      <LanguageSwitcher />

      <Card title={t('menu.playComputer')}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-parchment">{t('menu.opponents')}</span>
          <Stepper
            label={t('menu.opponents')}
            value={opponents}
            min={1}
            max={7}
            onChange={setOpponents}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('menu.skill')}</span>
          <Segmented
            value={difficulty}
            disabled={false}
            onChange={setDifficulty}
            choices={AI_LEVELS.map((level) => ({ label: aiLevelLabel(t, level), value: level }))}
          />
          <p className="text-xs text-parchment/50">{aiLevelBlurb(t, difficulty)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('menu.seas')}</span>
          <Segmented
            value={mapStyle}
            disabled={false}
            onChange={setMapStyle}
            choices={MAP_STYLE_CHOICES.map((style) => ({
              label: mapStyleLabel(t, style),
              value: style,
            }))}
          />
          <p className="text-xs text-parchment/50">{mapStyleBlurb(t, mapStyle)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('common.loot')}</span>
          <Segmented
            value={loot ? 'on' : 'off'}
            disabled={false}
            onChange={(value) => setLoot(value === 'on')}
            choices={[
              { label: t('common.lootOff'), value: 'off' as const },
              { label: t('common.lootOn'), value: 'on' as const },
            ]}
          />
          <p className="text-xs text-parchment/50">{t('common.lootBlurb')}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('menu.yourShip')}</span>
          <Segmented
            value={yourShip}
            disabled={false}
            onChange={setYourShip}
            choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
          />
          <p className="text-xs text-parchment/50">{shipBlurb(t, yourShip)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-parchment">{t('menu.theirShips')}</span>
          <Segmented
            value={theirShip}
            disabled={false}
            onChange={setTheirShip}
            choices={SHIP_CHOICES.map((id) => ({ label: shipLabel(t, id), value: id }))}
          />
          <p className="text-xs text-parchment/50">{t('common.biggerShipStronger')}</p>
        </div>
        <PrimaryButton
          onClick={() =>
            onPlayOffline(opponents, cleanName, difficulty, mapStyle, loot, {
              yours: yourShip,
              theirs: theirShip,
            })
          }
        >
          {t('menu.setSail')}
        </PrimaryButton>
      </Card>

      <Card title={t('menu.playFriends')}>
        {online ? (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-parchment">{t('menu.newRoom')}</span>
              <Segmented
                value={visibility}
                disabled={false}
                onChange={setVisibility}
                choices={VISIBILITY_CHOICES.map((value) => ({
                  label: visibilityLabel(t, value),
                  value,
                }))}
              />
              <p className="text-xs text-parchment/50">{visibilityBlurb(t, visibility)}</p>
            </div>
            <PrimaryButton
              disabled={working || !cleanName}
              onClick={() => run(() => online.createRoom(cleanName, { visibility }))}
            >
              {working ? t('menu.connecting') : t('menu.createRoom')}
            </PrimaryButton>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={12}
                placeholder={t('menu.roomCodeOrKey')}
                aria-label={t('menu.roomCodeOrKey')}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xl bg-black/25 px-3 py-2.5 text-base font-bold uppercase tracking-widest text-parchment placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-parchment/30 focus:outline-none focus:ring-2 focus:ring-parchment/50"
              />
              <SecondaryButton
                disabled={working || !cleanName || code.length < 3}
                onClick={() => run(() => online.joinRoom(code, cleanName))}
              >
                {t('menu.join')}
              </SecondaryButton>
            </div>
            {!cleanName && (
              <p className="text-xs text-parchment/50">{t('menu.enterNameOnline')}</p>
            )}
          </>
        ) : (
          <p className="text-sm text-parchment/60">{t('menu.onlineNotSetUp')}</p>
        )}
      </Card>

      {online && serverUrl && (
        <PublicRoomList
          serverUrl={serverUrl}
          canJoin={!working && cleanName.length > 0}
          onJoin={(roomCode) => run(() => online.joinRoom(roomCode, cleanName))}
        />
      )}

      {session.resuming && <Notice>{t('menu.returning')}</Notice>}
      {!session.resuming && messageText && <Notice>{messageText}</Notice>}
    </MenuLayout>
  );
}
