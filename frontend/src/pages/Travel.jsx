import { useEffect, useState, useCallback } from "react";
import { api, formatINR, formatINRFull } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Plus, Trash2, Plane, MapPin, Calendar, Edit3 } from "lucide-react";
import { Modal, Field, SelectMember } from "@/pages/Finance";
import ExportCsvButton from "@/components/ExportCsvButton";
import { toast } from "sonner";

export default function Travel() {
  const { activeMember, members } = useAuth();
  const [trips, setTrips] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({});
  const [editingId, setEditingId] = useState(null);
  const memberParam = activeMember === "family" ? "" : `?member_id=${activeMember}`;
  const defaultMemberId = activeMember === "family" ? members[0]?.id : activeMember;

  const refresh = useCallback(() => api.get(`/travel/trips${memberParam}`).then((r) => setTrips(r.data)), [memberParam]);
  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...form, member_id: form.member_id || defaultMemberId, budget: form.budget ? Number(form.budget) : null };
      if (editingId) {
        await api.patch(`/trips/${editingId}`, body);
        toast.success("Trip updated");
      } else {
        await api.post("/travel/trips", body);
        toast.success("Trip added");
      }
      setShowAdd(false); setForm({}); setEditingId(null);
      refresh();
    } catch { toast.error("Could not save"); }
  };

  const startEdit = (trip) => { setEditingId(trip.id); setForm(trip); setShowAdd(true); };
  const remove = async (id) => { await api.delete(`/travel/trips/${id}`); refresh(); };

  return (
    <div className="space-y-6" data-testid="travel-page">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="label-eyebrow">Travel</div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium mt-1">Trips & journeys</h1>
          <p className="text-sm text-[#5E6A62] mt-2">Snap a flight ticket or hotel email into the Inbox — we'll create the trip.</p>
        </div>
        <button onClick={() => { setShowAdd(true); setEditingId(null); setForm({}); }} data-testid="add-trip-button"
          className="bg-[#D19B4C] hover:bg-[#c18e3f] text-[#111812] text-sm font-medium px-4 py-2 rounded-full flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> New trip
        </button>
        <ExportCsvButton kind="trips" />
      </div>

      {trips.length === 0 && (
        <div className="card-surface p-8 text-center text-[#5E6A62]">
          <Plane className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No trips yet. Add one or upload your booking confirmation.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trips.map((t) => (
          <TripCard key={t.id} trip={t} onDelete={() => remove(t.id)} onEdit={() => startEdit(t)} memberName={members.find((m) => m.id === t.member_id)?.name} />
        ))}
      </div>

      {showAdd && (
        <Modal title={editingId ? "Edit trip" : "New trip"} onClose={() => { setShowAdd(false); setEditingId(null); }}>
          <form onSubmit={submit} className="space-y-3" data-testid="trip-form">
            <SelectMember value={form.member_id || defaultMemberId} onChange={(v) => setForm({ ...form, member_id: v })} members={members} />
            <Field label="Trip name" value={form.name || ""} onChange={(v) => setForm({ ...form, name: v })} required placeholder="Goa anniversary" />
            <Field label="Destination" value={form.destination || ""} onChange={(v) => setForm({ ...form, destination: v })} required placeholder="Goa, India" />
            <Field label="Start date" type="date" value={form.start_date || ""} onChange={(v) => setForm({ ...form, start_date: v })} />
            <Field label="End date" type="date" value={form.end_date || ""} onChange={(v) => setForm({ ...form, end_date: v })} />
            <Field label="Budget (₹)" type="number" value={form.budget || ""} onChange={(v) => setForm({ ...form, budget: v })} />
            <Field label="Notes" value={form.notes || ""} onChange={(v) => setForm({ ...form, notes: v })} />
            <button className="w-full bg-[#184A31] text-white py-2.5 rounded-full font-medium" data-testid="trip-save-button">{editingId ? "Update trip" : "Save trip"}</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function TripCard({ trip, onDelete, onEdit, memberName }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => { api.get(`/travel/trips/${trip.id}/summary`).then((r) => setSummary(r.data)).catch(() => {}); }, [trip.id]);
  const pct = summary?.budget_used_pct;

  return (
    <div className="card-surface p-5 hover:-translate-y-0.5 transition" data-testid="trip-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="label-eyebrow flex items-center gap-1"><MapPin className="h-3 w-3" /> {trip.destination}</div>
          <div className="font-display text-xl mt-1">{trip.name}</div>
          <div className="text-xs text-[#5E6A62] mt-1 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {trip.start_date || "—"} → {trip.end_date || "—"}
          </div>
          {memberName && <div className="text-xs text-[#5E6A62] mt-0.5">{memberName}</div>}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="text-[#5E6A62]/50 hover:text-[#5E6A62] p-1">
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="text-[#C25942]/50 hover:text-[#C25942] p-1">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {summary && (
        <div className="mt-4 space-y-2">
          {trip.budget ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-[#5E6A62]">Spent</span>
                <span className="font-mono">{formatINRFull(summary.spend)} / {formatINRFull(trip.budget)}</span>
              </div>
              <div className="h-2 bg-[#F2F0E9] rounded-full">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct || 0)}%`, background: pct > 90 ? "#C25942" : "#184A31" }} />
              </div>
            </>
          ) : (
            <div className="text-sm text-[#5E6A62]">Spent <span className="font-mono text-[#111812]">{formatINRFull(summary.spend)}</span></div>
          )}
          {summary.transactions?.length > 0 && (
            <div className="text-xs text-[#5E6A62] mt-2">{summary.transactions.length} linked transaction{summary.transactions.length > 1 ? "s" : ""}</div>
          )}
        </div>
      )}
      {trip.notes && <div className="text-xs text-[#5E6A62] mt-3 italic">{trip.notes}</div>}
    </div>
  );
}
