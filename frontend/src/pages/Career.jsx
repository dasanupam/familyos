import { useEffect, useState, useCallback } from "react";
import { api, formatINR, formatINRFull } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, Briefcase, Award, TrendingUp, Zap, Edit3 } from "lucide-react";
import { Modal, Field, SelectMember } from "@/pages/Finance";
import ExportCsvButton from "@/components/ExportCsvButton";
import { toast } from "sonner";

const EVENT_KINDS = [
  ["new_role", "New role"], ["promotion", "Promotion"], ["raise", "Raise"],
  ["certification", "Certification"], ["achievement", "Achievement"], ["review", "Review"],
];

export default function Career() {
  const { activeMember, members } = useAuth();
  const [tab, setTab] = useState("timeline");
  const [roles, setRoles] = useState([]);
  const [events, setEvents] = useState([]);
  const [skills, setSkills] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);

  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;
  const defaultMemberId = activeMember === "family" ? members[0]?.id : activeMember;

  const refresh = useCallback(async () => {
    const [r, e, s] = await Promise.all([
      api.get(`/career/roles${memberParam}`), api.get(`/career/events${memberParam}`), api.get(`/career/skills${memberParam}`)
    ]);
    setRoles(r.data); setEvents(e.data); setSkills(s.data);
  }, [memberParam]);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, member_id: form.member_id || defaultMemberId };
      if (editingId) {
        const kindMap = { timeline: "career-events", roles: "career-roles", skills: "career-skills" };
        await api.patch(`/${kindMap[tab]}/${editingId}`, body);
        toast.success("Updated");
      } else if (tab === "roles") {
        await api.post("/career/roles", { ...body, ctc: body.ctc ? Number(body.ctc) : null });
        toast.success("Role added");
      } else if (tab === "timeline") {
        await api.post("/career/events", { ...body, ctc: body.ctc ? Number(body.ctc) : null,
          date: body.date || new Date().toISOString().slice(0, 10), kind: body.kind || "achievement" });
        toast.success("Event added");
      } else if (tab === "skills") {
        await api.post("/career/skills", { ...body, level: Number(body.level || 3) });
        toast.success("Skill added");
      }
      setShowAdd(false); setForm({}); setEditingId(null);
      refresh();
    } catch { toast.error("Save failed"); }
  };

  const startEdit = (item) => { setEditingId(item.id); setForm(item); setShowAdd(true); };
  const closeModal = () => { setShowAdd(false); setForm({}); setEditingId(null); };
  const remove = async (kind, id) => { await api.delete(`/career/${kind}/${id}`); refresh(); };
  const memberName = (id) => members.find((m) => m.id === id)?.name || "—";

  // Salary progression chart data from roles
  const salaryProgression = roles
    .filter((r) => r.ctc)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .map((r) => ({ id: r.id, date: r.start_date, ctc: r.ctc, title: r.title, company: r.company }));

  return (
    <div className="space-y-6" data-testid="career-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="label-eyebrow">Career</div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Your progression</h1>
          <p className="text-sm text-[#5E6A62] mt-2">Drop an offer letter or appointment letter into the Inbox to auto-add roles.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          ["timeline", "Timeline", Zap], ["roles", "Roles & salary", Briefcase], ["skills", "Skills", Award],
        ].map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`career-tab-${k}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition flex items-center gap-1.5 ${
              tab === k ? "bg-[#184A31] text-white" : "bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31]"
            }`}>
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            {label}
          </button>
        ))}
        <button onClick={() => { setShowAdd(true); setForm({}); setEditingId(null); }} data-testid="career-add-button"
          className="ml-auto px-4 py-2 rounded-full text-sm font-medium bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </button>
        <ExportCsvButton kind={tab === "timeline" ? "career_events" : tab === "roles" ? "career_roles" : "career_skills"} label="Export CSV" />
      </div>

      {tab === "timeline" && (
        <div className="card-surface p-5">
          {events.length === 0 ? <div className="text-sm text-[#5E6A62]">No career events yet.</div> :
            <div className="space-y-4">
              {events.map((ev) => (
                <div key={ev.id} className="flex gap-4" data-testid="career-event-row">
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-[#184A31] mt-2" />
                    <div className="w-px flex-1 bg-[#E5E2DC]" />
                  </div>
                  <div className="flex-1 pb-4 border-b border-[#E5E2DC] last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-[#5E6A62]">{ev.date} · {memberName(ev.member_id)}</div>
                        <div className="font-display text-lg mt-0.5">{ev.title}</div>
                        <div className="text-xs uppercase tracking-wider text-[#C25942] mt-0.5">{ev.kind.replace("_", " ")}</div>
                        {ev.company && <div className="text-sm text-[#5E6A62] mt-1">@ {ev.company}</div>}
                        {ev.ctc && <div className="text-sm font-mono mt-1">{formatINRFull(ev.ctc)} CTC</div>}
                        {ev.notes && <div className="text-sm text-[#5E6A62] mt-1">{ev.notes}</div>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(ev)} className="text-[#5E6A62]/50 hover:text-[#5E6A62] p-1" data-testid="career-event-edit">
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => remove("events", ev.id)} className="text-[#C25942]/50 hover:text-[#C25942] p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>}
        </div>
      )}

      {tab === "roles" && (
        <div className="space-y-4">
          {salaryProgression.length > 1 && (
            <div className="card-surface p-5">
              <div className="label-eyebrow flex items-center gap-1 mb-3"><TrendingUp className="h-3 w-3" /> Salary progression</div>
              <div className="flex items-end gap-2 h-24">
                {salaryProgression.map((p, i) => {
                  const max = Math.max(...salaryProgression.map((x) => x.ctc));
                  const h = (p.ctc / max) * 100;
                  return (
                    <div key={p.id} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div className="text-[10px] font-mono text-[#5E6A62] mb-1">{formatINR(p.ctc)}</div>
                      <div className="w-full bg-[#184A31] rounded-t" style={{ height: `${h}%` }} title={`${p.title} @ ${p.company}`} />
                      <div className="text-[10px] text-[#5E6A62] mt-1 truncate w-full text-center">{p.date.slice(0, 4)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {roles.length === 0 ? <div className="card-surface p-5 text-sm text-[#5E6A62]">No roles yet.</div> :
            roles.map((r) => (
              <div key={r.id} className="card-surface p-5" data-testid="role-card">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-display text-lg">{r.title}</div>
                    <div className="text-sm text-[#5E6A62]">{r.company} · {r.location || "—"}</div>
                    <div className="text-xs text-[#5E6A62] mt-1">{r.start_date} → {r.end_date || "present"}</div>
                    {r.ctc && <div className="text-sm font-mono mt-2">{formatINRFull(r.ctc)} CTC</div>}
                    {r.notes && <div className="text-sm text-[#5E6A62] mt-2">{r.notes}</div>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(r)} className="text-[#5E6A62]/50 hover:text-[#5E6A62] p-1" data-testid="career-role-edit">
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove("roles", r.id)} className="text-[#C25942]/50 hover:text-[#C25942] p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {tab === "skills" && (
        <div className="card-surface p-5">
          {skills.length === 0 ? <div className="text-sm text-[#5E6A62]">No skills tracked yet.</div> :
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {skills.map((s) => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-[#F2F0E9] rounded-xl" data-testid="skill-row">
                  <div className="flex-1">
                    <div className="font-medium">{s.name}</div>
                    {s.category && <div className="text-xs text-[#5E6A62]">{s.category}</div>}
                  </div>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <div key={n} className={`h-1.5 w-4 rounded-full ${n <= s.level ? "bg-[#184A31]" : "bg-[#E5E2DC]"}`} />
                    ))}
                  </div>
                  <button onClick={() => startEdit(s)} className="text-[#5E6A62]/50 hover:text-[#5E6A62] p-1" data-testid="career-skill-edit">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove("skills", s.id)} className="text-[#C25942]/50 hover:text-[#C25942] p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>}
        </div>
      )}

      {showAdd && (
        <Modal title={editingId ? `Edit ${tab === "timeline" ? "event" : tab.slice(0, -1)}` : `Add ${tab === "timeline" ? "event" : tab.slice(0, -1)}`} onClose={closeModal}>
          <form onSubmit={submit} className="space-y-3" data-testid="career-form">
            <SelectMember value={form.member_id || defaultMemberId} onChange={(v) => setForm({ ...form, member_id: v })} members={members} />
            {tab === "timeline" && (
              <>
                <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
                <Field label="Kind" as="select" value={form.kind || "promotion"} onChange={(v) => setForm({ ...form, kind: v })} options={EVENT_KINDS} />
                <Field label="Title" value={form.title || ""} onChange={(v) => setForm({ ...form, title: v })} required placeholder="Promoted to Staff Engineer" />
                <Field label="Company" value={form.company || ""} onChange={(v) => setForm({ ...form, company: v })} />
                <Field label="New CTC (₹)" type="number" value={form.ctc || ""} onChange={(v) => setForm({ ...form, ctc: v })} />
                <Field label="Notes" value={form.notes || ""} onChange={(v) => setForm({ ...form, notes: v })} />
              </>
            )}
            {tab === "roles" && (
              <>
                <Field label="Company" value={form.company || ""} onChange={(v) => setForm({ ...form, company: v })} required />
                <Field label="Title" value={form.title || ""} onChange={(v) => setForm({ ...form, title: v })} required />
                <Field label="Start date" type="date" value={form.start_date || ""} onChange={(v) => setForm({ ...form, start_date: v })} required />
                <Field label="End date" type="date" value={form.end_date || ""} onChange={(v) => setForm({ ...form, end_date: v })} />
                <Field label="CTC (₹)" type="number" value={form.ctc || ""} onChange={(v) => setForm({ ...form, ctc: v })} />
                <Field label="Location" value={form.location || ""} onChange={(v) => setForm({ ...form, location: v })} />
                <Field label="Notes" value={form.notes || ""} onChange={(v) => setForm({ ...form, notes: v })} />
              </>
            )}
            {tab === "skills" && (
              <>
                <Field label="Skill name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required />
                <Field label="Category" value={form.category || ""} onChange={(v) => setForm({ ...form, category: v })} placeholder="languages, tools, soft" />
                <Field label="Level (1-5)" type="number" min="1" max="5" value={form.level || 3} onChange={(v) => setForm({ ...form, level: v })} />
              </>
            )}
            <button className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium" data-testid="career-save-button">{editingId ? "Update" : "Save"}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
