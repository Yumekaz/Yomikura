import { useSettingsStore } from "../stores/useSettingsStore";
import { translations, TranslationKey } from "../locales/translations";

export function useTranslation() {
  const language = useSettingsStore((state) => state.language || "en");

  const t = (key: TranslationKey): string => {
    const langDict = translations[language] || translations["en"];
    return langDict[key] || translations["en"][key] || String(key);
  };

  return { t, language };
}
