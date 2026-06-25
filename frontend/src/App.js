import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import AppShell from "@/components/AppShell";
import Overview from "@/pages/Overview";
import Finance from "@/pages/Finance";
import Health from "@/pages/Health";
import Goals from "@/pages/Goals";
import Documents from "@/pages/Documents";
import Family from "@/pages/Family";
import Travel from "@/pages/Travel";
import Career from "@/pages/Career";
import FamilyOverview from "@/pages/FamilyOverview";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#5E6A62]">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-[#5E6A62]">Loading…</div>;
  if (user) return <Navigate to="/overview" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster richColors position="top-right" />
        <Routes>
          <Route path="/login"    element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route path="/" element={<Protected><AppShell /></Protected>}>
            {/* Redirect bare / to /overview */}
            <Route index element={<Navigate to="/overview" replace />} />
            <Route path="overview"  element={<Overview />} />
            <Route path="finance"   element={<Finance />} />
            <Route path="health"    element={<Health />} />
            <Route path="goals"     element={<Goals />} />
            <Route path="documents" element={<Documents />} />
            <Route path="family"    element={<Family />} />
            <Route path="travel"    element={<Travel />} />
            <Route path="career"    element={<Career />} />
            <Route path="household" element={<FamilyOverview />} />
          </Route>
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
