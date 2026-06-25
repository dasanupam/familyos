import { useAuth } from "@/lib/auth";
import { ChevronDown, Users } from "lucide-react";
import { useState, useRef, useEffect } from "react";

export default function FamilySwitcher() {
  const { user, members, activeMember, setActiveMember } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const activeLabel =
    activeMember === "family"
      ? "Whole family"
      : (members.find((m) => m.id === activeMember)?.name || "Whole family");

  // Only admin users see the switcher
  if (!user || user.role === "member") return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        data-testid="family-switcher-button"
        className="flex items-center gap-2 bg-white border border-[#E5E2DC] hover:border-[#184A31] transition rounded-full pl-3 pr-2 py-1.5 text-sm"
      >
        <Users className="h-3.5 w-3.5 text-[#5E6A62]" strokeWidth={1.8} />
        <span className="font-medium text-[#111812] max-w-[120px] truncate">{activeLabel}</span>
        <ChevronDown className="h-3.5 w-3.5 text-[#5E6A62]" strokeWidth={1.8} />
      </button>

      {open && (
        <div
          data-testid="family-switcher-menu"
          className="absolute right-0 mt-2 w-56 bg-white border border-[#E5E2DC] rounded-xl shadow-lg overflow-hidden z-50"
        >
          <button
            onClick={() => { setActiveMember("family"); setOpen(false); }}
            data-testid="family-switcher-option-family"
            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F2F0E9] flex items-center gap-2 ${
              activeMember === "family" ? "bg-[#F2F0E9]" : ""
            }`}
          >
            <Users className="h-3.5 w-3.5 text-[#184A31]" />
            Whole family
          </button>
          <div className="border-t border-[#E5E2DC]" />
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => { setActiveMember(m.id); setOpen(false); }}
              data-testid={`family-switcher-option-${m.id}`}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F2F0E9] flex items-center gap-2 ${
                activeMember === m.id ? "bg-[#F2F0E9]" : ""
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: m.color || "#184A31" }} />
              {m.name}
              <span className="ml-auto text-xs text-[#5E6A62]">{m.relation}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
