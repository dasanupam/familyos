import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { LayoutDashboard, Wallet, HeartPulse, Target, FileText, Users, LogOut, Sparkles, Inbox } from "lucide-react";
import UniversalInbox from "@/components/UniversalInbox";
import FamilySwitcher from "@/components/FamilySwitcher";
import { useState } from "react";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, testid: "nav-overview" },
  { to: "/finance", label: "Finance", icon: Wallet, testid: "nav-finance" },
  { to: "/health", label: "Health", icon: HeartPulse, testid: "nav-health" },
  { to: "/goals", label: "Goals & FIRE", icon: Target, testid: "nav-goals" },
  { to: "/documents", label: "Documents", icon: FileText, testid: "nav-documents" },
  { to: "/family", label: "Family", icon: Users, testid: "nav-family" },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [inboxOpen, setInboxOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F2F0E9] grain relative">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-[#F2F0E9]/85 backdrop-blur-md border-b border-[#E5E2DC]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[#184A31] flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-[#D19B4C]" strokeWidth={2} />
            </div>
            <span className="font-display text-lg hidden sm:block">Family OS</span>
          </div>

          <div className="ml-2 hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                data-testid={n.testid}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-full text-sm font-medium transition flex items-center gap-1.5 ${
                    isActive
                      ? "bg-[#184A31] text-white"
                      : "text-[#5E6A62] hover:text-[#111812] hover:bg-white"
                  }`
                }
              >
                <n.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {n.label}
              </NavLink>
            ))}
          </div>

          <div className="flex-1" />

          <button
            data-testid="open-inbox-button"
            onClick={() => setInboxOpen(true)}
            className="hidden md:inline-flex items-center gap-2 bg-[#184A31] hover:bg-[#113523] text-white px-4 py-2 rounded-full text-sm font-medium transition"
          >
            <Inbox className="h-4 w-4" strokeWidth={1.8} />
            Universal Inbox
          </button>

          <FamilySwitcher />

          <button
            data-testid="logout-button"
            onClick={() => { logout(); navigate("/login"); }}
            className="text-[#5E6A62] hover:text-[#C25942] p-2 rounded-full hover:bg-white transition"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-[#E5E2DC] px-2 py-2 overflow-x-auto flex gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 ${
                  isActive ? "bg-[#184A31] text-white" : "text-[#5E6A62] bg-white border border-[#E5E2DC]"
                }`
              }
            >
              <n.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
              {n.label}
            </NavLink>
          ))}
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10 relative z-10">
        <div className="text-[13px] text-[#5E6A62] mb-4 hidden md:block">
          Welcome back, <span className="text-[#111812] font-medium">{user?.name}</span>
        </div>
        <Outlet />
      </main>

      {/* Mobile floating inbox button */}
      <button
        onClick={() => setInboxOpen(true)}
        data-testid="open-inbox-floating-button"
        className="md:hidden fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-[#184A31] text-white shadow-xl flex items-center justify-center"
      >
        <Inbox className="h-6 w-6" />
      </button>

      <UniversalInbox open={inboxOpen} onClose={() => setInboxOpen(false)} />
    </div>
  );
}
