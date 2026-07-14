import { useState, useRef, useEffect } from 'react';
import { Search, User, Heart, ShoppingBag, Menu, X, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/PehnawaLogoWhite.png';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useUI } from '../context/UIContext';
import useBodyScrollLock from '../utils/useBodyScrollLock';
import SearchOverlay from './SearchOverlay';

/* ─── Category hierarchy ───
 *
 * Each `items[]` is rendered in the dropdown. `path` controls where
 * the link goes — categories under Men/Women are leaf categories
 * (e.g. /products/Anarkalis), while items under Kids are subcategories
 * of the parent "Kids" category (e.g. /products/Kids/Boys).
 */
const NAV_GROUPS = [
    {
        label: 'Women',
        items: [
            'Anarkalis', 'Coord Sets', 'Lehangas', 'Indo Western',
            'Suits & Kurtis', 'Sarees', 'Blouses', 'Dupattas', 'Pashminas',
        ].map((c) => ({ label: c, path: `/products/${encodeURIComponent(c)}` })),
    },
    {
        label: 'Men',
        items: [{ label: "Men's Kurta", path: `/products/${encodeURIComponent("Men's Kurta")}` }],
    },
    {
        label: 'Kids',
        items: [
            { label: 'Boys', path: '/products/Kids/Boys' },
            { label: 'Girls', path: '/products/Kids/Girls' },
        ],
    },
];

const Navbar = () => {
    const navigate = useNavigate();
    const { openCart, getTotalQuantity } = useCart();
    const { user, isLoggedIn, logout } = useAuth();
    const cartCount = getTotalQuantity();
    const { wishlistCount } = useWishlist();

    const { mobileMenuOpen: mobileOpen, setMobileMenuOpen: setMobileOpen } = useUI();

    const [searchQuery, setSearchQuery] = useState('');
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [hoveredGroup, setHoveredGroup] = useState(null);
    const hoverTimeout = useRef(null);
    const accountRef = useRef(null);

    useEffect(() => {
        const handleClick = (e) => {
            if (accountRef.current && !accountRef.current.contains(e.target)) {
                setShowAccountMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    useBodyScrollLock(mobileOpen);

    const getInitials = () => {
        if (!user?.name) return 'U';
        return user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
    };

    const goToCategory = (item) => {
        navigate(item.path);
        setMobileOpen(false);
        setHoveredGroup(null);
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        const q = searchQuery.trim();
        if (q) { navigate(`/search?q=${encodeURIComponent(q)}`); setSearchQuery(''); }
    };

    const handleGroupEnter = (label) => { clearTimeout(hoverTimeout.current); setHoveredGroup(label); };
    const handleGroupLeave = () => { hoverTimeout.current = setTimeout(() => setHoveredGroup(null), 150); };
    const toggleMobileGroup = (label) => { setExpandedGroup((p) => (p === label ? null : label)); };

    return (
        <>
            <div className="h-14 lg:h-[4.75rem]"></div>

            <nav
                className="fixed top-0 left-0 w-full bg-white h-14 lg:h-[4.75rem] border-b border-gray-200"
                style={{ zIndex: 'var(--pw-z-nav)' }}
            >

                <div
                    className="flex items-center h-full"
                    style={{ padding: '0 clamp(1rem, 3vw, 2.5rem)' }}
                >
                    {/* ══════ Hamburger (mobile) ══════ */}
                    {/* Hamburger — tablet only (768–1023px). On phones the
                        bottom nav's "Categories" tab opens this same drawer;
                        on desktop the inline nav groups replace it. */}
                    <button
                        className="hidden md:flex lg:hidden items-center justify-center w-11 h-11 -ml-1.5 text-gray-800 cursor-pointer flex-shrink-0"
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>

                    {/* ══════ Logo ══════ */}
                    <div className="flex-shrink-0 cursor-pointer flex items-center" onClick={() => navigate('/')}>
                        <img
                            src={logo}
                            alt="Pehnawa"
                            className="w-auto object-contain block h-10 lg:h-16"
                        />
                    </div>

                    {/* ══════ Desktop nav groups ══════ */}
                    <div className="hidden lg:flex items-center h-full gap-2" style={{ marginLeft: '4rem' }}>
                        {NAV_GROUPS.map((group) => (
                            <div
                                key={group.label}
                                className="relative flex items-center h-full"
                                onMouseEnter={() => handleGroupEnter(group.label)}
                                onMouseLeave={handleGroupLeave}
                            >
                                <button
                                    className="flex items-center gap-[0.35rem] px-5 h-full text-[0.84rem] font-bold text-gray-800 hover:text-black uppercase cursor-pointer bg-transparent border-none"
                                    style={{ fontFamily: 'inherit', letterSpacing: '0.06em' }}
                                >
                                    {group.label}
                                    <ChevronDown
                                        className="w-[0.85rem] h-[0.85rem] transition-transform duration-200 mt-[1px]"
                                        strokeWidth={2.5}
                                        style={{ transform: hoveredGroup === group.label ? 'rotate(180deg)' : 'rotate(0)' }}
                                    />
                                </button>

                                {/* Active underline */}
                                <div
                                    className="absolute bottom-0 left-5 right-5 h-[3px] transition-all duration-200"
                                    style={{ background: hoveredGroup === group.label ? '#EFBF04' : 'transparent', borderRadius: '3px 3px 0 0' }}
                                />

                                {/* Dropdown panel */}
                                {hoveredGroup === group.label && (
                                    <div
                                        className="absolute top-full left-0 pt-0 z-50"
                                        onMouseEnter={() => handleGroupEnter(group.label)}
                                        onMouseLeave={handleGroupLeave}
                                    >
                                        <div
                                            style={{
                                                background: '#fff',
                                                borderTop: '3px solid #EFBF04',
                                                boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                                                borderRadius: '0 0 0.5rem 0.5rem',
                                                minWidth: '210px',
                                                padding: '0.6rem 0',
                                            }}
                                        >
                                            {group.items.map((item) => (
                                                <button
                                                    key={item.label}
                                                    onClick={() => goToCategory(item)}
                                                    className="dropdown-item"
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        padding: '0.6rem 1.5rem',
                                                        border: 'none',
                                                        background: 'transparent',
                                                        textAlign: 'left',
                                                        fontSize: '0.875rem',
                                                        fontWeight: 500,
                                                        color: '#4b5563',
                                                        cursor: 'pointer',
                                                        fontFamily: 'inherit',
                                                        whiteSpace: 'nowrap',
                                                        transition: 'all 0.15s ease',
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        e.currentTarget.style.background = '#fdf8e8';
                                                        e.currentTarget.style.color = '#111827';
                                                        e.currentTarget.style.paddingLeft = '1.75rem';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = 'transparent';
                                                        e.currentTarget.style.color = '#4b5563';
                                                        e.currentTarget.style.paddingLeft = '1.5rem';
                                                    }}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ══════ CENTER: Search ══════ */}
                    <div className="hidden md:flex flex-1 items-center justify-center mx-8 lg:mx-12">
                        <form onSubmit={handleSearchSubmit} className="w-full max-w-[580px]">
                            <div
                                className="flex items-center w-full overflow-hidden"
                                style={{ background: '#f5f5f6', borderRadius: '0.35rem' }}
                            >
                                <Search className="w-[1.05rem] h-[1.05rem] text-gray-400 ml-4 flex-shrink-0" strokeWidth={2.2} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for products, brands and more"
                                    style={{
                                        flex: 1,
                                        border: 'none',
                                        outline: 'none',
                                        background: 'transparent',
                                        padding: '0.65rem 0.85rem',
                                        fontSize: '0.875rem',
                                        color: '#111827',
                                        fontFamily: 'inherit',
                                    }}
                                />
                            </div>
                        </form>
                    </div>

                    {/* Mobile: spacer + search icon */}
                    <div className="flex-1 md:hidden" />
                    <button
                        className="md:hidden flex items-center justify-center w-11 h-11 text-gray-700 cursor-pointer"
                        onClick={() => setIsSearchOpen(true)}
                        aria-label="Search"
                    >
                        <Search className="w-[1.3rem] h-[1.3rem]" strokeWidth={1.8} />
                    </button>

                    {/* ══════ RIGHT: Profile + Bag ══════
                        Hidden on phones (< md) — these actions live in the
                        mobile bottom nav. Shown on tablet/desktop. */}
                    <div className="hidden md:flex items-center flex-shrink-0 gap-1 sm:gap-3">
                        {/* Profile */}
                        <div ref={accountRef} className="relative">
                            <button
                                onClick={() => isLoggedIn ? setShowAccountMenu(!showAccountMenu) : navigate('/signin')}
                                aria-label="Profile"
                                className="flex flex-col items-center justify-center min-h-11 min-w-11 cursor-pointer bg-transparent border-none text-gray-700 hover:text-black transition-colors"
                                style={{ fontFamily: 'inherit', padding: '0.25rem 0.5rem' }}
                            >
                                {isLoggedIn ? (
                                    <div
                                        style={{
                                            width: '1.55rem', height: '1.55rem', borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #EFBF04, #f5d442)',
                                            color: '#fff', fontWeight: 700, fontSize: '0.55rem',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                    >
                                        {getInitials()}
                                    </div>
                                ) : (
                                    <User className="w-[1.4rem] h-[1.4rem]" strokeWidth={1.5} />
                                )}
                                <span className="hidden lg:block text-[0.62rem] font-semibold mt-1 text-gray-500">Profile</span>
                            </button>

                            {showAccountMenu && isLoggedIn && (
                                <div
                                    style={{
                                        position: 'absolute', top: 'calc(100% - 0.25rem)', right: 0,
                                        background: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem',
                                        boxShadow: '0 6px 20px rgba(0,0,0,0.1)', minWidth: '170px',
                                        zIndex: 100, overflow: 'hidden',
                                    }}
                                >
                                    <button onClick={() => { setShowAccountMenu(false); navigate('/account'); }}
                                        style={ddStyle}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fdf8e8')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >My Account</button>
                                    <div style={{ height: '1px', background: '#f3f4f6' }} />
                                    <button onClick={() => { setShowAccountMenu(false); logout(); navigate('/'); }}
                                        style={ddStyle}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fdf8e8')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >Logout</button>
                                </div>
                            )}
                        </div>

                        {/* Wishlist */}
                        <button
                            onClick={() => navigate('/wishlist')}
                            aria-label="Wishlist"
                            className="relative flex flex-col items-center justify-center min-h-11 min-w-11 cursor-pointer bg-transparent border-none text-gray-700 hover:text-black transition-colors"
                            style={{ fontFamily: 'inherit', padding: '0.25rem 0.5rem' }}
                        >
                            <div className="relative">
                                <Heart className="w-[1.4rem] h-[1.4rem]" strokeWidth={1.5} />
                                {wishlistCount > 0 && (
                                    <span
                                        style={{
                                            position: 'absolute', top: '-0.35rem', right: '-0.5rem',
                                            minWidth: '1rem', height: '1rem', borderRadius: '50%',
                                            backgroundColor: '#ef4444', color: '#fff',
                                            fontSize: '0.55rem', fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            lineHeight: 1, padding: '0 0.15rem',
                                        }}
                                    >
                                        {wishlistCount}
                                    </span>
                                )}
                            </div>
                            <span className="hidden lg:block text-[0.62rem] font-semibold mt-1 text-gray-500">Wishlist</span>
                        </button>

                        {/* Bag */}
                        <button
                            onClick={openCart}
                            aria-label="Shopping bag"
                            className="flex flex-col items-center justify-center min-h-11 min-w-11 cursor-pointer bg-transparent border-none text-gray-700 hover:text-black transition-colors"
                            style={{ fontFamily: 'inherit', padding: '0.25rem 0.5rem' }}
                        >
                            <div className="relative">
                                <ShoppingBag className="w-[1.4rem] h-[1.4rem]" strokeWidth={1.5} />
                                {cartCount > 0 && (
                                    <span
                                        style={{
                                            position: 'absolute', top: '-0.35rem', right: '-0.5rem',
                                            minWidth: '1rem', height: '1rem', borderRadius: '50%',
                                            backgroundColor: '#EFBF04', color: '#fff',
                                            fontSize: '0.55rem', fontWeight: 700,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            lineHeight: 1, padding: '0 0.15rem',
                                        }}
                                    >
                                        {cartCount}
                                    </span>
                                )}
                            </div>
                            <span className="hidden lg:block text-[0.62rem] font-semibold mt-1 text-gray-500">Bag</span>
                        </button>
                    </div>
                </div>
            </nav>

            {/* ═══ Mobile Menu ═══ */}
            {mobileOpen && (
                <div
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm lg:hidden"
                    style={{ zIndex: 'var(--pw-z-menu-backdrop)' }}
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <div
                className="fixed top-0 left-0 bottom-0 w-[min(400px,88vw)] bg-white shadow-2xl lg:hidden flex flex-col transition-transform duration-300 ease-in-out"
                style={{ transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', zIndex: 'var(--pw-z-menu)' }}
            >
                {/* Drawer Header */}
                <div className="flex items-center justify-between px-6 h-14 border-b border-gray-100 flex-shrink-0">
                    <span className="text-[0.8rem] font-bold text-gray-900 uppercase tracking-[0.15em]">Menu</span>
                    <button
                        onClick={() => setMobileOpen(false)}
                        className="w-10 h-10 -mr-2 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Nav Groups — scrollable */}
                <div className="flex-1 overflow-y-auto overscroll-contain py-1">
                    {NAV_GROUPS.map((group) => {
                        const open = expandedGroup === group.label;
                        return (
                            <div key={group.label} className="border-b border-gray-100/80">
                                <button
                                    onClick={() => toggleMobileGroup(group.label)}
                                    className="w-full flex items-center justify-between px-6 min-h-[2.75rem] bg-transparent border-none cursor-pointer"
                                    style={{ fontFamily: 'inherit' }}
                                >
                                    <span className="text-[0.8rem] font-semibold text-gray-900 uppercase tracking-wider">{group.label}</span>
                                    <ChevronDown
                                        className="w-4 h-4 text-gray-400 transition-transform duration-200"
                                        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
                                    />
                                </button>
                                <div
                                    className="overflow-hidden transition-all duration-250 ease-in-out"
                                    style={{ maxHeight: open ? `${group.items.length * 2.75 + 0.5}rem` : '0', opacity: open ? 1 : 0 }}
                                >
                                    {group.items.map((item) => (
                                        <button
                                            key={item.label}
                                            onClick={() => goToCategory(item)}
                                            className="w-full text-left pl-9 pr-6 min-h-[2.75rem] flex items-center text-[0.82rem] text-gray-500 hover:text-gray-900 hover:bg-gray-50/80 transition-colors cursor-pointer bg-transparent border-none"
                                            style={{ fontFamily: 'inherit' }}
                                        >
                                            {item.label}
                                        </button>
                                    ))}
                                    <div className="h-1.5"></div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Bottom Section — sticky */}
                {isLoggedIn ? (
                    <div
                        className="px-6 py-4 border-t border-gray-100 flex-shrink-0"
                        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                    >
                        <div className="flex gap-2">
                            <button
                                onClick={() => { setMobileOpen(false); navigate('/account'); }}
                                className="flex-1 py-2.5 text-[0.8rem] font-semibold text-gray-700 bg-gray-100 rounded-lg cursor-pointer border-none hover:bg-gray-200 transition-colors"
                                style={{ fontFamily: 'inherit' }}
                            >
                                My Account
                            </button>
                            <button
                                onClick={() => { setMobileOpen(false); logout(); navigate('/'); }}
                                className="flex-1 py-2.5 text-[0.8rem] font-semibold text-gray-500 bg-gray-50 rounded-lg cursor-pointer border-none hover:bg-gray-100 transition-colors"
                                style={{ fontFamily: 'inherit' }}
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                ) : (
                    <div
                        className="px-6 py-4 border-t border-gray-100 flex-shrink-0"
                        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                    >
                        <button
                            onClick={() => { setMobileOpen(false); navigate('/signin'); }}
                            className="w-full py-3 text-[0.82rem] font-bold text-white rounded-lg cursor-pointer border-none transition-opacity hover:opacity-90"
                            style={{ background: 'linear-gradient(135deg, #EFBF04, #d4a904)', fontFamily: 'inherit' }}
                        >
                            Sign In
                        </button>
                    </div>
                )}
            </div>

            <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
        </>
    );
};

const ddStyle = { display: 'block', width: '100%', padding: '0.7rem 1.1rem', border: 'none', background: 'transparent', textAlign: 'left', fontSize: '0.85rem', color: '#374151', cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' };

export default Navbar;
