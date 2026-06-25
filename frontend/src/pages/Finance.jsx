import { useEffect, useState, useCallback, useMemo } from "react";
import { api, formatINR, formatINRFull, API } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, TrendingUp, TrendingDown, Edit3, Download, BadgeIndianRupee } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList } from "recharts";

const Section = ({ title, children, action }) => (
  <div className="card-surface p-5 md:p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="label-eyebrow capitalize">{title.replace(/-/g, " ")}</div>
      {action}
    </div>
    {children}
  </div>
);

const TABS = [
  ["transactions", "Transactions"],
  ["investments", "Investments"],
  ["sip", "SIP"],
  ["rsu", "RSU"],
  ["loans", "Loans"],
  ["tax", "Tax"],
  ["insurance", "Insurance"],
  ["subscriptions", "Subscriptions"],
  ["budget", "Budget vs Actuals"],
];

export default function Finance() {
  const { activeMember, members } = useAuth();
  const [tab, setTab] = useState("transactions");
  const [tx, setTx] = useState([]);
  const [inv, setInv] = useState([]);
  const [loans, setLoans] = useState([]);
  const [sip, setSip] = useState([]);
  const [rsu, setRsu] = useState([]);
  const [tax, setTax] = useState([]);
  const [insurance, setInsurance] = useState([]);
  const [subs, setSubs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [budgets, setBudgets] = useState([]);
  const [budgetMonth, setBudgetMonth] = useState(new Date().toISOString().slice(0, 7));

  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;
  const defaultMemberId = activeMember === "family" ? members[0]?.id : activeMember;

  const refresh = useCallback(async () => {
    const mp = memberParam;
    try {
      const [a, b, c, d, e, f, g, h, i] = await Promise.all([
        api.get(`/finance/transactions${mp}`),
        api.get(`/finance/investments${mp}`),
        api.get(`/finance/loans${mp}`),
        api.get(`/finance/summary${mp}`),
        api.get(`/finance/sip${mp}`),
        api.get(`/finance/rsu${mp}`),
        api.get(`/finance/tax${mp}`),
        api.get(`/finance/insurance${mp}`),
        api.get(`/finance/subscriptions${mp}`),
      ]);
      setTx(a.data); setInv(b.data); setLoans(c.data); setSummary(d.data);
      setSip(e.data); setRsu(f.data); setTax(g.data); setInsurance(h.data); setSubs(i.data);
    } catch { toast.error("Failed to load data"); }
  }, [memberParam]);

  useEffect(() => { refresh(); }, [refresh]);

  // Separate budget fetch (month-dependent)
  useEffect(() => {
    const mp = memberParam;
    const q = mp ? `${mp}&month=${budgetMonth}` : `?month=${budgetMonth}`;
    api.get(`/finance/budget${q}`).then((r) => setBudgets(r.data)).catch(() => {});
  }, [memberParam, budgetMonth]);

  const memberName = (id) => members.find((m) => m.id === id)?.name || "—";

  const today = new Date().toISOString().slice(0, 10);
  const daysUntil = (date) => date ? Math.ceil((new Date(date) - new Date(today)) / 86400000) : null;

  const tabSummary = useMemo(() => {
    if (tab === "transactions") {
      const income = tx.filter((t) => t.type === "income").reduce((s, t) => s + (t.amount || 0), 0);
      const expense = tx.filter((t) => t.type === "expense").reduce((s, t) => s + (t.amount || 0), 0);
      return [
        { label: "Total income", value: formatINRFull(income), color: "#367A50" },
        { label: "Total expenses", value: formatINRFull(expense), color: "#C25942" },
        { label: "Net", value: formatINRFull(income - expense), color: income >= expense ? "#367A50" : "#C25942" },
      ];
    }
    if (tab === "investments") {
      const invested = inv.reduce((s, i) => s + (i.invested_value || 0), 0);
      const current = inv.reduce((s, i) => s + (i.current_value || 0), 0);
      const retPct = invested > 0 ? ((current - invested) / invested * 100).toFixed(1) : null;
      return [
        { label: "Total invested", value: formatINRFull(invested) },
        { label: "Current value", value: formatINRFull(current), color: current >= invested ? "#367A50" : "#C25942" },
        { label: "Total return", value: retPct != null ? `${retPct > 0 ? "+" : ""}${retPct}%` : "—", color: retPct > 0 ? "#367A50" : "#C25942" },
      ];
    }
    if (tab === "sip") {
      const monthly = sip.filter((s) => s.status === "active").reduce((acc, s) => acc + (s.monthly_amount || 0), 0);
      const invested = sip.reduce((acc, s) => acc + (s.total_invested || 0), 0);
      const current = sip.reduce((acc, s) => acc + (s.current_value || 0), 0);
      return [
        { label: "Monthly SIP (active)", value: formatINRFull(monthly) },
        { label: "Total invested", value: formatINRFull(invested) },
        { label: "Current value", value: formatINRFull(current), color: current >= invested ? "#367A50" : "#C25942" },
      ];
    }
    if (tab === "rsu") {
      const totalUnits = rsu.reduce((s, r) => s + (r.total_units || 0), 0);
      const vestedUnits = rsu.reduce((s, r) => s + (r.vested_units || 0), 0);
      const unvestedValue = rsu.reduce((s, r) => s + ((r.total_units - (r.vested_units || 0)) * (r.current_price || 0)), 0);
      return [
        { label: "Total units", value: totalUnits.toLocaleString() },
        { label: "Vested units", value: vestedUnits.toLocaleString(), color: "#367A50" },
        { label: "Unvested value", value: formatINRFull(unvestedValue) },
      ];
    }
    if (tab === "loans") {
      const outstanding = loans.reduce((s, l) => s + (l.outstanding || 0), 0);
      const emi = loans.reduce((s, l) => s + (l.emi || 0), 0);
      return [
        { label: "Total outstanding", value: formatINRFull(outstanding), color: "#C25942" },
        { label: "Total EMI / month", value: formatINRFull(emi) },
        { label: "Active loans", value: loans.length.toString() },
      ];
    }
    if (tab === "insurance") {
      const totalPremium = insurance.reduce((s, i) => s + (i.annual_premium || 0), 0);
      const expiringSoon = insurance.filter((i) => { const d = daysUntil(i.policy_end); return d != null && d >= 0 && d <= 30; }).length;
      return [
        { label: "Policies", value: insurance.length.toString() },
        { label: "Annual premium", value: formatINRFull(totalPremium) },
        { label: "Expiring ≤30 days", value: expiringSoon.toString(), color: expiringSoon > 0 ? "#C25942" : undefined },
      ];
    }
    if (tab === "subscriptions") {
      const monthlyTotal = subs.filter((s) => s.status === "active").reduce((acc, s) => {
        if (s.billing_cycle === "annual") return acc + (s.amount || 0) / 12;
        return acc + (s.amount || 0);
      }, 0);
      const active = subs.filter((s) => s.status === "active").length;
      return [
        { label: "Monthly spend", value: formatINRFull(Math.round(monthlyTotal)) },
        { label: "Annual equivalent", value: formatINRFull(Math.round(monthlyTotal * 12)) },
        { label: "Active subscriptions", value: active.toString() },
      ];
    }
    if (tab === "budget") {
      const totalBudget = budgets.reduce((s, b) => s + (b.budgeted_amount || 0), 0);
      const totalActual = budgets.reduce((s, b) => s + (b.actual_amount || 0), 0);
      return [
        { label: "Total budget", value: formatINRFull(totalBudget) },
        { label: "Total spent", value: formatINRFull(totalActual), color: totalActual > totalBudget ? "#C25942" : undefined },
        { label: "Remaining", value: formatINRFull(Math.max(0, totalBudget - totalActual)), color: totalBudget - totalActual < 0 ? "#C25942" : "#367A50" },
      ];
    }
    return null;
  }, [tab, tx, inv, loans, sip, rsu, insurance, subs, budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  const getTabData = () => ({
    transactions: tx, investments: inv, loans, sip, rsu, tax, insurance, subscriptions: subs, budget: budgets,
  })[tab] || [];

  const filteredRows = () => {
    const rows = getTabData();
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, member_id: form.member_id || defaultMemberId };
      if (editingId) {
        if (["transactions", "investments", "loans"].includes(tab)) {
          const numFields = { transactions: ["amount"], investments: ["units", "current_value", "invested_value"], loans: ["outstanding", "emi", "rate"] };
          (numFields[tab] || []).forEach((k) => { if (body[k]) body[k] = Number(body[k]); });
          await api.patch(`/${tab === "transactions" ? "transactions" : tab === "investments" ? "investments" : "loans"}/${editingId}`, body);
        } else if (tab === "budget") {
          await api.put(`/finance/budget/${editingId}`, { ...body, budgeted_amount: Number(body.budgeted_amount || 0), month: body.month || budgetMonth });
        } else {
          const routeMap = { sip: "/finance/sip", rsu: "/finance/rsu", tax: "/finance/tax", insurance: "/finance/insurance", subscriptions: "/finance/subscriptions" };
          await api.put(`${routeMap[tab]}/${editingId}`, body);
        }
      } else {
        if (tab === "transactions") await api.post("/finance/transactions", { ...body, amount: Number(body.amount), date: body.date || new Date().toISOString().slice(0, 10), type: body.type || "expense", category: body.category || "other" });
        else if (tab === "investments") await api.post("/finance/investments", { ...body, units: body.units ? Number(body.units) : null, current_value: body.current_value ? Number(body.current_value) : null, invested_value: body.invested_value ? Number(body.invested_value) : null });
        else if (tab === "loans") await api.post("/finance/loans", { ...body, outstanding: Number(body.outstanding), emi: body.emi ? Number(body.emi) : null, rate: body.rate ? Number(body.rate) : null });
        else if (tab === "sip") await api.post("/finance/sip", { ...body, monthly_amount: Number(body.monthly_amount || 0), total_invested: body.total_invested ? Number(body.total_invested) : null, current_value: body.current_value ? Number(body.current_value) : null });
        else if (tab === "rsu") await api.post("/finance/rsu", { ...body, total_units: Number(body.total_units || 0), current_price: body.current_price ? Number(body.current_price) : null, vested_units: body.vested_units ? Number(body.vested_units) : 0 });
        else if (tab === "tax") await api.post("/finance/tax", { ...body, income_salary: body.income_salary ? Number(body.income_salary) : null, tds_deducted: body.tds_deducted ? Number(body.tds_deducted) : null });
        else if (tab === "insurance") await api.post("/finance/insurance", { ...body, policy_type: body.policy_type || "term", sum_assured: body.sum_assured ? Number(body.sum_assured) : null, annual_premium: body.annual_premium ? Number(body.annual_premium) : null });
        else if (tab === "subscriptions") await api.post("/finance/subscriptions", { ...body, amount: Number(body.amount || 0) });
        else if (tab === "budget") await api.post("/finance/budget", { ...body, budgeted_amount: Number(body.budgeted_amount || 0), month: body.month || budgetMonth });
      }
      setShowAdd(false); setForm({}); setEditingId(null);
      await refresh(); toast.success(editingId ? "Updated" : "Added");
    } catch { toast.error("Save failed"); }
  };

  const startEdit = (row) => { setEditingId(row.id); setForm(row); setShowAdd(true); };
  const remove = async (kind, id) => {
    const routeMap = { transactions: "/finance/transactions", investments: "/finance/investments", loans: "/finance/loans", sip: "/finance/sip", rsu: "/finance/rsu", tax: "/finance/tax", insurance: "/finance/insurance", subscriptions: "/finance/subscriptions", budget: "/finance/budget" };
    await api.delete(`${routeMap[tab]}/${id}`);
    if (tab === "budget") {
      const mp = memberParam;
      const q = mp ? `${mp}&month=${budgetMonth}` : `?month=${budgetMonth}`;
      api.get(`/finance/budget${q}`).then((r) => setBudgets(r.data)).catch(() => {});
    } else {
      refresh();
    }
  };

  const downloadCsv = () => {
    const map = { transactions: "transactions", investments: "investments", loans: "loans" };
    const kind = map[tab];
    if (!kind) return;
    const token = localStorage.getItem("flos_token");
    window.open(`${API}/export/${kind}.csv?auth=${encodeURIComponent(token)}`, "_blank");
  };

  return (
    <div className="space-y-6" data-testid="finance-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="label-eyebrow">Finance</div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Money in one place</h1>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card-surface p-4"><div className="label-eyebrow">Net worth</div><div className="font-display text-2xl mt-1">{formatINRFull(summary.net_worth)}</div></div>
          <div className="card-surface p-4"><div className="label-eyebrow">Assets</div><div className="font-display text-2xl mt-1 text-[#367A50]">{formatINRFull(summary.invest_value)}</div></div>
          <div className="card-surface p-4"><div className="label-eyebrow">Debt</div><div className="font-display text-2xl mt-1 text-[#C25942]">{formatINRFull(summary.debt)}</div></div>
          <div className="card-surface p-4"><div className="label-eyebrow">Saved this month</div><div className="font-display text-2xl mt-1">{formatINRFull(summary.savings_month)}</div></div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`finance-tab-${k}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${tab === k ? "bg-[#184A31] text-white" : "bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31]"}`}>
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="bg-white border border-[#E5E2DC] px-3 py-1.5 rounded-full text-sm focus:outline-none focus:border-[#184A31]" />
          <button onClick={() => { setShowAdd(true); setForm({}); setEditingId(null); }} data-testid="finance-add-button"
            className="px-4 py-2 rounded-full text-sm font-medium bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </button>
          {["transactions","investments","loans"].includes(tab) && (
            <button onClick={downloadCsv} className="px-3 py-2 rounded-full text-sm bg-white border border-[#E5E2DC] text-[#5E6A62] flex items-center gap-1.5">
              <Download className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Per-tab summary bar */}
      {tabSummary && (
        <div className="grid grid-cols-3 gap-3" data-testid={`finance-summary-${tab}`}>
          {tabSummary.map((card) => (
            <div key={card.label} className="card-surface p-4">
              <div className="label-eyebrow">{card.label}</div>
              <div className="font-display text-xl mt-1" style={card.color ? { color: card.color } : {}}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <Section title={tab}>
        {tab === "transactions" && <Table rows={filteredRows()} cols={[
          { k: "date", label: "Date" },
          { k: "type", label: "Type", render: (v) => v === "income" ? <span className="text-[#367A50] flex items-center gap-1"><TrendingUp className="h-3 w-3" /> income</span> : <span className="text-[#C25942] flex items-center gap-1"><TrendingDown className="h-3 w-3" /> expense</span> },
          { k: "category", label: "Category" },
          { k: "merchant", label: "Merchant" },
          { k: "member_id", label: "Member", render: memberName },
          { k: "amount", label: "Amount", render: formatINRFull, align: "right" },
        ]} onDelete={(r) => remove("transactions", r.id)} onEdit={startEdit} testidPrefix="finance-tx" empty="No transactions. Capture spends via Universal Inbox." />}

        {tab === "investments" && <Table rows={filteredRows()} cols={[
          { k: "name", label: "Name" },
          { k: "kind", label: "Type" },
          { k: "invested_value", label: "Invested", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "current_value", label: "Value", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "_return", label: "Return", render: (_v, row) => {
            const inv = row.invested_value; const cur = row.current_value;
            if (!inv || !cur) return "—";
            const pct = ((cur - inv) / inv * 100).toFixed(1);
            return <span className={`font-mono text-xs ${cur >= inv ? "text-[#367A50]" : "text-[#C25942]"}`}>{cur >= inv ? "+" : ""}{pct}%</span>;
          }, align: "right" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove("investments", r.id)} onEdit={startEdit} testidPrefix="finance-inv" empty="No investments." />}

        {tab === "sip" && <Table rows={filteredRows()} cols={[
          { k: "fund_name", label: "Fund" },
          { k: "monthly_amount", label: "Monthly SIP", render: formatINRFull, align: "right" },
          { k: "total_invested", label: "Invested", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "current_value", label: "Value", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "xirr", label: "XIRR %", render: (v) => v ? `${v.toFixed(1)}%` : "—" },
          { k: "status", label: "Status" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove("sip", r.id)} onEdit={startEdit} testidPrefix="finance-sip" empty="No SIPs tracked." />}

        {tab === "rsu" && <Table rows={filteredRows()} cols={[
          { k: "company", label: "Company" },
          { k: "grant_date", label: "Grant Date" },
          { k: "total_units", label: "Total Units", align: "right" },
          { k: "vested_units", label: "Vested", align: "right" },
          { k: "current_price", label: "CMP", render: (v) => v ? formatINR(v) : "—", align: "right" },
          { k: "projected_value", label: "Unvested Value", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove("rsu", r.id)} onEdit={startEdit} testidPrefix="finance-rsu" empty="No RSU grants." />}

        {tab === "loans" && <Table rows={filteredRows()} cols={[
          { k: "name", label: "Loan" },
          { k: "outstanding", label: "Outstanding", render: formatINRFull, align: "right" },
          { k: "emi", label: "EMI", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "rate", label: "Rate %" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove("loans", r.id)} onEdit={startEdit} testidPrefix="finance-loan" empty="No loans tracked." />}

        {tab === "tax" && <Table rows={filteredRows()} cols={[
          { k: "financial_year", label: "FY" },
          { k: "income_salary", label: "Salary Income", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "tds_deducted", label: "TDS", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "estimated_liability", label: "Est. Liability", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "itr_status", label: "ITR Status" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove("tax", r.id)} onEdit={startEdit} testidPrefix="finance-tax" empty="No tax records." />}

        {tab === "insurance" && <Table rows={filteredRows()} cols={[
          { k: "insurer", label: "Insurer" },
          { k: "policy_type", label: "Type" },
          { k: "sum_assured", label: "Sum Assured", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "annual_premium", label: "Premium / yr", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
          { k: "policy_end", label: "Expires" },
          { k: "member_id", label: "Member", render: memberName },
        ]} onDelete={(r) => remove("insurance", r.id)} onEdit={startEdit} testidPrefix="finance-ins"
        rowClass={(r) => { const d = daysUntil(r.policy_end); return d != null && d >= 0 && d <= 30 ? "bg-[#FDF3F1] border-[#C25942]/30" : ""; }}
        empty="No insurance policies." />}

        {tab === "subscriptions" && <Table rows={filteredRows()} cols={[
          { k: "name", label: "Service" },
          { k: "category", label: "Category" },
          { k: "amount", label: "Amount", render: formatINRFull, align: "right" },
          { k: "billing_cycle", label: "Cycle" },
          { k: "next_billing_date", label: "Next Due" },
          { k: "status", label: "Status" },
        ]} onDelete={(r) => remove("subscriptions", r.id)} onEdit={startEdit} testidPrefix="finance-sub" empty="No subscriptions tracked." />}

        {tab === "budget" && (
          <BudgetView budgets={budgets} budgetMonth={budgetMonth} setBudgetMonth={setBudgetMonth} onDelete={(r) => remove("budget", r.id)} onEdit={startEdit} />
        )}
      </Section>

      {showAdd && (
        <Modal title={editingId ? `Edit ${tab}` : `Add ${tab}`} onClose={() => { setShowAdd(false); setEditingId(null); }}>
          <form onSubmit={submitAdd} className="space-y-3" data-testid="finance-add-form">
            {tab !== "budget" && <SelectMember value={form.member_id || defaultMemberId} onChange={(v) => setForm({ ...form, member_id: v })} members={members} />}
            {tab === "transactions" && <>
              <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
              <Field label="Amount (₹)" type="number" value={form.amount || ""} onChange={(v) => setForm({ ...form, amount: v })} required />
              <Field label="Type" as="select" value={form.type || "expense"} onChange={(v) => setForm({ ...form, type: v })} options={[["expense", "Expense"], ["income", "Income"]]} />
              <Field label="Category" value={form.category || ""} onChange={(v) => setForm({ ...form, category: v })} placeholder="groceries, salary, fuel…" />
              <Field label="Merchant / source" value={form.merchant || ""} onChange={(v) => setForm({ ...form, merchant: v })} />
            </>}
            {tab === "investments" && <>
              <Field label="Name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required />
              <Field label="Kind" as="select" value={form.kind || "mutual_fund"} onChange={(v) => setForm({ ...form, kind: v })} options={[["mutual_fund","Mutual fund"],["stock","Stock"],["fd","FD"],["crypto","Crypto"],["other","Other"]]} />
              <Field label="Purchase date" type="date" value={form.purchase_date || ""} onChange={(v) => setForm({ ...form, purchase_date: v })} />
              <Field label="Invested (₹)" type="number" value={form.invested_value || ""} onChange={(v) => setForm({ ...form, invested_value: v })} />
              <Field label="Current value (₹)" type="number" value={form.current_value || ""} onChange={(v) => setForm({ ...form, current_value: v })} />
            </>}
            {tab === "sip" && <>
              <Field label="Fund name" value={form.fund_name || ""} onChange={(v) => setForm({ ...form, fund_name: v })} required />
              <Field label="Folio number" value={form.folio_number || ""} onChange={(v) => setForm({ ...form, folio_number: v })} />
              <Field label="Monthly SIP (₹)" type="number" value={form.monthly_amount || ""} onChange={(v) => setForm({ ...form, monthly_amount: v })} required />
              <Field label="Start date" type="date" value={form.start_date || ""} onChange={(v) => setForm({ ...form, start_date: v })} required />
              <Field label="Status" as="select" value={form.status || "active"} onChange={(v) => setForm({ ...form, status: v })} options={[["active","Active"],["paused","Paused"],["stopped","Stopped"]]} />
              <Field label="Total invested (₹)" type="number" value={form.total_invested || ""} onChange={(v) => setForm({ ...form, total_invested: v })} />
              <Field label="Current value (₹)" type="number" value={form.current_value || ""} onChange={(v) => setForm({ ...form, current_value: v })} />
            </>}
            {tab === "rsu" && <>
              <Field label="Company" value={form.company || ""} onChange={(v) => setForm({ ...form, company: v })} required />
              <Field label="Grant date" type="date" value={form.grant_date || ""} onChange={(v) => setForm({ ...form, grant_date: v })} required />
              <Field label="Total units" type="number" value={form.total_units || ""} onChange={(v) => setForm({ ...form, total_units: v })} required />
              <Field label="Vested units" type="number" value={form.vested_units || ""} onChange={(v) => setForm({ ...form, vested_units: v })} />
              <Field label="Current price (₹)" type="number" value={form.current_price || ""} onChange={(v) => setForm({ ...form, current_price: v })} />
            </>}
            {tab === "loans" && <>
              <Field label="Name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required />
              <Field label="Outstanding (₹)" type="number" value={form.outstanding || ""} onChange={(v) => setForm({ ...form, outstanding: v })} required />
              <Field label="EMI (₹)" type="number" value={form.emi || ""} onChange={(v) => setForm({ ...form, emi: v })} />
              <Field label="Rate %" type="number" step="0.01" value={form.rate || ""} onChange={(v) => setForm({ ...form, rate: v })} />
            </>}
            {tab === "tax" && <>
              <Field label="Financial year (e.g. 2025-26)" value={form.financial_year || ""} onChange={(v) => setForm({ ...form, financial_year: v })} required />
              <Field label="Salary income (₹)" type="number" value={form.income_salary || ""} onChange={(v) => setForm({ ...form, income_salary: v })} />
              <Field label="Other income (₹)" type="number" value={form.income_other || ""} onChange={(v) => setForm({ ...form, income_other: v })} />
              <Field label="TDS deducted (₹)" type="number" value={form.tds_deducted || ""} onChange={(v) => setForm({ ...form, tds_deducted: v })} />
              <Field label="Estimated liability (₹)" type="number" value={form.estimated_liability || ""} onChange={(v) => setForm({ ...form, estimated_liability: v })} />
              <Field label="ITR status" as="select" value={form.itr_status || "not_filed"} onChange={(v) => setForm({ ...form, itr_status: v })} options={[["not_filed","Not filed"],["filed","Filed"],["processed","Processed"]]} />
            </>}
            {tab === "insurance" && <>
              <Field label="Insurer" value={form.insurer || ""} onChange={(v) => setForm({ ...form, insurer: v })} required />
              <Field label="Type" as="select" value={form.policy_type || "term"} onChange={(v) => setForm({ ...form, policy_type: v })} options={[["term","Term"],["health","Health"],["life","Life"],["vehicle","Vehicle"],["home","Home"]]} />
              <Field label="Policy number" value={form.policy_number || ""} onChange={(v) => setForm({ ...form, policy_number: v })} />
              <Field label="Sum assured (₹)" type="number" value={form.sum_assured || ""} onChange={(v) => setForm({ ...form, sum_assured: v })} />
              <Field label="Annual premium (₹)" type="number" value={form.annual_premium || ""} onChange={(v) => setForm({ ...form, annual_premium: v })} />
              <Field label="Policy ends" type="date" value={form.policy_end || ""} onChange={(v) => setForm({ ...form, policy_end: v })} />
              <Field label="Nominee" value={form.nominee || ""} onChange={(v) => setForm({ ...form, nominee: v })} />
            </>}
            {tab === "subscriptions" && <>
              <Field label="Service name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required />
              <Field label="Category" as="select" value={form.category || "other"} onChange={(v) => setForm({ ...form, category: v })} options={[["entertainment","Entertainment"],["tools","Tools"],["fitness","Fitness"],["other","Other"]]} />
              <Field label="Amount (₹)" type="number" value={form.amount || ""} onChange={(v) => setForm({ ...form, amount: v })} required />
              <Field label="Billing cycle" as="select" value={form.billing_cycle || "monthly"} onChange={(v) => setForm({ ...form, billing_cycle: v })} options={[["monthly","Monthly"],["annual","Annual"]]} />
              <Field label="Next billing date" type="date" value={form.next_billing_date || ""} onChange={(v) => setForm({ ...form, next_billing_date: v })} />
              <Field label="Status" as="select" value={form.status || "active"} onChange={(v) => setForm({ ...form, status: v })} options={[["active","Active"],["cancelled","Cancelled"]]} />
            </>}
            {tab === "budget" && <>
              <Field label="Month" type="month" value={form.month || budgetMonth} onChange={(v) => setForm({ ...form, month: v })} required />
              <Field label="Category" value={form.category || ""} onChange={(v) => setForm({ ...form, category: v })} required placeholder="groceries, salary, fuel…" />
              <Field label="Budgeted amount (₹)" type="number" value={form.budgeted_amount || ""} onChange={(v) => setForm({ ...form, budgeted_amount: v })} required />
            </>}
            <button data-testid="finance-submit-button" className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function BudgetView({ budgets, budgetMonth, setBudgetMonth, onDelete, onEdit }) {
  const chartData = budgets.map((b) => ({
    category: b.category,
    Budget: b.budgeted_amount || 0,
    Actual: b.actual_amount || 0,
    over: (b.actual_amount || 0) > (b.budgeted_amount || 0),
  }));

  return (
    <div className="space-y-5" data-testid="budget-view">
      <div className="flex items-center gap-3">
        <div className="label-eyebrow">Month</div>
        <input type="month" value={budgetMonth} onChange={(e) => setBudgetMonth(e.target.value)}
          className="bg-white border border-[#E5E2DC] px-3 py-1.5 rounded-xl text-sm focus:outline-none focus:border-[#184A31]" />
      </div>

      {chartData.length > 0 ? (
        <>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap="30%">
                <CartesianGrid stroke="#E5E2DC" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: "#5E6A62" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#5E6A62" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [`₹${v.toLocaleString()}`, ""]} />
                <Bar dataKey="Budget" fill="#D19B4C" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Actual" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.over ? "#C25942" : "#184A31"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto -mx-5 md:-mx-6">
            <table className="w-full text-sm">
              <thead className="text-left text-[#5E6A62] border-b border-[#E5E2DC]">
                <tr>
                  <th className="px-5 py-2 font-medium text-xs uppercase tracking-wider">Category</th>
                  <th className="px-5 py-2 font-medium text-xs uppercase tracking-wider text-right">Budget</th>
                  <th className="px-5 py-2 font-medium text-xs uppercase tracking-wider text-right">Actual</th>
                  <th className="px-5 py-2 font-medium text-xs uppercase tracking-wider text-right">Remaining</th>
                  <th className="px-5 py-2 font-medium text-xs uppercase tracking-wider">Used</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => {
                  const pct = b.budgeted_amount > 0 ? Math.min(100, (b.actual_amount || 0) / b.budgeted_amount * 100) : 0;
                  const over = (b.actual_amount || 0) > (b.budgeted_amount || 0);
                  return (
                    <tr key={b.id} className={`border-b border-[#E5E2DC]/60 hover:bg-[#F2F0E9]/50 ${over ? "bg-[#FDF3F1]" : ""}`} data-testid="budget-row">
                      <td className="px-5 py-3 font-medium capitalize">{b.category}</td>
                      <td className="px-5 py-3 text-right font-mono">{formatINRFull(b.budgeted_amount)}</td>
                      <td className={`px-5 py-3 text-right font-mono ${over ? "text-[#C25942]" : ""}`}>{formatINRFull(b.actual_amount || 0)}</td>
                      <td className={`px-5 py-3 text-right font-mono ${over ? "text-[#C25942]" : "text-[#367A50]"}`}>{formatINRFull(Math.max(0, b.budgeted_amount - (b.actual_amount || 0)))}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#E5E2DC] rounded-full overflow-hidden" style={{ minWidth: 60 }}>
                            <div className={`h-full rounded-full ${over ? "bg-[#C25942]" : "bg-[#184A31]"}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-[#5E6A62] w-10 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        <button onClick={() => onEdit(b)} className="text-[#5E6A62] hover:text-[#184A31] opacity-50 hover:opacity-100 mr-2"><Edit3 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => onDelete(b)} className="text-[#C25942] opacity-50 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="text-sm text-[#5E6A62] py-4">No budget set for {budgetMonth}. Add categories above.</div>
      )}
    </div>
  );
}

function Table({ rows, cols, onDelete, onEdit, testidPrefix, rowClass, empty }) {
  if (rows.length === 0) return <div className="text-sm text-[#5E6A62] py-4">{empty}</div>;
  return (
    <div className="overflow-x-auto -mx-5 md:-mx-6">
      <table className="w-full text-sm">
        <thead className="text-left text-[#5E6A62] border-b border-[#E5E2DC]">
          <tr>
            {cols.map((c) => <th key={c.k} className={`px-5 md:px-6 py-2 font-medium text-xs uppercase tracking-wider ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>)}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-b border-[#E5E2DC]/60 hover:bg-[#F2F0E9]/50 ${rowClass ? rowClass(r) : ""}`} data-testid={`${testidPrefix}-row`}>
              {cols.map((c) => (
                <td key={c.k} className={`px-5 md:px-6 py-3 ${c.align === "right" ? "text-right font-mono" : ""}`}>
                  {c.render ? c.render(r[c.k], r) : (r[c.k] ?? "—")}
                </td>
              ))}
              <td className="px-2 py-3 whitespace-nowrap">
                {onEdit && <button onClick={() => onEdit(r)} className="text-[#5E6A62] hover:text-[#184A31] opacity-50 hover:opacity-100 mr-2" data-testid={`${testidPrefix}-edit`}><Edit3 className="h-3.5 w-3.5" /></button>}
                <button onClick={() => onDelete(r)} className="text-[#C25942] opacity-50 hover:opacity-100" data-testid={`${testidPrefix}-delete`}><Trash2 className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-[#111812]/40 backdrop-blur-sm flex items-end md:items-center justify-center p-3 md:p-6" onClick={onClose}>
      <div className="w-full max-w-md card-surface p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="font-display text-xl capitalize">{title}</div>
          <button onClick={onClose} className="text-[#5E6A62]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, type = "text", as, options, value, onChange, ...rest }) {
  if (as === "select") return (
    <div>
      <label className="label-eyebrow block mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white border border-[#E5E2DC] px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#184A31]">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
  return (
    <div>
      <label className="label-eyebrow block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} {...rest} className="w-full bg-white border border-[#E5E2DC] px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#184A31]" />
    </div>
  );
}

export function SelectMember({ value, onChange, members }) {
  return (
    <div>
      <label className="label-eyebrow block mb-1.5">Member</label>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full bg-white border border-[#E5E2DC] px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#184A31]">
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );
}
