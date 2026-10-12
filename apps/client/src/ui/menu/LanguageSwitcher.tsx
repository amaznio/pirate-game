import { useTranslation } from 'react-i18next';
import { Segmented } from '@/kit/Segmented';
import { LANGUAGES } from '../../i18n/languages';
import { changeLanguage, currentLanguage } from '../../i18n';

/** Lets the player pick the language (EN / ES / PL); the choice is remembered. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  return (
    <div className="w-auto">
      <Segmented
        label={t('language.title')}
        value={currentLanguage()}
        onChange={changeLanguage}
        choices={LANGUAGES.map((language) => ({
          label: language.code.toUpperCase(),
          ariaLabel: language.label,
          value: language.code,
        }))}
      />
    </div>
  );
}
