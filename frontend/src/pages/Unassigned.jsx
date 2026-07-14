import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { UserX, Loader2, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

const KIND_LABELS = {
  transactions: "Transactions",
  investments: "Investments",
  loans: "Loans",
  lab_results: "Lab Results",
  prescriptions: "Prescriptions",
  vitals: "Vitals",
  vaccinations: "Vaccinations",
  career_events: "Career Events",
  supplements: "Supplements",
  trips: "Trips",
  generic_entries: "Other Notes",
};

function recordLabel(kind, r) {
  if (kind === "transactions") return `${r.date || ""} · ${r.category || ""} · ₹${r.amount ?? ""} ${r.merchant ? `· ${r.merchant}` : ""}`;
  if (kind === "lab_results") return `${r.date || ""} · ${r.test || ""}: ${r.value ?? ""} ${r.unit || ""}`;
  if (kind === "prescriptions") return `${r.date || ""} · ${(r.medications || []).map((m) => m.name).join(", ")}`;
  if (kind === "vitals") return `${r.date || ""} · ${r.kind || ""}: ${r.value || ""}`;
  if (kind === "vaccinations") return `${r.date_administered || ""} · ${r.vaccine_name || ""}`;
  if (kind === "career_events") return `${r.date || ""} · ${r.title || ""}`;
  if (kind === "investments") return `${r.name || ""} (${r.kind || ""})`;
  if (kind === "loans") return `${r.name || ""}: ₹${r.outstanding ?? ""}`;
  if (kind === "supplements") return `${r.name || ""} · ${r.dose || ""}`;
  if (kind === "trips") return `${r.name || ""} → ${r.destination || ""}`;
  return r.title || r.name || r.category || "Record";
}

export default function Unassigned() {
  const { members } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState({}); // `${kind}:${id}` -> member_id

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/records/unassigned");
      setData(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load unassigned records");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const assign = async (kind, rid) => {
    const memberId = selections[`${kind}:${rid}`];
    if (!memberId) { toast.error("Pick a family member first"); return; }
    try {
      const { data: res } = await api.patch(`/records/unassigned/${kind}/${rid}`, { member_id: memberId });
      toast.success(`Assigned to ${res.member_name}`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Assign failed");
    }
  };

  const remove = async (kind, rid) => {
    try {
      await api.delete(`/records/unassigned/${kind}/${rid}`);
      toast.success("Record deleted");
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const kinds = Object.keys(data?.records || {});

  return (
    <div className="space-y-6" data-testid="unassigned-page">
      <div>
        <div className="label-eyebrow">Review</div>
        <h1 className="font-display text-3xl mt-1">Unassigned records</h1>
        <p className="text-sm text-[#5E6A62] mt-1 max-w-2xl">
          Records the AI extracted but couldn't confidently attach to a family member.
          Assign each one to the right person — they'll then appear on that person's dashboards.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#5E6A62]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : !data || data.total === 0 ? (
        <div className="card-surface p-10 text-center text-sm text-[#5E6A62]">
          <UserX className="h-8 w-8 mx-auto mb-3 opacity-40" />
          Nothing to review — every record is assigned to a family member.
        </div>
      ) : (
        <div className="space-y-5">
          {kinds.map((kind) => (
            <div key={kind} className="card-surface p-5" data-testid={`unassigned-group-${kind}`}>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-display text-lg">{KIND_LABELS[kind] || kind}</h2>
                <span className="text-xs font-mono bg-[#F2F0E9] px-2 py-0.5 rounded-full">{data.counts[kind]}</span>
              </div>
              <div className="space-y-2">
                {data.records[kind].map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm bg-[#F2F0E9] border border-[#E5E2DC] rounded-xl px-3 py-2">
                    <span className="flex-1 min-w-[200px] truncate text-[#111812]">{recordLabel(kind, r)}</span>
                    <select
                      value={selections[`${kind}:${r.id}`] || ""}
                      onChange={(e) => setSelections((s) => ({ ...s, [`${kind}:${r.id}`]: e.target.value }))}
                      className="bg-white border border-[#E5E2DC] rounded-full px-3 py-1.5 text-xs focus:outline-none focus:border-[#184A31]"
                      data-testid={`assign-select-${kind}-${r.id}`}
                    >
                      <option value="">Assign to…</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <button onClick={() => assign(kind, r.id)}
                      className="bg-[#184A31] text-white p-1.5 rounded-full hover:bg-[#113523]" title="Assign"
                      data-testid={`assign-button-${kind}-${r.id}`}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(kind, r.id)}
                      className="text-[#C25942]/60 hover:text-[#C25942] p-1.5" title="Delete record">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
