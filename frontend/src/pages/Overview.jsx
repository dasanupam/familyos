import { useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatINRFull, formatINRCompact } from "@/lib/utils";
import { Link } from "react-router-dom";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { AlertTriangle, Activity, TrendingUp, Target, ChevronRight, ArrowRight } from "lucide-react";

const Stat = ({ label, value, sub, tone, testid }) => (
  <div className="card-surface p-4 flex flex-col gap-1" data-testid={testid}>
    <div className="label-eyebrow">{label}</div>
    <div className={`font-display text-2xl font-semibold leading-none ${tone === "red" ? "text-[#C25942]" : tone === "green" ? "text-[#367A50]" : tone === "amber" ? "text-amber-600" : "text-[#111812]"}`}>{value}</div>
    {sub && <div className="text-xs text-[#5E6A62]">{sub}</div>}
  </div>
);

const CountBadges = ({ counts }) => {
  const entries = useMemo(() => Object.entries(counts || {}).filter(([, v]) => v > 0), [counts]);
  if (!entries.length) return null;
  return (
    <div className="text-xs text-[#5E6A62] hidden sm:flex gap-2">
      {entries.map(([k, v]) => (
        <span key={k} className="bg-[#F2F0E9] px-2 py-0.5 rounded">{k}: {v}</span>
      ))}
    </div>
  );
};

const DOMAIN_COLORS = { finance: "bg-[#184A31]/10 text-[#184A31]", health: "bg-red-50 text-red-700", career: "bg-blue-50 text-blue-700", travel: "bg-purple-50 text-purple-700", personal: "bg-[#F2F0E9] text-[#5E6A62]" };

const Avatar = ({ name }) => (
  <div className="h-8 w-8 rounded-full bg-[#184A31]/20 text-[#184A31] font-medium text-xs flex items-center justify-center flex-shrink-0">
    {name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
  </div>
);

// ── Family Finance Panel ────────────────────────────────────────────────────
function FamilyFinancePanel({ members, memberParam }) {
  const [rows, setRows] = useState({});
  useEffect(() => {
    members.forEach(m => {
      api.get(`/finance/summary?member_id=${m.id}`).then(r => setRows(p => ({ ...p, [m.id]: r.data }))).catch(() => {});
    });
  }, [members]);
  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#E5E2DC]">
        <div className="font-display text-base font-semibold">Family Finance</div>
        <Link to="/finance" className="text-xs text-[#184A31] flex items-center gap-1 hover:underline">Finance <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-[#F9F8F4]">
            <th className="px-5 py-2 text-left font-medium text-[#5E6A62] text-xs">Member</th>
            <th className="px-4 py-2 text-right font-medium text-[#5E6A62] text-xs">Net Worth</th>
            <th className="px-4 py-2 text-right font-medium text-[#5E6A62] text-xs">Saved MTD</th>
            <th className="px-4 py-2 text-left font-medium text-[#5E6A62] text-xs">Active Loans</th>
          </tr></thead>
          <tbody>
            {members.map(m => {
              const d = rows[m.id];
              const netWorth = d ? (d.total_investments || 0) + (d.total_savings || 0) - (d.total_loans || 0) : null;
              const savedMTD = d ? (d.monthly_income || 0) - (d.monthly_spend || 0) : null;
              return (
                <tr key={m.id} className="border-t border-[#F2F0E9] hover:bg-[#F9F8F4] transition">
                  <td className="px-5 py-2.5"><div className="flex items-center gap-2.5"><Avatar name={m.name} /><span className="font-medium">{m.name}</span></div></td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm">{netWorth != null ? formatINRCompact(netWorth) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm">{savedMTD != null ? <span className={savedMTD >= 0 ? "text-[#367A50]" : "text-[#C25942]"}>{formatINRCompact(savedMTD)}</span> : "—"}</td>
                  <td className="px-4 py-2.5 text-[#5E6A62]">{d?.active_loans || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Family Health Panel ─────────────────────────────────────────────────────
function FamilyHealthPanel({ members }) {
  const [rows, setRows] = useState({});
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    members.forEach(m => {
      const mp = `?member_id=${m.id}`;
      Promise.all([
        api.get(`/health/vitals${mp}`),
        api.get(`/health/active-medications${mp}`),
        api.get(`/health/appointments${mp}`),
      ]).then(([v, med, appt]) => {
        const vitals = v.data || [];
        const bpEntry = vitals.find(x => x.kind === "bp");
        const wtEntry = vitals.find(x => x.kind === "weight");
        const upcoming = (appt.data || []).filter(a => a.appointment_date >= today).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
        const nextAppt = upcoming[0];
        const daysUntil = nextAppt ? Math.ceil((new Date(nextAppt.appointment_date) - new Date()) / 86400000) : null;
        setRows(p => ({ ...p, [m.id]: { bp: bpEntry?.value, bpDate: bpEntry?.date, weight: wtEntry?.value, weightUnit: wtEntry?.unit || "kg", activeMeds: med.data?.count ?? (Array.isArray(med.data) ? med.data.length : 0), nextAppt, daysUntil } }));
      }).catch(() => {});
    });
  }, [members, today]);

  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#E5E2DC]">
        <div className="font-display text-base font-semibold">Family Health</div>
        <Link to="/health" className="text-xs text-[#184A31] flex items-center gap-1 hover:underline">Health <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-[#F9F8F4]">
            <th className="px-5 py-2 text-left font-medium text-[#5E6A62] text-xs">Member</th>
            <th className="px-4 py-2 text-right font-medium text-[#5E6A62] text-xs">Last BP</th>
            <th className="px-4 py-2 text-right font-medium text-[#5E6A62] text-xs">Weight</th>
            <th className="px-4 py-2 text-right font-medium text-[#5E6A62] text-xs">Active Meds</th>
            <th className="px-4 py-2 text-left font-medium text-[#5E6A62] text-xs">Next Appt</th>
          </tr></thead>
          <tbody>
            {members.map(m => {
              const d = rows[m.id];
              const soon = d?.daysUntil != null && d.daysUntil <= 7;
              return (
                <tr key={m.id} className="border-t border-[#F2F0E9] hover:bg-[#F9F8F4] transition">
                  <td className="px-5 py-2.5"><div className="flex items-center gap-2.5"><Avatar name={m.name} /><span className="font-medium">{m.name}</span></div></td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm">{d?.bp || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm">{d?.weight ? `${d.weight} ${d.weightUnit}` : "—"}</td>
                  <td className="px-4 py-2.5 text-right">{d?.activeMeds ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {d?.nextAppt
                      ? <span className={`${soon ? "text-amber-600 font-medium" : "text-[#5E6A62]"}`}>
                          {d.nextAppt.doctor_name} · {d.nextAppt.appointment_date} {soon && "⚠️"}
                        </span>
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Overview ───────────────────────────────────────────────────────────
export default function Overview() {
  const { activeMember, members } = useAuth();
  const [data, setData] = useState(null);
  const [nwSeries, setNwSeries] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [recentInbox, setRecentInbox] = useState([]);
  const [goals, setGoals] = useState([]);
  const [extraStats, setExtraStats] = useState({});

  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;
  const today = new Date().toISOString().slice(0, 10);

  const refresh = useCallback(async () => {
    const mp = activeMember === "family" ? "" : `?member_id=${activeMember}`;
    const [sum, nw, al, inbox, gl] = await Promise.all([
      api.get(`/finance/summary${mp}`),
      api.get(`/finance/net-worth-series${mp}`),
      api.get("/alerts"),
      api.get("/inbox/log"),
      api.get(`/goals${mp}`),
    ]);
    setData(sum.data);
    setNwSeries(nw.data || []);
    setAlerts(al.data || []);
    setRecentInbox(inbox.data || []);
    setGoals(gl.data || []);

    // Extra stats: RSU, next EMI, next appointment, emergency fund
    const [rsus, loans, appts, ef] = await Promise.all([
      api.get(`/finance/rsu${mp}`).catch(() => ({ data: [] })),
      api.get(`/finance/loans${mp}`).catch(() => ({ data: [] })),
      api.get(`/health/appointments${mp}`).catch(() => ({ data: [] })),
      api.get(`/property/emergency-fund${mp}`).catch(() => ({ data: [] })),
    ]);
    const unvestedRSU = (rsus.data || []).reduce((s, r) => {
      const unvested = (r.unvested_units ?? (r.total_units - (r.vested_units || 0)));
      return s + (unvested * (r.current_price || 0));
    }, 0);
    const upcomingLoans = (loans.data || []).filter(l => l.next_emi_date).sort((a, b) => a.next_emi_date.localeCompare(b.next_emi_date));
    const upcomingAppts = (appts.data || []).filter(a => a.appointment_date >= today).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
    const efData = Array.isArray(ef.data) ? ef.data[0] : ef.data;
    setExtraStats({ unvestedRSU, nextEMI: upcomingLoans[0], nextAppt: upcomingAppts[0], efData });
  }, [activeMember, today]);

  useEffect(() => { refresh(); }, [refresh]);

  const healthData = data;
  const efCoverage = extraStats.efData?.coverage_months;
  const efTarget = extraStats.efData?.target_months || 6;
  const efTone = efCoverage == null ? "" : efCoverage >= efTarget ? "green" : efCoverage >= 3 ? "amber" : "red";

  const formatNW = (v) => formatINRCompact(v || 0);

  const familyMembers = members.filter(m => m.id);

  return (
    <div className="space-y-6 pb-8" data-testid="overview-page">
      {/* ── Alerts banner ── */}
      {alerts.filter(a => a.severity === "error" || a.severity === "warning").slice(0, 2).map((a, i) => (
        <Link key={a.type + "-" + a.date + "-" + i} to={a.link || "/"} className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm ${a.severity === "error" ? "bg-red-50 border-red-200 text-red-800" : "bg-amber-50 border-amber-200 text-amber-800"}`} data-testid="alert-banner">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{a.title}</span>
          {a.member_name && <span className="text-xs opacity-70">{a.member_name}</span>}
          <ChevronRight className="h-4 w-4 opacity-50" />
        </Link>
      ))}

      {/* ── Row 1: Core finance stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Monthly Income" value={formatNW(data?.monthly_income)} testid="stat-income" />
        <Stat label="Monthly Spend" value={formatNW(data?.monthly_spend)} testid="stat-spend" />
        <Stat label="Net Worth" value={formatNW(data?.net_worth || ((data?.total_investments || 0) + (data?.total_savings || 0) - (data?.total_loans || 0)))} tone="green" testid="stat-networth" />
        <Stat label="Savings Rate" value={data?.monthly_income > 0 ? `${Math.round((1 - data.monthly_spend / data.monthly_income) * 100)}%` : "—"} testid="stat-savings-rate" />
      </div>

      {/* ── Row 2: Extra stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="RSU Unvested Value"
          value={extraStats.unvestedRSU > 0 ? formatINRCompact(extraStats.unvestedRSU) : "—"}
          sub="projected"
          testid="stat-rsu-unvested" />
        <Stat label="Next EMI Due"
          value={extraStats.nextEMI?.name || "—"}
          sub={extraStats.nextEMI?.next_emi_date}
          testid="stat-next-emi" />
        <Stat label="Next Appointment"
          value={extraStats.nextAppt?.doctor_name || "—"}
          sub={extraStats.nextAppt?.appointment_date}
          testid="stat-next-appt" />
        <Stat label="Emergency Fund"
          value={efCoverage != null ? `${efCoverage} / ${efTarget} mo` : "—"}
          tone={efTone}
          sub={efCoverage != null && efCoverage < efTarget ? `${efTarget - efCoverage} months to target` : efCoverage != null ? "Target reached" : "Not set"}
          testid="stat-emergency-fund" />
      </div>

      {/* ── Family panels (admin family view only) ── */}
      {activeMember === "family" && familyMembers.length > 0 && (
        <div className="space-y-4">
          <FamilyFinancePanel members={familyMembers} memberParam={memberParam} />
          <FamilyHealthPanel members={familyMembers} />
        </div>
      )}

      {/* ── Net worth chart ── */}
      {nwSeries.length >= 2 && (
        <div className="card-surface p-5" data-testid="net-worth-chart">
          <div className="label-eyebrow mb-3">Net Worth Over Time</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={nwSeries}>
              <defs><linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#184A31" stopOpacity={0.2} /><stop offset="95%" stopColor="#184A31" stopOpacity={0} /></linearGradient></defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v) => formatINRCompact(v)} contentStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="net_worth" stroke="#184A31" fill="url(#nwGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Income vs spend chart ── */}
      {data?.monthly_breakdown?.length > 0 && (
        <div className="card-surface p-5" data-testid="income-spend-chart">
          <div className="label-eyebrow mb-3">Income vs Spend</div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={data.monthly_breakdown}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v) => formatINRCompact(v)} contentStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="income" stroke="#367A50" fill="#367A50" fillOpacity={0.15} strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="spend" stroke="#C25942" fill="#C25942" fillOpacity={0.12} strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Goals mini-panel ── */}
      {goals.length > 0 && (
        <div className="card-surface p-5" data-testid="goals-overview">
          <div className="flex items-center justify-between mb-4">
            <div className="label-eyebrow">Goals</div>
            <Link to="/goals" className="text-xs text-[#184A31] hover:underline flex items-center gap-1">All goals <ArrowRight className="h-3 w-3" /></Link>
          </div>
          <div className="space-y-3">
            {goals.slice(0, 4).map(g => {
              const pct = g.target_amount > 0 ? Math.min(100, Math.round(g.current_amount / g.target_amount * 100)) : 0;
              const domain = (g.domain || "personal").toLowerCase();
              return (
                <div key={g.id} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DOMAIN_COLORS[domain] || DOMAIN_COLORS.personal}`}>{domain}</span>
                    <span className="text-sm font-medium flex-1 truncate">{g.name}</span>
                    <span className="text-xs font-mono text-[#5E6A62]">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-[#E5E2DC] rounded-full overflow-hidden">
                    <div className="h-full bg-[#184A31] rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Health snapshot ── */}
      <HealthSnapshot memberParam={memberParam} today={today} />

      {/* ── Recent inbox ── */}
      {recentInbox.length > 0 && (
        <div className="card-surface p-5" data-testid="recent-inbox">
          <div className="label-eyebrow mb-3">Recent Inbox</div>
          <div className="space-y-2">
            {recentInbox.slice(0, 4).map((i, idx) => (
              <div key={i.id || idx} className="flex items-center gap-3 py-2 border-b border-[#F2F0E9] last:border-0">
                <div className="flex-1 text-sm text-[#5E6A62] truncate">{i.input_preview || i.parsed?.summary}</div>
                <CountBadges counts={i.counts} />
                <div className="text-xs text-[#5E6A62] opacity-60">{(i.created_at || "").slice(0, 10)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Health snapshot card ────────────────────────────────────────────────────
function HealthSnapshot({ memberParam, today }) {
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    Promise.all([
      api.get(`/health/vitals${memberParam}`),
      api.get(`/health/active-medications${memberParam}`),
      api.get(`/health/appointments${memberParam}`),
    ]).then(([v, meds, appts]) => {
      const vitals = v.data || [];
      const bpEntry = vitals.find(x => x.kind === "bp");
      const wtEntry = vitals.find(x => x.kind === "weight");
      const upcoming = (appts.data || []).filter(a => a.appointment_date >= today).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
      setSnapshot({
        bp: bpEntry?.value, bpDate: bpEntry?.date,
        weight: wtEntry?.value, weightUnit: wtEntry?.unit || "kg", weightDate: wtEntry?.date,
        activeMeds: meds.data?.count ?? (Array.isArray(meds.data) ? meds.data.length : 0),
        nextAppt: upcoming[0],
      });
    }).catch(() => {});
  }, [memberParam, today]);

  if (!snapshot) return null;
  return (
    <div className="card-surface p-5" data-testid="health-snapshot">
      <div className="flex items-center justify-between mb-4">
        <div className="label-eyebrow">Health Snapshot</div>
        <Link to="/health" className="text-xs text-[#184A31] hover:underline flex items-center gap-1">Health <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#F9F8F4] rounded-xl p-3">
          <div className="text-xs text-[#5E6A62] mb-1">Last BP</div>
          <div className={`font-mono text-lg font-semibold ${snapshot.bp && (parseInt(snapshot.bp) > 130) ? "text-[#C25942]" : "text-[#111812]"}`}>{snapshot.bp || "—"}</div>
          <div className="text-xs text-[#5E6A62]">{snapshot.bpDate || ""}</div>
        </div>
        <div className="bg-[#F9F8F4] rounded-xl p-3">
          <div className="text-xs text-[#5E6A62] mb-1">Last Weight</div>
          <div className="font-mono text-lg font-semibold text-[#111812]">{snapshot.weight ? `${snapshot.weight} ${snapshot.weightUnit}` : "—"}</div>
          <div className="text-xs text-[#5E6A62]">{snapshot.weightDate || ""}</div>
        </div>
        <div className="bg-[#F9F8F4] rounded-xl p-3">
          <div className="text-xs text-[#5E6A62] mb-1">Active Medications</div>
          <div className="font-display text-lg font-semibold text-[#111812]">{snapshot.activeMeds ?? "—"}</div>
          <div className="text-xs text-[#5E6A62]">active</div>
        </div>
        <div className="bg-[#F9F8F4] rounded-xl p-3">
          <div className="text-xs text-[#5E6A62] mb-1">Next Appointment</div>
          <div className="text-sm font-medium text-[#111812] truncate">{snapshot.nextAppt?.doctor_name || "—"}</div>
          <div className="text-xs text-[#5E6A62]">{snapshot.nextAppt?.appointment_date || "None scheduled"}</div>
        </div>
      </div>
    </div>
  );
}
