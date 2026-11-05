import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, ArrowRight, BookOpen, Check, CheckCircle2, Download, ExternalLink, HardDrive, Laptop, Link2, Loader2, Monitor, Play, Puzzle, Search, Server, WifiOff } from "lucide-react";
import { BrandLogo, ReadingSpirit } from "../../components/Brand";
import { DesktopDownloadLink } from "../../components/onboarding/DesktopDownloadLink";
import { DEFAULT_SERVER_BASE_URL, validateServerBaseUrl } from "../../config/server";
import { useSettingsStore } from "../../stores/useSettingsStore";
import "./browserSetup.css";

const SUWAYOMI_DOWNLOADS = "https://github.com/Suwayomi/Suwayomi-Server/releases/latest";
const SUWAYOMI_INSTALL = "https://github.com/Suwayomi/Suwayomi-Server#downloading-and-running-the-app";
const SUWAYOMI_CONFIG = "https://github.com/Suwayomi/Suwayomi-Server/wiki/Configuring-Suwayomi%E2%80%90Server";

function OutsideLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="yomi-guide-text-link">{children}<ExternalLink aria-hidden="true" /></a>;
}

/** Explanatory diagrams are deliberately illustrative, not disabled controls. */
function Diagram({ label, children }: { label: string; children: ReactNode }) {
  return <figure className="yomi-guide-diagram" aria-label={label}>
    <div className="yomi-guide-window-top" aria-hidden="true"><span /><span /><span /></div>
    {children}
    <figcaption>{label}</figcaption>
  </figure>;
}

export default function BrowserSetupPage() {
  const navigate = useNavigate();
  const connectionStatus = useSettingsStore((state) => state.connectionStatus);
  const mockMode = useSettingsStore((state) => state.mockMode);
  const [address, setAddress] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const connected = !mockMode && connectionStatus === "connected";

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateServerBaseUrl(address);
    if (!validation.valid) { setFeedback(validation.message); return; }
    setConnecting(true); setFeedback(null);
    // Keep the old profile (especially a managed desktop library) intact.
    // Connecting explicitly establishes the backend identity through the same
    // path as onboarding; the guide never installs or trusts a source itself.
    const settings = useSettingsStore.getState();
    settings.setMockMode(false);
    const existing = settings.profiles.find((profile) => {
      const value = validateServerBaseUrl(profile.url);
      return value.valid && value.normalizedUrl === validation.normalizedUrl;
    });
    if (existing) settings.setActiveProfileId(existing.id);
    else settings.addProfile("Browser library", validation.normalizedUrl);
    const ok = await useSettingsStore.getState().testConnection();
    if (!mounted.current) return;
    setConnecting(false);
    if (ok) setFeedback("Your library is connected. Next, choose your sources below.");
    else setFeedback("We couldn’t connect yet. Keep Suwayomi running, confirm its address, then try again. Your other libraries are still saved.");
  };

  return <div className="yomi-setup-guide">
    <header className="yomi-guide-heading">
      <div><span className="yomi-eyebrow">A little help getting started</span><h1>Your browser. Your reading room.</h1><p>Four steps from a new installation to your first chapter. No coding required.</p></div>
      <Link to="/library" className="yomi-button yomi-button-secondary">Back to library<ArrowRight aria-hidden="true" /></Link>
    </header>

    <div className="yomi-guide-paths">
      <section className="yomi-guide-desktop" aria-labelledby="guide-desktop-title">
        <div className="yomi-guide-recommendation"><Laptop aria-hidden="true" /><span>The easiest way</span></div>
        <h2 id="guide-desktop-title">Let the desktop app do the setup.</h2>
        <p>Install Yomikura and choose <strong>Set up my library</strong>. It prepares Java and Suwayomi for you, then opens your library.</p>
        <DesktopDownloadLink />
        <ReadingSpirit mood="resting" className="yomi-guide-spirit" />
      </section>
      <section className="yomi-guide-browser" aria-labelledby="guide-browser-title">
        <Monitor aria-hidden="true" /><h2 id="guide-browser-title">Prefer reading in your browser?</h2>
        <p>Suwayomi keeps your books and fetches chapters. Yomikura is where you browse, organize and read them.</p>
        <a href="#guide-install" className="yomi-button yomi-button-secondary">Start the browser guide<ArrowDown aria-hidden="true" /></a>
        <a href="#guide-connect" className="yomi-guide-text-link">I already have Suwayomi<Link2 aria-hidden="true" /></a>
      </section>
    </div>

    <nav className="yomi-guide-steps-nav" aria-label="Browser setup steps">
      {[ ["guide-install", "Install"], ["guide-connect", "Connect"], ["guide-sources", "Choose sources"], ["guide-read", "Read"] ].map(([id, name], index) => <a key={id} href={`#${id}`}><span>{index + 1}</span>{name}</a>)}
    </nav>

    <ol className="yomi-guide-steps">
      <li id="guide-install" className="yomi-guide-step">
        <div className="yomi-guide-step-copy"><span className="yomi-guide-step-number" aria-hidden="true">01</span><h2>Give your library a home.</h2><p>Download Suwayomi’s bundle for your computer from its official release page. Windows ZIP and macOS bundles include Java. On Linux, follow the package requirements in the official instructions.</p><p>On Windows, choose the file ending in windows-x64.zip, right-click it and choose Extract All. Open the extracted folder (and its same-named inner folder, if present), then open Suwayomi Launcher.bat. Choose Launch and leave the server running while you read. First startup can take a few minutes.</p><div className="yomi-guide-actions"><OutsideLink href={SUWAYOMI_DOWNLOADS}>Download Suwayomi</OutsideLink><OutsideLink href={SUWAYOMI_INSTALL}>Instructions for your computer</OutsideLink></div><details><summary>Which download should I choose?</summary><p>On Windows, look for <strong>windows-x64.zip</strong> (for example, <code>Suwayomi-Server-v2.4.2366-windows-x64.zip</code>). On a Mac, use <strong>macOS-arm64</strong> for Apple silicon or <strong>macOS-x64</strong> for an Intel Mac. On Linux, follow the official Linux instructions. Choose an operating-system bundle rather than the standalone <code>.jar</code> if you want the included Java runtime.</p><p>The Windows ZIP includes Java. The <code>.msi</code> installer has a different setup flow; the similarly named launcher JAR is not the bundled Windows launcher. If Windows shows a publisher warning, verify the official download before deciding whether to run it. Do not disable Windows protection.</p><p>For an existing library, keep a backup before changing server versions. For a separate library, create an empty folder and select it with <strong>Root Directory → folder button</strong> before Launch. Keep a note of that exact path; choosing Downloads itself stores library files directly there.</p><p>These steps follow <OutsideLink href={SUWAYOMI_INSTALL}>Suwayomi’s official installation guide</OutsideLink>. Release filenames can change; use that guide if the available packages differ.</p></details></div>
        <Diagram label="Keep the library server running"><div className="yomi-guide-install-visual"><div className="yomi-guide-archive"><Download aria-hidden="true" /><span>Suwayomi bundle</span><small>Your computer’s version</small></div><ArrowDown aria-hidden="true" /><div className="yomi-guide-server"><Server aria-hidden="true" /><div><strong>Suwayomi</strong><span><Check aria-hidden="true" />Library server running</span></div><Play aria-hidden="true" /></div></div></Diagram>
      </li>

      <li id="guide-connect" className="yomi-guide-step">
        <div className="yomi-guide-step-copy"><span className="yomi-guide-step-number" aria-hidden="true">02</span><h2>Connect your reading room.</h2><p>When Suwayomi opens its own browser page, copy the library address from that page’s address bar. Paste it here without adding <code>/api/graphql</code>.</p><p>If Suwayomi is on this computer with its usual settings, the suggested address below is the place to start.</p>
          {connected ? <div className="yomi-guide-connected" role="status"><CheckCircle2 aria-hidden="true" /><span>Your current library is connected.</span><button type="button" className="yomi-guide-text-link" onClick={() => setShowDetails((value) => !value)} aria-expanded={showDetails}>Connect another library</button></div> : null}
          {(!connected || showDetails) && <form onSubmit={(event) => void connect(event)} className="yomi-guide-connect-form"><label htmlFor="guide-library-address">Your Suwayomi address</label><input id="guide-library-address" className="yomi-field" type="url" autoComplete="off" spellCheck={false} required value={address} onChange={(event) => { setAddress(event.target.value); setFeedback(null); }} placeholder="Paste your library’s address" aria-describedby="guide-address-hint" disabled={connecting} /><span id="guide-address-hint">On this computer? <button type="button" className="yomi-guide-text-link" disabled={connecting} onClick={() => { setAddress(DEFAULT_SERVER_BASE_URL); setFeedback(null); }}>Use the usual address</button></span><button type="submit" className="yomi-button yomi-button-primary" disabled={connecting}>{connecting ? <><Loader2 aria-hidden="true" className="animate-spin" />Connecting…</> : <><Link2 aria-hidden="true" />Connect my library</>}</button></form>}
          {feedback && <p className="yomi-guide-feedback" role={connected ? "status" : "alert"}>{feedback}</p>}
          <details><summary>Only reading on this computer?</summary><p>In Suwayomi’s own interface, use <strong>More → Settings → Server → IP</strong> and save <code>127.0.0.1</code>. Restart Suwayomi to apply it. On Windows, open Suwayomi’s icon beside the clock (possibly under the hidden-icons arrow) and choose <strong>Quit</strong>, then reopen its launcher and choose Launch. Closing a browser tab does not stop the server. Keep the same Root Directory when restarting.</p></details>
          <details><summary>Another device, a hosted website, or a connection problem?</summary><p><strong>Localhost means this device.</strong> On another computer or phone, use the address of the computer running Suwayomi. That computer must remain on and reachable.</p><p>A hosted HTTPS website may be unable to reach an HTTP library because of browser connection restrictions. Start with the desktop app or a local website, or ask whoever runs your library for a compatible HTTPS address. Do not turn off browser security.</p><p>Yomikura currently connects without an in-app username/password form. A server requiring authentication or a browser-origin configuration may need its administrator’s help. Do not paste credentials into the address.</p><p><OutsideLink href={SUWAYOMI_CONFIG}>Official connection settings</OutsideLink></p></details>
        </div>
        <Diagram label="One library, your choice of reader"><div className="yomi-guide-connection-visual"><div><Server aria-hidden="true" /><strong>Suwayomi</strong><span>Your books &amp; chapters</span></div><div className="yomi-guide-connection-line" aria-hidden="true"><span /><ArrowRight /></div><div><BrandLogo /><strong>Yomikura</strong><span>Your reading room</span></div></div><div className="yomi-guide-address-example"><Link2 aria-hidden="true" /><code>{DEFAULT_SERVER_BASE_URL}</code><span>Example: same computer</span></div></Diagram>
      </li>

      <li id="guide-sources" className="yomi-guide-step">
        <div className="yomi-guide-step-copy"><span className="yomi-guide-step-number" aria-hidden="true">03</span><h2>Choose where your stories come from.</h2><p>Open <strong>Discover → Extensions → Stores</strong>. Add a store you trust, review its publisher information, then install the source you want from Extensions.</p><p>An extension is the connector for a reading source. Yomikura includes no third-party sources or comic content; you choose what to add.</p><div className="yomi-guide-actions">{connected ? <><Link to="/browse/extension-repos" className="yomi-button yomi-button-secondary">Choose a store<Puzzle aria-hidden="true" /></Link><Link to="/extensions" className="yomi-guide-text-link">Browse extensions<ArrowRight aria-hidden="true" /></Link></> : <a className="yomi-guide-text-link" href="#guide-connect">Connect your library first<ArrowRight aria-hidden="true" /></a>}</div><details><summary>My source is missing or shows an error.</summary><p>Confirm it is installed in this Suwayomi library, check your connection, and look for extension updates. A source can be unavailable even while your library is working. Your other sources and saved books remain separate.</p></details></div>
        <Diagram label="Choose a store, then install a source"><div className="yomi-guide-source-visual"><div><Puzzle aria-hidden="true" /><span>Trusted store</span><small>Review the publisher</small></div><ArrowDown aria-hidden="true" /><div><BookOpen aria-hidden="true" /><span>Your chosen source</span><span className="yomi-guide-example-label">Install</span></div></div></Diagram>
      </li>

      <li id="guide-read" className="yomi-guide-step">
        <div className="yomi-guide-step-copy"><span className="yomi-guide-step-number" aria-hidden="true">04</span><h2>Find a story. Make yourself at home.</h2><p>Open your installed source in <strong>Discover</strong>, search for a title, then open a chapter. Add books you want to keep to your Library and choose their collections.</p><p>Reading history remembers your latest position even for books you have not added. Come back to your library or History when you want to continue.</p><div className="yomi-guide-actions">{connected ? <button type="button" className="yomi-button yomi-button-primary" onClick={() => navigate("/browse/sources")}>Discover books<ArrowRight aria-hidden="true" /></button> : <a className="yomi-guide-text-link" href="#guide-connect">Connect, then discover books<ArrowRight aria-hidden="true" /></a>}</div></div>
        <Diagram label="Your next chapter is waiting"><div className="yomi-guide-shelf-visual" aria-hidden="true"><Search /><span>Find your next story…</span><div className="yomi-guide-mini-books"><i /><i /><i /></div><div className="yomi-guide-reading-card"><BookOpen /><span>Pick up where you left off</span><ArrowRight /></div></div></Diagram>
      </li>
    </ol>

    <section className="yomi-guide-keep" aria-labelledby="guide-keep-title"><div><HardDrive aria-hidden="true" /><h2 id="guide-keep-title">Know where your books live.</h2></div><dl><div><dt>Your library &amp; server downloads</dt><dd>Stored with Suwayomi on the computer running it. Keep that computer and Suwayomi running to reach them. You can close Suwayomi’s browser tab once connected; leave its server running.</dd></div><div><dt>Your Yomikura preferences</dt><dd>Saved in this browser. Clearing its site data can remove device preferences and retained local records. Back up your library from Settings → Backups.</dd></div><div><dt>Reading without internet</dt><dd>Your local server can still run without internet. A chapter already downloaded on that reachable server can be read; an unsaved chapter still needs its source. Desktop also offers chapters saved on this device when its server is unavailable.</dd></div></dl></section>
    <section className="yomi-guide-help" aria-labelledby="guide-help-title"><WifiOff aria-hidden="true" /><div><h2 id="guide-help-title">If the connection drops, your books haven’t vanished.</h2><p>Restart Suwayomi and reconnect. If one source fails, try another or check its extension update. Downloaded chapters and unsaved chapters have different availability; the reader will explain when it cannot fetch a chapter.</p><OutsideLink href="https://github.com/Suwayomi/Suwayomi-Server/wiki/Troubleshooting">Suwayomi troubleshooting</OutsideLink></div></section>
    <footer className="yomi-guide-footer"><BrandLogo /><span>Your books. Your reading room.</span><Link to="/settings/connection" className="yomi-guide-text-link">Connection settings<ArrowRight aria-hidden="true" /></Link></footer>
  </div>;
}
