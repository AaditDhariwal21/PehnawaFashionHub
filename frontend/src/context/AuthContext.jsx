import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

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
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setUser(null);
        setViewMode('admin'); // reset view mode on logout
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
