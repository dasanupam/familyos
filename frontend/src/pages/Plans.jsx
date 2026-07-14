import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ClipboardList, Trash2, Loader2, CalendarDays, FileText } from "lucide-react";
import { toast } from "sonner";

const TYPE_COLORS = {
  financial: "bg-[#184A31]/10 text-[#184A31]",
  retirement: "bg-[#184A31]/10 text-[#184A31]",
  investment: "bg-[#184A31]/10 text-[#184A31]",
  budget: "bg-[#D19B4C]/15 text-[#B07A2E]",
  supplement: "bg-[#367A50]/10 text-[#367A50]",
  diet: "bg-[#367A50]/10 text-[#367A50]",
  fitness: "bg-[#367A50]/10 text-[#367A50]",
  treatment: "bg-[#C25942]/10 text-[#C25942]",
  other: "bg-[#F2F0E9] text-[#5E6A62]",
};

export default function Plans() {
  const { activeMember } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const memberParam = activeMember && activeMember !== "family" ? `?member_id=${activeMember}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/plans/progress${memberParam}`);
      setPlans(data || []);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load plans");
    } finally {
      setLoading(false);
    }
  }, [memberParam]);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    try {
      await api.delete(`/plans/${id}`);
      setPlans((p) => p.filter((x) => x.id !== id));
      toast.success("Plan deleted");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  return (
    <div className="space-y-6" data-testid="plans-page">
      <div>
        <div className="label-eyebrow">Plans</div>
        <h1 className="font-display text-3xl mt-1">Uploaded &amp; tracked plans</h1>
        <p className="text-sm text-[#5E6A62] mt-1 max-w-2xl">
          Financial, supplement, diet, or fitness plans you upload through the Universal Inbox
          land here. Re-uploading a plan with the same name updates it instead of duplicating.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#5E6A62]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading plans…
        </div>
      ) : plans.length === 0 ? (
        <div className="card-surface p-10 text-center text-sm text-[#5E6A62]">
          <ClipboardList className="h-8 w-8 mx-auto mb-3 opacity-40" />
          No plans yet. Upload a financial plan, supplement plan, or any plan document via the
          Universal Inbox and it will appear here with its line items.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {plans.map((p) => (
            <div key={p.id} className="card-surface p-5" data-testid={`plan-card-${p.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-[#111812]">{p.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[p.plan_type] || TYPE_COLORS.other}`}>
                      {p.plan_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[#5E6A62]">
                    {p.target_date && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" /> target {p.target_date}
                      </span>
                    )}
                    {p.origin_document_id && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" /> from uploaded document
                      </span>
                    )}
                    {p.updated_at && <span>updated {String(p.updated_at).slice(0, 10)}</span>}
                  </div>
                </div>
                <button
                  onClick={() => remove(p.id)}
                  className="text-[#5E6A62] hover:text-[#C25942] p-1.5 rounded-full hover:bg-[#F2F0E9] transition"
                  title="Delete plan"
                  data-testid={`plan-delete-${p.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {p.notes && <p className="text-xs text-[#5E6A62] mt-2">{p.notes}</p>}

              {/* Plan-level progress vs actuals (linked goals) */}
              {p.progress?.pct != null && (
                <div className="mt-3" data-testid={`plan-progress-${p.id}`}>
                  <div className="flex justify-between text-xs text-[#5E6A62] mb-1">
                    <span>Progress vs actuals</span>
                    <span className="font-mono">
                      ₹{Number(p.progress.linked_current).toLocaleString("en-IN")} / ₹{Number(p.progress.linked_target).toLocaleString("en-IN")} · {p.progress.pct}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#E5E2DC] rounded-full overflow-hidden">
                    <div className="h-full bg-[#184A31] rounded-full transition-all"
                         style={{ width: `${Math.min(100, p.progress.pct)}%` }} />
                  </div>
                </div>
              )}

              {(p.items || []).length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {(p.items || []).map((it, i) => (
                    <div key={i} className="text-xs bg-[#F2F0E9] border border-[#E5E2DC] rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-[#111812] font-medium truncate">
                            {it.title}
                            {it.linked?.type === "goal" && (
                              <span className="ml-2 text-[10px] bg-[#184A31]/10 text-[#184A31] px-1.5 py-0.5 rounded-full">tracked goal</span>
                            )}
                            {it.linked?.type === "supplement" && (
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${it.linked.active ? "bg-[#367A50]/10 text-[#367A50]" : "bg-[#C25942]/10 text-[#C25942]"}`}>
                                {it.linked.active ? "active supplement" : "ended"}
                              </span>
                            )}
                          </div>
                          {it.detail && <div className="text-[#5E6A62] truncate">{it.detail}</div>}
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          {it.amount != null && (
                            <div className="font-mono text-[#184A31]">₹{Number(it.amount).toLocaleString("en-IN")}</div>
                          )}
                          {it.due_date && <div className="text-[#5E6A62]">{it.due_date}</div>}
                        </div>
                      </div>
                      {it.linked?.type === "goal" && it.linked.pct != null && (
                        <div className="mt-1.5">
                          <div className="h-1.5 bg-white rounded-full overflow-hidden border border-[#E5E2DC]">
                            <div className="h-full bg-[#367A50] rounded-full"
                                 style={{ width: `${Math.min(100, it.linked.pct)}%` }} />
                          </div>
                          <div className="text-[10px] text-[#5E6A62] mt-0.5 font-mono">
                            ₹{Number(it.linked.current).toLocaleString("en-IN")} of ₹{Number(it.linked.target).toLocaleString("en-IN")} ({it.linked.pct}%)
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
