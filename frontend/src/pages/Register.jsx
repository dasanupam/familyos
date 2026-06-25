import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      toast.success("Welcome aboard");
      nav("/overview");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not register");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 grain" data-testid="register-screen">
      <div className="w-full max-w-md card-surface p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-[#184A31] flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-[#D19B4C]" strokeWidth={2} />
          </div>
          <span className="font-display text-xl">Family Life OS</span>
        </div>
        <div className="label-eyebrow mb-2">Get started</div>
        <h2 className="font-display text-3xl font-medium mb-6">Create your account</h2>

        <form onSubmit={onSubmit} className="space-y-4" data-testid="register-form">
          <div>
            <label className="label-eyebrow block mb-2">Your name</label>
            <input
              data-testid="register-name-input"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-[#E5E2DC] bg-white px-4 py-3 rounded-xl focus:outline-none focus:border-[#184A31]"
              placeholder="Arjun Sharma"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">Email</label>
            <input
              data-testid="register-email-input"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-[#E5E2DC] bg-white px-4 py-3 rounded-xl focus:outline-none focus:border-[#184A31]"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-2">Password</label>
            <div className="relative">
              <input
                data-testid="register-password-input"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-[#E5E2DC] bg-white px-4 py-3 pr-12 rounded-xl focus:outline-none focus:border-[#184A31]"
                placeholder="at least 6 characters"
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
            data-testid="register-submit-button"
            disabled={loading}
            className="w-full bg-[#184A31] hover:bg-[#113523] text-white py-3 rounded-full font-medium transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create account
          </button>
        </form>
        <p className="text-sm text-[#5E6A62] mt-6">
          Already have one? <Link to="/login" className="text-[#184A31] font-medium hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
