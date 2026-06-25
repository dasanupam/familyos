import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Search, X, ArrowRight, Wallet, HeartPulse, Target, TrendingUp, Calendar } from "lucide-react";

const TYPE_ICONS = {
  transaction: Wallet,
  goal: Target,
  lab: HeartPulse,
  appointment: Calendar,
  investment: TrendingUp,
};

const TYPE_COLORS = {
  transaction: "#184A31",
  goal: "#D19B4C",
  lab: "#C25942",
  appointment: "#367A50",
  investment: "#184A31",
};

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery(""); setResults([]); setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data); setActiveIdx(0);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const go = (link) => { navigate(link); onClose(); };

  const onKey = (e) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && results[activeIdx]) { go(results[activeIdx].link); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose} data-testid="command-palette">
      <div className="w-full max-w-xl bg-white dark:bg-[#172112] rounded-2xl shadow-2xl border border-[#E5E2DC] dark:border-[#263B2E] overflow-hidden"
        onClick={(e) => e.stopPropagation()}>

        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E5E2DC] dark:border-[#263B2E]">
          <Search className="h-5 w-5 text-[#5E6A62] flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search transactions, labs, goals, appointments…"
            className="flex-1 bg-transparent text-base focus:outline-none text-[#111812] dark:text-[#E8E4DB] placeholder-[#5E6A62]"
            data-testid="command-palette-input"
          />
          <button onClick={onClose} className="text-[#5E6A62] hover:text-[#111812] p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <div className="px-5 py-4 text-sm text-[#5E6A62]">Searching…</div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="px-5 py-4 text-sm text-[#5E6A62]">No results for "{query}"</div>
          )}
          {!loading && results.length > 0 && results.map((r, i) => {
            const Icon = TYPE_ICONS[r.type] || Search;
            const color = TYPE_COLORS[r.type] || "#184A31";
            return (
              <button key={i} onClick={() => go(r.link)}
                className={`w-full flex items-center gap-3 px-5 py-3 text-left transition hover:bg-[#F2F0E9] dark:hover:bg-[#1E2E24] ${i === activeIdx ? "bg-[#F2F0E9] dark:bg-[#1E2E24]" : ""}`}
                data-testid={`search-result-${i}`}>
                <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                  <Icon className="h-4 w-4" style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#111812] dark:text-[#E8E4DB] truncate">{r.label}</div>
                  <div className="text-xs text-[#5E6A62] truncate">{r.sub}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-[#5E6A62] flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        {results.length === 0 && !loading && query.length < 2 && (
          <div className="px-5 py-3 text-xs text-[#5E6A62] flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        )}
      </div>
    </div>
  );
}
