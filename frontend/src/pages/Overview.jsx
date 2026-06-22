import { useEffect, useState } from "react";
import { api, formatINR, formatINRFull } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { TrendingUp, TrendingDown, Wallet, Target, Activity, Sparkles, ArrowUpRight, FileText } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { Link } from "react-router-dom";

const Stat = ({ label, value, sub, tone, testid }) => (
  <div className="card-surface p-5 md:p-6" data-testid={testid}>
    <div className="label-eyebrow">{label}</div>
    <div className="font-display text-3xl md:text-4xl mt-2 font-medium" style={{ color: tone || "#111812" }}>{value}</div>
    {sub && <div className="text-xs text-[#5E6A62] mt-2">{sub}</div>}
  </div>
);

export default function Overview() {
  const { activeMember } = useAuth();
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    const m = activeMember === "family" ? "" : `?member_id=${activeMember}`;
    api.get(`/dashboard/overview${m}`).then((r) => setData(r.data)).catch(() => {});
    api.get(`/finance/monthly-trend${m}`).then((r) => setTrend(r.data)).catch(() => {});
  }, [activeMember]);

  if (!data) return <div className="text-[#5E6A62]">Loading…</div>;

  const { summary, fire, goals, recent_inbox, recent_labs, recent_meds } = data;
  const catData = Object.entries(summary?.category_breakdown || {}).map(([category, value]) => ({ category, value }));

  return (
    <div className="space-y-6 md:space-y-10" data-testid="overview-page">
      <div>
        <div className="label-eyebrow">Your Command Center</div>
        <h1 className="font-display text-4xl sm:text-5xl font-medium tracking-tight text-[#111812] mt-1">
          Everything, at a glance.
        </h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
        <Stat label="Net worth" value={formatINR(summary.net_worth)}
          sub={`${formatINR(summary.invest_value)} assets · ${formatINR(summary.debt)} debt`}
          testid="stat-net-worth" />
        <Stat label="Income this month" value={formatINR(summary.income_month)} tone="#367A50" testid="stat-income" />
        <Stat label="Spend this month" value={formatINR(summary.expense_month)} tone="#C25942" testid="stat-spend" />
        <Stat label="Saved this month" value={formatINR(summary.savings_month)} testid="stat-saved" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="card-surface p-6 lg:col-span-2" data-testid="trend-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="label-eyebrow">Income vs spend</div>
              <div className="font-display text-xl mt-1">Last 12 months</div>
            </div>
            <Link to="/finance" className="text-xs text-[#184A31] font-medium flex items-center gap-1 hover:underline">
              Open finance <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend.length ? trend : [{ month: new Date().toISOString().slice(0, 7), income: 0, expense: 0 }]}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#184A31" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#184A31" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C25942" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#C25942" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E5E2DC" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#5E6A62", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatINR} tick={{ fill: "#5E6A62", fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip formatter={(v) => formatINRFull(v)} />
                <Area type="monotone" dataKey="income" stroke="#184A31" strokeWidth={2} fill="url(#g1)" />
                <Area type="monotone" dataKey="expense" stroke="#C25942" strokeWidth={2} fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-surface p-6" data-testid="fire-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="label-eyebrow">FIRE Tracker</div>
              <div className="font-display text-xl mt-1">Financial freedom</div>
            </div>
            <Sparkles className="h-5 w-5 text-[#D19B4C]" strokeWidth={1.8} />
          </div>
          {fire ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-end gap-2">
                <span className="font-display text-4xl text-[#184A31]">{fire.progress_pct}%</span>
                <span className="text-sm text-[#5E6A62] mb-1.5">of {formatINR(fire.target_corpus)}</span>
              </div>
              <div className="h-2 bg-[#F2F0E9] rounded-full overflow-hidden">
                <div className="h-full bg-[#184A31]" style={{ width: `${Math.min(100, fire.progress_pct)}%` }} />
              </div>
              <div className="text-sm text-[#5E6A62]">
                {fire.years_to_fire} years to go at {formatINR(fire.monthly_savings)}/mo
              </div>
              {fire.target_date && (
                <div className="text-xs text-[#367A50] font-medium">Projected: {fire.target_date}</div>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-[#5E6A62]">Set up your FIRE target to start tracking.</p>
              <Link to="/goals" className="inline-block mt-3 text-sm bg-[#184A31] text-white px-4 py-2 rounded-full">Configure FIRE</Link>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="card-surface p-6">
          <div className="label-eyebrow mb-3">Spend by category</div>
          {catData.length ? (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catData} layout="vertical">
                  <XAxis type="number" hide />
                  <YAxis dataKey="category" type="category" width={90} tick={{ fill: "#5E6A62", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => formatINRFull(v)} />
                  <Bar dataKey="value" fill="#184A31" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-sm text-[#5E6A62]">No expense data yet this month.</div>
          )}
        </div>

        <div className="card-surface p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="label-eyebrow">Goals</div>
            <Target className="h-4 w-4 text-[#5E6A62]" />
          </div>
          {goals.length === 0 && <div className="text-sm text-[#5E6A62]">No goals yet. Add some on Goals page.</div>}
          <div className="space-y-3">
            {goals.slice(0, 4).map((g) => {
              const pct = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
              return (
                <div key={g.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-[#111812] truncate">{g.name}</span>
                    <span className="text-[#5E6A62] font-mono">{Math.round(pct)}%</span>
                  </div>
                  <div className="h-1.5 bg-[#F2F0E9] rounded-full">
                    <div className="h-full bg-[#D19B4C] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card-surface p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="label-eyebrow">Health snapshot</div>
            <Activity className="h-4 w-4 text-[#5E6A62]" />
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-[#5E6A62] uppercase tracking-wider mb-1">Recent labs</div>
              {recent_labs.length === 0 ? (
                <div className="text-[#5E6A62]">No lab data</div>
              ) : recent_labs.slice(0, 3).map((l) => (
                <div key={l.id} className="flex justify-between py-1 border-b border-[#E5E2DC] last:border-0">
                  <span>{l.test}</span>
                  <span className="font-mono">{l.value} {l.unit || ""}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="text-xs text-[#5E6A62] uppercase tracking-wider mb-1">Active prescriptions</div>
              {recent_meds.length === 0 ? (
                <div className="text-[#5E6A62]">None</div>
              ) : recent_meds.slice(0, 2).map((p) => (
                <div key={p.id} className="text-xs text-[#5E6A62] truncate">
                  {p.date} · {p.medications?.[0]?.name || "Prescription"}
                  {p.medications?.length > 1 && ` +${p.medications.length - 1} more`}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card-surface p-6" data-testid="recent-inbox">
        <div className="label-eyebrow mb-3">Recent inbox activity</div>
        {recent_inbox.length === 0 ? (
          <div className="text-sm text-[#5E6A62]">Nothing yet. Try the Universal Inbox in the top bar.</div>
        ) : (
          <div className="divide-y divide-[#E5E2DC]">
            {recent_inbox.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-3">
                <FileText className="h-4 w-4 text-[#5E6A62]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-[#111812] truncate">{i.parsed?.summary || i.input_preview}</div>
                  <div className="text-xs text-[#5E6A62]">{new Date(i.created_at).toLocaleString("en-IN")}</div>
                </div>
                <div className="text-xs text-[#5E6A62] hidden sm:flex gap-2">
                  {Object.entries(i.counts || {}).filter(([, v]) => v > 0).map(([k, v]) => (
                    <span key={k} className="bg-[#F2F0E9] px-2 py-0.5 rounded">{k}: {v}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
