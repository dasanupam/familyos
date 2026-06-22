import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { Modal, Field } from "@/pages/Finance";
import { toast } from "sonner";

const COLORS = ["#184A31", "#C25942", "#D19B4C", "#367A50", "#5E6A62", "#7F5A3E"];

export default function Family() {
  const { members, fetchMembers } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ color: COLORS[1] });

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/members", form);
      setShowAdd(false); setForm({ color: COLORS[1] });
      await fetchMembers();
      toast.success("Family member added");
    } catch { toast.error("Could not add"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Remove this member?")) return;
    await api.delete(`/members/${id}`);
    await fetchMembers();
  };

  return (
    <div className="space-y-6" data-testid="family-page">
      <div className="flex items-end justify-between">
        <div>
          <div className="label-eyebrow">Household</div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Family members</h1>
        </div>
        <button onClick={() => setShowAdd(true)} data-testid="add-member-button"
          className="bg-[#184A31] text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-1.5">
          <UserPlus className="h-4 w-4" /> Add member
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map((m) => (
          <div key={m.id} className="card-surface p-5 flex items-center gap-4" data-testid="member-card">
            <div className="h-14 w-14 rounded-2xl flex items-center justify-center font-display text-xl text-white"
              style={{ background: m.color || "#184A31" }}>
              {m.name?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="font-display text-lg">{m.name}</div>
              <div className="text-xs text-[#5E6A62] capitalize">{m.relation || "—"}</div>
            </div>
            {m.relation !== "self" && (
              <button onClick={() => remove(m.id)} className="text-[#C25942]/50 hover:text-[#C25942] p-2">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <Modal title="Add family member" onClose={() => setShowAdd(false)}>
          <form onSubmit={submit} className="space-y-3" data-testid="add-member-form">
            <Field label="Name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label="Relation" value={form.relation || ""} onChange={(v) => setForm({ ...form, relation: v })} placeholder="partner, child, brother…" />
            <div>
              <label className="label-eyebrow block mb-2">Color tag</label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button type="button" key={c} onClick={() => setForm({ ...form, color: c })}
                    className={`h-8 w-8 rounded-full transition ${form.color === c ? "ring-2 ring-offset-2 ring-[#111812]" : ""}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
            <button className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium" data-testid="member-save-button">Add</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
