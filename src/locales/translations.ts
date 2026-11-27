export type TranslationKey =
  | "library"
  | "updates"
  | "history"
  | "settings"
  | "downloads"
  | "reading"
  | "plan_to_read"
  | "completed"
  | "downloaded"
  | "auto_delete_read"
  | "infinite_reading"
  | "portable_mode"
  | "opds_feed"
  | "tracker_settings"
  | "extension_health"
  | "high_contrast"
  | "reduce_motion";

const partialTranslations: Record<string, Partial<Record<TranslationKey, string>>> = {
  en: {
    library: "Library",
    updates: "Updates",
    history: "History",
    settings: "Settings",
    downloads: "Downloads",
    reading: "Reading",
    plan_to_read: "Plan to Read",
    completed: "Completed",
    downloaded: "Downloaded",
    auto_delete_read: "Auto-delete read chapters",
    infinite_reading: "Infinite chapter reading (webtoon)",
    portable_mode: "Portable mode (data next to app)",
    opds_feed: "OPDS feed",
    tracker_settings: "Tracker accounts",
    extension_health: "Extension health",
    high_contrast: "High contrast mode",
    reduce_motion: "Reduce motion",
  },
  es: {
    library: "Biblioteca",
    updates: "Novedades",
    history: "Historial",
    settings: "Ajustes",
    downloads: "Descargas",
    reading: "Leyendo",
    plan_to_read: "Plan para Leer",
    completed: "Completado",
    downloaded: "Descargado",
    auto_delete_read: "Auto-eliminar capítulos leídos",
  },
  fr: {
    library: "Bibliothèque",
    updates: "Mises à jour",
    history: "Historique",
    settings: "Paramètres",
    downloads: "Téléchargements",
    reading: "En cours",
    plan_to_read: "À lire",
    completed: "Terminé",
    downloaded: "Téléchargé",
    auto_delete_read: "Suppression auto des chapitres lus",
  },
  de: {
    library: "Bibliothek",
    updates: "Updates",
    history: "Verlauf",
    settings: "Einstellungen",
    downloads: "Downloads",
    reading: "Am Lesen",
    plan_to_read: "Geplant",
    completed: "Abgeschlossen",
    downloaded: "Heruntergeladen",
    auto_delete_read: "Gelesene Kapitel auto-löschen",
  },
  ja: {
    library: "ライブラリ",
    updates: "更新履歴",
    history: "閲覧履歴",
    settings: "設定",
    downloads: "ダウンロード",
    reading: "読書中",
    plan_to_read: "読みたい",
    completed: "完読",
    downloaded: "保存済",
    auto_delete_read: "読了後にキャッシュ削除",
  },
  pt: {
    library: "Biblioteca",
    updates: "Atualizações",
    history: "Histórico",
    settings: "Configurações",
    downloads: "Downloads",
    reading: "Lendo",
    plan_to_read: "Planejo Ler",
    completed: "Concluído",
    downloaded: "Baixado",
    auto_delete_read: "Auto-excluir capítulos lidos",
  },
  zh: {
    library: "书架",
    updates: "更新",
    history: "历史",
    settings: "设置",
    downloads: "下载",
    reading: "阅读中",
    plan_to_read: "计划阅读",
    completed: "已完结",
    downloaded: "已下载",
    auto_delete_read: "自动删除已读章节",
  },
  ru: {
    library: "Библиотека",
    updates: "Обновления",
    history: "История",
    settings: "Настройки",
    downloads: "Загрузки",
    reading: "Читаю",
    plan_to_read: "В планах",
    completed: "Прочитано",
    downloaded: "Скачано",
    auto_delete_read: "Автоудаление прочитанных глав",
  },
  it: {
    library: "Libreria",
    updates: "Aggiornamenti",
    history: "Cronologia",
    settings: "Impostazioni",
    downloads: "Download",
    reading: "In Lettura",
    plan_to_read: "Da Leggere",
    completed: "Completati",
    downloaded: "Scaricati",
    auto_delete_read: "Auto-elimina capitoli letti",
  },
  ko: {
    library: "라이브러리",
    updates: "최신 업데이트",
    history: "기록",
    settings: "설정",
    downloads: "다운로드",
    reading: "읽는 중",
    plan_to_read: "읽을 예정",
    completed: "읽음 완료",
    downloaded: "다운로드됨",
    auto_delete_read: "읽은 후 다운로드 캐시 자동 삭제",
  },
};

// New keys fall back to English for locales that haven't been fully translated yet.
const EN_BASE = partialTranslations.en as Record<TranslationKey, string>;
export const translations: Record<string, Record<TranslationKey, string>> = Object.fromEntries(
  Object.entries(partialTranslations).map(([lang, dict]) => [
    lang,
    { ...EN_BASE, ...dict } as Record<TranslationKey, string>,
  ])
);
