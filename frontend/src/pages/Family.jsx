import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Trash2, UserPlus, KeyRound, Copy } from "lucide-react";
import { Modal, Field } from "@/pages/Finance";
import { toast } from "sonner";

const COLORS = ["#184A31", "#C25942", "#D19B4C", "#367A50", "#5E6A62", "#7F5A3E"];

export default function Family() {
  const { members, fetchMembers } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ color: COLORS[1] });
  const [invites, setInvites] = useState([]);
  const [inviteMember, setInviteMember] = useState("");

  const loadInvites = useCallback(async () => {
    try {
      const { data } = await api.get("/invites");
      setInvites(data || []);
    } catch { /* member-role users can't list invites */ }
  }, []);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const createInvite = async () => {
    try {
      const { data } = await api.post("/invites", { member_id: inviteMember || null });
      await loadInvites();
      const link = `${window.location.origin}/register?code=${data.code}`;
      try { await navigator.clipboard.writeText(link); } catch { /* clipboard may be blocked */ }
      toast.success(`Invite ${data.code} created`, { description: "Registration link copied — share it privately." });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create invite");
    }
  };

  const copyInvite = async (code) => {
    const link = `${window.location.origin}/register?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.info(link);
    }
  };

  const removeInvite = async (id) => {
    await api.delete(`/invites/${id}`);
    await loadInvites();
  };

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

      {/* ── Invites: registration is invite-only ── */}
      <div className="card-surface p-5" data-testid="invites-section">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-4 w-4 text-[#184A31]" />
          <h2 className="font-display text-lg">Account invites</h2>
        </div>
        <p className="text-xs text-[#5E6A62] mb-4">
          Registration is locked — only people with an invite code can create an account, and they
          join <span className="font-medium">your</span> family. Codes are single-use and expire in 14 days.
          Optionally link an invite to a member profile so their account attaches to the right person.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            value={inviteMember}
            onChange={(e) => setInviteMember(e.target.value)}
            data-testid="invite-member-select"
            className="bg-white border border-[#E5E2DC] rounded-full px-3 py-2 text-sm focus:outline-none focus:border-[#184A31]"
          >
            <option value="">New member profile (created at signup)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>Link to: {m.name}</option>
            ))}
          </select>
          <button onClick={createInvite} data-testid="create-invite-button"
            className="bg-[#184A31] text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Generate invite
          </button>
        </div>

        {invites.length > 0 && (
          <div className="space-y-2">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 text-sm bg-[#F2F0E9] border border-[#E5E2DC] rounded-xl px-3 py-2" data-testid={`invite-row-${inv.code}`}>
                <span className="font-mono font-semibold tracking-wider">{inv.code}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  inv.status === "active" ? "bg-[#367A50]/10 text-[#367A50]"
                  : inv.status === "used" ? "bg-[#5E6A62]/10 text-[#5E6A62]"
                  : "bg-[#C25942]/10 text-[#C25942]"}`}>
                  {inv.status}
                </span>
                <span className="text-xs text-[#5E6A62] flex-1 truncate">
                  {inv.member_id ? `→ ${members.find((m) => m.id === inv.member_id)?.name || "member"}` : "new member"}
                  {inv.used_by_email && ` · used by ${inv.used_by_email}`}
                  {inv.status === "active" && inv.expires_at && ` · expires ${String(inv.expires_at).slice(0, 10)}`}
                </span>
                {inv.status === "active" && (
                  <button onClick={() => copyInvite(inv.code)} className="text-[#5E6A62] hover:text-[#184A31] p-1" title="Copy registration link">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => removeInvite(inv.id)} className="text-[#C25942]/60 hover:text-[#C25942] p-1" title="Revoke invite">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
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
