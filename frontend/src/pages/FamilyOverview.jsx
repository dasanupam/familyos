import { useEffect, useState } from "react";
import { api, formatINR, formatINRFull } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Users, TrendingUp, HeartPulse, Briefcase, Plane } from "lucide-react";
import { Link } from "react-router-dom";

export default function FamilyOverview() {
  const { members } = useAuth();
  const [perMember, setPerMember] = useState({});

  useEffect(() => {
    (async () => {
      const out = {};
      for (const m of members) {
        const [s, l, p, tr, ev] = await Promise.all([
          api.get(`/finance/summary?member_id=${m.id}`),
          api.get(`/health/labs?member_id=${m.id}`),
          api.get(`/health/prescriptions?member_id=${m.id}`),
          api.get(`/travel/trips?member_id=${m.id}`),
          api.get(`/career/events?member_id=${m.id}`),
        ]);
        out[m.id] = { summary: s.data, labs: l.data, prescriptions: p.data, trips: tr.data, events: ev.data };
      }
      setPerMember(out);
    })();
  }, [members]);

  const totalNetWorth = members.reduce((acc, m) => acc + (perMember[m.id]?.summary?.net_worth || 0), 0);
  const totalMonthSpend = members.reduce((acc, m) => acc + (perMember[m.id]?.summary?.expense_month || 0), 0);
  const totalMonthIncome = members.reduce((acc, m) => acc + (perMember[m.id]?.summary?.income_month || 0), 0);

  return (
    <div className="space-y-6" data-testid="family-overview-page">
      <div>
        <div className="label-eyebrow flex items-center gap-1.5"><Users className="h-3 w-3" /> Household command view · private to you</div>
        <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Everyone, side by side</h1>
        <p className="text-sm text-[#5E6A62] mt-2">A roll-up of every family member's finance, health, travel and career — only you can see this.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Combined net worth" value={formatINRFull(totalNetWorth)} />
        <Stat label="Household income this month" value={formatINRFull(totalMonthIncome)} tone="#367A50" />
        <Stat label="Household spend this month" value={formatINRFull(totalMonthSpend)} tone="#C25942" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {members.map((m) => {
          const d = perMember[m.id];
          if (!d) return <div key={m.id} className="card-surface p-6 text-sm text-[#5E6A62]">Loading {m.name}…</div>;
          return (
            <div key={m.id} className="card-surface p-6 hover:-translate-y-0.5 transition" data-testid={`member-overview-${m.id}`}>
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#E5E2DC]">
                <div className="h-12 w-12 rounded-2xl flex items-center justify-center font-display text-lg text-white"
                  style={{ background: m.color || "#184A31" }}>
                  {m.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-display text-xl">{m.name}</div>
                  <div className="text-xs text-[#5E6A62] capitalize">{m.relation || "member"}</div>
                </div>
                <div className="text-right">
                  <div className="label-eyebrow">Net worth</div>
                  <div className="font-mono text-lg">{formatINR(d.summary?.net_worth || 0)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Mini icon={TrendingUp} label="Spend MTD" value={formatINR(d.summary?.expense_month || 0)} tone="#C25942" />
                <Mini icon={TrendingUp} label="Income MTD" value={formatINR(d.summary?.income_month || 0)} tone="#367A50" />
                <Mini icon={HeartPulse} label="Lab readings" value={d.labs.length} />
                <Mini icon={HeartPulse} label="Active scripts" value={d.prescriptions.length} />
                <Mini icon={Plane} label="Trips" value={d.trips.length} />
                <Mini icon={Briefcase} label="Career events" value={d.events.length} />
              </div>

              {d.labs.length > 0 && (
                <div className="mt-4">
                  <div className="label-eyebrow mb-2">Latest labs</div>
                  <div className="space-y-1">
                    {d.labs.slice(0, 3).map((l) => (
                      <div key={l.id} className="text-xs flex justify-between">
                        <span className="text-[#5E6A62]">{l.test}</span>
                        <span className="font-mono">{l.value} {l.unit || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-xs text-[#5E6A62] flex justify-end gap-3">
        <Link to="/finance" className="hover:underline">→ Finance</Link>
        <Link to="/health" className="hover:underline">→ Health</Link>
        <Link to="/travel" className="hover:underline">→ Travel</Link>
        <Link to="/career" className="hover:underline">→ Career</Link>
      </div>
    </div>
  );
}

const Stat = ({ label, value, tone }) => (
  <div className="card-surface p-5">
    <div className="label-eyebrow">{label}</div>
    <div className="font-display text-3xl mt-1.5" style={{ color: tone || "#111812" }}>{value}</div>
  </div>
);

const Mini = ({ icon: Icon, label, value, tone }) => (
  <div className="flex items-center gap-2.5 bg-[#F2F0E9] rounded-lg px-3 py-2">
    <Icon className="h-3.5 w-3.5 text-[#5E6A62]" strokeWidth={1.8} />
    <div className="flex-1 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-[#5E6A62]">{label}</div>
      <div className="font-mono text-sm" style={{ color: tone || "#111812" }}>{value}</div>
    </div>
  </div>
);
