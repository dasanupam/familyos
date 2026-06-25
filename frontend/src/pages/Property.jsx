import { useEffect, useState, useCallback } from "react";
import { api, formatINRFull } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, Edit3, Home, Car, Building2, Leaf, ShieldCheck } from "lucide-react";
import { Modal, Field, SelectMember } from "@/pages/Finance";
import { toast } from "sonner";

export default function Property() {
  const { activeMember, members } = useAuth();
  const [tab, setTab] = useState("properties");
  const [props, setProps] = useState([]);
  const [ef, setEf] = useState([]);
  const [identity, setIdentity] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);

  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;
  const defaultMemberId = activeMember === "family" ? members[0]?.id : activeMember;
  const memberName = (id) => members.find((m) => m.id === id)?.name || "—";

  const refresh = useCallback(async () => {
    const mp = memberParam;
    try {
      const [p, e, id] = await Promise.all([
        api.get(`/property${mp}`),
        api.get(`/property/emergency-fund${mp}`),
        api.get(`/identity${mp}`),
      ]);
      setProps(p.data); setEf(e.data); setIdentity(id.data);
    } catch { toast.error("Failed to load property data"); }
  }, [memberParam]);

  useEffect(() => { refresh(); }, [refresh]);

  const totalPropertyValue = props.reduce((s, p) => s + (p.current_estimated_value || 0), 0);
  const totalRentalIncome = props.reduce((s, p) => s + (p.rental_income_monthly || 0), 0);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, member_id: form.member_id || defaultMemberId };
      if (editingId) {
        if (tab === "properties") await api.put(`/property/${editingId}`, { ...body, purchase_price: body.purchase_price ? Number(body.purchase_price) : null, current_estimated_value: body.current_estimated_value ? Number(body.current_estimated_value) : null, rental_income_monthly: body.rental_income_monthly ? Number(body.rental_income_monthly) : null });
        else if (tab === "emergency-fund") await api.put(`/property/emergency-fund/${editingId}`, { ...body, target_months: Number(body.target_months || 6), monthly_expense_estimate: Number(body.monthly_expense_estimate || 0), current_amount: Number(body.current_amount || 0) });
        else if (tab === "identity") await api.put(`/identity/${editingId}`, body);
      } else {
        if (tab === "properties") await api.post("/property", { ...body, purchase_price: body.purchase_price ? Number(body.purchase_price) : null, current_estimated_value: body.current_estimated_value ? Number(body.current_estimated_value) : null, rental_income_monthly: body.rental_income_monthly ? Number(body.rental_income_monthly) : null });
        else if (tab === "emergency-fund") await api.post("/property/emergency-fund", { ...body, target_months: Number(body.target_months || 6), monthly_expense_estimate: Number(body.monthly_expense_estimate || 0), current_amount: Number(body.current_amount || 0) });
        else if (tab === "identity") await api.post("/identity", body);
      }
      setShowAdd(false); setForm({}); setEditingId(null); refresh(); toast.success(editingId ? "Updated" : "Added");
    } catch { toast.error("Save failed"); }
  };

  const remove = async (id) => {
    if (tab === "properties") await api.delete(`/property/${id}`);
    else if (tab === "emergency-fund") await api.delete(`/property/emergency-fund/${id}`);
    else if (tab === "identity") await api.delete(`/identity/${id}`);
    refresh();
  };

  const typeIcon = (t) => ({ residential: Home, vehicle: Car, commercial: Building2, land: Leaf }[t] || Home);

  return (
    <div className="space-y-6" data-testid="property-page">
      <div><div className="label-eyebrow">Property & Assets</div><h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Wealth beyond investments</h1></div>

      {props.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="card-surface p-4"><div className="label-eyebrow">Total Property Value</div><div className="font-display text-2xl mt-1 text-[#367A50]">{formatINRFull(totalPropertyValue)}</div></div>
          <div className="card-surface p-4"><div className="label-eyebrow">Rental Income / mo</div><div className="font-display text-2xl mt-1">{formatINRFull(totalRentalIncome)}</div></div>
          <div className="card-surface p-4"><div className="label-eyebrow">Total Assets</div><div className="font-display text-2xl mt-1">{props.length} properties</div></div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        {[["properties","Properties"],["emergency-fund","Emergency Fund"],["identity","Identity Docs"]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${tab === k ? "bg-[#184A31] text-white" : "bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31]"}`}>
            {label}
          </button>
        ))}
        <button onClick={() => { setShowAdd(true); setForm({}); setEditingId(null); }} className="ml-auto px-4 py-2 rounded-full text-sm font-medium bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      <div className="card-surface p-5 md:p-6">
        {tab === "properties" && (
          props.length === 0 ? <div className="text-sm text-[#5E6A62] py-4">No properties yet. Add your home, vehicle, or land.</div> :
          <div className="space-y-3">
            {props.map((p) => {
              const Icon = typeIcon(p.property_type);
              return (
                <div key={p.id} className="flex items-start gap-4 border border-[#E5E2DC] rounded-xl p-4">
                  <div className="h-10 w-10 rounded-full bg-[#184A31]/10 flex items-center justify-center"><Icon className="h-5 w-5 text-[#184A31]" /></div>
                  <div className="flex-1">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-[#5E6A62]">{p.property_type} · {p.address || "—"} · {memberName(p.member_id)}</div>
                    <div className="flex gap-4 mt-1 text-sm">
                      {p.purchase_price && <span>Bought at {formatINRFull(p.purchase_price)}</span>}
                      {p.current_estimated_value && <span className="text-[#367A50] font-medium">Now {formatINRFull(p.current_estimated_value)}</span>}
                      {p.rental_income_monthly && <span>Rent {formatINRFull(p.rental_income_monthly)}/mo</span>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(p.id); setForm(p); setShowAdd(true); }} className="text-[#5E6A62] hover:text-[#184A31]"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => remove(p.id)} className="text-[#C25942]"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "emergency-fund" && (
          ef.length === 0 ? <div className="text-sm text-[#5E6A62] py-4">Set up your emergency fund target.</div> :
          <div className="space-y-4">
            {ef.map((e) => {
              const pct = Math.min(100, (e.coverage_months / e.target_months) * 100);
              return (
                <div key={e.id} className="border border-[#E5E2DC] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">Emergency Fund · {memberName(e.member_id)}</div>
                      <div className="text-xs text-[#5E6A62]">{e.account_name || ""}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setEditingId(e.id); setForm(e); setShowAdd(true); }} className="text-[#5E6A62] hover:text-[#184A31]"><Edit3 className="h-4 w-4" /></button>
                      <button onClick={() => remove(e.id)} className="text-[#C25942]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm mb-3">
                    <span className="font-medium">{formatINRFull(e.current_amount)}</span><span className="text-[#5E6A62]">/ {formatINRFull(e.target_amount)} target</span>
                    <span className="ml-auto text-[#184A31] font-medium">{e.coverage_months} / {e.target_months} months</span>
                  </div>
                  <div className="bg-[#E5E2DC] rounded-full h-2">
                    <div className="bg-[#184A31] h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "identity" && (
          identity.length === 0 ? <div className="text-sm text-[#5E6A62] py-4">No identity documents added.</div> :
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {identity.map((d) => {
              const isExpiring = d.expiry_date && new Date(d.expiry_date) < new Date(Date.now() + 90 * 864e5);
              return (
                <div key={d.id} className={`border rounded-xl p-4 flex gap-3 ${isExpiring ? "border-[#C25942]/50 bg-[#C25942]/5" : "border-[#E5E2DC]"}`}>
                  <ShieldCheck className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isExpiring ? "text-[#C25942]" : "text-[#184A31]"}`} />
                  <div className="flex-1">
                    <div className="font-medium capitalize">{d.doc_type.replace(/_/g, " ")}</div>
                    <div className="text-xs text-[#5E6A62]">{d.doc_number || "—"} · {memberName(d.member_id)}</div>
                    {d.expiry_date && <div className={`text-xs mt-1 ${isExpiring ? "text-[#C25942] font-medium" : "text-[#5E6A62]"}`}>Expires {d.expiry_date}</div>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingId(d.id); setForm(d); setShowAdd(true); }} className="text-[#5E6A62] hover:text-[#184A31]"><Edit3 className="h-4 w-4" /></button>
                    <button onClick={() => remove(d.id)} className="text-[#C25942]"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title={`Add ${tab}`} onClose={() => { setShowAdd(false); setEditingId(null); }}>
          <form onSubmit={submit} className="space-y-3">
            <SelectMember value={form.member_id || defaultMemberId} onChange={(v) => setForm({ ...form, member_id: v })} members={members} />
            {tab === "properties" && <>
              <Field label="Name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required placeholder="My home, Car, Plot…" />
              <Field label="Type" as="select" value={form.property_type || "residential"} onChange={(v) => setForm({ ...form, property_type: v })} options={[["residential","Residential"],["commercial","Commercial"],["land","Land"],["vehicle","Vehicle"]]} />
              <Field label="Address / description" value={form.address || ""} onChange={(v) => setForm({ ...form, address: v })} />
              <Field label="Purchase date" type="date" value={form.purchase_date || ""} onChange={(v) => setForm({ ...form, purchase_date: v })} />
              <Field label="Purchase price (₹)" type="number" value={form.purchase_price || ""} onChange={(v) => setForm({ ...form, purchase_price: v })} />
              <Field label="Current value (₹)" type="number" value={form.current_estimated_value || ""} onChange={(v) => setForm({ ...form, current_estimated_value: v })} />
              <Field label="Rental income / mo (₹)" type="number" value={form.rental_income_monthly || ""} onChange={(v) => setForm({ ...form, rental_income_monthly: v })} />
            </>}
            {tab === "emergency-fund" && <>
              <Field label="Target months" type="number" value={form.target_months || "6"} onChange={(v) => setForm({ ...form, target_months: v })} />
              <Field label="Monthly expenses (₹)" type="number" value={form.monthly_expense_estimate || ""} onChange={(v) => setForm({ ...form, monthly_expense_estimate: v })} required />
              <Field label="Current amount (₹)" type="number" value={form.current_amount || ""} onChange={(v) => setForm({ ...form, current_amount: v })} required />
              <Field label="Account name" value={form.account_name || ""} onChange={(v) => setForm({ ...form, account_name: v })} />
            </>}
            {tab === "identity" && <>
              <Field label="Document type" as="select" value={form.doc_type || "aadhaar"} onChange={(v) => setForm({ ...form, doc_type: v })} options={[["aadhaar","Aadhaar"],["pan","PAN"],["passport","Passport"],["driving_license","Driving License"],["visa","Visa"],["other","Other"]]} />
              <Field label="Document number" value={form.doc_number || ""} onChange={(v) => setForm({ ...form, doc_number: v })} />
              <Field label="Issued date" type="date" value={form.issued_date || ""} onChange={(v) => setForm({ ...form, issued_date: v })} />
              <Field label="Expiry date" type="date" value={form.expiry_date || ""} onChange={(v) => setForm({ ...form, expiry_date: v })} />
              <Field label="Issued by" value={form.issued_by || ""} onChange={(v) => setForm({ ...form, issued_by: v })} />
            </>}
            <button className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium">Save</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
