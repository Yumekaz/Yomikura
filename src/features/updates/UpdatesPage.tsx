import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Clock3, Play, BookOpen, RefreshCw } from "lucide-react";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { createGraphqlClient } from "../../api/graphql/client";
import { getErrorMessage } from "../../api/suwayomi/errors";
import { ChapterOrderBy, SortOrder } from "../../api/graphql/generated/graphql";
import { useTranslation } from "../../hooks/useTranslation";

interface UpdateItem {
  id: string;
  name: string;
  chapterNumber: number;
  uploadDate: string;
  scanlator?: string | null;
  mangaId: number;
  manga: {
    id: number;
    title: string;
    thumbnailUrl?: string | null;
  };
}

export default function UpdatesPage() {
  const { serverBaseUrl } = useSettingsStore();
  const { t, language } = useTranslation();

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["updates", serverBaseUrl],
    queryFn: () =>
      sdk.GetUpdates({
        filter: {
          inLibrary: { equalTo: true },
        },
        order: [
          {
            by: ChapterOrderBy.UploadDate,
            byType: SortOrder.Desc,
          },
        ],
        first: 100,
      }),
    enabled: !!serverBaseUrl,
  });

  const updates = useMemo(() => {
    if (!data?.chapters?.edges) return [];
    return data.chapters.edges
      .map((edge) => edge?.node)
      .filter((node): node is NonNullable<typeof node> => node != null) as unknown as UpdateItem[];
  }, [data]);

  // Group updates by date
  const groupedUpdates = useMemo(() => {
    const groups: Record<string, UpdateItem[]> = {};
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;

    updates.forEach((item) => {
      const rawTime = parseInt(item.uploadDate);
      const time = !isNaN(rawTime) && rawTime < 30000000000 ? rawTime * 1000 : rawTime;
      if (isNaN(time)) {
        const key = "Unknown Date";
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
        return;
      }

      let key = "Older";
      if (time >= startOfToday) {
        key = t("today");
      } else if (time >= startOfYesterday) {
        key = t("yesterday");
      } else if (time >= startOfWeek) {
        key = "This Week";
      }

      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    return groups;
  }, [updates, language]);

  if (!serverBaseUrl) {
    return (
      <div className="yomi-workspace">
        <div className="yomi-route-empty"><div>
          <Clock3 />
          <h2>Updates need a local engine</h2>
          <p>{t("no_server")}</p>
        </div></div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="yomi-workspace flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="yomi-workspace"><div className="yomi-route-empty"><div>
        <Clock3 />
        <h2>Updates could not load</h2>
        <p>{getErrorMessage(error)}</p>
        <button onClick={() => refetch()} className="yomi-button yomi-button-primary mt-5"><RefreshCw />{t("retry")}</button>
      </div></div></div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="yomi-workspace"><div className="yomi-route-empty"><div>
        <Clock3 />
        <h2>{t("no_updates")}</h2>
        <p>When a source publishes a new chapter for a title in your library, it will appear here.</p>
      </div></div></div>
    );
  }

  return (
    <div className="yomi-workspace">
      <div className="yomi-workspace-head">
        <div>
          <span className="yomi-eyebrow">Library activity</span>
          <h1 className="yomi-workspace-title"><Clock3 />{t("updates")}</h1>
          <p className="yomi-workspace-subtitle">New chapters from titles you follow, arranged by when they reached your library.</p>
        </div>
        <span className="yomi-status-chip"><span className="yomi-status-dot" />{updates.length} recent chapters</span>
      </div>

      <div className="space-y-9">
        {[t("today"), t("yesterday"), "This Week", "Older"].map((groupName) => {
          const groupItems = groupedUpdates[groupName] || [];
          if (groupItems.length === 0) return null;

          return (
            <section key={groupName}>
              <h2 className="yomi-section-label">{groupName}</h2>
              <div className="yomi-surface">
                {groupItems.map((item) => {
                  let coverUrl = "/placeholder-cover.svg";
                  if (item.manga.thumbnailUrl) {
                    coverUrl = item.manga.thumbnailUrl.startsWith("http")
                      ? item.manga.thumbnailUrl
                      : `${serverBaseUrl.replace(/\/$/, "")}${item.manga.thumbnailUrl}`;
                  }

                  return (
                    <div
                      key={item.id}
                      className="yomi-surface-row"
                    >
                      <Link
                        to={`/manga/${item.manga.id}`}
                        className="yomi-cover-sm"
                      >
                        <img src={coverUrl} alt={item.manga.title} className="h-full w-full object-cover" />
                      </Link>

                      <div className="yomi-row-copy">
                        <div className="yomi-row-overline"><strong>New chapter</strong><span>{item.scanlator || "Library update"}</span></div>
                        <Link
                          to={`/manga/${item.manga.id}`}
                          className="yomi-row-title"
                        >
                          {item.manga.title}
                        </Link>
                        <p>{item.name}</p>
                        <small>{new Date(parseInt(item.uploadDate) < 30000000000 ? parseInt(item.uploadDate) * 1000 : parseInt(item.uploadDate)).toLocaleDateString()}</small>
                      </div>

                      <div className="yomi-row-actions">
                        <Link
                          to={`/reader/${item.id}`}
                          className="yomi-icon-button"
                          title="Read Chapter"
                        >
                          <Play className="h-4 w-4 fill-current ml-0.5" />
                        </Link>
                        <Link
                          to={`/manga/${item.manga.id}`}
                          className="yomi-icon-button hidden sm:inline-grid"
                          title="Manga Details"
                        >
                          <BookOpen className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
