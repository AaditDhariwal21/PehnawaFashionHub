import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { GENDERS, CATEGORIES_BY_GENDER } from '../utils/productCategories.js';

const Footer = () => {
    const navigate = useNavigate();

    /* On mobile the link groups collapse into accordions (Amazon/Flipkart
       pattern) to avoid a tall wall of links. On md+ they're always open. */
    const [open, setOpen] = useState({ quick: false, company: false });
    const toggle = (key) => setOpen((p) => ({ ...p, [key]: !p[key] }));

    /* Derived from the shared taxonomy. This list previously included
       "New Arrivals" — a special tag, never a category, so the link resolved to
       an empty page — and hand-written paths that were not URL-encoded. Kids
       entries keep their "Kids — Boys" phrasing because the category name alone
       ("Boys") would be ambiguous in a flat footer list. */
    const quickLinks = GENDERS.flatMap((gender) =>
        CATEGORIES_BY_GENDER[gender].map((category) => ({
            label: gender === 'Kids' ? `Kids — ${category}` : category,
            path: `/products/${encodeURIComponent(gender)}/${encodeURIComponent(category)}`,
        }))
    );

    const companyLinks = [
        { label: 'About us', path: '/about-us' },
        { label: 'Contact us', path: '/contact-us' },
        { label: 'Privacy Policy', path: '/privacy-policy' },
        { label: 'Refund Policy', path: '/refund-policy' },
        { label: 'Shipping Policy', path: '/shipping-policy' },
        { label: 'Terms of Service', path: '/terms-of-service' },
    ];

    const linkStyle = {
        fontSize: '0.85rem',
        color: '#6b7280',
        textDecoration: 'none',
        transition: 'color 0.2s',
    };

    const headingStyle = { fontSize: '0.9rem', fontWeight: 600, color: '#111827' };

    /* Accordion header — a real button (44px tap) on mobile, an inert
       heading on md+ (pointer-events disabled, chevron hidden). */
    const AccordionHeader = ({ id, children }) => (
        <button
            type="button"
            onClick={() => toggle(id)}
            aria-expanded={open[id]}
            className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer text-left min-h-11 md:min-h-0 md:mb-4 md:cursor-default md:pointer-events-none"
        >
            <span style={headingStyle}>{children}</span>
            <ChevronDown
                className="w-4 h-4 text-gray-400 md:hidden transition-transform duration-200"
                style={{ transform: open[id] ? 'rotate(180deg)' : 'rotate(0)' }}
            />
        </button>
    );

    return (
        <footer style={{ backgroundColor: '#fff' }}>
            {/* Main content — stacks on mobile, 3 cols on md+ */}
            <div
                className="grid grid-cols-1 md:grid-cols-3"
                style={{
                    maxWidth: '1200px',
                    margin: '0 auto',
                    padding: 'clamp(1.5rem, 3.5vw, 3.5rem) clamp(1rem, 3vw, 2rem) clamp(1.25rem, 2.5vw, 2.5rem)',
                    gap: 'clamp(1.5rem, 2.5vw, 3rem)',
                }}
            >
                {/* Quick Links */}
                <div className="border-b border-gray-100 md:border-b-0">
                    <AccordionHeader id="quick">Quick link</AccordionHeader>
                    <ul
                        className={`${open.quick ? 'grid' : 'hidden'} md:grid grid-cols-2 pb-3 md:pb-0`}
                        style={{ listStyle: 'none', padding: 0, margin: 0, gap: '0 1.5rem' }}
                    >
                        {quickLinks.map((link) => (
                            <li key={link.label}>
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); navigate(link.path); }}
                                    style={linkStyle}
                                    className="block py-2 md:py-1"
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
                <div className="border-b border-gray-100 md:border-b-0">
                    <AccordionHeader id="company">Company</AccordionHeader>
                    <ul
                        className={`${open.company ? 'block' : 'hidden'} md:block pb-3 md:pb-0`}
                        style={{ listStyle: 'none', padding: 0, margin: 0 }}
                    >
                        {companyLinks.map((link) => (
                            <li key={link.label}>
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); navigate(link.path); }}
                                    style={linkStyle}
                                    className="block py-2 md:py-1"
                                    onMouseEnter={(e) => (e.currentTarget.style.color = '#111827')}
                                    onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                                >
                                    {link.label}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Social — small, always visible */}
                <div className="pt-4 md:pt-0">
                    <h4 style={{ ...headingStyle, marginBottom: '1rem' }}>Our store</h4>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <a href="https://www.instagram.com/pehnawafashionhub/" target="_blank" rel="noopener noreferrer" style={socialIconStyle} aria-label="Instagram">
                            <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                            </svg>
                        </a>
                    </div>
                </div>
            </div>

            {/* Bottom bar */}
            <div style={{ borderTop: '1px solid #e5e7eb' }}>
                <div
                    className="flex flex-col items-center sm:flex-row sm:justify-between"
                    style={{
                        maxWidth: '1200px',
                        margin: '0 auto',
                        gap: '0.35rem',
                        padding: '1rem clamp(1.25rem, 4vw, 2rem)',
                    }}
                >
                    <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>
                        © <span style={{ color: '#EFBF04', fontWeight: 600 }}>Pehnawa</span> 2026
                    </p>
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                        United States (USD $)
                    </span>
                </div>
            </div>
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
