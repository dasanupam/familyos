import { useState, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { X, Upload, Send, Loader2, FileText, Check } from "lucide-react";
import { toast } from "sonner";

export default function UniversalInbox({ open, onClose }) {
  const { activeMember, members } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const fileRef = useRef(null);

  if (!open) return null;

  const memberIdParam = activeMember === "family" ? null : activeMember;

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

  const submitFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (memberIdParam) fd.append("member_id", memberIdParam);
      const { data } = await api.post("/inbox/file", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setLastResult(data);
      toast.success(`Processed ${file.name}`, { description: data.parsed?.summary });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const exampleChips = [
    "Spent 2000 on groceries today",
    "Salary credit ₹185000 today",
    "BP 128/82 this morning",
    "Bought 5 units of Parag Parikh Flexicap at ₹68",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[#111812]/40 backdrop-blur-sm p-3 md:p-6" data-testid="universal-inbox-modal">
      <div className="w-full max-w-2xl bg-[#F2F0E9] border border-[#E5E2DC] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E2DC] bg-white">
          <div>
            <div className="label-eyebrow">Universal Inbox</div>
            <div className="font-display text-xl mt-0.5">Drop anything — we'll sort it</div>
          </div>
          <button onClick={onClose} data-testid="close-inbox-button" className="p-2 rounded-full hover:bg-[#F2F0E9] text-[#5E6A62]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-xs text-[#5E6A62]">
            Routing to: <span className="font-medium text-[#184A31]">
              {activeMember === "family" ? "Auto-detect / first member" : members.find(m => m.id === activeMember)?.name}
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
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json,.md"
              className="hidden"
              data-testid="inbox-file-input"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              data-testid="inbox-upload-button"
              className="flex items-center gap-2 bg-white border border-[#E5E2DC] hover:border-[#184A31] px-4 py-2.5 rounded-full text-sm font-medium transition disabled:opacity-50"
            >
              <Upload className="h-4 w-4" strokeWidth={1.8} />
              Upload document
            </button>
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

          {lastResult && (
            <div className="card-surface p-4 mt-2" data-testid="inbox-last-result">
              <div className="flex items-center gap-2 text-[#367A50]">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">{lastResult.parsed?.summary || "Processed"}</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {Object.entries(lastResult.counts || {})
                  .filter(([, v]) => v > 0)
                  .map(([k, v]) => (
                    <div key={k} className="text-xs bg-[#F2F0E9] border border-[#E5E2DC] rounded-lg px-2.5 py-1.5">
                      <span className="text-[#5E6A62]">{k.replace("_", " ")}</span>
                      <span className="ml-1.5 font-mono font-semibold text-[#184A31]">+{v}</span>
                    </div>
                  ))}
              </div>
              {lastResult.document_id && (
                <div className="mt-3 flex items-center gap-2 text-xs text-[#5E6A62]">
                  <FileText className="h-3.5 w-3.5" />
                  Stored in Documents library
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
