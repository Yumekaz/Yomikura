import { ThemedSelect } from "../../components/ui/ThemedSelect";
import { useState } from "react";
import type { GetMangaTrackersQuery, UpdateTrackInput } from "../../api/graphql/generated/graphql";
import type { BoundTrackerRecord } from "../../api/suwayomi/trackingActions";

export function TrackerEditForm({ record, tracker, busy, onSave, onCancel }: {
  record: BoundTrackerRecord; tracker: GetMangaTrackersQuery["trackers"]["nodes"][number]; busy: boolean;
  onSave: (patch: Omit<UpdateTrackInput, "recordId">) => void; onCancel: () => void;
}) {
  const originalScore = record.displayScore ?? String(record.score ?? 0);
  const [status, setStatus] = useState(record.status);
  const [score, setScore] = useState(originalScore);
  const [chapter, setChapter] = useState(String(record.lastChapterRead));
  const [privateTrack, setPrivateTrack] = useState(record.private);
  const [error, setError] = useState("");
  return <form className="space-y-3" onSubmit={(event) => {
    event.preventDefault(); const position = Number(chapter);
    if (!chapter.trim() || !Number.isFinite(position) || position < 0) { setError("Enter a valid chapter number of zero or greater."); return; }
    const patch: Omit<UpdateTrackInput, "recordId"> = {
      ...(status !== record.status ? { status } : {}), ...(score !== originalScore ? { scoreString: score } : {}),
      ...(position !== record.lastChapterRead ? { lastChapterRead: position } : {}),
      ...(tracker.supportsPrivateTracking && privateTrack !== record.private ? { private: privateTrack } : {}),
    };
    if (!Object.keys(patch).length) { onCancel(); return; }
    setError(""); onSave(patch);
  }}>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs text-slate-400">Tracker status<ThemedSelect aria-label="Tracker status" className="yomi-select mt-1 w-full" value={status} disabled={busy} onValueChange={(value) => setStatus(Number(value))}>
        {!tracker.statuses.some((item) => item.value === record.status) && <option value={record.status}>Current status</option>}
        {tracker.statuses.map((item) => <option key={item.value} value={item.value}>{item.name}</option>)}
      </ThemedSelect></label>
      <label className="text-xs text-slate-400">Tracker score<ThemedSelect aria-label="Tracker score" className="yomi-select mt-1 w-full" value={score} disabled={busy} onValueChange={(value) => setScore(value)}>
        <option value="0">No score</option>
        {originalScore !== "0" && !tracker.scores.includes(originalScore) && <option value={originalScore}>Current: {originalScore}</option>}
        {tracker.scores.filter((item) => item !== "0").map((item) => <option key={item} value={item}>{item}</option>)}
      </ThemedSelect></label>
    </div>
    <label className="block text-xs text-slate-400">Chapters read<input type="number" min="0" step="any" className="yomi-field mt-1 w-full" value={chapter} disabled={busy} onChange={(event) => setChapter(event.target.value)} /></label>
    {tracker.supportsPrivateTracking && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={privateTrack} disabled={busy} onChange={(event) => setPrivateTrack(event.target.checked)} />Private tracker entry</label>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    <div className="flex gap-2"><button type="submit" disabled={busy} className="yomi-button yomi-button-primary">Save tracker changes</button><button type="button" disabled={busy} onClick={onCancel} className="yomi-button yomi-button-secondary">Cancel edit</button></div>
  </form>;
}
