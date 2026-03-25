import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import formatPrice from '../utils/formatPrice';
import './AccountPage.css';

const API = import.meta.env.VITE_API_URL;

const STATUS_COLORS = {
    Pending: { bg: '#fef3c7', color: '#92400e' },
    Paid: { bg: '#d1fae5', color: '#065f46' },
    Processing: { bg: '#dbeafe', color: '#1e40af' },
    Shipped: { bg: '#e0e7ff', color: '#3730a3' },
    Delivered: { bg: '#d1fae5', color: '#065f46' },
    Cancelled: { bg: '#fee2e2', color: '#991b1b' },
};

const AccountPage = () => {
    const navigate = useNavigate();
    const { user, logout, updateUser } = useAuth();
    const [activeTab, setActiveTab] = useState('info');

    // Form state – personal info
    const [name, setName] = useState(user?.name || '');
    const [phone, setPhone] = useState(user?.phone || '');
    const [email] = useState(user?.email || '');

    // Form state – address
    const [address, setAddress] = useState({
        fullName: '',
        phone: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        zip: '',
        country: 'United States',
    });

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Orders state
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersFetched, setOrdersFetched] = useState(false);

    // Redirect if not logged in
    if (!user) {
        navigate('/signin');
        return null;
    }

    /* Fetch full profile (including address) on mount */
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        fetch(`${API}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                if (data.success && data.user) {
                    const u = data.user;
                    if (u.name) setName(u.name);
                    if (u.phone) setPhone(u.phone);
                    if (u.address) {
                        setAddress((prev) => ({
                            ...prev,
                            fullName: u.address.fullName || '',
                            phone: u.address.phone || '',
                            addressLine1: u.address.addressLine1 || '',
                            addressLine2: u.address.addressLine2 || '',
                            city: u.address.city || '',
                            state: u.address.state || '',
                            zip: u.address.zip || '',
                            country: u.address.country || 'United States',
                        }));
                    }
                }
            })
            .catch(console.error);
    }, []);

    /* Fetch orders when tab switches to 'orders' */
    useEffect(() => {
        if (activeTab !== 'orders' || ordersFetched) return;
        setOrdersLoading(true);
        const token = localStorage.getItem('token');
        fetch(`${API}/orders/my`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => { if (data.success) setOrders(data.orders); })
            .catch(console.error)
            .finally(() => { setOrdersLoading(false); setOrdersFetched(true); });
    }, [activeTab, ordersFetched]);

    const handleAddressChange = (e) => {
        const { name: field, value } = e.target;
        setAddress((prev) => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError('');
        try {
            const token = localStorage.getItem('token');

            // Save profile (name, phone)
            const profileRes = await fetch(`${API}/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ name, phone }),
            });
            const profileData = await profileRes.json();

            // Save address
            const addressRes = await fetch(`${API}/users/address`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(address),
            });
            const addressData = await addressRes.json();

            if (profileData.success) {
                updateUser({ ...profileData.user, address: addressData.address || address });
            }

            if (!profileData.success || !addressData.success) {
                setSaveError(profileData.message || addressData.message || 'Something went wrong');
                return;
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (err) {
            console.error('Error updating profile:', err);
            setSaveError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        navigate('/');
        logout();
    };

    const getInitials = () => {
        if (!user?.name) return 'U';
        return user.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <div className="account-pg">
            <Navbar />
            <div className="account-layout">
                {/* ═══ Sidebar ═══ */}
                <aside className="account-sidebar">
                    <div className="account-avatar">
                        <div className="account-avatar-circle">{getInitials()}</div>
                        <p className="account-avatar-name">{user.name}</p>
                        <p className="account-avatar-email">{user.email}</p>
                    </div>

                    <nav className="account-nav">
                        <button
                            className={`account-nav-item ${activeTab === 'info' ? 'active' : ''}`}
                            onClick={() => setActiveTab('info')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            Account Info
                        </button>
                        <button
                            className={`account-nav-item ${activeTab === 'orders' ? 'active' : ''}`}
                            onClick={() => setActiveTab('orders')}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <path d="M16 10a4 4 0 0 1-8 0" />
                            </svg>
                            Your Orders
                        </button>
                    </nav>
                </aside>

                {/* ═══ Content ═══ */}
                <main className="account-content">
                    {activeTab === 'info' && (
                        <div className="account-info-panel">
                            <h1>Account Information</h1>
                            <p className="account-info-sub">Manage your personal details and shipping address</p>

                            {/* ── Personal Details ── */}
                            <div className="account-fields">
                                <div className="account-field">
                                    <label>Full Name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Your full name"
                                    />
                                </div>
                                <div className="account-field">
                                    <label>Phone Number</label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="Your phone number"
                                    />
                                </div>
                                <div className="account-field">
                                    <label>Registered Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        disabled
                                        className="disabled-field"
                                    />
                                    <span className="field-hint">Email cannot be changed</span>
                                </div>
                            </div>

                            {/* ── Shipping Address ── */}
                            <div className="account-address-section">
                                <h2 className="account-address-heading">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                        <circle cx="12" cy="10" r="3" />
                                    </svg>
                                    Shipping Address
                                </h2>
                                <p className="account-address-hint">This address will be autofilled during checkout</p>

                                <div className="account-fields">
                                    <div className="account-field-row">
                                        <div className="account-field">
                                            <label>Full Name</label>
                                            <input
                                                type="text"
                                                name="fullName"
                                                value={address.fullName}
                                                onChange={handleAddressChange}
                                                placeholder="Recipient full name"
                                            />
                                        </div>
                                        <div className="account-field">
                                            <label>Phone Number</label>
                                            <input
                                                type="tel"
                                                name="phone"
                                                value={address.phone}
                                                onChange={handleAddressChange}
                                                placeholder="+1 (555) 000-0000"
                                            />
                                        </div>
                                    </div>

                                    <div className="account-field">
                                        <label>Address Line 1</label>
                                        <input
                                            type="text"
                                            name="addressLine1"
                                            value={address.addressLine1}
                                            onChange={handleAddressChange}
                                            placeholder="123 Main Street"
                                        />
                                    </div>

                                    <div className="account-field">
                                        <label>Address Line 2 <span className="field-hint-inline">(optional)</span></label>
                                        <input
                                            type="text"
                                            name="addressLine2"
                                            value={address.addressLine2}
                                            onChange={handleAddressChange}
                                            placeholder="Apt, Suite, Unit, etc."
                                        />
                                    </div>

                                    <div className="account-field-row">
                                        <div className="account-field">
                                            <label>City</label>
                                            <input
                                                type="text"
                                                name="city"
                                                value={address.city}
                                                onChange={handleAddressChange}
                                                placeholder="New York"
                                            />
                                        </div>
                                        <div className="account-field">
                                            <label>State</label>
                                            <input
                                                type="text"
                                                name="state"
                                                value={address.state}
                                                onChange={handleAddressChange}
                                                placeholder="NY"
                                            />
                                        </div>
                                    </div>

                                    <div className="account-field-row">
                                        <div className="account-field">
                                            <label>ZIP Code</label>
                                            <input
                                                type="text"
                                                name="zip"
                                                value={address.zip}
                                                onChange={handleAddressChange}
                                                placeholder="10001"
                                            />
                                        </div>
                                        <div className="account-field">
                                            <label>Country</label>
                                            <select
                                                name="country"
                                                value={address.country}
                                                onChange={handleAddressChange}
                                                className="account-select"
                                            >
                                                <option>United States</option>
                                                <option>Canada</option>
                                                <option>United Kingdom</option>
                                                <option>India</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Save + Feedback ── */}
                            {saveError && (
                                <div className="account-save-error">{saveError}</div>
                            )}

                            <div className="account-actions">
                                <button className="btn-save" onClick={handleSave} disabled={saving}>
                                    {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
                                </button>
                            </div>

                            <div className="account-logout-section">
                                <button className="btn-logout" onClick={handleLogout}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                        <polyline points="16 17 21 12 16 7" />
                                        <line x1="21" y1="12" x2="9" y2="12" />
                                    </svg>
                                    Logout
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'orders' && (
                        <div className="account-orders-panel">
                            <h1>Your Orders</h1>
                            <p className="account-info-sub">Track and manage your purchases</p>

                            {ordersLoading ? (
                                <div className="account-orders-empty">
                                    <p className="empty-desc">Loading your orders…</p>
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="account-orders-empty">
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                                        <line x1="3" y1="6" x2="21" y2="6" />
                                        <path d="M16 10a4 4 0 0 1-8 0" />
                                    </svg>
                                    <p className="empty-title">No Orders Yet</p>
                                    <p className="empty-desc">You have not placed any orders yet.</p>
                                    <button className="btn-shop" onClick={() => navigate('/')}>
                                        Start Shopping
                                    </button>
                                </div>
                            ) : (
                                <div className="account-orders-list">
                                    {orders.map((order) => {
                                        const sc = STATUS_COLORS[order.orderStatus] || STATUS_COLORS.Pending;
                                        const firstItem = order.items?.[0];
                                        const extraCount = (order.items?.length || 1) - 1;
                                        return (
                                            <div key={order._id} className="account-order-card">
                                                <div className="account-order-row">
                                                    {/* Left: Product thumbnail */}
                                                    <div className="account-order-thumb-wrap">
                                                        <div className="account-order-thumb">
                                                            {firstItem?.image ? (
                                                                <img src={firstItem.image} alt={firstItem.name || 'Product'} />
                                                            ) : (
                                                                <span className="account-order-thumb-placeholder">📦</span>
                                                            )}
                                                        </div>
                                                        {extraCount > 0 && (
                                                            <p className="account-order-more">+{extraCount} more</p>
                                                        )}
                                                    </div>

                                                    {/* Middle: Order info */}
                                                    <div className="account-order-info">
                                                        <p className="account-order-id">{order.orderId}</p>
                                                        <p className="account-order-date">
                                                            {new Date(order.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                                        </p>
                                                        <p className="account-order-total">{formatPrice(order.totalAmount)}</p>
                                                    </div>

                                                    {/* Right: Status + Action */}
                                                    <div className="account-order-actions">
                                                        <span className="account-order-badge" style={{ backgroundColor: sc.bg, color: sc.color }}>
                                                            {order.orderStatus}
                                                        </span>
                                                        <button className="account-order-view-btn" onClick={() => navigate(`/account/orders/${order._id}`)}>
                                                            View Details
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>
            <Footer />
        </div>
    );
};

export default AccountPage;
