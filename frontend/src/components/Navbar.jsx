import { useState, useRef, useEffect } from 'react';
import { Search, User, ShoppingBag, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/PehnawaLogoWhite.png';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import SearchOverlay from './SearchOverlay';

const Navbar = () => {
    const navigate = useNavigate();
    const { openCart, getTotalQuantity } = useCart();
    const { user, isLoggedIn, logout } = useAuth();
    const cartCount = getTotalQuantity();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const accountRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (accountRef.current && !accountRef.current.contains(e.target)) {
                setShowAccountMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const getInitials = () => {
        if (!user?.name) return 'U';
        return user.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    const navSections = [
        'Anarkalis',
        'Coord Sets',
        'Lehangas',
        'Indo Western',
        'Suits & Kurtis',
        'Sarees',
        'Blouses',
        'Kidswear',
        "Men's Kurta",
        'Dupattas',
        'Pashminas',
    ];

    return (
        <>
            {/* Spacer to prevent content from hiding behind fixed navbar */}
            <div className="h-[4rem]"></div>

            <nav className="fixed top-0 left-0 w-full bg-white border-b border-gray-200 h-[4rem] z-50">
                <div className="w-full h-full">
                    <div className="flex justify-around items-center h-full">
                        {/* Logo */}
                        <div className="flex-shrink-0 cursor-pointer" onClick={() => navigate('/')}>
                            <img src={logo} alt="Pehnawa" className="h-16 w-auto" />
                        </div>

                        {/* Navigation Links - Centered */}
                        <div className="flex items-center gap-8">
                            {navSections.map((section) => (
                                <a
                                    key={section}
                                    onClick={() => navigate(`/products/${encodeURIComponent(section)}`)}
                                    className="text-base text-gray-700 hover:text-gray-900 transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer font-semibold"
                                >
                                    {section}
                                    {section === 'Blog' && (
                                        <ChevronDown className="w-3 h-3" />
                                    )}
                                </a>
                            ))}
                        </div>

                        {/* Right Icons - Search, Account, Cart */}
                        <div className="flex items-center gap-6">
                            {/* Search Icon */}
                            <button
                                className="relative group text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
                                onClick={() => setIsSearchOpen(true)}
                            >
                                <Search className="h-6 w-6" strokeWidth={1.5} />
                                <div
                                    className="absolute left-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                    style={{ top: '100%', transform: 'translateX(-50%)', marginTop: '0.8rem' }}
                                >
                                    <div
                                        className="absolute left-1/2 bg-[#333]"
                                        style={{ top: '-0.35rem', transform: 'translateX(-50%) rotate(45deg)', width: '0.6rem', height: '0.6rem' }}
                                    ></div>
                                    <span
                                        className="relative block bg-[#333] text-white whitespace-nowrap"
                                        style={{ padding: '0.6rem 1rem', fontSize: '0.875rem', borderRadius: '0.4rem' }}
                                    >
                                        Search
                                    </span>
                                </div>
                            </button>

                            {/* Account Icon / Initials */}
                            <div ref={accountRef} style={{ position: 'relative' }}>
                                {isLoggedIn ? (
                                    <>
                                        <button
                                            onClick={() => setShowAccountMenu(!showAccountMenu)}
                                            style={{
                                                width: '2rem',
                                                height: '2rem',
                                                borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #EFBF04, #f5d442)',
                                                color: '#fff',
                                                fontWeight: 700,
                                                fontSize: '0.7rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: 'none',
                                                cursor: 'pointer',
                                                letterSpacing: '0.03em',
                                                transition: 'box-shadow 0.2s',
                                                boxShadow: showAccountMenu ? '0 0 0 3px rgba(239,191,4,0.25)' : 'none',
                                            }}
                                        >
                                            {getInitials()}
                                        </button>

                                        {/* Dropdown */}
                                        {showAccountMenu && (
                                            <div
                                                style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 0.6rem)',
                                                    right: 0,
                                                    background: '#fff',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '0.5rem',
                                                    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                                                    minWidth: '160px',
                                                    zIndex: 100,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <button
                                                    onClick={() => { setShowAccountMenu(false); navigate('/account'); }}
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        padding: '0.7rem 1rem',
                                                        border: 'none',
                                                        background: 'transparent',
                                                        textAlign: 'left',
                                                        fontSize: '0.85rem',
                                                        color: '#374151',
                                                        cursor: 'pointer',
                                                        fontFamily: 'inherit',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#fdf8e8')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    My Account
                                                </button>
                                                <div style={{ height: '1px', background: '#f3f4f6' }} />
                                                <button
                                                    onClick={() => { setShowAccountMenu(false); logout(); navigate('/'); }}
                                                    style={{
                                                        display: 'block',
                                                        width: '100%',
                                                        padding: '0.7rem 1rem',
                                                        border: 'none',
                                                        background: 'transparent',
                                                        textAlign: 'left',
                                                        fontSize: '0.85rem',
                                                        color: '#374151',
                                                        cursor: 'pointer',
                                                        fontFamily: 'inherit',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.background = '#fdf8e8')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                                >
                                                    Logout
                                                </button>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <button
                                        className="relative group text-gray-700 hover:text-gray-900 transition-colors cursor-pointer"
                                        onClick={() => navigate('/signin')}
                                    >
                                        <User className="h-6 w-6" strokeWidth={1.5} />
                                        <div
                                            className="absolute left-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                            style={{ top: '100%', transform: 'translateX(-50%)', marginTop: '0.8rem' }}
                                        >
                                            <div
                                                className="absolute left-1/2 bg-[#333]"
                                                style={{ top: '-0.35rem', transform: 'translateX(-50%) rotate(45deg)', width: '0.6rem', height: '0.6rem' }}
                                            ></div>
                                            <span
                                                className="relative block bg-[#333] text-white whitespace-nowrap"
                                                style={{ padding: '0.6rem 1rem', fontSize: '0.875rem', borderRadius: '0.4rem' }}
                                            >
                                                Account
                                            </span>
                                        </div>
                                    </button>
                                )}
                            </div>

                            {/* Cart/Bag Icon */}
                            <button onClick={openCart} className="relative group text-gray-700 hover:text-gray-900 transition-colors cursor-pointer">
                                <ShoppingBag className="h-6 w-6" strokeWidth={1.5} />
                                {cartCount > 0 && (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            top: '-0.4rem',
                                            right: '-0.5rem',
                                            width: '1.15rem',
                                            height: '1.15rem',
                                            borderRadius: '50%',
                                            backgroundColor: '#EFBF04',
                                            color: '#fff',
                                            fontSize: '0.65rem',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            lineHeight: 1,
                                        }}
                                    >
                                        {cartCount}
                                    </span>
                                )}
                                <div
                                    className="absolute left-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                                    style={{ top: '100%', transform: 'translateX(-50%)', marginTop: '0.8rem' }}
                                >
                                    <div
                                        className="absolute left-1/2 bg-[#333]"
                                        style={{ top: '-0.35rem', transform: 'translateX(-50%) rotate(45deg)', width: '0.6rem', height: '0.6rem' }}
                                    ></div>
                                    <span
                                        className="relative block bg-[#333] text-white whitespace-nowrap"
                                        style={{ padding: '0.6rem 1rem', fontSize: '0.875rem', borderRadius: '0.4rem' }}
                                    >
                                        Cart
                                    </span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
        </>
    );
};

export default Navbar;
