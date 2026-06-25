import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, Edit3 } from "lucide-react";
import { Modal, Field, SelectMember } from "@/pages/Finance";
import { toast } from "sonner";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const TABS = [
  ["vitals", "Vitals"],
  ["labs", "Lab Results"],
  ["prescriptions", "Prescriptions"],
  ["medications", "Active Meds"],
  ["supplements", "Supplements"],
  ["appointments", "Appointments"],
  ["fitness", "Fitness"],
  ["vaccinations", "Vaccinations"],
];

export default function Health() {
  const { activeMember, members } = useAuth();
  const [tab, setTab] = useState("vitals");
  const [vitals, setVitals] = useState([]);
  const [labs, setLabs] = useState([]);
  const [pres, setPres] = useState([]);
  const [meds, setMeds] = useState([]);
  const [supps, setSupps] = useState([]);
  const [appts, setAppts] = useState([]);
  const [fitness, setFitness] = useState([]);
  const [vacs, setVacs] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");

  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;
  const defaultMemberId = activeMember === "family" ? members[0]?.id : activeMember;
  const memberName = (id) => members.find((m) => m.id === id)?.name || "—";

  const refresh = useCallback(async () => {
    const mp = memberParam;
    try {
      const [v, l, p, m, s, a, fi, va] = await Promise.all([
        api.get(`/health/vitals${mp}`),
        api.get(`/health/labs${mp}`),
        api.get(`/health/prescriptions${mp}`),
        api.get(`/health/active-medications${mp}`),
        api.get(`/health/supplements${mp}`),
        api.get(`/health/appointments${mp}`),
        api.get(`/health/fitness${mp}`),
        api.get(`/health/vaccinations${mp}`),
      ]);
      setVitals(v.data); setLabs(l.data); setPres(p.data); setMeds(m.data);
      setSupps(s.data); setAppts(a.data); setFitness(fi.data); setVacs(va.data);
    } catch { toast.error("Failed to load health data"); }
  }, [memberParam]);

  useEffect(() => { refresh(); }, [refresh]);

  const labGroups = labs.reduce((acc, l) => { (acc[l.test] = acc[l.test] || []).push(l); return acc; }, {});
  Object.values(labGroups).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));

  const getTabData = () => ({ vitals, labs, prescriptions: pres, medications: meds, supplements: supps, appointments: appts, fitness, vaccinations: vacs })[tab] || [];
  const filteredRows = () => { const rows = getTabData(); if (!search) return rows; const q = search.toLowerCase(); return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)); };

  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, member_id: form.member_id || defaultMemberId, date: form.date || new Date().toISOString().slice(0, 10) };
      if (tab === "vitals") await api.post("/health/vitals", body);
      else if (tab === "labs") await api.post("/health/labs", { ...body, value: Number(body.value) });
      else if (tab === "prescriptions") await api.post("/health/prescriptions", { ...body, medications: form.medName ? [{ name: form.medName, dose: form.dose || "", frequency: form.frequency || "", duration: form.duration || null }] : [] });
      else if (tab === "supplements") await api.post("/health/supplements", { ...body, start_date: body.start_date || body.date });
      else if (tab === "appointments") await api.post("/health/appointments", { ...body, appointment_date: body.date });
      else if (tab === "fitness") await api.post("/health/fitness", { ...body, steps: body.steps ? Number(body.steps) : null, weight_kg: body.weight_kg ? Number(body.weight_kg) : null, duration_mins: body.duration_mins ? Number(body.duration_mins) : null });
      else if (tab === "vaccinations") await api.post("/health/vaccinations", { ...body, date_administered: body.date });
      setShowAdd(false); setForm({}); setEditingId(null);
      refresh(); toast.success("Added");
    } catch { toast.error("Add failed"); }
  };

  const remove = async (id) => {
    const routes = { vitals: `/health/vitals/${id}`, labs: `/health/labs/${id}`, prescriptions: `/health/prescriptions/${id}`, supplements: `/health/supplements/${id}`, appointments: `/health/appointments/${id}`, fitness: `/health/fitness/${id}`, vaccinations: `/health/vaccinations/${id}` };
    if (routes[tab]) { await api.delete(routes[tab]); refresh(); }
  };

  const startEdit = (row) => { setEditingId(row.id); setForm(row); setShowAdd(true); };

  return (
    <div className="space-y-6" data-testid="health-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div><div className="label-eyebrow">Health</div><h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Track wellbeing</h1></div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`health-tab-${k}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${tab === k ? "bg-[#184A31] text-white" : "bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31]"}`}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="bg-white border border-[#E5E2DC] px-3 py-1.5 rounded-full text-sm focus:outline-none focus:border-[#184A31]" />
          {tab !== "medications" && (
            <button onClick={() => { setShowAdd(true); setForm({}); setEditingId(null); }} data-testid="health-add-button"
              className="px-4 py-2 rounded-full text-sm font-medium bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </button>
          )}
        </div>
      </div>

      <div className="card-surface p-5 md:p-6">
        <div className="label-eyebrow mb-4 capitalize">{tab.replace(/-/g, " ")}</div>

        {tab === "vitals" && (
          <>
            <Table rows={filteredRows()} cols={[
              { k: "date", label: "Date" },
              { k: "kind", label: "Type" },
              { k: "value", label: "Value" },
              { k: "unit", label: "Unit" },
              { k: "member_id", label: "Member", render: memberName },
            ]} onDelete={(r) => remove(r.id)} empty="No vitals recorded." />
            {Object.keys(labGroups).length === 0 && labs.length === 0 && (
              <p className="text-xs text-[#5E6A62] mt-4">Chart appears when lab results are added.</p>
            )}
          </>
        )}

        {tab === "labs" && (
          <>
            <Table rows={filteredRows()} cols={[
              { k: "date", label: "Date" },
              { k: "test", label: "Test" },
              { k: "value", label: "Value", align: "right" },
              { k: "unit", label: "Unit" },
              { k: "reference_range", label: "Reference" },
              { k: "member_id", label: "Member", render: memberName },
            ]} onDelete={(r) => remove(r.id)} empty="No lab results." />
            {Object.entries(labGroups).slice(0, 3).map(([test, pts]) => (
              <div key={test} className="mt-6">
                <div className="label-eyebrow mb-2">{test} trend</div>
                <div style={{ height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={pts}>
                      <CartesianGrid stroke="#E5E2DC" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#5E6A62" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "#5E6A62" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [v, test]} />
                      <Line type="monotone" dataKey="value" stroke="#184A31" strokeWidth={2} dot={{ fill: "#184A31", r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "prescriptions" && <Table rows={filteredRows()} cols={[
          { k: "date", label: "Date" },
          { k: "doctor", label: "Doctor" },
          { k: "medications", label: "Medications", render: (v) => (v || []).map((m) => m.name).join(", ") || "—" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove(r.id)} empty="No prescriptions." />}

        {tab === "medications" && (
          <div className="space-y-3">
            {meds.length === 0 ? <div className="text-sm text-[#5E6A62]">No active medications derived from prescriptions.</div> : meds.map((m) => (
              <div key={m.name} className="flex items-center gap-3 border border-[#E5E2DC] rounded-xl p-3">
                <div className="h-8 w-8 rounded-full bg-[#184A31]/10 flex items-center justify-center text-[#184A31] text-sm font-bold">{m.name[0]}</div>
                <div className="flex-1">
                  <div className="font-medium text-sm">{m.name}</div>
                  <div className="text-xs text-[#5E6A62]">{m.dose} · {m.frequency} · Dr {m.doctor || "—"}</div>
                </div>
                <div className="text-xs text-[#5E6A62]">Last seen {m.last_seen}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "supplements" && <Table rows={filteredRows()} cols={[
          { k: "name", label: "Supplement" },
          { k: "dose", label: "Dose" },
          { k: "frequency", label: "Frequency" },
          { k: "start_date", label: "Started" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove(r.id)} empty="No supplements." />}

        {tab === "appointments" && <Table rows={filteredRows()} cols={[
          { k: "appointment_date", label: "Date" },
          { k: "doctor_name", label: "Doctor" },
          { k: "speciality", label: "Speciality" },
          { k: "reason", label: "Reason" },
          { k: "follow_up_date", label: "Follow-up" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove(r.id)} onEdit={startEdit} empty="No appointments." />}

        {tab === "fitness" && <Table rows={filteredRows()} cols={[
          { k: "date", label: "Date" },
          { k: "workout_type", label: "Workout" },
          { k: "duration_mins", label: "Duration (min)", align: "right" },
          { k: "weight_kg", label: "Weight (kg)", align: "right" },
          { k: "steps", label: "Steps", align: "right" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove(r.id)} empty="No fitness logs." />}

        {tab === "vaccinations" && <Table rows={filteredRows()} cols={[
          { k: "vaccine_name", label: "Vaccine" },
          { k: "date_administered", label: "Date" },
          { k: "dose_number", label: "Dose #" },
          { k: "next_due_date", label: "Next Due" },
          { k: "administered_by", label: "By" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove(r.id)} empty="No vaccination records." />}
      </div>

      {showAdd && (
        <Modal title={`Add ${tab.replace(/-/g, " ")}`} onClose={() => { setShowAdd(false); setEditingId(null); }}>
          <form onSubmit={submit} className="space-y-3">
            <SelectMember value={form.member_id || defaultMemberId} onChange={(v) => setForm({ ...form, member_id: v })} members={members} />
            {tab === "vitals" && <>
              <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
              <Field label="Type" as="select" value={form.kind || "bp"} onChange={(v) => setForm({ ...form, kind: v })} options={[["bp","Blood Pressure"],["weight","Weight"],["sugar","Blood Sugar"],["heart_rate","Heart Rate"],["spo2","SpO2"],["temperature","Temperature"]]} />
              <Field label="Value" value={form.value || ""} onChange={(v) => setForm({ ...form, value: v })} required placeholder="e.g. 120/80 or 72" />
              <Field label="Unit" value={form.unit || ""} onChange={(v) => setForm({ ...form, unit: v })} placeholder="mmHg, kg, mg/dL…" />
            </>}
            {tab === "labs" && <>
              <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
              <Field label="Test name" value={form.test || ""} onChange={(v) => setForm({ ...form, test: v })} required />
              <Field label="Value" type="number" step="0.01" value={form.value || ""} onChange={(v) => setForm({ ...form, value: v })} required />
              <Field label="Unit" value={form.unit || ""} onChange={(v) => setForm({ ...form, unit: v })} />
              <Field label="Reference range" value={form.reference_range || ""} onChange={(v) => setForm({ ...form, reference_range: v })} placeholder="e.g. 4.0–6.0" />
            </>}
            {tab === "prescriptions" && <>
              <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
              <Field label="Doctor" value={form.doctor || ""} onChange={(v) => setForm({ ...form, doctor: v })} />
              <Field label="Medication name" value={form.medName || ""} onChange={(v) => setForm({ ...form, medName: v })} />
              <Field label="Dose" value={form.dose || ""} onChange={(v) => setForm({ ...form, dose: v })} />
              <Field label="Frequency" value={form.frequency || ""} onChange={(v) => setForm({ ...form, frequency: v })} />
              <Field label="Duration" value={form.duration || ""} onChange={(v) => setForm({ ...form, duration: v })} />
            </>}
            {tab === "supplements" && <>
              <Field label="Supplement name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required />
              <Field label="Dose" value={form.dose || ""} onChange={(v) => setForm({ ...form, dose: v })} />
              <Field label="Frequency" value={form.frequency || ""} onChange={(v) => setForm({ ...form, frequency: v })} />
              <Field label="Start date" type="date" value={form.start_date || ""} onChange={(v) => setForm({ ...form, start_date: v })} />
            </>}
            {tab === "appointments" && <>
              <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} required />
              <Field label="Doctor name" value={form.doctor_name || ""} onChange={(v) => setForm({ ...form, doctor_name: v })} required />
              <Field label="Speciality" value={form.speciality || ""} onChange={(v) => setForm({ ...form, speciality: v })} />
              <Field label="Reason" value={form.reason || ""} onChange={(v) => setForm({ ...form, reason: v })} />
              <Field label="Follow-up date" type="date" value={form.follow_up_date || ""} onChange={(v) => setForm({ ...form, follow_up_date: v })} />
            </>}
            {tab === "fitness" && <>
              <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} required />
              <Field label="Workout type" value={form.workout_type || ""} onChange={(v) => setForm({ ...form, workout_type: v })} placeholder="Running, Yoga, Gym…" />
              <Field label="Duration (mins)" type="number" value={form.duration_mins || ""} onChange={(v) => setForm({ ...form, duration_mins: v })} />
              <Field label="Weight (kg)" type="number" step="0.1" value={form.weight_kg || ""} onChange={(v) => setForm({ ...form, weight_kg: v })} />
              <Field label="Steps" type="number" value={form.steps || ""} onChange={(v) => setForm({ ...form, steps: v })} />
            </>}
            {tab === "vaccinations" && <>
              <Field label="Vaccine name" value={form.vaccine_name || ""} onChange={(v) => setForm({ ...form, vaccine_name: v })} required />
              <Field label="Date administered" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} required />
              <Field label="Dose #" type="number" value={form.dose_number || "1"} onChange={(v) => setForm({ ...form, dose_number: v })} />
              <Field label="Next due date" type="date" value={form.next_due_date || ""} onChange={(v) => setForm({ ...form, next_due_date: v })} />
              <Field label="Administered by" value={form.administered_by || ""} onChange={(v) => setForm({ ...form, administered_by: v })} />
            </>}
            <button className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Table({ rows, cols, onDelete, onEdit, empty }) {
  if (rows.length === 0) return <div className="text-sm text-[#5E6A62] py-4">{empty}</div>;
  return (
    <div className="overflow-x-auto -mx-5 md:-mx-6">
      <table className="w-full text-sm">
        <thead className="text-left text-[#5E6A62] border-b border-[#E5E2DC]">
          <tr>{cols.map((c) => <th key={c.k} className={`px-5 py-2 font-medium text-xs uppercase tracking-wider ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>)}<th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[#E5E2DC]/60 hover:bg-[#F2F0E9]/50">
              {cols.map((c) => <td key={c.k} className={`px-5 py-3 ${c.align === "right" ? "text-right font-mono" : ""}`}>{c.render ? c.render(r[c.k]) : (r[c.k] ?? "—")}</td>)}
              <td className="px-2 py-3 whitespace-nowrap">
                {onEdit && <button onClick={() => onEdit(r)} className="text-[#5E6A62] hover:text-[#184A31] opacity-50 hover:opacity-100 mr-2"><Edit3 className="h-3.5 w-3.5" /></button>}
                {onDelete && <button onClick={() => onDelete(r)} className="text-[#C25942] opacity-50 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
