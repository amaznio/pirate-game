import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LANGUAGES } from '../../i18n/languages';
import { changeLanguage, currentLanguage } from '../../i18n';

/** A dropdown to pick the language by its own name; the choice is remembered. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  return (
    <Select value={currentLanguage()} onValueChange={changeLanguage}>
      <SelectTrigger aria-label={t('language.title')} className="min-w-36">
        <Globe aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" sideOffset={4}>
        {LANGUAGES.map((language) => (
          <SelectItem key={language.code} value={language.code}>
            {language.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
