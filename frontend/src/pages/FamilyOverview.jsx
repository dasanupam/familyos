import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatINRCompact } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

const Avatar = ({ name, size = "lg" }) => {
  const initials = name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  const sz = size === "lg" ? "h-12 w-12 text-base" : "h-8 w-8 text-xs";
  return (
    <div className={`${sz} rounded-full bg-[#184A31]/15 text-[#184A31] font-semibold flex items-center justify-center flex-shrink-0`}>
      {initials}
    </div>
  );
};

const Cell = ({ label, value, tone }) => (
  <div className="text-center">
    <div className="text-xs text-[#5E6A62] mb-0.5">{label}</div>
    <div className={`text-sm font-medium ${tone === "red" ? "text-[#C25942]" : tone === "green" ? "text-[#367A50]" : "text-[#111812]"}`}>{value || "—"}</div>
  </div>
);

function MemberCard({ member }) {
  const [fin, setFin] = useState(null);
  const [health, setHealth] = useState(null);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const mp = `?member_id=${member.id}`;
    api.get(`/finance/summary${mp}`).then(r => setFin(r.data)).catch(() => {});
    Promise.all([
      api.get(`/health/vitals${mp}`),
      api.get(`/health/active-medications${mp}`),
      api.get(`/health/appointments${mp}`),
    ]).then(([v, meds, appts]) => {
      const vitals = v.data || [];
      const bp = vitals.find(x => x.kind === "bp")?.value;
      const wt = vitals.find(x => x.kind === "weight");
      const upcoming = (appts.data || []).filter(a => a.appointment_date >= today).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date));
      const nextAppt = upcoming[0];
      const activeMeds = meds.data?.count ?? (Array.isArray(meds.data) ? meds.data.length : 0);
      setHealth({ bp, weight: wt?.value, weightUnit: wt?.unit || "kg", activeMeds, nextAppt });
    }).catch(() => {});
  }, [member.id, today]);

  const netWorth = fin ? (fin.total_investments || 0) + (fin.total_savings || 0) - (fin.total_loans || 0) : null;
  const savedMTD = fin ? (fin.monthly_income || 0) - (fin.monthly_spend || 0) : null;

  return (
    <div className="card-surface p-5 space-y-4" data-testid={`member-card-${member.id}`}>
      <div className="flex items-center gap-3">
        <Avatar name={member.name} />
        <div>
          <div className="font-display text-lg font-semibold">{member.name}</div>
          <div className="text-xs text-[#5E6A62]">{member.relation || member.role}</div>
        </div>
      </div>

      {/* Finance row */}
      <div>
        <div className="text-xs font-medium text-[#5E6A62] uppercase tracking-wider mb-2">Finance</div>
        <div className="grid grid-cols-3 gap-2">
          <Cell label="Net Worth" value={netWorth != null ? formatINRCompact(netWorth) : null} />
          <Cell label="Income MTD" value={fin?.monthly_income ? formatINRCompact(fin.monthly_income) : null} />
          <Cell label="Spend MTD" value={fin?.monthly_spend ? formatINRCompact(fin.monthly_spend) : null} tone={savedMTD != null && savedMTD < 0 ? "red" : undefined} />
        </div>
      </div>

      {/* Health row */}
      <div>
        <div className="text-xs font-medium text-[#5E6A62] uppercase tracking-wider mb-2">Health</div>
        <div className="grid grid-cols-2 gap-2">
          <Cell label="Last BP" value={health?.bp} tone={health?.bp && parseInt(health.bp) > 130 ? "red" : undefined} />
          <Cell label="Weight" value={health?.weight ? `${health.weight} ${health.weightUnit}` : null} />
          <Cell label="Active Meds" value={health?.activeMeds != null ? `${health.activeMeds}` : null} />
          <Cell label="Next Appt"
            value={health?.nextAppt ? `${health.nextAppt.doctor_name} · ${health.nextAppt.appointment_date}` : "None"}
            tone={health?.nextAppt && Math.ceil((new Date(health.nextAppt.appointment_date) - new Date()) / 86400000) <= 7 ? "red" : undefined} />
        </div>
      </div>
    </div>
  );
}

export default function FamilyOverview() {
  const { members } = useAuth();
  if (!members?.length) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#5E6A62]" /></div>;
  return (
    <div className="space-y-6 pb-8" data-testid="family-overview-page">
      <div>
        <div className="label-eyebrow">Household</div>
        <div className="font-display text-4xl mt-1">Family Overview</div>
        <p className="text-[#5E6A62] mt-1.5 text-sm">Live snapshot across all family members</p>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {members.map(m => <MemberCard key={m.id} member={m} />)}
      </div>
    </div>
  );
}
