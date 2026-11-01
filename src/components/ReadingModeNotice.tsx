import { Link } from "react-router-dom";
import { useSettingsStore } from "../stores/useSettingsStore";
export function ReadingModeNotice() {
  const { experience, updateExperience } = useSettingsStore();
  if (!experience.incognito && !experience.downloadedOnly) return null;
  return <div className="yomi-reading-mode-notice"><p role="status">{experience.incognito && <span>Incognito reading · New progress and history are paused.</span>}{experience.downloadedOnly && <span>Downloaded books only.</span>}</p><div>{experience.incognito && <button className="yomi-text-link" onClick={() => updateExperience({ incognito: false })}>End incognito</button>}{experience.downloadedOnly && <button className="yomi-text-link" onClick={() => updateExperience({ downloadedOnly: false })}>Show all books</button>}<Link className="yomi-text-link" to="/settings/privacy">Reading preferences</Link></div></div>;
}
