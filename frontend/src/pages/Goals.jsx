import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatINRFull } from "@/lib/utils";
import { toast } from "sonner";
import { Target, Trash2, Edit3, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import Field from "@/components/Field";
import ExportCsvButton from "@/components/ExportCsvButton";

const DOMAINS = ["personal", "finance", "health", "career", "travel"];
const DOMAIN_COLORS = {
  finance: "bg-[#184A31]/10 text-[#184A31] border-[#184A31]/20",
  health:  "bg-red-50 text-red-700 border-red-200",
  career:  "bg-blue-50 text-blue-700 border-blue-200",
  travel:  "bg-purple-50 text-purple-700 border-purple-200",
  personal:"bg-[#F2F0E9] text-[#5E6A62] border-[#E5E2DC]",
};

function urgencyInfo(target_date) {
  if (!target_date) return null;
  const today = new Date();
  const due = new Date(target_date);
  const daysLeft = Math.ceil((due - today) / 86400000);
  if (daysLeft < 0) return { label: "Overdue", border: "border-[#C25942]", badge: "bg-[#C25942] text-white", days: daysLeft };
  if (daysLeft <= 30) return { label: "Due soon", border: "border-[#C25942]", badge: "bg-[#C25942]/10 text-[#C25942]", days: daysLeft };
  if (daysLeft <= 90) return { label: "Coming up", border: "border-amber-400", badge: "bg-amber-50 text-amber-700", days: daysLeft };
  return null;
}

export default function Goals() {
  const { activeMember, members } = useAuth();
  const [goals, setGoals] = useState([]);
  const [domainFilter, setDomainFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});

  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;
  const defaultMemberId = activeMember === "family" ? members[0]?.id : activeMember;

  const refresh = useCallback(async () => {
    const q = domainFilter === "all" ? memberParam : `${memberParam}${memberParam ? "&" : "?"}domain=${domainFilter}`;
    const { data } = await api.get(`/goals${q}`);
    setGoals(data);
  }, [memberParam, domainFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, member_id: form.member_id || defaultMemberId, domain: form.domain || "personal" };
      if (editingId) {
        await api.patch(`/goals/${editingId}`, body);
        toast.success("Goal updated");
      } else {
        await api.post("/goals", { ...body, target_amount: Number(body.target_amount || 0), current_amount: Number(body.current_amount || 0) });
        toast.success("Goal added");
      }
      setShowAdd(false); setForm({}); setEditingId(null);
      refresh();
    } catch { toast.error("Save failed"); }
  };

  const remove = async (id) => {
    await api.delete(`/goals/${id}`);
    refresh();
  };

  const startEdit = (g) => { setEditingId(g.id); setForm(g); setShowAdd(true); };
  const closeModal = () => { setShowAdd(false); setForm({}); setEditingId(null); };

  const memberName = (id) => members.find(m => m.id === id)?.name || "—";

  return (
    <div className="space-y-6 pb-8" data-testid="goals-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="label-eyebrow">Goals</div>
          <div className="font-display text-4xl mt-1">Goals & Milestones</div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton kind="goals" label="Export" />
          <button onClick={() => { setShowAdd(true); setForm({}); setEditingId(null); }}
            className="flex items-center gap-2 bg-[#184A31] text-white px-4 py-2.5 rounded-full text-sm font-medium"
            data-testid="add-goal-button">
            <Plus className="h-4 w-4" /> Add goal
          </button>
        </div>
      </div>

      {/* ── Domain filter tabs ── */}
      <div className="flex flex-wrap gap-2">
        {["all", ...DOMAINS].map(d => (
          <button key={d} onClick={() => setDomainFilter(d)}
            className={`text-xs px-3.5 py-1.5 rounded-full border capitalize transition ${
              domainFilter === d
                ? "bg-[#184A31] text-white border-[#184A31]"
                : "bg-white border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31] hover:text-[#184A31]"
            }`}
            data-testid={`domain-filter-${d}`}>
            {d === "all" ? "All" : d}
          </button>
        ))}
      </div>

      {/* ── Goal cards ── */}
      {goals.length === 0 ? (
        <div className="card-surface py-16 flex flex-col items-center text-[#5E6A62]">
          <Target className="h-8 w-8 mb-3 opacity-40" />
          <p className="text-sm">No goals yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {goals.map(g => {
            const pct = g.target_amount > 0 ? Math.min(100, Math.round(g.current_amount / g.target_amount * 100)) : 0;
            const domain = (g.domain || "personal").toLowerCase();
            const urg = urgencyInfo(g.target_date);
            return (
              <div key={g.id} className={`card-surface p-5 space-y-3 border-l-2 ${urg?.border || "border-transparent"}`} data-testid="goal-card">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${DOMAIN_COLORS[domain] || DOMAIN_COLORS.personal}`}>{domain}</span>
                      {urg && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${urg.badge}`}>{urg.label}</span>}
                    </div>
                    <div className="font-display text-base font-semibold">{g.name}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(g)} className="text-[#5E6A62]/50 hover:text-[#5E6A62] p-1" data-testid="goal-edit-btn">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(g.id)} className="text-[#C25942]/50 hover:text-[#C25942] p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex justify-between text-xs text-[#5E6A62] mb-1">
                    <span>{formatINRFull(g.current_amount)}</span>
                    <span className="font-medium">{pct}%</span>
                    <span>{formatINRFull(g.target_amount)}</span>
                  </div>
                  <div className="h-2 bg-[#E5E2DC] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${pct >= 100 ? "bg-[#367A50]" : "bg-[#184A31]"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between text-xs text-[#5E6A62]">
                  <span>{memberName(g.member_id)}</span>
                  {g.target_date && <span className={urg?.days != null && urg.days < 0 ? "text-[#C25942]" : ""}>{urg?.days != null && urg.days < 0 ? "Overdue" : `Due ${g.target_date}`}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add/Edit modal ── */}
      {showAdd && (
        <Modal title={editingId ? "Edit goal" : "Add goal"} onClose={closeModal}>
          <form onSubmit={submit} className="space-y-3" data-testid="goal-form">
            <Field label="Goal name" value={form.name || ""} onChange={v => setForm({ ...form, name: v })} required />
            <Field label="Domain" as="select" value={form.domain || "personal"} onChange={v => setForm({ ...form, domain: v })}
              options={DOMAINS.map(d => [d, d.charAt(0).toUpperCase() + d.slice(1)])} />
            <Field label="Target amount (₹)" type="number" value={form.target_amount || ""} onChange={v => setForm({ ...form, target_amount: v })} required />
            <Field label="Current amount (₹)" type="number" value={form.current_amount || 0} onChange={v => setForm({ ...form, current_amount: v })} />
            <Field label="Target date" type="date" value={form.target_date || ""} onChange={v => setForm({ ...form, target_date: v })} />
            <Field label="Member" as="select" value={form.member_id || defaultMemberId || ""}
              onChange={v => setForm({ ...form, member_id: v })}
              options={members.map(m => [m.id, m.name])} />
            <button type="submit" className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium" data-testid="goal-save-btn">
              {editingId ? "Update" : "Save"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
