import { useTranslation } from 'react-i18next';
import { Card, Segmented } from './MenuLayout';
import { LANGUAGES } from '../../i18n/languages';
import { changeLanguage, currentLanguage } from '../../i18n';

/** Lets the player pick the language; the choice is remembered. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  return (
    <Card title={t('language.title')}>
      <Segmented
        value={currentLanguage()}
        disabled={false}
        onChange={changeLanguage}
        choices={LANGUAGES.map((language) => ({
          label: language.label,
          value: language.code,
        }))}
      />
    </Card>
  );
}
