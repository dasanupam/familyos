import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      nav("/overview");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex grain" data-testid="login-screen">
      {/* Left brand panel */}
      <div className="hidden md:flex md:w-1/2 bg-[#184A31] text-[#F2F0E9] p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#D19B4C] flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-[#184A31]" strokeWidth={2} />
            </div>
            <span className="font-display text-xl tracking-tight">Family Life OS</span>
          </div>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="font-display text-4xl lg:text-5xl font-medium leading-[1.1] mb-4">
            One quiet place for every receipt, prescription and goal.
          </h1>
          <p className="text-[#F2F0E9]/70 leading-relaxed">
            Drop a document, type a sentence — your dashboards update themselves.
            Built for households, designed for the long run.
          </p>
        </div>
        <div className="relative z-10 text-xs uppercase tracking-[0.2em] text-[#F2F0E9]/50">
          finance · health · goals · documents
        </div>
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 20%, #D19B4C 0%, transparent 40%), radial-gradient(circle at 20% 80%, #C25942 0%, transparent 45%)",
          }}
        />
      </div>

      {/* Right form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <div className="label-eyebrow mb-3">Welcome back</div>
          <h2 className="font-display text-3xl font-medium mb-8 text-[#111812]">Sign in</h2>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <label className="label-eyebrow block mb-2">Email</label>
              <input
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-[#E5E2DC] bg-white px-4 py-3 rounded-xl focus:outline-none focus:border-[#184A31] transition"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label-eyebrow">Password</label>
                <button
                  type="button"
                  onClick={() => toast.info("Contact the app admin to reset your password.")}
                  className="text-xs text-[#184A31] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <input
                  data-testid="login-password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border border-[#E5E2DC] bg-white px-4 py-3 pr-12 rounded-xl focus:outline-none focus:border-[#184A31] transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5E6A62] hover:text-[#184A31]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              data-testid="login-submit-button"
              type="submit"
              disabled={loading}
              className="w-full bg-[#184A31] hover:bg-[#113523] text-white py-3 rounded-full font-medium transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
          </form>

          <p className="text-sm text-[#5E6A62] mt-6">
            New here?{" "}
            <Link to="/register" data-testid="login-go-register" className="text-[#184A31] font-medium underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
