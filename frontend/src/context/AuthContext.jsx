import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE_URL = import.meta.env.VITE_API_URL;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const stored = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (stored && token) {
            try {
                return JSON.parse(stored);
            } catch {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
            }
        }
        return null;
    });

    /* ── View Mode: "admin" | "customer" (UI-only, never touches auth) ── */
    const [viewMode, setViewMode] = useState('admin');

    const login = (userData, token) => {
        localStorage.setItem('user', JSON.stringify(userData));
        if (token) {
            localStorage.setItem('token', token);
        }
        setUser(userData);
        setViewMode('admin'); // always reset to admin view on login
    };

    const logout = () => {
        // Clear all auth storage
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        sessionStorage.clear();

        // Clear httpOnly cookie via backend (fire-and-forget)
        fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
        }).catch(() => {});

        // Reset all auth state
        setUser(null);
        setViewMode('admin');
    };

    const updateUser = (updates) => {
        const updated = { ...user, ...updates };
        localStorage.setItem('user', JSON.stringify(updated));
        setUser(updated);
    };

    /**
     * True when an admin is previewing the customer site.
     * Components should check this to disable cart/checkout actions.
     */
    const isAdminPreview = user?.role === 'admin' && viewMode === 'customer';

    return (
        <AuthContext.Provider value={{
            user,
            isLoggedIn: !!user,
            login,
            logout,
            updateUser,
            viewMode,
            setViewMode,
            isAdminPreview,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
