import { useNavigate } from 'react-router-dom';

const Footer = () => {
    const navigate = useNavigate();

    const quickLinks = [
        { label: 'New Arrivals', path: '/products/New Arrivals' },
        { label: 'Anarkalis', path: '/products/Anarkalis' },
        { label: 'Coord Sets', path: '/products/Coord Sets' },
        { label: 'Lehangas', path: '/products/Lehangas' },
        { label: 'Indo Western', path: '/products/Indo Western' },
        { label: 'Suits & Kurtis', path: '/products/Suits & Kurtis' },
        { label: 'Sarees', path: '/products/Sarees' },
        { label: 'Blouses', path: '/products/Blouses' },
        { label: 'Kidswear', path: '/products/Kidswear' },
        { label: "Men's Kurta", path: "/products/Men's Kurta" },
        { label: 'Dupattas', path: '/products/Dupattas' },
        { label: 'Pashminas', path: '/products/Pashminas' },
    ];

    const companyLinks = [
        { label: 'About us', path: '/about-us' },
        { label: 'Contact us', path: '/contact-us' },
        { label: 'Privacy Policy', path: '/privacy-policy' },
        { label: 'Refund Policy', path: '/refund-policy' },
        { label: 'Shipping Policy', path: '/shipping-policy' },
        { label: 'Terms of Service', path: '/terms-of-service' },
    ];

    return (
        <footer style={{ backgroundColor: '#fff' }}>
            {/* ═══ Main content ═══ */}
            <div
                style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    padding: '3.5rem 2rem 2.5rem',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '3rem',
                }}
                className="footer-grid"
            >

                {/* Quick Links */}
                <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', marginBottom: '1.2rem' }}>
                        Quick link
                    </h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem 2rem' }} className="quick-links-grid">
                        {quickLinks.map((link) => (
                            <li key={link.label}>
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); navigate(link.path); }}
                                    style={{ fontSize: '0.85rem', color: '#6b7280', textDecoration: 'none', transition: 'color 0.2s' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Company */}
                <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', marginBottom: '1.2rem' }}>
                        Company
                    </h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {companyLinks.map((link) => (
                            <li key={link.label}>
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); navigate(link.path); }}
                                    style={{ fontSize: '0.85rem', color: '#6b7280', textDecoration: 'none', transition: 'color 0.2s' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Social */}
                <div>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#111827', marginBottom: '1.2rem' }}>
                        Our store
                    </h4>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        {/* Instagram */}
                        <a href="https://www.instagram.com/pehnawafashionhub/" target="_blank" rel="noopener noreferrer" style={socialIconStyle}>
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                            </svg>
                        </a>
                    </div>
                </div>
            </div>

            {/* ═══ Bottom bar ═══ */}
            <div
                style={{
                    borderTop: '1px solid #e5e7eb',
                    padding: '1.25rem 2rem',
                }}
            >
                <div
                    style={{
                        maxWidth: '1200px',
                        margin: '0 auto',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '1rem',
                    }}
                    className="footer-bottom"
                >
                    {/* Copyright */}
                    <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
                        © <span style={{ color: '#EFBF04', fontWeight: 600 }}>Pehnawa</span> 2026
                    </p>

                    {/* Country / Currency */}
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                        🇺🇸 United States (USD $)
                    </span>
                </div>
            </div>

            {/* Responsive CSS */}
            <style>{`
                @media (max-width: 768px) {
                    .footer-grid {
                        grid-template-columns: 1fr !important;
                        gap: 2rem !important;
                        padding: 2rem 1.25rem !important;
                    }
                    .footer-bottom {
                        flex-direction: column !important;
                        align-items: center !important;
                        text-align: center;
                    }
                    .quick-links-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </footer>
    );
};

const socialIconStyle = {
    width: '2.5rem',
    height: '2.5rem',
    borderRadius: '50%',
    backgroundColor: '#111827',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    transition: 'background-color 0.2s',
    textDecoration: 'none',
};

export default Footer;
