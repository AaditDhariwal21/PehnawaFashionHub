import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const AdminToggleButton = () => {
    const { user, setViewMode } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [hovered, setHovered] = useState(false);

    // Only render for admin users
    if (!user || user.role !== 'admin') return null;

    const isAdminPage =
        location.pathname === '/adminDashboard' ||
        location.pathname.startsWith('/admin/');

    const label = isAdminPage ? 'View Customer Site' : 'Back to Admin Dashboard';

    const handleClick = () => {
        if (isAdminPage) {
            setViewMode('customer');
            navigate('/');
        } else {
            setViewMode('admin');
            navigate('/adminDashboard');
        }
    };

    return (
        <>
            <button
                onClick={handleClick}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                aria-label={label}
                style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    zIndex: 9999,
                    width: '54px',
                    height: '54px',
                    borderRadius: '50%',
                    border: 'none',
                    cursor: 'pointer',
                    background: hovered
                        ? 'linear-gradient(135deg, #d4a904, #EFBF04)'
                        : 'linear-gradient(135deg, #EFBF04, #f5d442)',
                    color: '#fff',
                    boxShadow: hovered
                        ? '0 8px 28px rgba(239, 191, 4, 0.55)'
                        : '0 4px 18px rgba(239, 191, 4, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: hovered ? 'scale(1.1)' : 'scale(1)',
                    fontFamily: 'inherit',
                }}
            >
                {isAdminPage ? (
                    /* Eye icon – "View Site" */
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                ) : (
                    /* Arrow back icon – "Back to Admin" */
                    <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M9 14l-4-4 4-4" />
                        <path d="M5 10h11a4 4 0 0 1 0 8h-1" />
                    </svg>
                )}
            </button>

            {/* Tooltip */}
            <div
                style={{
                    position: 'fixed',
                    bottom: '28px',
                    right: '82px',
                    zIndex: 9999,
                    backgroundColor: '#1f2937',
                    color: '#fff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.4rem 0.75rem',
                    borderRadius: '0.4rem',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    opacity: hovered ? 1 : 0,
                    transform: hovered ? 'translateX(0)' : 'translateX(8px)',
                    transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    fontFamily: 'inherit',
                    letterSpacing: '0.01em',
                }}
            >
                {label}
                {/* Tooltip arrow */}
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        right: '-5px',
                        transform: 'translateY(-50%) rotate(45deg)',
                        width: '10px',
                        height: '10px',
                        backgroundColor: '#1f2937',
                    }}
                />
            </div>
        </>
    );
};

export default AdminToggleButton;
