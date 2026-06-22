import { useEffect, useState, useCallback } from "react";
import { api, formatINR, formatINRFull } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, Target, Sparkles, Edit3 } from "lucide-react";
import { Modal, Field, SelectMember } from "@/pages/Finance";
import { toast } from "sonner";

export default function Goals() {
  const { members } = useAuth();
  const [goals, setGoals] = useState([]);
  const [fire, setFire] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showFire, setShowFire] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [fireForm, setFireForm] = useState({});

  const refresh = useCallback(async () => {
    const [a, b] = await Promise.all([api.get("/goals"), api.get("/fire")]);
    setGoals(a.data);
    setFire(b.data);
    if (b.data) setFireForm(b.data);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const submitGoal = async (e) => {
    e.preventDefault();
    try {
      const body = {
        ...form, target_amount: Number(form.target_amount),
        current_amount: Number(form.current_amount || 0),
        category: form.category || "general",
      };
      if (editing) {
        await api.patch(`/goals/${editing}`, body);
      } else {
        await api.post("/goals", body);
      }
      setShowAdd(false); setEditing(null); setForm({});
      refresh(); toast.success("Saved");
    } catch { toast.error("Save failed"); }
  };

  const submitFire = async (e) => {
    e.preventDefault();
    try {
      await api.post("/fire", {
        target_corpus: Number(fireForm.target_corpus),
        monthly_savings: Number(fireForm.monthly_savings),
        expected_return_pct: Number(fireForm.expected_return_pct || 11),
        current_corpus: Number(fireForm.current_corpus || 0),
      });
      setShowFire(false);
      refresh(); toast.success("FIRE plan updated");
    } catch { toast.error("Update failed"); }
  };

  const remove = async (id) => { await api.delete(`/goals/${id}`); refresh(); };

  return (
    <div className="space-y-6" data-testid="goals-page">
      <div>
        <div className="label-eyebrow">Goals & FIRE</div>
        <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Where you're heading</h1>
      </div>

      <div className="card-surface p-6" data-testid="fire-plan-card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="label-eyebrow flex items-center gap-1.5"><Sparkles className="h-3 w-3" /> FIRE — Financial Independence Retire Early</div>
            <h2 className="font-display text-2xl mt-1">{fire ? `${fire.progress_pct}% there` : "Not configured"}</h2>
            {fire && (
              <div className="mt-2 text-sm text-[#5E6A62]">
                {fire.years_to_fire} years to <span className="font-mono text-[#111812]">{formatINRFull(fire.target_corpus)}</span> at <span className="font-mono text-[#111812]">{formatINR(fire.monthly_savings)}/mo</span>
                {fire.target_date && <span className="ml-2 text-[#367A50]">· Target: {fire.target_date}</span>}
              </div>
            )}
          </div>
          <button onClick={() => setShowFire(true)} data-testid="configure-fire-button" className="bg-[#184A31] text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-1.5">
            <Edit3 className="h-3.5 w-3.5" /> Configure
          </button>
        </div>
        {fire && (
          <div className="mt-5">
            <div className="h-3 bg-[#F2F0E9] rounded-full">
              <div className="h-full bg-gradient-to-r from-[#184A31] to-[#367A50] rounded-full transition-all" style={{ width: `${Math.min(100, fire.progress_pct)}%` }} />
            </div>
            <div className="flex justify-between text-xs text-[#5E6A62] mt-2 font-mono">
              <span>{formatINRFull(fire.current_corpus || 0)} now</span>
              <span>{formatINRFull(fire.target_corpus)} target</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl">Specific goals</h3>
        <button onClick={() => { setShowAdd(true); setEditing(null); setForm({}); }} data-testid="add-goal-button"
          className="bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] text-sm font-medium px-4 py-2 rounded-full flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New goal
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.length === 0 && (
          <div className="card-surface p-6 text-sm text-[#5E6A62] col-span-full">
            No goals yet. Start with classics like "Car ₹8L", "Home down-payment ₹25L", or "Brother's care fund".
          </div>
        )}
        {goals.map((g) => {
          const pct = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
          return (
            <div key={g.id} className="card-surface p-5 hover:-translate-y-0.5 transition" data-testid="goal-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="label-eyebrow">{g.category}</div>
                  <div className="font-display text-xl mt-1">{g.name}</div>
                  {g.target_date && <div className="text-xs text-[#5E6A62] mt-1">By {g.target_date}</div>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(g.id); setForm(g); setShowAdd(true); }} className="text-[#5E6A62] hover:text-[#184A31] p-1">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(g.id)} className="text-[#C25942]/50 hover:text-[#C25942] p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <div className="font-display text-2xl">{formatINR(g.current_amount)}<span className="text-sm text-[#5E6A62]"> / {formatINR(g.target_amount)}</span></div>
                <div className="h-2 bg-[#F2F0E9] mt-2 rounded-full">
                  <div className="h-full bg-[#184A31] rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-[#5E6A62] mt-1.5 font-mono">{Math.round(pct)}% complete</div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <Modal title={editing ? "Edit goal" : "New goal"} onClose={() => { setShowAdd(false); setEditing(null); }}>
          <form onSubmit={submitGoal} className="space-y-3" data-testid="goal-form">
            <Field label="Name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required placeholder="e.g. Down payment for home" />
            <Field label="Target amount (₹)" type="number" value={form.target_amount || ""} onChange={(v) => setForm({ ...form, target_amount: v })} required />
            <Field label="Current amount (₹)" type="number" value={form.current_amount || ""} onChange={(v) => setForm({ ...form, current_amount: v })} />
            <Field label="Target date" type="date" value={form.target_date || ""} onChange={(v) => setForm({ ...form, target_date: v })} />
            <Field label="Category" value={form.category || ""} onChange={(v) => setForm({ ...form, category: v })} placeholder="car, home, retirement, care…" />
            <button className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium" data-testid="goal-save-button">Save</button>
          </form>
        </Modal>
      )}

      {showFire && (
        <Modal title="FIRE plan" onClose={() => setShowFire(false)}>
          <form onSubmit={submitFire} className="space-y-3" data-testid="fire-form">
            <Field label="Target corpus (₹)" type="number" value={fireForm.target_corpus || ""} onChange={(v) => setFireForm({ ...fireForm, target_corpus: v })} required placeholder="50000000" />
            <Field label="Current corpus (₹)" type="number" value={fireForm.current_corpus || ""} onChange={(v) => setFireForm({ ...fireForm, current_corpus: v })} />
            <Field label="Monthly savings (₹)" type="number" value={fireForm.monthly_savings || ""} onChange={(v) => setFireForm({ ...fireForm, monthly_savings: v })} required />
            <Field label="Expected return %" type="number" step="0.1" value={fireForm.expected_return_pct || ""} onChange={(v) => setFireForm({ ...fireForm, expected_return_pct: v })} placeholder="11" />
            <button className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium" data-testid="fire-save-button">Save FIRE plan</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
