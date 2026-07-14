import { useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, Edit3, AlertTriangle } from "lucide-react";
import { Modal, Field, SelectMember } from "@/pages/Finance";
import { toast } from "sonner";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

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

const VITAL_LABELS = {
  bp: "Blood Pressure",
  weight: "Weight",
  sugar: "Blood Sugar",
  heart_rate: "Heart Rate",
  spo2: "SpO2",
  temperature: "Temperature",
};

function isLabFlagged(lab) {
  if (!lab.reference_range || lab.value == null) return false;
  const range = lab.reference_range.trim();
  const val = Number(lab.value);
  const mmMatch = range.match(/^([\d.]+)\s*[-–]\s*([\d.]+)$/);
  if (mmMatch) return val < Number(mmMatch[1]) || val > Number(mmMatch[2]);
  const ltMatch = range.match(/^<\s*([\d.]+)$/);
  if (ltMatch) return val >= Number(ltMatch[1]);
  const gtMatch = range.match(/^>\s*([\d.]+)$/);
  if (gtMatch) return val <= Number(gtMatch[1]);
  return false;
}

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
  const [flaggedOnly, setFlaggedOnly] = useState(false);

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
  }, [memberParam]); // eslint-disable-line react-hooks/exhaustive-deps -- api is a stable singleton

  useEffect(() => { refresh(); }, [refresh]);

  const labGroups = useMemo(() => {
    const acc = {};
    labs.forEach((l) => { (acc[l.test] = acc[l.test] || []).push(l); });
    Object.values(acc).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));
    return acc;
  }, [labs]);

  const vitalGroups = useMemo(() => {
    const acc = {};
    vitals.forEach((v) => { (acc[v.kind] = acc[v.kind] || []).push(v); });
    Object.values(acc).forEach((arr) => arr.sort((a, b) => a.date.localeCompare(b.date)));
    return acc;
  }, [vitals]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const upcomingAppts = useMemo(() => appts.filter((a) => a.appointment_date >= today), [appts, today]);
  const pastAppts = useMemo(() => appts.filter((a) => a.appointment_date < today), [appts, today]);
  const flaggedLabs = useMemo(() => labs.filter(isLabFlagged), [labs]);
  const lastPresDate = useMemo(() =>
    pres.length > 0 ? [...pres].sort((a, b) => b.date.localeCompare(a.date))[0].date : null,
  [pres]);

  const tabData = useMemo(() => ({
    vitals, labs, prescriptions: pres, medications: meds,
    supplements: supps, appointments: appts, fitness, vaccinations: vacs,
  })[tab] || [], [tab, vitals, labs, pres, meds, supps, appts, fitness, vacs]);

  const filteredRows = useMemo(() => {
    let rows = tabData;
    if (tab === "labs" && flaggedOnly) rows = rows.filter(isLabFlagged);
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [tabData, tab, flaggedOnly, search]);

  const filteredUpcoming = useMemo(() =>
    upcomingAppts.filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())),
  [upcomingAppts, search]);

  const filteredPast = useMemo(() =>
    pastAppts.filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase())),
  [pastAppts, search]);

  const submit = async (e) => {
    try {
      const body = {
        ...form,
        member_id: form.member_id || defaultMemberId,
        date: form.date || new Date().toISOString().slice(0, 10),
      };
      if (editingId) {
        const routeMap = {
          vitals: `/health/vitals/${editingId}`,
          labs: `/health/labs/${editingId}`,
          prescriptions: `/health/prescriptions/${editingId}`,
          supplements: `/health/supplements/${editingId}`,
          appointments: `/health/appointments/${editingId}`,
          fitness: `/health/fitness/${editingId}`,
          vaccinations: `/health/vaccinations/${editingId}`,
        };
        if (routeMap[tab]) await api.patch(routeMap[tab], body);
      } else {
        if (tab === "vitals") await api.post("/health/vitals", body);
        else if (tab === "labs") await api.post("/health/labs", { ...body, value: Number(body.value) });
        else if (tab === "prescriptions") await api.post("/health/prescriptions", {
          ...body,
          medications: form.medName
            ? [{ name: form.medName, dose: form.dose || "", frequency: form.frequency || "", duration: form.duration || null }]
            : [],
        });
        else if (tab === "supplements") await api.post("/health/supplements", { ...body, start_date: body.start_date || body.date });
        else if (tab === "appointments") await api.post("/health/appointments", { ...body, appointment_date: body.date });
        else if (tab === "fitness") await api.post("/health/fitness", {
          ...body,
          steps: body.steps ? Number(body.steps) : null,
          weight_kg: body.weight_kg ? Number(body.weight_kg) : null,
          duration_mins: body.duration_mins ? Number(body.duration_mins) : null,
        });
        else if (tab === "vaccinations") await api.post("/health/vaccinations", { ...body, date_administered: body.date });
      }
      setShowAdd(false); setForm({}); setEditingId(null);
      refresh(); toast.success(editingId ? "Updated" : "Added");
    } catch { toast.error("Save failed"); }
  };

  const remove = async (id) => {
    const routes = {
      vitals: `/health/vitals/${id}`, labs: `/health/labs/${id}`,
      prescriptions: `/health/prescriptions/${id}`, supplements: `/health/supplements/${id}`,
      appointments: `/health/appointments/${id}`, fitness: `/health/fitness/${id}`,
      vaccinations: `/health/vaccinations/${id}`,
    };
    if (routes[tab]) { await api.delete(routes[tab]); refresh(); }
  };

  const startEdit = (row) => { setEditingId(row.id); setForm(row); setShowAdd(true); };

  const apptCols = [
    { k: "appointment_date", label: "Date" },
    { k: "doctor_name", label: "Doctor" },
    { k: "speciality", label: "Speciality" },
    { k: "reason", label: "Reason" },
    { k: "follow_up_date", label: "Follow-up" },
    { k: "member_id", label: "Member", render: memberName },
  ];

  return (
    <div className="space-y-6" data-testid="health-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="label-eyebrow">Health</div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Track wellbeing</h1>
        </div>
      </div>

      {/* Summary header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-surface p-4" data-testid="health-stat-vitals">
          <div className="label-eyebrow">Vitals logged</div>
          <div className="font-display text-2xl mt-1">{vitals.length}</div>
          <div className="text-xs text-[#5E6A62]">{Object.keys(vitalGroups).length} types</div>
        </div>
        <div className="card-surface p-4" data-testid="health-stat-labs">
          <div className="label-eyebrow">Lab tests</div>
          <div className="font-display text-2xl mt-1">{Object.keys(labGroups).length}</div>
          <div className="text-xs text-[#5E6A62]">{labs.length} readings</div>
        </div>
        <div className="card-surface p-4" data-testid="health-stat-appts">
          <div className="label-eyebrow">Upcoming appts</div>
          <div className="font-display text-2xl mt-1">{upcomingAppts.length}</div>
        </div>
        <div className={`card-surface p-4 ${flaggedLabs.length > 0 ? "border border-[#C25942]/40" : ""}`} data-testid="health-stat-flagged">
          <div className="label-eyebrow">Flagged labs</div>
          <div className={`font-display text-2xl mt-1 ${flaggedLabs.length > 0 ? "text-[#C25942]" : ""}`}>{flaggedLabs.length}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap items-center">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setSearch(""); setFlaggedOnly(false); }}
            data-testid={`health-tab-${k}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${tab === k ? "bg-[#184A31] text-white" : "bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31]"}`}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…"
            className="bg-white border border-[#E5E2DC] px-3 py-1.5 rounded-full text-sm focus:outline-none focus:border-[#184A31]" />
          {tab === "labs" && (
            <button onClick={() => setFlaggedOnly(!flaggedOnly)} data-testid="labs-flagged-toggle"
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition flex items-center gap-1.5 ${flaggedOnly ? "bg-[#C25942] text-white border-[#C25942]" : "bg-white border-[#E5E2DC] text-[#5E6A62]"}`}>
              <AlertTriangle className="h-3.5 w-3.5" /> Flagged
            </button>
          )}
          {tab !== "medications" && (
            <button onClick={() => { setShowAdd(true); setForm({}); setEditingId(null); }}
              data-testid="health-add-button"
              className="px-4 py-2 rounded-full text-sm font-medium bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </button>
          )}
        </div>
      </div>

      <div className="card-surface p-5 md:p-6">
        <div className="label-eyebrow mb-4 capitalize">{tab.replace(/-/g, " ")}</div>

        {/* VITALS: per-kind sparklines + full table */}
        {tab === "vitals" && (
          <>
            {Object.entries(vitalGroups).filter(([, pts]) => pts.length >= 2).length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                {Object.entries(vitalGroups)
                  .filter(([, pts]) => pts.length >= 2)
                  .map(([kind, pts]) => (
                    <div key={kind} className="border border-[#E5E2DC] rounded-xl p-3">
                      <div className="label-eyebrow mb-1">{VITAL_LABELS[kind] || kind}</div>
                      <div className="text-base font-medium">
                        {pts[pts.length - 1].value}{" "}
                        <span className="text-xs text-[#5E6A62]">{pts[pts.length - 1].unit}</span>
                      </div>
                      <div style={{ height: 60, marginTop: 4 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={pts}>
                            <Line type="monotone" dataKey="value" stroke="#184A31" strokeWidth={1.5} dot={false} />
                            <Tooltip formatter={(v) => [v, VITAL_LABELS[kind] || kind]} contentStyle={{ fontSize: 11 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
              </div>
            )}
            <Table rows={filteredRows} cols={[
              { k: "date", label: "Date" },
              { k: "kind", label: "Type", render: (v) => VITAL_LABELS[v] || v },
              { k: "value", label: "Value" },
              { k: "unit", label: "Unit" },
              { k: "member_id", label: "Member", render: memberName },
            ]} onDelete={(r) => remove(r.id)} onEdit={startEdit} empty="No vitals recorded." />
          </>
        )}

        {/* LABS: all charts ≥2 pts + search + flagged toggle */}
        {tab === "labs" && (
          <>
            {Object.entries(labGroups).filter(([, pts]) => pts.length >= 2).length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {Object.entries(labGroups)
                  .filter(([, pts]) => pts.length >= 2)
                  .filter(([test]) => !search || test.toLowerCase().includes(search.toLowerCase()))
                  .map(([test, pts]) => {
                    const latest = pts[pts.length - 1];
                    const flagged = isLabFlagged(latest);
                    return (
                      <div key={test} className={`border rounded-xl p-4 ${flagged ? "border-[#C25942]/50 bg-[#FDF3F1]" : "border-[#E5E2DC]"}`}
                        data-testid={`lab-chart-${test.replace(/\s+/g, "-").toLowerCase()}`}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="label-eyebrow">{test}</div>
                          {flagged && (
                            <span className="text-xs text-[#C25942] flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> out of range
                            </span>
                          )}
                        </div>
                        <div className="text-base font-medium">
                          {latest.value}{" "}
                          <span className="text-xs text-[#5E6A62]">{latest.unit}</span>
                          {latest.reference_range && (
                            <span className="text-xs text-[#5E6A62] ml-2">ref: {latest.reference_range}</span>
                          )}
                        </div>
                        <div style={{ height: 100, marginTop: 8 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={pts}>
                              <CartesianGrid stroke="#E5E2DC" vertical={false} />
                              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#5E6A62" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 9, fill: "#5E6A62" }} axisLine={false} tickLine={false} />
                              <Tooltip formatter={(v) => [v, test]} contentStyle={{ fontSize: 11 }} />
                              <Line type="monotone" dataKey="value"
                                stroke={flagged ? "#C25942" : "#184A31"} strokeWidth={2}
                                dot={{ fill: flagged ? "#C25942" : "#184A31", r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
            <Table rows={filteredRows} cols={[
              { k: "date", label: "Date" },
              { k: "test", label: "Test" },
              { k: "value", label: "Value", align: "right" },
              { k: "unit", label: "Unit" },
              { k: "reference_range", label: "Reference" },
              { k: "member_id", label: "Member", render: memberName },
            ]} onDelete={(r) => remove(r.id)} rowClass={(r) => isLabFlagged(r) ? "bg-[#FDF3F1]" : ""}
            empty="No lab results." />
          </>
        )}

        {tab === "prescriptions" && (
          <Table rows={filteredRows} cols={[
            { k: "date", label: "Date" },
            { k: "doctor", label: "Doctor" },
            { k: "medications", label: "Medications", render: (v) => (v || []).map((m) => m.name).join(", ") || "—" },
            { k: "member_id", label: "Member", render: memberName },
          ]} onDelete={(r) => remove(r.id)} empty="No prescriptions." />
        )}

        {tab === "medications" && (
          <>
            <div className="text-xs text-[#5E6A62] mb-4 italic" data-testid="medications-subtitle">
              Derived from prescriptions up to {lastPresDate || "—"}
            </div>
            <div className="space-y-3">
              {meds.length === 0
                ? <div className="text-sm text-[#5E6A62]">No active medications derived from prescriptions.</div>
                : meds.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 border border-[#E5E2DC] rounded-xl p-3">
                    <div className="h-8 w-8 rounded-full bg-[#184A31]/10 flex items-center justify-center text-[#184A31] text-sm font-bold">
                      {m.name[0]}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{m.name}</div>
                      <div className="text-xs text-[#5E6A62]">{m.dose} · {m.frequency} · Dr {m.doctor || "—"}</div>
                    </div>
                    <div className="text-xs text-[#5E6A62]">Last seen {m.last_seen}</div>
                  </div>
                ))}
            </div>
          </>
        )}

        {tab === "supplements" && (
          <Table rows={filteredRows} cols={[
            { k: "name", label: "Supplement" },
            { k: "dose", label: "Dose" },
            { k: "frequency", label: "Frequency" },
            { k: "start_date", label: "Started" },
            { k: "member_id", label: "Member", render: memberName },
          ]} onDelete={(r) => remove(r.id)} empty="No supplements." />
        )}

        {/* APPOINTMENTS: Upcoming / Past split */}
        {tab === "appointments" && (
          <>
            <div className="label-eyebrow text-[#184A31] mb-2" data-testid="appts-upcoming-label">Upcoming</div>
            <Table
              rows={filteredUpcoming}
              cols={apptCols} onDelete={(r) => remove(r.id)} onEdit={startEdit} empty="No upcoming appointments." />
            {pastAppts.length > 0 && (
              <>
                <div className="label-eyebrow text-[#5E6A62] mt-6 mb-2" data-testid="appts-past-label">Past</div>
                <Table
                  rows={filteredPast}
                  cols={apptCols} onDelete={(r) => remove(r.id)} onEdit={startEdit} empty="" />
              </>
            )}
          </>
        )}

        {tab === "fitness" && (
          <Table rows={filteredRows} cols={[
            { k: "date", label: "Date" },
            { k: "workout_type", label: "Workout" },
            { k: "duration_mins", label: "Duration (min)", align: "right" },
            { k: "weight_kg", label: "Weight (kg)", align: "right" },
            { k: "steps", label: "Steps", align: "right" },
            { k: "member_id", label: "Member", render: memberName },
          ]} onDelete={(r) => remove(r.id)} empty="No fitness logs." />
        )}

        {tab === "vaccinations" && (
          <Table rows={filteredRows} cols={[
            { k: "vaccine_name", label: "Vaccine" },
            { k: "date_administered", label: "Date" },
            { k: "dose_number", label: "Dose #" },
            { k: "next_due_date", label: "Next Due" },
            { k: "administered_by", label: "By" },
            { k: "member_id", label: "Member", render: memberName },
          ]} onDelete={(r) => remove(r.id)} onEdit={startEdit} empty="No vaccination records." />
        )}
      </div>

      {showAdd && (
        <Modal title={editingId ? `Edit ${tab}` : `Add ${tab}`} onClose={() => { setShowAdd(false); setEditingId(null); }}>
          <form onSubmit={submit} className="space-y-3">
            <SelectMember value={form.member_id || defaultMemberId} onChange={(v) => setForm({ ...form, member_id: v })} members={members} />
            {tab === "vitals" && <>
              <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
              <Field label="Type" as="select" value={form.kind || "bp"} onChange={(v) => setForm({ ...form, kind: v })}
                options={[["bp","Blood Pressure"],["weight","Weight"],["sugar","Blood Sugar"],["heart_rate","Heart Rate"],["spo2","SpO2"],["temperature","Temperature"]]} />
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

function Table({ rows, cols, onDelete, onEdit, rowClass, empty }) {
  if (rows.length === 0) return empty ? <div className="text-sm text-[#5E6A62] py-4">{empty}</div> : null;
  return (
    <div className="overflow-x-auto -mx-5 md:-mx-6">
      <table className="w-full text-sm">
        <thead className="text-left text-[#5E6A62] border-b border-[#E5E2DC]">
          <tr>
            {cols.map((c) => (
              <th key={c.k} className={`px-5 py-2 font-medium text-xs uppercase tracking-wider ${c.align === "right" ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-b border-[#E5E2DC]/60 hover:bg-[#F2F0E9]/50 ${rowClass ? rowClass(r) : ""}`}>
              {cols.map((c) => (
                <td key={c.k} className={`px-5 py-3 ${c.align === "right" ? "text-right font-mono" : ""}`}>
                  {c.render ? c.render(r[c.k], r) : (r[c.k] ?? "—")}
                </td>
              ))}
              <td className="px-2 py-3 whitespace-nowrap">
                {onEdit && (
                  <button onClick={() => onEdit(r)} className="text-[#5E6A62] hover:text-[#184A31] opacity-50 hover:opacity-100 mr-2">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button onClick={() => onDelete(r)} className="text-[#C25942] opacity-50 hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
