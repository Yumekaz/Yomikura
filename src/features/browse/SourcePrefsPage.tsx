import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowLeft, Save, ShieldAlert, Check, Eye, EyeOff } from "lucide-react";
import { createGraphqlClient } from "../../api/graphql/client";
import { useSettingsStore } from "../../stores/useSettingsStore";
import { getErrorMessage } from "../../api/suwayomi/errors";

interface PreferenceField {
  __typename: "CheckBoxPreference" | "EditTextPreference" | "ListPreference" | "SwitchPreference";
  key: string;
  title: string;
  summary?: string | null;
  defaultBool?: boolean | null;
  valueBool?: boolean | null;
  defaultString?: string | null;
  valueString?: string | null;
  entries?: string[] | null;
  entryValues?: string[] | null;
  enabled: boolean;
  visible: boolean;
}

export default function SourcePrefsPage() {
  const { sourceId } = useParams<{ sourceId: string }>();
  const navigate = useNavigate();
  const { serverBaseUrl } = useSettingsStore();
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [pendingTextValues, setPendingTextValues] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const sdk = useMemo(() => {
    const cleanUrl = serverBaseUrl.replace(/\/$/, "");
    return createGraphqlClient(`${cleanUrl}/api/graphql`);
  }, [serverBaseUrl]);

  // Query: Get Source Preferences
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["source-preferences", sourceId, serverBaseUrl],
    queryFn: () => sdk.GetSourcePreferences({ sourceId: sourceId! }),
    enabled: !!serverBaseUrl && !!sourceId,
  });

  const source = data?.source;
  const preferences = (source?.preferences || []) as unknown as PreferenceField[];
  const visiblePreferenceCount = preferences.filter((pref) => pref.visible).length;

  // Mutation: Update Source Preference
  const { mutate: updatePreference, isPending: updating } = useMutation({
    mutationFn: ({ position, typename, value }: { position: number; typename: string; value: any }) => {
      const changePayload: any = { position };
      if (typename === "CheckBoxPreference") {
        changePayload.checkBoxState = value;
      } else if (typename === "SwitchPreference") {
        changePayload.switchState = value;
      } else if (typename === "EditTextPreference") {
        changePayload.editTextState = value;
      } else if (typename === "ListPreference") {
        changePayload.listState = value;
      }

      return sdk.UpdateSourcePreference({
        input: {
          source: sourceId!,
          change: changePayload,
        },
      });
    },
    onSuccess: () => {
      setSuccessMsg("Preference saved successfully!");
      setErrorMsg("");
      queryClient.invalidateQueries({ queryKey: ["source-preferences", sourceId] });
      setTimeout(() => setSuccessMsg(""), 3000);
    },
    onError: (err) => {
      setErrorMsg(`Failed to save preference: ${getErrorMessage(err)}`);
    },
  });

  const handleTextChange = (key: string, val: string) => {
    setPendingTextValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleTextSave = (key: string, position: number, typename: string) => {
    const value = pendingTextValues[key];
    if (value === undefined) return;
    updatePreference({ position, typename, value });
  };

  if (!serverBaseUrl) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-400">
        <ShieldAlert className="mb-4 h-12 w-12 opacity-50" />
        <p>Server not configured.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <Loader2 className="h-8 w-8 animate-spin text-yomi-jade" />
      </div>
    );
  }

  if (isError || !source) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 text-slate-300 p-4 text-center max-w-md mx-auto">
        <p className="text-red-400 font-semibold mb-2">Failed to load source preferences</p>
        <p className="text-sm mb-4">{getErrorMessage(error)}</p>
        <button
          onClick={() => navigate("/browse")}
          className="rounded-lg bg-yomi-jade px-4 py-2 font-medium text-ink-950 hover:bg-yomi-jade/90"
        >
          Back to Browse
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-ink-950/90 backdrop-blur-md border-b border-white/5 px-4 py-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/browse")}
              className="rounded-full p-2 hover:bg-white/10 text-slate-300"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white truncate">{source.name}</h1>
              <p className="text-xs text-slate-400 mt-0.5">Source Preferences</p>
            </div>
          </div>

          {updating && <Loader2 className="h-5 w-5 animate-spin text-yomi-jade" />}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {successMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-yomi-jade/20 bg-yomi-jade/10 p-3 text-sm text-yomi-jade">
            <Check className="h-4 w-4" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <ShieldAlert className="h-4 w-4" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="rounded-xl border border-white/5 bg-ink-900 overflow-hidden divide-y divide-white/5">
          {preferences.map((pref, index) => {
            if (!pref.visible) return null;

            const isText = pref.__typename === "EditTextPreference";
            const isSelect = pref.__typename === "ListPreference";
            const isCheck = pref.__typename === "CheckBoxPreference" || pref.__typename === "SwitchPreference";

            const currentValue = isCheck
              ? (pref.valueBool !== null && pref.valueBool !== undefined ? pref.valueBool : pref.defaultBool)
              : (pref.valueString !== null && pref.valueString !== undefined ? pref.valueString : pref.defaultString);

            return (
              <div key={pref.key} className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <h3 className="text-sm font-semibold text-slate-200">{pref.title}</h3>
                  {pref.summary && <p className="text-xs text-slate-400 leading-relaxed">{pref.summary}</p>}
                </div>

                <div className="flex items-center shrink-0 min-w-[180px] sm:justify-end">
                  {isCheck && (
                    /* Checkbox or Switch */
                    <button
                      onClick={() =>
                        updatePreference({
                          position: index,
                          typename: pref.__typename,
                          value: !currentValue,
                        })
                      }
                      disabled={!pref.enabled || updating}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        currentValue ? "bg-yomi-jade" : "bg-ink-950"
                      } disabled:opacity-50`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          currentValue ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  )}

                  {isSelect && (
                    /* Select Dropdown */
                    <select
                      value={currentValue as string || ""}
                      onChange={(e) =>
                        updatePreference({
                          position: index,
                          typename: pref.__typename,
                          value: e.target.value,
                        })
                      }
                      disabled={!pref.enabled || updating}
                      className="w-full rounded bg-ink-950 border border-white/10 px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-yomi-jade/50 transition-colors"
                    >
                      {(pref.entries || []).map((entry, idx) => {
                        const val = pref.entryValues?.[idx] || entry;
                        return (
                          <option key={val} value={val}>
                            {entry}
                          </option>
                        );
                      })}
                    </select>
                  )}

                  {isText && (() => {
                    const isSensitive = ["password", "token", "secret", "key", "auth"].some(
                      (kw) => pref.key.toLowerCase().includes(kw) || pref.title.toLowerCase().includes(kw)
                    );
                    const isVisible = showPasswords[pref.key] || false;
                    const inputType = isSensitive ? (isVisible ? "text" : "password") : "text";

                    return (
                      /* Text Input with Save button and password toggler */
                      <div className="flex gap-2 w-full">
                        <div className="relative flex-1">
                          <input
                            type={inputType}
                            value={
                              pendingTextValues[pref.key] !== undefined
                                ? pendingTextValues[pref.key]
                                : (currentValue as string) || ""
                            }
                            onChange={(e) => handleTextChange(pref.key, e.target.value)}
                            className="w-full rounded bg-ink-950 border border-white/10 pl-3 pr-8 py-1.5 text-xs text-slate-300 outline-none focus:border-yomi-jade/50 transition-colors"
                            disabled={!pref.enabled || updating}
                          />
                          {isSensitive && (
                            <button
                              type="button"
                              onClick={() => setShowPasswords(prev => ({ ...prev, [pref.key]: !prev[pref.key] }))}
                              className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-300 transition"
                            >
                              {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </div>
                        <button
                          onClick={() => handleTextSave(pref.key, index, pref.__typename)}
                          disabled={!pref.enabled || updating || pendingTextValues[pref.key] === undefined}
                          className="rounded bg-yomi-jade p-1.5 text-ink-950 hover:bg-yomi-jade/90 disabled:opacity-50 transition shrink-0"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}

          {visiblePreferenceCount === 0 && (
            <div className="p-12 text-center text-slate-500">
              No configurable settings found for this source extension.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
