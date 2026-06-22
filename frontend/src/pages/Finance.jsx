import { useEffect, useState, useCallback } from "react";
import { api, formatINR, formatINRFull } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, TrendingUp, TrendingDown, Building2, LineChart, Edit3, Download } from "lucide-react";
import { toast } from "sonner";
import { API } from "@/lib/api";

const Section = ({ title, children, action }) => (
  <div className="card-surface p-5 md:p-6">
    <div className="flex items-center justify-between mb-4">
      <div className="label-eyebrow">{title}</div>
      {action}
    </div>
    {children}
  </div>
);

export default function Finance() {
  const { activeMember, members } = useAuth();
  const [tab, setTab] = useState("transactions");
  const [tx, setTx] = useState([]);
  const [inv, setInv] = useState([]);
  const [loans, setLoans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);

  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;

  const refresh = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      api.get(`/finance/transactions${memberParam}`),
      api.get(`/finance/investments${memberParam}`),
      api.get(`/finance/loans${memberParam}`),
      api.get(`/finance/summary${memberParam}`),
    ]);
    setTx(a.data); setInv(b.data); setLoans(c.data); setSummary(d.data);
  }, [memberParam]);

  useEffect(() => { refresh(); }, [refresh]);

  const defaultMemberId = activeMember === "family" ? members[0]?.id : activeMember;

  const submitAdd = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, member_id: form.member_id || defaultMemberId };
      const kindMap = { transactions: "transactions", investments: "investments", loans: "loans" };
      if (editingId) {
        const patchBody = { ...body };
        if (tab === "transactions" && patchBody.amount) patchBody.amount = Number(patchBody.amount);
        await api.patch(`/${kindMap[tab]}/${editingId}`, patchBody);
      } else if (tab === "transactions") {
        await api.post("/finance/transactions", {
          ...body, amount: Number(body.amount), date: body.date || new Date().toISOString().slice(0, 10),
          type: body.type || "expense", category: body.category || "other",
        });
      } else if (tab === "investments") {
        await api.post("/finance/investments", {
          ...body, units: body.units ? Number(body.units) : null,
          current_value: body.current_value ? Number(body.current_value) : null,
          invested_value: body.invested_value ? Number(body.invested_value) : null,
        });
      } else if (tab === "loans") {
        await api.post("/finance/loans", {
          ...body, outstanding: Number(body.outstanding),
          emi: body.emi ? Number(body.emi) : null, rate: body.rate ? Number(body.rate) : null,
        });
      }
      setShowAdd(false); setForm({}); setEditingId(null);
      await refresh();
      toast.success(editingId ? "Updated" : "Added");
    } catch { toast.error("Save failed"); }
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm(row);
    setShowAdd(true);
  };

  const downloadCsv = () => {
    const map = { transactions: "transactions", investments: "investments", loans: "loans" };
    const token = localStorage.getItem("flos_token");
    window.open(`${API}/export/${map[tab]}.csv?auth=${encodeURIComponent(token)}`, "_blank");
  };

  const remove = async (kind, id) => {
    await api.delete(`/finance/${kind}/${id}`);
    refresh();
  };

  const memberName = (id) => members.find((m) => m.id === id)?.name || "—";

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
          <div className="card-surface p-4">
            <div className="label-eyebrow">Net worth</div>
            <div className="font-display text-2xl mt-1">{formatINRFull(summary.net_worth)}</div>
          </div>
          <div className="card-surface p-4">
            <div className="label-eyebrow">Assets</div>
            <div className="font-display text-2xl mt-1 text-[#367A50]">{formatINRFull(summary.invest_value)}</div>
          </div>
          <div className="card-surface p-4">
            <div className="label-eyebrow">Debt</div>
            <div className="font-display text-2xl mt-1 text-[#C25942]">{formatINRFull(summary.debt)}</div>
          </div>
          <div className="card-surface p-4">
            <div className="label-eyebrow">Saved this month</div>
            <div className="font-display text-2xl mt-1">{formatINRFull(summary.savings_month)}</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {[
          ["transactions", "Transactions"],
          ["investments", "Investments"],
          ["loans", "Loans"],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            data-testid={`finance-tab-${k}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
              tab === k ? "bg-[#184A31] text-white" : "bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31]"
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => { setShowAdd(true); setForm({}); setEditingId(null); }}
          data-testid="finance-add-button"
          className="ml-auto px-4 py-2 rounded-full text-sm font-medium bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] flex items-center gap-1.5 transition"
        >
          <Plus className="h-4 w-4" /> Add manually
        </button>
        <button
          onClick={downloadCsv}
          data-testid="finance-export-csv"
          className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31] flex items-center gap-1.5"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      <Section title={tab}>
        {tab === "transactions" && (
          <Table
            rows={tx}
            cols={[
              { k: "date", label: "Date" },
              { k: "type", label: "Type", render: (v) => v === "income"
                ? <span className="text-[#367A50] flex items-center gap-1"><TrendingUp className="h-3 w-3" /> income</span>
                : <span className="text-[#C25942] flex items-center gap-1"><TrendingDown className="h-3 w-3" /> expense</span> },
              { k: "category", label: "Category" },
              { k: "merchant", label: "Merchant" },
              { k: "member_id", label: "Member", render: (v) => memberName(v) },
              { k: "amount", label: "Amount", render: (v) => formatINRFull(v), align: "right" },
            ]}
            onDelete={(r) => remove("transactions", r.id)}
            onEdit={startEdit}
            testidPrefix="finance-tx"
            empty="No transactions yet. Use the Universal Inbox to capture spends instantly."
          />
        )}
        {tab === "investments" && (
          <Table
            rows={inv}
            cols={[
              { k: "name", label: "Name" },
              { k: "kind", label: "Type" },
              { k: "units", label: "Units" },
              { k: "invested_value", label: "Invested", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
              { k: "current_value", label: "Value", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
              { k: "member_id", label: "Member", render: (v) => memberName(v) },
            ]}
            onDelete={(r) => remove("investments", r.id)}
            onEdit={startEdit}
            testidPrefix="finance-inv"
            empty="No investments. Snap a screenshot of your MF holdings to add via Inbox."
          />
        )}
        {tab === "loans" && (
          <Table
            rows={loans}
            cols={[
              { k: "name", label: "Loan" },
              { k: "outstanding", label: "Outstanding", render: formatINRFull, align: "right" },
              { k: "emi", label: "EMI", render: (v) => v ? formatINRFull(v) : "—", align: "right" },
              { k: "rate", label: "Rate %" },
              { k: "member_id", label: "Member", render: (v) => memberName(v) },
            ]}
            onDelete={(r) => remove("loans", r.id)}
            onEdit={startEdit}
            testidPrefix="finance-loan"
            empty="No loans tracked. Add manually or paste a loan statement."
          />
        )}
      </Section>

      {showAdd && (
        <Modal title={editingId ? `Edit ${tab.slice(0, -1)}` : `Add ${tab.slice(0, -1)}`} onClose={() => { setShowAdd(false); setEditingId(null); }}>
          <form onSubmit={submitAdd} className="space-y-3" data-testid="finance-add-form">
            <SelectMember value={form.member_id || defaultMemberId} onChange={(v) => setForm({ ...form, member_id: v })} members={members} />
            {tab === "transactions" && (
              <>
                <Field label="Date" type="date" value={form.date || ""} onChange={(v) => setForm({ ...form, date: v })} />
                <Field label="Amount (₹)" type="number" value={form.amount || ""} onChange={(v) => setForm({ ...form, amount: v })} required />
                <Field label="Type" as="select" value={form.type || "expense"} onChange={(v) => setForm({ ...form, type: v })}
                  options={[["expense", "Expense"], ["income", "Income"]]} />
                <Field label="Category" value={form.category || ""} onChange={(v) => setForm({ ...form, category: v })} placeholder="groceries, salary, fuel…" />
                <Field label="Merchant / source" value={form.merchant || ""} onChange={(v) => setForm({ ...form, merchant: v })} />
              </>
            )}
            {tab === "investments" && (
              <>
                <Field label="Name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required />
                <Field label="Kind" as="select" value={form.kind || "mutual_fund"} onChange={(v) => setForm({ ...form, kind: v })}
                  options={[["mutual_fund", "Mutual fund"], ["stock", "Stock"], ["fd", "Fixed deposit"], ["crypto", "Crypto"], ["other", "Other"]]} />
                <Field label="Units" type="number" step="0.0001" value={form.units || ""} onChange={(v) => setForm({ ...form, units: v })} />
                <Field label="Invested (₹)" type="number" value={form.invested_value || ""} onChange={(v) => setForm({ ...form, invested_value: v })} />
                <Field label="Current value (₹)" type="number" value={form.current_value || ""} onChange={(v) => setForm({ ...form, current_value: v })} />
              </>
            )}
            {tab === "loans" && (
              <>
                <Field label="Name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required />
                <Field label="Outstanding (₹)" type="number" value={form.outstanding || ""} onChange={(v) => setForm({ ...form, outstanding: v })} required />
                <Field label="EMI (₹)" type="number" value={form.emi || ""} onChange={(v) => setForm({ ...form, emi: v })} />
                <Field label="Rate %" type="number" step="0.01" value={form.rate || ""} onChange={(v) => setForm({ ...form, rate: v })} />
              </>
            )}
            <button data-testid="finance-submit-button" className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Table({ rows, cols, onDelete, onEdit, testidPrefix, empty }) {
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
            <tr key={r.id} className="border-b border-[#E5E2DC]/60 hover:bg-[#F2F0E9]/50 transition" data-testid={`${testidPrefix}-row`}>
              {cols.map((c) => (
                <td key={c.k} className={`px-5 md:px-6 py-3 ${c.align === "right" ? "text-right font-mono" : ""}`}>
                  {c.render ? c.render(r[c.k]) : (r[c.k] ?? "—")}
                </td>
              ))}
              <td className="px-2 py-3 whitespace-nowrap">
                {onEdit && (
                  <button onClick={() => onEdit(r)} className="text-[#5E6A62] hover:text-[#184A31] opacity-50 hover:opacity-100 mr-2" data-testid={`${testidPrefix}-edit`}>
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => onDelete(r)} className="text-[#C25942] opacity-50 hover:opacity-100" data-testid={`${testidPrefix}-delete`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
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
      <div className="w-full max-w-md card-surface p-6" onClick={(e) => e.stopPropagation()}>
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
  if (as === "select") {
    return (
      <div>
        <label className="label-eyebrow block mb-1.5">{label}</label>
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white border border-[#E5E2DC] px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#184A31]">
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div>
      <label className="label-eyebrow block mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} {...rest}
        className="w-full bg-white border border-[#E5E2DC] px-3 py-2.5 rounded-xl focus:outline-none focus:border-[#184A31]" />
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
