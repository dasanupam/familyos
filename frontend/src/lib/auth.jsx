import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("flos_user") || "null"); } catch { return null; }
  });
  const [members, setMembers] = useState([]);
  const [activeMember, setActiveMember] = useState("family"); // 'family' or member id
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await api.get("/members");
      setMembers(data);
    } catch (_) {}
  }, []);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("flos_token");
      if (token) {
        try {
          const { data } = await api.get("/auth/me");
          setUser(data);
          await fetchMembers();
        } catch (_) {
          localStorage.removeItem("flos_token");
          localStorage.removeItem("flos_user");
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, [fetchMembers]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("flos_token", data.token);
    localStorage.setItem("flos_user", JSON.stringify(data.user));
    setUser(data.user);
    await fetchMembers();
    return data.user;
  };

  const register = async (name, email, password) => {
    const { data } = await api.post("/auth/register", { name, email, password });
    localStorage.setItem("flos_token", data.token);
    localStorage.setItem("flos_user", JSON.stringify(data.user));
    setUser(data.user);
    await fetchMembers();
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("flos_token");
    localStorage.removeItem("flos_user");
    setUser(null);
    setMembers([]);
  };

  return (
    <AuthContext.Provider value={{ user, members, activeMember, setActiveMember, fetchMembers, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
