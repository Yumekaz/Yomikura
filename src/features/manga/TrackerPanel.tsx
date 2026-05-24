import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Link2, Link2Off, ExternalLink, RefreshCw } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { getErrorMessage } from "../../api/suwayomi/errors";

interface TrackerPanelProps {
  mangaId: number;
}

export function TrackerPanel({ mangaId }: TrackerPanelProps) {
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);

  // Form states for updating track record
  const [status, setStatus] = useState<number>(1);
  const [score, setScore] = useState<string>("0");
  const [lastChapterRead, setLastChapterRead] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState("");

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Fetch trackers and manga track records
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["manga-trackers", mangaId, serverBaseUrl],
    queryFn: () => sdk.GetMangaTrackers({ mangaId }),
    enabled: !!serverBaseUrl,
  });

  const trackers = data?.trackers?.nodes || [];
  const trackRecords = data?.manga?.trackRecords?.nodes || [];

  // Mutations
  const { mutate: linkTracker, isPending: linking } = useMutation({
    mutationFn: (trackerId: number) =>
      sdk.TrackProgress({
        input: { mangaId },
      }),
    onSuccess: () => {
      setErrorMsg("");
      queryClient.invalidateQueries({ queryKey: ["manga-trackers", mangaId] });
    },
    onError: (err) => {
      setErrorMsg(`Link failed: ${getErrorMessage(err)}`);
    },
  });

  const { mutate: unlinkTracker, isPending: unlinking } = useMutation({
    mutationFn: (recordId: number) =>
      sdk.UnbindTrack({
        input: { recordId, deleteRemoteTrack: false },
      }),
    onSuccess: () => {
      setErrorMsg("");
      queryClient.invalidateQueries({ queryKey: ["manga-trackers", mangaId] });
    },
    onError: (err) => {
      setErrorMsg(`Unlink failed: ${getErrorMessage(err)}`);
    },
  });

  const { mutate: updateTrackRecord, isPending: updating } = useMutation({
    mutationFn: () =>
      sdk.UpdateTrack({
        input: {
          recordId: editingRecordId!,
          status,
          scoreString: score,
          lastChapterRead,
        },
      }),
    onSuccess: () => {
      setEditingRecordId(null);
      setErrorMsg("");
      queryClient.invalidateQueries({ queryKey: ["manga-trackers", mangaId] });
    },
    onError: (err) => {
      setErrorMsg(`Update failed: ${getErrorMessage(err)}`);
    },
  });

  const handleEditClick = (record: any, tracker: any) => {
    setEditingRecordId(record.id);
    setStatus(record.status);
    setScore(String(record.score || "0"));
    setLastChapterRead(record.lastChapterRead || 0);
  };

  const isPending = linking || unlinking || updating;

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-yomi-jade" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center p-4 border border-white/5 rounded-xl bg-ink-900">
        <p className="text-sm text-red-400">Failed to load trackers: {getErrorMessage(error)}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 text-xs font-semibold text-yomi-jade hover:underline flex items-center gap-1 mx-auto"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="border border-white/5 rounded-xl bg-ink-900 p-5 mt-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-100">Tracking</h3>
        <p className="text-xs text-slate-400 mt-1">Sync your reading progress with external services.</p>
      </div>

      {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        {trackers.map((tracker) => {
          const record = trackRecords.find((r) => r.trackerId === tracker.id);

          return (
            <div
              key={tracker.id}
              className="flex flex-col justify-between rounded-lg border border-white/5 bg-ink-950/40 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {tracker.icon ? (
                    <img src={tracker.icon} alt={tracker.name} className="h-5 w-5 rounded object-cover" />
                  ) : (
                    <Link2 className="h-5 w-5 text-slate-500" />
                  )}
                  <span className="font-semibold text-sm text-slate-200">{tracker.name}</span>
                </div>

                {!tracker.isLoggedIn ? (
                  <a
                    href={tracker.authUrl || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-white/5 border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white"
                  >
                    Login
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : record ? (
                  <span className="text-xs font-semibold text-yomi-jade bg-yomi-jade/10 rounded px-2 py-0.5">
                    Linked
                  </span>
                ) : (
                  <button
                    onClick={() => linkTracker(tracker.id)}
                    disabled={isPending}
                    className="rounded bg-yomi-jade px-2.5 py-1 text-xs font-semibold text-ink-950 hover:bg-yomi-jade/90 disabled:opacity-50"
                  >
                    Link Track
                  </button>
                )}
              </div>

              {tracker.isLoggedIn && record && (
                <div className="mt-4 pt-3 border-t border-white/5 space-y-3">
                  {editingRecordId === record.id ? (
                    /* Edit Form */
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-400 pb-1">Status</label>
                          <select
                            value={status}
                            onChange={(e) => setStatus(parseInt(e.target.value))}
                            className="w-full rounded bg-ink-900 border border-white/10 p-1 text-xs text-slate-300 outline-none"
                          >
                            {tracker.statuses.map((s: any) => (
                              <option key={s.value} value={s.value}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 pb-1">Score</label>
                          <select
                            value={score}
                            onChange={(e) => setScore(e.target.value)}
                            className="w-full rounded bg-ink-900 border border-white/10 p-1 text-xs text-slate-300 outline-none"
                          >
                            <option value="0">No Score</option>
                            {tracker.scores.map((sc: string) => (
                              <option key={sc} value={sc}>
                                {sc}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <label className="block text-[10px] text-slate-400 pb-1">Chapters Read</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={0}
                              value={lastChapterRead}
                              onChange={(e) => setLastChapterRead(parseInt(e.target.value) || 0)}
                              className="w-20 rounded bg-ink-900 border border-white/10 p-1 text-xs text-slate-300 outline-none"
                            />
                            <span className="text-xs text-slate-500">/ {record.totalChapters || "?"}</span>
                          </div>
                        </div>

                        <div className="flex gap-1 mt-auto">
                          <button
                            onClick={() => setEditingRecordId(null)}
                            className="rounded border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => updateTrackRecord()}
                            disabled={isPending}
                            className="rounded bg-yomi-jade px-2.5 py-1 text-xs font-semibold text-ink-950 hover:bg-yomi-jade/90"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Display Record Details */
                    <div className="flex justify-between items-end">
                      <div className="space-y-1 text-xs">
                        <p className="text-slate-400 truncate">
                          Title: <strong className="text-slate-200">{record.title}</strong>
                        </p>
                        <p className="text-slate-400">
                          Status:{" "}
                          <strong className="text-slate-200">
                            {tracker.statuses.find((s: any) => s.value === record.status)?.name || "Unknown"}
                          </strong>
                        </p>
                        <p className="text-slate-400">
                          Score: <strong className="text-slate-200">{record.score || "No score"}</strong>
                        </p>
                        <p className="text-slate-400">
                          Progress:{" "}
                          <strong className="text-slate-200">
                            {record.lastChapterRead} / {record.totalChapters || "?"}
                          </strong>
                        </p>
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleEditClick(record, tracker)}
                          className="rounded bg-white/5 hover:bg-white/10 px-2 py-1 text-xs text-slate-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => unlinkTracker(record.id)}
                          disabled={isPending}
                          className="rounded bg-red-500/10 border border-red-500/20 hover:bg-red-500/25 px-2 py-1 text-xs text-red-400"
                          title="Unlink"
                        >
                          <Link2Off className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {trackers.length === 0 && (
          <p className="text-sm text-slate-500 col-span-2 py-4 text-center">No trackers configured on the server.</p>
        )}
      </div>
    </div>
  );
}
