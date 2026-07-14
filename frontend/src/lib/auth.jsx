import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("flos_user") || "null"); } catch { return null; }
  });
  const [members, setMembers] = useState([]);
  const [activeMember, setActiveMemberState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("flos_user") || "null");
      // For member-role users, default to their own member id
      if (saved?.role === "member") return saved.linked_member_id || "family";
      return localStorage.getItem("flos_activeMember") || "family";
    } catch { return "family"; }
  });
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async () => {
    try {
      const { data } = await api.get("/members");
      setMembers(data);
    } catch (_) {
      // 403 for member-role users is expected
      setMembers([]);
    }
  }, []);

  // Persist activeMember for admin users; members always use their own id
  const setActiveMember = useCallback((id) => {
    setActiveMemberState(id);
    // Only persist for admin
    const currentUser = JSON.parse(localStorage.getItem("flos_user") || "null");
    if (!currentUser || currentUser.role !== "member") {
      localStorage.setItem("flos_activeMember", id);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("flos_token");
      if (token) {
        try {
          const { data } = await api.get("/auth/me");
          setUser(data);
          localStorage.setItem("flos_user", JSON.stringify(data));
          if (data.role === "member" && data.linked_member_id) {
            setActiveMemberState(data.linked_member_id);
          } else {
            await fetchMembers();
            const saved = localStorage.getItem("flos_activeMember");
            if (saved) setActiveMemberState(saved);
          }
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
    localStorage.setItem("flos_token", data.access_token);
    localStorage.setItem("flos_user", JSON.stringify(data.user));
    setUser(data.user);
    if (data.user.role === "member" && data.user.linked_member_id) {
      setActiveMemberState(data.user.linked_member_id);
    } else {
      await fetchMembers();
      const saved = localStorage.getItem("flos_activeMember");
      if (saved) setActiveMemberState(saved);
    }
    return data.user;
  };

  const register = async (name, email, password, inviteCode) => {
    const { data } = await api.post("/auth/register",
      { name, email, password, invite_code: inviteCode || null });
    localStorage.setItem("flos_token", data.access_token);
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
    setActiveMemberState("family");
  };

  return (
    <AuthContext.Provider value={{
      user, members, activeMember, setActiveMember,
      fetchMembers, login, register, logout, loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
