import { useState, useRef, useMemo } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { X, Upload, Send, Loader2, FileText, Check, Eye, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { toast } from "sonner";

// ── Helpers ─────────────────────────────────────────────────────────────────

const RECORD_TYPES = [
  { key: "transactions",    label: "Transactions" },
  { key: "lab_results",     label: "Lab Results" },
  { key: "prescriptions",   label: "Prescriptions" },
  { key: "investments",     label: "Investments" },
  { key: "loans",           label: "Loans" },
  { key: "vitals",          label: "Vitals" },
  { key: "trips",           label: "Trips" },
  { key: "career_events",   label: "Career Events" },
  { key: "goals",           label: "Goals" },
  { key: "supplements",     label: "Supplements" },
  { key: "generic_entries", label: "Other Notes" },
];

function previewRecord(type, item) {
  if (type === "transactions")  return `${item.date || ""} · ${item.category || ""} · ₹${item.amount || ""}`;
  if (type === "lab_results")   return `${item.test || ""}: ${item.value || ""} ${item.unit || ""}`;
  if (type === "prescriptions") return `${item.date || ""} · ${(item.medications || []).map((m) => m.name).join(", ")}`;
  if (type === "investments")   return `${item.name || ""} (${item.kind || ""})`;
  if (type === "loans")         return `${item.name || ""}: ₹${item.outstanding || ""}`;
  if (type === "vitals")        return `${item.kind || ""}: ${item.value || ""} ${item.unit || ""}`;
  if (type === "trips")         return `${item.name || ""} → ${item.destination || ""}`;
  if (type === "career_events") return `${item.date || ""} · ${item.title || ""}`;
  if (type === "goals")         return `${item.name || ""} · ₹${item.target_amount || ""}`;
  if (type === "supplements")   return `${item.name || ""} · ${item.dose || ""} ${item.frequency || ""}`;
  return item.title || item.name || "Record";
}

function countProposed(parsed) {
  return RECORD_TYPES.reduce((s, t) => s + (parsed?.[t.key] || []).length, 0);
}

// ── Diff/Confirm view ────────────────────────────────────────────────────────

function DiffConfirmView({ result, busy, onApply, onSkip }) {
  const available = RECORD_TYPES.filter((t) => (result.parsed?.[t.key] || []).length > 0);
  const planUpdates = result.plan_updates || [];

  const [selected, setSelected] = useState(
    Object.fromEntries(available.map((t) => [t.key, true]))
  );
  const [approvedGoals, setApprovedGoals] = useState(
    Object.fromEntries(planUpdates.map((u) => [u.goal_name, true]))
  );
  const [expanded, setExpanded] = useState({});

  const toggle = (key) => setSelected((s) => ({ ...s, [key]: !s[key] }));
  const toggleGoal = (name) => setApprovedGoals((s) => ({ ...s, [name]: !s[name] }));
  const toggleExpand = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));

  const selectedTypes = available.filter((t) => selected[t.key]).map((t) => t.key);
  const approvedGoalNames = planUpdates.filter((u) => approvedGoals[u.goal_name]).map((u) => u.goal_name);
  const totalSelected = selectedTypes.reduce((s, k) => s + (result.parsed?.[k] || []).length, 0);
  const isVision = result.parsed?._source === "vision";

  const handleApply = () => {
    onApply(selectedTypes, approvedGoalNames.length > 0 ? approvedGoalNames : null);
  };

  return (
    <div className="space-y-4" data-testid="diff-confirm-view">
      <div className="flex items-start gap-2">
        {isVision && (
          <span className="inline-flex items-center gap-1 text-xs bg-[#367A50]/10 text-[#367A50] border border-[#367A50]/20 rounded-full px-2.5 py-1 font-medium">
            <Sparkles className="h-3 w-3" /> Vision AI
          </span>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-[#111812] leading-snug">{result.parsed?.summary}</p>
          <p className="text-xs text-[#5E6A62] mt-0.5">
            Found {countProposed(result.parsed)} records across {available.length} categor{available.length === 1 ? "y" : "ies"}.
            {planUpdates.length > 0 && ` Also ${planUpdates.length} goal target update${planUpdates.length > 1 ? "s" : ""}.`}
            {" "}Choose what to save:
          </p>
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {available.map((t) => {
          const items = result.parsed?.[t.key] || [];
          const isOpen = expanded[t.key];
          return (
            <div
              key={t.key}
              className={`rounded-xl border transition ${
                selected[t.key]
                  ? "border-[#184A31]/40 bg-[#184A31]/5"
                  : "border-[#E5E2DC] bg-white opacity-60"
              }`}
            >
              <div className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={selected[t.key]}
                  onChange={() => toggle(t.key)}
                  data-testid={`diff-check-${t.key}`}
                  className="accent-[#184A31] h-4 w-4 rounded"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-[#111812]">{t.label}</span>
                  {!isOpen && (
                    <span className="text-xs text-[#5E6A62] ml-2 truncate">
                      {previewRecord(t.key, items[0])}
                      {items.length > 1 && ` +${items.length - 1} more`}
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono bg-[#F2F0E9] px-2 py-0.5 rounded-full">{items.length}</span>
                <button
                  onClick={() => toggleExpand(t.key)}
                  className="text-[#5E6A62] hover:text-[#111812] p-0.5"
                  aria-label="expand"
                >
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              {isOpen && (
                <div className="px-3 pb-3 space-y-1 border-t border-[#E5E2DC] pt-2">
                  {items.map((item, i) => (
                    <div key={t.key + '-' + i} className="text-xs text-[#5E6A62] bg-white rounded-lg px-2.5 py-1.5 border border-[#E5E2DC] truncate">
                      {previewRecord(t.key, item)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Plan updates section */}
        {planUpdates.length > 0 && (
          <div className="rounded-xl border border-[#D19B4C]/40 bg-[#D19B4C]/5 p-3" data-testid="plan-updates-section">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-[#D19B4C] uppercase tracking-wider">Goal Target Updates</span>
              <span className="text-xs font-mono bg-[#D19B4C]/15 text-[#D19B4C] px-2 py-0.5 rounded-full">{planUpdates.length}</span>
            </div>
            <div className="space-y-2">
              {planUpdates.map((u) => (
                <div key={u.goal_name} className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition ${approvedGoals[u.goal_name] ? "border-[#D19B4C]/40 bg-white" : "border-[#E5E2DC] bg-white opacity-60"}`}
                  data-testid={`plan-update-${u.goal_name.replace(/\s+/g, "-").toLowerCase()}`}>
                  <input
                    type="checkbox"
                    checked={approvedGoals[u.goal_name]}
                    onChange={() => toggleGoal(u.goal_name)}
                    className="accent-[#D19B4C] h-4 w-4"
                    data-testid={`plan-update-check-${u.goal_name.replace(/\s+/g, "-").toLowerCase()}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#111812] truncate">{u.goal_name}</div>
                    <div className="text-xs text-[#5E6A62] flex items-center gap-1.5">
                      <span className="line-through">₹{u.current_target.toLocaleString("en-IN")}</span>
                      <span className="text-[#D19B4C]">→</span>
                      <span className="font-medium text-[#111812]">₹{u.proposed_target.toLocaleString("en-IN")}</span>
                      <span className="bg-[#D19B4C]/15 text-[#D19B4C] px-1.5 rounded text-xs">{u.action}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={handleApply}
          disabled={busy || (totalSelected === 0 && approvedGoalNames.length === 0)}
          data-testid="diff-apply-button"
          className="flex-1 flex items-center justify-center gap-2 bg-[#184A31] hover:bg-[#113523] text-white py-2.5 rounded-full text-sm font-medium transition disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Apply {totalSelected} record{totalSelected !== 1 ? "s" : ""}
          {approvedGoalNames.length > 0 && ` + ${approvedGoalNames.length} goal update${approvedGoalNames.length !== 1 ? "s" : ""}`}
        </button>
        <button
          onClick={onSkip}
          data-testid="diff-skip-button"
          className="px-5 py-2.5 rounded-full border border-[#E5E2DC] text-sm text-[#5E6A62] hover:border-[#184A31] transition"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ── Success result card ──────────────────────────────────────────────────────

function ResultCard({ result }) {
  const isVision = result.parsed?._source === "vision";
  const countEntries = useMemo(
    () => Object.entries(result.counts || {}).filter(([, v]) => v > 0),
    [result.counts]
  );
  return (
    <div className="card-surface p-4 mt-2" data-testid="inbox-last-result">
      <div className="flex items-center gap-2 text-[#367A50]">
        <Check className="h-4 w-4" />
        <span className="text-sm font-medium">{result.parsed?.summary || "Processed"}</span>
        {isVision && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs bg-[#367A50]/10 text-[#367A50] border border-[#367A50]/20 rounded-full px-2 py-0.5">
            <Sparkles className="h-2.5 w-2.5" /> Vision AI
          </span>
        )}
      </div>
      {countEntries.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
          {countEntries.map(([k, v]) => (
            <div key={k} className="text-xs bg-[#F2F0E9] border border-[#E5E2DC] rounded-lg px-2.5 py-1.5">
              <span className="text-[#5E6A62]">{k.replace("_", " ")}</span>
              <span className="ml-1.5 font-mono font-semibold text-[#184A31]">+{v}</span>
            </div>
          ))}
        </div>
      )}
      {result.document_id && (
        <div className="mt-3 flex items-center gap-2 text-xs text-[#5E6A62]">
          <FileText className="h-3.5 w-3.5" />
          Stored in Documents library
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function UniversalInbox({ open, onClose }) {
  const { activeMember, members } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [proposedResult, setProposedResult] = useState(null);
  const fileRef = useRef(null);

  if (!open) return null;

  const memberIdParam = activeMember === "family" ? null : activeMember;

  // ── Text submit (auto-save, no confirmation needed) ──
  const submitText = async () => {
    if (!text.trim()) { toast.error("Type something first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/inbox/text", { text, member_id: memberIdParam });
      setLastResult(data);
      setText("");
      toast.success("Captured & routed", { description: data.parsed?.summary });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not process");
    } finally { setBusy(false); }
  };

  // ── File upload: dry-run first, then show confirm modal ──
  const submitFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setLastResult(null);
    setProposedResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("dry_run", "true");
      if (memberIdParam) fd.append("member_id", memberIdParam);
      const { data } = await api.post("/inbox/file", fd, { headers: { "Content-Type": "multipart/form-data" } });

      if (data.proposed && countProposed(data.parsed) > 0) {
        setProposedResult(data);
        toast.info("Document analysed — review records below");
      } else {
        // Nothing parseable found
        setLastResult({ parsed: data.parsed, counts: {}, document_id: data.document_id });
        toast.info(`Stored ${file.name}`, { description: data.parsed?.summary });
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Apply user-confirmed records ──
  const applyProposed = async (selectedTypes, approvedGoalNames) => {
    if (!proposedResult) return;
    setBusy(true);
    try {
      const { data } = await api.post("/inbox/apply", {
        parsed: proposedResult.parsed,
        doc_id: proposedResult.document_id,
        member_id: memberIdParam,
        selected_types: selectedTypes,
        approved_goal_names: approvedGoalNames,
      });
      setLastResult({ parsed: proposedResult.parsed, counts: data.counts, document_id: proposedResult.document_id });
      setProposedResult(null);
      const total = Object.values(data.counts || {}).reduce((a, b) => a + b, 0);
      toast.success(`${total} record${total !== 1 ? "s" : ""} saved`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Apply failed");
    } finally { setBusy(false); }
  };

  const skipProposed = () => {
    setProposedResult(null);
    toast.info("Records skipped — file is still stored in Documents");
  };

  const exampleChips = [
    "Spent 2000 on groceries today",
    "Salary credit ₹185000 today",
    "BP 128/82 this morning",
    "Bought 5 units of Parag Parikh Flexicap at ₹68",
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[#111812]/40 backdrop-blur-sm p-3 md:p-6"
      data-testid="universal-inbox-modal"
    >
      <div className="w-full max-w-2xl bg-[#F2F0E9] border border-[#E5E2DC] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E2DC] bg-white">
          <div>
            <div className="label-eyebrow">Universal Inbox</div>
            <div className="font-display text-xl mt-0.5">
              {proposedResult ? "Review & confirm records" : "Drop anything — we'll sort it"}
            </div>
          </div>
          <button onClick={onClose} data-testid="close-inbox-button" className="p-2 rounded-full hover:bg-[#F2F0E9] text-[#5E6A62]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* ── Diff confirm step ── */}
          {proposedResult ? (
            <DiffConfirmView
              result={proposedResult}
              busy={busy}
              onApply={applyProposed}
              onSkip={skipProposed}
            />
          ) : (
            <>
              <div className="text-xs text-[#5E6A62]">
                Routing to:{" "}
                <span className="font-medium text-[#184A31]">
                  {activeMember === "family" ? "Auto-detect / first member" : members.find((m) => m.id === activeMember)?.name}
                </span>
              </div>

              <textarea
                data-testid="inbox-text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder="e.g. 'Spent 2000 on groceries today' or paste a bank statement…"
                className="w-full bg-white border border-[#E5E2DC] rounded-xl p-4 text-sm focus:outline-none focus:border-[#184A31] resize-none"
              />

              <div className="flex flex-wrap gap-2">
                {exampleChips.map((c) => (
                  <button
                    key={c}
                    onClick={() => setText(c)}
                    className="text-xs px-3 py-1.5 rounded-full bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31] hover:text-[#184A31] transition"
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <input
                  ref={fileRef}
                  type="file"
                  onChange={submitFile}
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.txt,.csv,.json,.md"
                  className="hidden"
                  data-testid="inbox-file-input"
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  data-testid="inbox-upload-button"
                  className="flex items-center gap-2 bg-white border border-[#E5E2DC] hover:border-[#184A31] px-4 py-2.5 rounded-full text-sm font-medium transition disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={1.8} />}
                  Upload document
                </button>
                <div className="flex items-center gap-1 text-xs text-[#5E6A62]">
                  <Eye className="h-3 w-3" />
                  <span>Images processed with Vision AI</span>
                </div>
                <button
                  onClick={submitText}
                  disabled={busy || !text.trim()}
                  data-testid="inbox-send-button"
                  className="ml-auto flex items-center gap-2 bg-[#184A31] hover:bg-[#113523] text-white px-5 py-2.5 rounded-full text-sm font-medium transition disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={1.8} />}
                  Process
                </button>
              </div>

              {lastResult && <ResultCard result={lastResult} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
