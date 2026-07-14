import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, Heart, ShoppingBag, User } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';

/*
 * MobileBottomNav — thumb-reachable primary navigation for phones (< md).
 *
 * Complements the top bar (which keeps the logo, search and hamburger). It is
 * hidden on ≥ md and on admin routes. While mounted it flags <body> with
 * `.pw-has-bottom-nav` so global CSS can reserve bottom padding and lift the
 * compare bar above it (see index.css).
 */
const MobileBottomNav = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { openCart, isCartOpen, getTotalQuantity } = useCart();
    const { wishlistCount } = useWishlist();
    const { isLoggedIn } = useAuth();
    const { openMobileMenu, mobileMenuOpen } = useUI();

    const path = location.pathname;
    const isAdminRoute = path === '/adminDashboard' || path.startsWith('/admin/');
    // Auth is a focused, full-screen gate — the tab bar is hidden there
    // (matches Myntra/Flipkart) so nothing competes with the sign-in card.
    const isHiddenRoute = isAdminRoute || path === '/signin';

    // Reserve page space only while the nav is actually present.
    useEffect(() => {
        if (isHiddenRoute) {
            document.body.classList.remove('pw-has-bottom-nav');
            return;
        }
        document.body.classList.add('pw-has-bottom-nav');
        return () => document.body.classList.remove('pw-has-bottom-nav');
    }, [isHiddenRoute]);

    if (isHiddenRoute) return null;

    const cartCount = getTotalQuantity();

    const tabs = [
        {
            key: 'home',
            label: 'Home',
            icon: Home,
            active: path === '/',
            onClick: () => navigate('/'),
        },
        {
            key: 'categories',
            label: 'Categories',
            icon: LayoutGrid,
            active: mobileMenuOpen,
            onClick: openMobileMenu,
        },
        {
            key: 'wishlist',
            label: 'Wishlist',
            icon: Heart,
            active: path === '/wishlist',
            badge: wishlistCount,
            onClick: () => navigate('/wishlist'),
        },
        {
            key: 'bag',
            label: 'Bag',
            icon: ShoppingBag,
            active: isCartOpen,
            badge: cartCount,
            onClick: openCart,
        },
        {
            key: 'account',
            label: 'Account',
            icon: User,
            active: path.startsWith('/account'),
            onClick: () => navigate(isLoggedIn ? '/account' : '/signin'),
        },
    ];

    return (
        <nav
            className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex"
            aria-label="Primary"
            style={{
                zIndex: 'var(--pw-z-nav)',
                height: 'calc(var(--pw-bottom-nav-h) + var(--pw-safe-bottom))',
                paddingBottom: 'var(--pw-safe-bottom)',
                boxShadow: '0 -2px 12px rgba(0,0,0,0.05)',
            }}
        >
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const showBadge = tab.badge > 0;
                return (
                    <button
                        key={tab.key}
                        onClick={tab.onClick}
                        aria-label={tab.label}
                        aria-current={tab.active ? 'page' : undefined}
                        className="flex-1 flex flex-col items-center justify-center gap-0.5 bg-transparent border-none cursor-pointer transition-colors"
                        style={{ minHeight: 'var(--pw-tap)', color: tab.active ? 'var(--pw-brand-dark)' : '#6b7280' }}
                    >
                        <span className="relative flex items-center justify-center">
                            <Icon className="w-[1.35rem] h-[1.35rem]" strokeWidth={tab.active ? 2.4 : 1.8} />
                            {showBadge && (
                                <span
                                    style={{
                                        position: 'absolute', top: '-0.4rem', right: '-0.55rem',
                                        minWidth: '1rem', height: '1rem', padding: '0 0.2rem',
                                        borderRadius: '9999px', backgroundColor: tab.key === 'bag' ? 'var(--pw-brand)' : '#ef4444',
                                        color: '#fff', fontSize: '0.6rem', fontWeight: 700, lineHeight: 1,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    {tab.badge > 9 ? '9+' : tab.badge}
                                </span>
                            )}
                        </span>
                        <span className="text-[0.62rem] font-semibold tracking-tight">{tab.label}</span>
                    </button>
                );
            })}
        </nav>
    );
};

export default MobileBottomNav;
