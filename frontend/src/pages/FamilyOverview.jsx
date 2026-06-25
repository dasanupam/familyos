import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatINRCompact } from "@/lib/utils";
import { Link } from "react-router-dom";
import { Loader2, AlertTriangle, Bell, Activity } from "lucide-react";

const SEVERITY_COLORS = {
  error:   { bg: "#FDF3F1", border: "#C25942/30", text: "#C25942", icon: AlertTriangle },
  warning: { bg: "#FFFBF0", border: "#D19B4C/30", text: "#D19B4C", icon: AlertTriangle },
  info:    { bg: "#F0F6FF", border: "#3B82F6/20", text: "#3B82F6", icon: Bell },
};

function HouseholdNotifications() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/alerts").then((r) => {
      const health = (r.data || []).filter((a) => a.category === "health");
      setAlerts(health);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (alerts.length === 0) return null;

  return (
    <div className="card-surface p-5" data-testid="household-notifications">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-lg bg-[#C25942]/10 flex items-center justify-center">
          <Activity className="h-4 w-4 text-[#C25942]" />
        </div>
        <div>
          <div className="label-eyebrow">Household Health Alerts</div>
          <div className="text-xs text-[#5E6A62]">{alerts.length} alert{alerts.length !== 1 ? "s" : ""} across your family</div>
        </div>
      </div>
      <div className="space-y-2">
        {alerts.slice(0, 8).map((alert, i) => {
          const cfg = SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.info;
          const Icon = cfg.icon;
          return (
            <Link to={alert.link || "/health"} key={`${alert.type || 'alert'}-${i}`}
              className="flex items-start gap-3 rounded-xl border px-3 py-2.5 hover:opacity-90 transition"
              style={{ backgroundColor: cfg.bg, borderColor: cfg.border }}
              data-testid={`household-alert-${i}`}>
              <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: cfg.text }} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-[#111812] leading-snug">{alert.title}</div>
                {alert.date && <div className="text-xs text-[#5E6A62] mt-0.5">{alert.date}</div>}
              </div>
              <span className="text-xs font-medium rounded-full px-2 py-0.5 flex-shrink-0 capitalize"
                style={{ backgroundColor: `${cfg.text}15`, color: cfg.text }}>
                {alert.severity}
              </span>
            </Link>
          );
        })}
      </div>
      {alerts.length > 8 && (
        <div className="text-xs text-[#5E6A62] text-center mt-3">+{alerts.length - 8} more alerts in Health</div>
      )}
    </div>
  );
}

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
      <HouseholdNotifications />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {members.map(m => <MemberCard key={m.id} member={m} />)}
      </div>
    </div>
  );
}
