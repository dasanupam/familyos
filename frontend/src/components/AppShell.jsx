import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Wallet, HeartPulse, Target, FileText,
  Users, LogOut, Sparkles, Inbox, Plane, Briefcase, Home,
  Search, Moon, Sun, ClipboardList, UserX,
} from "lucide-react";
import UniversalInbox from "@/components/UniversalInbox";
import FamilySwitcher from "@/components/FamilySwitcher";
import CommandPalette from "@/components/CommandPalette";
import { useState, useEffect, useCallback } from "react";

const ADMIN_NAV = [
  { to: "/overview",  label: "Overview",    icon: LayoutDashboard, end: true },
  { to: "/household", label: "Household",   icon: Users },
  { to: "/finance",   label: "Finance",     icon: Wallet },
  { to: "/health",    label: "Health",      icon: HeartPulse },
  { to: "/travel",    label: "Travel",      icon: Plane },
  { to: "/career",    label: "Career",      icon: Briefcase },
  { to: "/goals",     label: "Goals & FIRE",icon: Target },
  { to: "/plans",     label: "Plans",       icon: ClipboardList },
  { to: "/property",  label: "Property",    icon: Home },
  { to: "/documents", label: "Documents",   icon: FileText },
  { to: "/review",    label: "Review",      icon: UserX },
  { to: "/family",    label: "Family",      icon: Users },
];

const MEMBER_NAV = [
  { to: "/overview",  label: "Overview",    icon: LayoutDashboard, end: true },
  { to: "/finance",   label: "Finance",     icon: Wallet },
  { to: "/health",    label: "Health",      icon: HeartPulse },
  { to: "/travel",    label: "Travel",      icon: Plane },
  { to: "/career",    label: "Career",      icon: Briefcase },
  { to: "/goals",     label: "Goals & FIRE",icon: Target },
  { to: "/plans",     label: "Plans",       icon: ClipboardList },
  { to: "/property",  label: "Property",    icon: Home },
  { to: "/documents", label: "Documents",   icon: FileText },
];

// Bottom nav shows 5 key items on mobile
const MOBILE_BOTTOM_NAV = [
  { to: "/overview",  label: "Overview",  icon: LayoutDashboard, end: true },
  { to: "/finance",   label: "Finance",   icon: Wallet },
  { to: "/health",    label: "Health",    icon: HeartPulse },
  { to: "/goals",     label: "Goals",     icon: Target },
  { to: "/travel",    label: "Travel",    icon: Plane },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [inboxOpen, setInboxOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("flos_dark") === "true");

  const isAdmin = !user?.role || user?.role === "admin";
  const nav = isAdmin ? ADMIN_NAV : MEMBER_NAV;

  // Apply dark mode class
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("flos_dark", darkMode ? "true" : "false");
  }, [darkMode]);

  // Cmd+K / Ctrl+K listener
  const handleKeyDown = useCallback((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      setPaletteOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

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

          {/* Desktop nav */}
          <div className="ml-2 hidden md:flex items-center gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end || false}
                data-testid={`nav-${n.label.toLowerCase().replace(/[^a-z]/g, "-")}`}
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

          {/* Search button */}
          <button
            data-testid="global-search-button"
            onClick={() => setPaletteOpen(true)}
            className="hidden md:flex items-center gap-2 bg-white border border-[#E5E2DC] text-[#5E6A62] hover:border-[#184A31] px-3 py-1.5 rounded-full text-sm transition"
            title="Search (⌘K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline text-xs bg-[#F2F0E9] border border-[#E5E2DC] rounded px-1 py-0.5 font-mono">⌘K</kbd>
          </button>

          {/* Dark mode toggle */}
          <button
            data-testid="dark-mode-toggle"
            onClick={() => setDarkMode(!darkMode)}
            className="text-[#5E6A62] hover:text-[#111812] p-2 rounded-full hover:bg-white transition"
            title={darkMode ? "Light mode" : "Dark mode"}
          >
            {darkMode ? <Sun className="h-4 w-4" strokeWidth={1.8} /> : <Moon className="h-4 w-4" strokeWidth={1.8} />}
          </button>

          <button
            data-testid="open-inbox-button"
            onClick={() => setInboxOpen(true)}
            className="hidden md:inline-flex items-center gap-2 bg-[#184A31] hover:bg-[#113523] text-white px-4 py-2 rounded-full text-sm font-medium transition"
          >
            <Inbox className="h-4 w-4" strokeWidth={1.8} />
            Universal Inbox
          </button>

          {/* Family switcher: admin only */}
          {isAdmin && <FamilySwitcher />}

          <button
            data-testid="logout-button"
            onClick={() => { logout(); navigate("/login"); }}
            className="text-[#5E6A62] hover:text-[#C25942] p-2 rounded-full hover:bg-white transition"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        {/* Mobile top scroll nav (secondary, for less common pages) */}
        <div className="md:hidden border-t border-[#E5E2DC] px-2 py-2 overflow-x-auto flex gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end || false}
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

      <main className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-10 pb-24 md:pb-10 relative z-10">
        <div className="text-[13px] text-[#5E6A62] mb-4 hidden md:block">
          Welcome back, <span className="text-[#111812] font-medium">{user?.name}</span>
          {user?.role === "member" && (
            <span className="ml-2 text-xs bg-[#184A31]/10 text-[#184A31] px-2 py-0.5 rounded-full">Member view</span>
          )}
        </div>
        <Outlet />
      </main>

      {/* Mobile bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#E5E2DC] flex items-center justify-around px-2 py-2 pb-safe"
        data-testid="mobile-bottom-nav">
        {MOBILE_BOTTOM_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end || false}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                isActive ? "text-[#184A31]" : "text-[#5E6A62]"
              }`
            }>
            <n.icon className="h-5 w-5" strokeWidth={1.8} />
            <span>{n.label}</span>
          </NavLink>
        ))}
        <button onClick={() => setInboxOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#5E6A62]"
          data-testid="mobile-inbox-bottom-btn">
          <Inbox className="h-5 w-5" strokeWidth={1.8} />
          <span>Inbox</span>
        </button>
      </nav>

      {/* Mobile floating search button */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="md:hidden fixed bottom-24 right-5 z-40 h-12 w-12 rounded-full bg-white border border-[#E5E2DC] shadow-lg flex items-center justify-center text-[#5E6A62]"
        data-testid="mobile-search-button"
      >
        <Search className="h-5 w-5" />
      </button>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <UniversalInbox open={inboxOpen} onClose={() => setInboxOpen(false)} />
    </div>
  );
}
