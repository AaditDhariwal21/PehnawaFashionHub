import { createContext, useContext, useState, useCallback } from 'react';

/*
 * UIContext — shared UI-chrome state for the app shell.
 *
 * The mobile category drawer lives inside <Navbar> (rendered per-page), while
 * the <MobileBottomNav> is mounted once in <App>. They're siblings in different
 * subtrees, so the drawer's open-state is lifted here to let the bottom nav's
 * "Categories" tab open the same drawer without duplicating it.
 */
const UIContext = createContext(null);

export const UIProvider = ({ children }) => {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
    const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
    const toggleMobileMenu = useCallback(() => setMobileMenuOpen((v) => !v), []);

    return (
        <UIContext.Provider
            value={{ mobileMenuOpen, setMobileMenuOpen, openMobileMenu, closeMobileMenu, toggleMobileMenu }}
        >
            {children}
        </UIContext.Provider>
    );
};

export const useUI = () => {
    const ctx = useContext(UIContext);
    if (!ctx) throw new Error('useUI must be used within a UIProvider');
    return ctx;
};
