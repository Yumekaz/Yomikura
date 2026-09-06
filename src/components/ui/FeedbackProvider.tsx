import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "info" | "success" | "error";

export interface ConfirmOptions {
  title: string;
  detail: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

interface TextRequest {
  title: string;
  detail: string;
  initialValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
}

interface FeedbackContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  notify: (message: string, tone?: ToastTone) => void;
  requestText: (options: Omit<TextRequest, "resolve">) => Promise<string | null>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [textRequest, setTextRequest] = useState<TextRequest | null>(null);
  const [textValue, setTextValue] = useState("");
  const dialogTitleId = useId();
  const dialogDetailId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const toastIdRef = useRef(0);

  const closeConfirm = useCallback((confirmed: boolean) => {
    setRequest((current) => {
      current?.resolve(confirmed);
      return null;
    });
    window.setTimeout(() => previousFocusRef.current?.focus(), 0);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    return new Promise<boolean>((resolve) => setRequest({ ...options, resolve }));
  }, []);

  const notify = useCallback((message: string, tone: ToastTone = "info") => {
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, tone });
  }, []);

  const requestText = useCallback((options: Omit<TextRequest, "resolve">) => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setTextValue(options.initialValue ?? "");
    return new Promise<string | null>((resolve) => setTextRequest({ ...options, resolve }));
  }, []);

  const closeTextRequest = useCallback((value: string | null) => {
    setTextRequest((current) => {
      current?.resolve(value);
      return null;
    });
    window.setTimeout(() => previousFocusRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!request && !textRequest) return;
    const activeDialog = request ? "[data-yomi-confirm]" : "[data-yomi-text-request]";
    const closeActiveDialog = request ? () => closeConfirm(false) : () => closeTextRequest(null);
    if (request) cancelRef.current?.focus();
    else document.querySelector<HTMLButtonElement>(`${activeDialog} button[type=button]`)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeActiveDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>(activeDialog);
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeConfirm, closeTextRequest, request, textRequest]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast((current) => current?.id === toast.id ? null : current), 4200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const value = useMemo(() => ({ confirm, notify, requestText }), [confirm, notify, requestText]);

  const ToastIcon = toast?.tone === "success" ? CheckCircle2 : toast?.tone === "error" ? AlertTriangle : Info;

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {request && (
        <div className="yomi-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeConfirm(false)}>
          <section
            className="yomi-dialog"
            data-yomi-confirm
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDetailId}
          >
            <div className={`yomi-dialog-icon ${request.danger ? "is-danger" : ""}`}>
              <AlertTriangle aria-hidden="true" />
            </div>
            <div className="yomi-dialog-copy">
              <h2 id={dialogTitleId}>{request.title}</h2>
              <p id={dialogDetailId}>{request.detail}</p>
            </div>
            <div className="yomi-dialog-actions">
              <button ref={cancelRef} type="button" className="yomi-button yomi-button-secondary" onClick={() => closeConfirm(false)}>
                {request.cancelLabel ?? "Cancel"}
              </button>
              <button type="button" className={`yomi-button ${request.danger ? "yomi-button-danger" : "yomi-button-primary"}`} onClick={() => closeConfirm(true)}>
                {request.confirmLabel ?? "Continue"}
              </button>
            </div>
          </section>
        </div>
      )}
      {textRequest && (
        <div className="yomi-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeTextRequest(null)}>
          <form className="yomi-dialog" data-yomi-text-request role="dialog" aria-modal="true" aria-labelledby={`${dialogTitleId}-text`} onSubmit={(event) => { event.preventDefault(); closeTextRequest(textValue.trim() || null); }}>
            <div className="yomi-dialog-copy">
              <h2 id={`${dialogTitleId}-text`}>{textRequest.title}</h2>
              <p>{textRequest.detail}</p>
              <input autoFocus className="yomi-dialog-input" value={textValue} onChange={(event) => setTextValue(event.target.value)} />
            </div>
            <div className="yomi-dialog-actions">
              <button type="button" className="yomi-button yomi-button-secondary" onClick={() => closeTextRequest(null)}>Cancel</button>
              <button type="submit" className="yomi-button yomi-button-primary" disabled={!textValue.trim()}>{textRequest.confirmLabel ?? "Save"}</button>
            </div>
          </form>
        </div>
      )}
      {toast && (
        <div className={`yomi-toast is-${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"} aria-live={toast.tone === "error" ? "assertive" : "polite"}>
          <ToastIcon aria-hidden="true" />
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><X /></button>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside FeedbackProvider");
  return value;
}
