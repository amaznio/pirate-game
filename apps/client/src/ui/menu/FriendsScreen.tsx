import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomVisibility } from '@pirate/game-core/protocol/messages';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CardTitle, Field } from '@/kit/Field';
import { Notice } from '@/kit/Notice';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { Segmented } from '@/kit/Segmented';
import { humanMessage } from '../../i18n/humanMessage';
import { onlineSession, serverUrl, useOnlineSession } from '../../app/onlineSession';
import { PublicRoomList } from './PublicRoomList';
import {
  VISIBILITY_CHOICES,
  loadVisibility,
  saveVisibility,
  visibilityBlurb,
  visibilityLabel,
} from './visibility';

interface FriendsScreenProps {
  name: string;
  onNameChange: (name: string) => void;
  onBack: () => void;
  /** A room code from the page link (?room=ABCDE), to prefill the join box. */
  initialRoomCode?: string;
}

/** Create a room, join one with a code, or pick a public room. */
export function FriendsScreen({
  name,
  onNameChange,
  onBack,
  initialRoomCode = '',
}: FriendsScreenProps) {
  const { t } = useTranslation();
  const session = useOnlineSession();
  const [code, setCode] = useState(initialRoomCode.toUpperCase());
  const [visibility, setVisibilityState] = useState<RoomVisibility>(loadVisibility);
  const [busy, setBusy] = useState(false);

  const setVisibility = (value: RoomVisibility) => {
    setVisibilityState(value);
    saveVisibility(value);
  };

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
    <ScreenFrame title={t('menu.playFriends')} onBack={onBack} wide={false}>
      {online ? (
        <>
          <Card>
            <Field label={t('menu.yourName')} hint={!cleanName ? t('menu.enterNameOnline') : undefined}>
              <input
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                maxLength={20}
                placeholder={t('menu.namePlaceholder')}
                aria-label={t('menu.yourName')}
                className="min-h-12 rounded-btn border-2 border-border bg-secondary/40 px-3 text-base font-bold text-foreground outline-none placeholder:font-semibold placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
              />
            </Field>
          </Card>

          <Card>
            <CardTitle>{t('menu.newRoom')}</CardTitle>
            <div className="flex flex-col gap-2">
              <Segmented
                label={t('menu.newRoom')}
                value={visibility}
                onChange={setVisibility}
                choices={VISIBILITY_CHOICES.map((value) => ({
                  label: visibilityLabel(t, value),
                  value,
                }))}
              />
              <p className="text-sm text-muted-foreground">{visibilityBlurb(t, visibility)}</p>
            </div>
            <Button
              size="lg"
              disabled={working || !cleanName}
              onClick={() => run(() => online.createRoom(cleanName, { visibility }))}
            >
              {working ? t('menu.connecting') : t('menu.createRoom')}
            </Button>
          </Card>

          <Card>
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
                className="min-h-12 min-w-0 flex-1 rounded-btn border-2 border-border bg-secondary/40 px-3 text-base font-bold uppercase tracking-widest text-foreground outline-none placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring"
              />
              <Button
                variant="secondary"
                disabled={working || !cleanName || code.length < 3}
                onClick={() => run(() => online.joinRoom(code, cleanName))}
              >
                {t('menu.join')}
              </Button>
            </div>
          </Card>

          {serverUrl && (
            <PublicRoomList
              serverUrl={serverUrl}
              canJoin={!working && cleanName.length > 0}
              onJoin={(roomCode) => run(() => online.joinRoom(roomCode, cleanName))}
            />
          )}
        </>
      ) : (
        <Card>
          <p className="text-base text-muted-foreground">{t('menu.onlineNotSetUp')}</p>
        </Card>
      )}

      {session.resuming && <Notice>{t('menu.returning')}</Notice>}
      {!session.resuming && messageText && <Notice>{messageText}</Notice>}
    </ScreenFrame>
  );
}
