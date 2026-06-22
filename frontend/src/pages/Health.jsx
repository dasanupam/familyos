import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, Pill, FlaskConical, Activity } from "lucide-react";
import { Modal, Field, SelectMember } from "@/pages/Finance";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

export default function Health() {
  const { activeMember, members } = useAuth();
  const [tab, setTab] = useState("vitals");
  const [vitals, setVitals] = useState([]);
  const [labs, setLabs] = useState([]);
  const [pres, setPres] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});

  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;
  const defaultMemberId = activeMember === "family" ? members[0]?.id : activeMember;

  const refresh = useCallback(async () => {
    const [v, l, p] = await Promise.all([
      api.get(`/health/vitals${memberParam}`),
      api.get(`/health/labs${memberParam}`),
      api.get(`/health/prescriptions${memberParam}`),
    ]);
    setVitals(v.data); setLabs(l.data); setPres(p.data);
  }, [memberParam]);

  useEffect(() => { refresh(); }, [refresh]);

  const memberName = (id) => members.find((m) => m.id === id)?.name || "—";

  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, member_id: form.member_id || defaultMemberId, date: form.date || new Date().toISOString().slice(0, 10) };
      if (tab === "vitals") await api.post("/health/vitals", body);
      else if (tab === "labs") await api.post("/health/labs", { ...body, value: Number(body.value) });
      else if (tab === "prescriptions") await api.post("/health/prescriptions", {
        ...body,
        medications: form.medName ? [{ name: form.medName, dose: form.dose || "", frequency: form.frequency || "", duration: form.duration || null }] : [],
      });
      setShowAdd(false); setForm({});
      refresh(); toast.success("Added");
    } catch { toast.error("Add failed"); }
  };

  const remove = async (kind, id) => { await api.delete(`/health/${kind}/${id}`); refresh(); };

  // lab trends per test
  const labGroups = labs.reduce((acc, l) => { (acc[l.test] = acc[l.test] || []).push(l); return acc; }, {});
  Object.values(labGroups).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));

  return (
    <div className="space-y-6" data-testid="health-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="label-eyebrow">Health</div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Wellbeing tracker</h1>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          ["vitals", "Vitals", Activity],
          ["labs", "Lab results", FlaskConical],
          ["prescriptions", "Prescriptions", Pill],
        ].map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={`health-tab-${k}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition flex items-center gap-1.5 ${
              tab === k ? "bg-[#184A31] text-white" : "bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31]"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
            {label}
          </button>
        ))}
        <button
          onClick={() => { setShowAdd(true); setForm({}); }}
          data-testid="health-add-button"
          className="ml-auto px-4 py-2 rounded-full text-sm font-medium bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add manually
        </button>
      </div>

      {tab === "vitals" && (
        <div className="card-surface p-5">
          <div className="label-eyebrow mb-3">Recent vitals</div>
          {vitals.length === 0 ? <div className="text-sm text-[#5E6A62]">No vitals yet. Try "BP 120/80 today" in the Inbox.</div> :
            <div className="divide-y divide-[#E5E2DC]">
              {vitals.slice(0, 20).map((v) => (
                <div key={v.id} className="flex items-center py-2.5 text-sm" data-testid="vital-row">
                  <span className="w-24 text-[#5E6A62] text-xs">{v.date}</span>
                  <span className="w-24 uppercase tracking-wider text-xs text-[#184A31]">{v.kind}</span>
                  <span className="font-mono">{v.value} {v.unit || ""}</span>
                  <span className="ml-auto text-xs text-[#5E6A62]">{memberName(v.member_id)}</span>
                  <button onClick={() => remove("vitals", v.id)} className="ml-3 text-[#C25942]/50 hover:text-[#C25942]"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>}
        </div>
      )}

      {tab === "labs" && (
        <div className="space-y-4">
          {Object.keys(labGroups).length === 0 && (
            <div className="card-surface p-5 text-sm text-[#5E6A62]">No lab results yet. Upload a lab report PDF to auto-extract.</div>
          )}
          {Object.entries(labGroups).map(([test, arr]) => (
            <div key={test} className="card-surface p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="label-eyebrow">{test}</div>
                  <div className="font-display text-2xl mt-1">{arr[arr.length - 1].value} <span className="text-sm text-[#5E6A62]">{arr[arr.length - 1].unit}</span></div>
                  {arr[arr.length - 1].reference_range && (
                    <div className="text-xs text-[#5E6A62] mt-1">Ref: {arr[arr.length - 1].reference_range}</div>
                  )}
                </div>
                <div className="text-xs text-[#5E6A62]">{arr.length} reading{arr.length > 1 ? "s" : ""}</div>
              </div>
              {arr.length > 1 && (
                <div style={{ height: 120 }} className="mt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={arr}>
                      <CartesianGrid stroke="#E5E2DC" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "#5E6A62", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#5E6A62", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#184A31" strokeWidth={2} dot={{ fill: "#184A31", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "prescriptions" && (
        <div className="card-surface p-5">
          {pres.length === 0 ? <div className="text-sm text-[#5E6A62]">No prescriptions yet. Upload a prescription PDF.</div> :
            <div className="divide-y divide-[#E5E2DC]">
              {pres.map((p) => (
                <div key={p.id} className="py-3" data-testid="prescription-row">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{p.doctor || "Prescription"}</div>
                      <div className="text-xs text-[#5E6A62]">{p.date} · {memberName(p.member_id)}</div>
                    </div>
                    <button onClick={() => remove("prescriptions", p.id)} className="text-[#C25942]/50 hover:text-[#C25942]"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="mt-2 space-y-1">
                    {(p.medications || []).map((m, i) => (
                      <div key={i} className="text-sm flex gap-3">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-[#5E6A62]">{m.dose}</span>
                        <span className="text-[#5E6A62]">{m.frequency}</span>
                        {m.duration && <span className="text-[#5E6A62]">· {m.duration}</span>}
                      </div>
                    ))}
                  </div>
                  {p.notes && <div className="text-xs text-[#5E6A62] mt-2">{p.notes}</div>}
                </div>
              ))}
            </div>}
        </div>
      )}

      {showAdd && (
        <Modal title={`Add ${tab.slice(0, -1)}`} onClose={() => setShowAdd(false)}>
          <form onSubmit={submit} className="space-y-3" data-testid="health-add-form">
            <SelectMember value={form.member_id || defaultMemberId} onChange={(v) => setForm({ ...form, member_id: v })} members={members} />
            <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
            {tab === "vitals" && (
              <>
                <Field label="Kind" as="select" value={form.kind || "bp"} onChange={(v) => setForm({ ...form, kind: v })}
                  options={[["bp", "Blood pressure"], ["weight", "Weight"], ["sugar", "Sugar"], ["heart_rate", "Heart rate"], ["temperature", "Temperature"], ["spo2", "SpO2"]]} />
                <Field label="Value" value={form.value || ""} onChange={(v) => setForm({ ...form, value: v })} placeholder="e.g. 120/80 or 72" required />
                <Field label="Unit" value={form.unit || ""} onChange={(v) => setForm({ ...form, unit: v })} placeholder="mmHg, kg, bpm…" />
              </>
            )}
            {tab === "labs" && (
              <>
                <Field label="Test" value={form.test || ""} onChange={(v) => setForm({ ...form, test: v })} placeholder="HbA1c, TSH, LDL…" required />
                <Field label="Value" type="number" step="0.01" value={form.value || ""} onChange={(v) => setForm({ ...form, value: v })} required />
                <Field label="Unit" value={form.unit || ""} onChange={(v) => setForm({ ...form, unit: v })} />
                <Field label="Reference range" value={form.reference_range || ""} onChange={(v) => setForm({ ...form, reference_range: v })} />
              </>
            )}
            {tab === "prescriptions" && (
              <>
                <Field label="Doctor" value={form.doctor || ""} onChange={(v) => setForm({ ...form, doctor: v })} />
                <Field label="Medication name" value={form.medName || ""} onChange={(v) => setForm({ ...form, medName: v })} />
                <Field label="Dose" value={form.dose || ""} onChange={(v) => setForm({ ...form, dose: v })} placeholder="500mg" />
                <Field label="Frequency" value={form.frequency || ""} onChange={(v) => setForm({ ...form, frequency: v })} placeholder="twice a day" />
                <Field label="Duration" value={form.duration || ""} onChange={(v) => setForm({ ...form, duration: v })} placeholder="5 days" />
                <Field label="Notes" value={form.notes || ""} onChange={(v) => setForm({ ...form, notes: v })} />
              </>
            )}
            <button className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium" data-testid="health-submit-button">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
