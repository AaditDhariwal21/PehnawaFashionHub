import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import formatPrice from '../utils/formatPrice';
import { GENDERS, CATEGORIES_BY_GENDER } from '../utils/productCategories.js';

const API = import.meta.env.VITE_API_URL;

/** Datetime-local inputs need `YYYY-MM-DDTHH:mm` in local time. */
const toLocalInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const BLANK_FORM = {
    code: '',
    description: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    maxDiscountAmount: '',
    minOrderValue: '',
    validFrom: '',
    validTill: '',
    totalUsageLimit: '',
    perUserUsageLimit: '1',
    genders: [],
    categories: [],
    firstOrderOnly: false,
    isActive: true,
};

const AdminPromoCodesPage = () => {
    const [user, setUser] = useState(null);
    const [promoCodes, setPromoCodes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');
    const [notice, setNotice] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(BLANK_FORM);
    const [redemptions, setRedemptions] = useState({ id: null, rows: [] });
    const navigate = useNavigate();

    const load = useCallback(async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API}/adminDashboard/promocodes`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) setPromoCodes(data.promoCodes);
        } catch (err) {
            console.error('Promo code fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const stored = localStorage.getItem('user');
        if (!token || !stored) { navigate('/signin'); return; }
        const parsed = JSON.parse(stored);
        if (parsed.role !== 'admin') { navigate('/'); return; }
        setUser(parsed);
        load();
    }, [navigate, load]);

    const flash = (message) => {
        setNotice(message);
        setTimeout(() => setNotice(''), 4000);
    };

    const resetForm = () => {
        setForm(BLANK_FORM);
        setEditingId(null);
        setFormError('');
    };

    const startEdit = (promo) => {
        setEditingId(promo._id);
        setFormError('');
        setForm({
            code: promo.code,
            description: promo.description || '',
            discountType: promo.discountType,
            discountValue: String(promo.discountValue),
            maxDiscountAmount: promo.maxDiscountAmount ?? '',
            minOrderValue: promo.minOrderValue ?? '',
            validFrom: toLocalInput(promo.validFrom),
            validTill: toLocalInput(promo.validTill),
            totalUsageLimit: promo.totalUsageLimit ?? '',
            perUserUsageLimit: String(promo.perUserUsageLimit),
            genders: promo.genders || [],
            categories: promo.categories || [],
            firstOrderOnly: !!promo.firstOrderOnly,
            isActive: !!promo.isActive,
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if (formError) setFormError('');
    };

    const toggleGender = (gender) => {
        setForm((prev) => ({
            ...prev,
            genders: prev.genders.includes(gender)
                ? prev.genders.filter((g) => g !== gender)
                : [...prev.genders, gender],
        }));
    };

    const toggleCategory = (category) => {
        setForm((prev) => ({
            ...prev,
            categories: prev.categories.includes(category)
                ? prev.categories.filter((c) => c !== category)
                : [...prev.categories, category],
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFormError('');

        const token = localStorage.getItem('token');
        const payload = {
            ...form,
            /* Blank means "no limit"/"no cap" — send null so the backend stores
               it as unlimited rather than coercing an empty string to 0. */
            maxDiscountAmount: form.discountType === 'FLAT' || form.maxDiscountAmount === ''
                ? null
                : form.maxDiscountAmount,
            minOrderValue: form.minOrderValue === '' ? 0 : form.minOrderValue,
            totalUsageLimit: form.totalUsageLimit === '' ? null : form.totalUsageLimit,
        };

        try {
            const res = await fetch(
                editingId
                    ? `${API}/adminDashboard/promocodes/${editingId}`
                    : `${API}/adminDashboard/promocodes`,
                {
                    method: editingId ? 'PUT' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(payload),
                }
            );
            const data = await res.json();

            if (data.success) {
                flash(editingId ? `Updated ${data.promoCode.code}.` : `Created ${data.promoCode.code}.`);
                resetForm();
                load();
            } else {
                setFormError(data.message || 'Could not save the promo code.');
            }
        } catch (err) {
            console.error('Promo code save error:', err);
            setFormError('Something went wrong. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (promo) => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API}/adminDashboard/promocodes/${promo._id}/active`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ isActive: !promo.isActive }),
            });
            const data = await res.json();
            if (data.success) {
                flash(`${data.promoCode.code} is now ${data.promoCode.isActive ? 'active' : 'inactive'}.`);
                load();
            } else {
                flash(data.message || 'Could not update the promo code.');
            }
        } catch (err) {
            console.error('Promo code toggle error:', err);
        }
    };

    const viewRedemptions = async (promo) => {
        if (redemptions.id === promo._id) {
            setRedemptions({ id: null, rows: [] });
            return;
        }
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API}/adminDashboard/promocodes/${promo._id}/redemptions`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (data.success) setRedemptions({ id: promo._id, rows: data.redemptions });
        } catch (err) {
            console.error('Redemption fetch error:', err);
        }
    };

    if (!user) {
        return (
            <div className="w-full h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }}></div>
            </div>
        );
    }

    const fieldStyle = {
        width: '100%',
        padding: '0.6rem 0.7rem',
        fontSize: '0.88rem',
        color: '#111827',
        backgroundColor: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '0.45rem',
        outline: 'none',
        fontFamily: 'inherit',
    };

    const labelStyle = {
        display: 'block',
        fontSize: '0.78rem',
        fontWeight: 600,
        color: '#374151',
        marginBottom: '0.3rem',
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
            {/* ── Header (matches AdminDashboard / AdminOrdersPage) ── */}
            <header
                className="sticky top-0 z-40 w-full"
                style={{ backgroundColor: '#FFFFFF', borderBottom: '2px solid #FAD76C', boxShadow: '0 4px 20px rgba(250,215,108,0.3)' }}
            >
                <div className="w-full flex items-center justify-between gap-3 px-4 py-3.5 md:px-10 md:py-5">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: '#EFBF04' }}>
                            <span className="font-serif text-xl italic" style={{ color: '#EFBF04' }}>P</span>
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-lg md:text-xl font-bold text-gray-900 truncate">Promo Codes</h1>
                            <p className="text-sm text-gray-500">Pehnawa</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/adminDashboard')}
                        className="text-sm font-medium transition-all cursor-pointer rounded-md shrink-0"
                        style={{ padding: '10px 16px', border: '1.5px solid #EFBF04', color: '#EFBF04', backgroundColor: 'transparent' }}
                    >
                        Back to Dashboard
                    </button>
                </div>
            </header>

            <main className="px-4 py-6 md:px-12 md:py-10">
                {notice && (
                    <div
                        className="mb-6 p-4 rounded-lg"
                        style={{ backgroundColor: 'rgba(239, 191, 4, 0.1)', border: '1px solid #EFBF04' }}
                    >
                        <p className="text-gray-800 text-sm">{notice}</p>
                    </div>
                )}

                {/* ══════ Create / edit form ══════ */}
                <form
                    onSubmit={handleSubmit}
                    className="rounded-xl mb-8"
                    style={{ backgroundColor: '#fff', border: '2px solid #FAD76C', padding: '1.5rem' }}
                >
                    <h2 className="text-lg font-bold text-gray-900 mb-4">
                        {editingId ? 'Edit promo code' : 'Create a promo code'}
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label style={labelStyle} htmlFor="code">Code *</label>
                            <input
                                id="code" name="code" value={form.code} onChange={handleChange}
                                placeholder="SUMMER20" style={{ ...fieldStyle, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}
                                autoComplete="off"
                            />
                        </div>
                        <div>
                            <label style={labelStyle} htmlFor="discountType">Type *</label>
                            <select id="discountType" name="discountType" value={form.discountType} onChange={handleChange} style={fieldStyle}>
                                <option value="PERCENTAGE">Percentage (%)</option>
                                <option value="FLAT">Flat amount ($)</option>
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle} htmlFor="discountValue">
                                {form.discountType === 'PERCENTAGE' ? 'Percent off *' : 'Dollars off *'}
                            </label>
                            <input
                                id="discountValue" name="discountValue" type="number" min="0" step="0.01"
                                value={form.discountValue} onChange={handleChange}
                                placeholder={form.discountType === 'PERCENTAGE' ? '20' : '15.00'} style={fieldStyle}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                            <label style={labelStyle} htmlFor="maxDiscountAmount">
                                Max discount cap
                                {form.discountType === 'FLAT' && (
                                    <span className="font-normal text-gray-400"> — n/a for flat codes</span>
                                )}
                            </label>
                            <input
                                id="maxDiscountAmount" name="maxDiscountAmount" type="number" min="0" step="0.01"
                                value={form.discountType === 'FLAT' ? '' : form.maxDiscountAmount}
                                onChange={handleChange}
                                disabled={form.discountType === 'FLAT'}
                                placeholder="No cap" style={fieldStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle} htmlFor="minOrderValue">Minimum order value</label>
                            <input
                                id="minOrderValue" name="minOrderValue" type="number" min="0" step="0.01"
                                value={form.minOrderValue} onChange={handleChange} placeholder="0" style={fieldStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle} htmlFor="description">Internal note</label>
                            <input
                                id="description" name="description" value={form.description} onChange={handleChange}
                                placeholder="Diwali campaign" style={fieldStyle}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <label style={labelStyle} htmlFor="validFrom">Valid from *</label>
                            <input
                                id="validFrom" name="validFrom" type="datetime-local"
                                value={form.validFrom} onChange={handleChange} style={fieldStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle} htmlFor="validTill">Valid till *</label>
                            <input
                                id="validTill" name="validTill" type="datetime-local"
                                value={form.validTill} onChange={handleChange} style={fieldStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle} htmlFor="totalUsageLimit">Total uses</label>
                            <input
                                id="totalUsageLimit" name="totalUsageLimit" type="number" min="1" step="1"
                                value={form.totalUsageLimit} onChange={handleChange} placeholder="Unlimited" style={fieldStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle} htmlFor="perUserUsageLimit">Uses per customer *</label>
                            <input
                                id="perUserUsageLimit" name="perUserUsageLimit" type="number" min="1" step="1"
                                value={form.perUserUsageLimit} onChange={handleChange} style={fieldStyle}
                            />
                        </div>
                    </div>

                    {/* Gender scope — supports whole-demographic coupons like
                        "20% off all Women's", which the old flat taxonomy could
                        not express because gender lived inside the category
                        string. Scopes widen: an item qualifies if it matches the
                        gender OR the category OR the product list. */}
                    <div className="mb-4">
                        <span style={labelStyle}>
                            Limit to genders
                            <span className="font-normal text-gray-400"> — e.g. 20% off all Women&apos;s</span>
                        </span>
                        <div className="flex flex-wrap gap-4 mt-1">
                            {GENDERS.map((gender) => (
                                <label key={gender} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.genders.includes(gender)}
                                        onChange={() => toggleGender(gender)}
                                        style={{ accentColor: '#EFBF04' }}
                                    />
                                    {gender}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="mb-4">
                        <span style={labelStyle}>
                            Limit to categories
                            <span className="font-normal text-gray-400"> — leave every scope unchecked to apply to the whole cart</span>
                        </span>
                        <div className="flex flex-col gap-2 mt-1">
                            {GENDERS.map((gender) => (
                                <div key={gender} className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs font-semibold text-gray-500 w-14 shrink-0">{gender}</span>
                                    {CATEGORIES_BY_GENDER[gender].map((category) => (
                                        <label key={category} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={form.categories.includes(category)}
                                                onChange={() => toggleCategory(category)}
                                                style={{ accentColor: '#EFBF04' }}
                                            />
                                            {category}
                                        </label>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-5 mb-4">
                        <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                            <input
                                type="checkbox" name="firstOrderOnly" checked={form.firstOrderOnly}
                                onChange={handleChange} style={{ accentColor: '#EFBF04' }}
                            />
                            First order only
                        </label>
                        <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                            <input
                                type="checkbox" name="isActive" checked={form.isActive}
                                onChange={handleChange} style={{ accentColor: '#EFBF04' }}
                            />
                            Active
                        </label>
                    </div>

                    {formError && (
                        <p className="text-sm mb-4" style={{ color: '#ef4444' }}>{formError}</p>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="submit" disabled={saving}
                            className="text-sm font-bold rounded-md cursor-pointer"
                            style={{
                                padding: '10px 22px',
                                border: 'none',
                                color: '#fff',
                                background: saving ? '#d1d5db' : 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                            }}
                        >
                            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create code'}
                        </button>
                        {editingId && (
                            <button
                                type="button" onClick={resetForm}
                                className="text-sm font-medium rounded-md cursor-pointer"
                                style={{ padding: '10px 18px', border: '1.5px solid #d1d5db', color: '#6b7280', backgroundColor: 'transparent' }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>

                {/* ══════ Existing codes ══════ */}
                {loading ? (
                    <div className="flex justify-center py-10">
                        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }}></div>
                    </div>
                ) : promoCodes.length === 0 ? (
                    <p className="text-sm text-gray-500">No promo codes yet.</p>
                ) : (
                    <div className="flex flex-col gap-3">
                        {promoCodes.map((promo) => {
                            const now = new Date();
                            const expired = new Date(promo.validTill) < now;
                            const pending = new Date(promo.validFrom) > now;
                            const exhausted =
                                promo.totalUsageLimit !== null && promo.usedCount >= promo.totalUsageLimit;

                            /* Live = actually redeemable right now. The date window and
                               the kill-switch are independent, so a code can be
                               "Inactive" while still inside its window. */
                            const badge = !promo.isActive
                                ? { label: 'Inactive', bg: '#f3f4f6', color: '#6b7280' }
                                : exhausted
                                    ? { label: 'Fully claimed', bg: '#fee2e2', color: '#991b1b' }
                                    : expired
                                        ? { label: 'Expired', bg: '#fee2e2', color: '#991b1b' }
                                        : pending
                                            ? { label: 'Scheduled', bg: '#dbeafe', color: '#1e40af' }
                                            : { label: 'Live', bg: '#d1fae5', color: '#065f46' };

                            return (
                                <div
                                    key={promo._id}
                                    className="rounded-xl"
                                    style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', padding: '1.1rem 1.25rem' }}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                <span className="font-bold text-gray-900" style={{ letterSpacing: '0.06em' }}>
                                                    {promo.code}
                                                </span>
                                                <span
                                                    className="text-xs font-bold rounded-full"
                                                    style={{ padding: '3px 9px', backgroundColor: badge.bg, color: badge.color }}
                                                >
                                                    {badge.label}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600 mt-1">
                                                {promo.discountType === 'PERCENTAGE'
                                                    ? `${promo.discountValue}% off`
                                                    : `${formatPrice(promo.discountValue)} off`}
                                                {promo.maxDiscountAmount != null && ` (max ${formatPrice(promo.maxDiscountAmount)})`}
                                                {promo.minOrderValue > 0 && ` · min order ${formatPrice(promo.minOrderValue)}`}
                                                {promo.genders?.length > 0 && ` · ${promo.genders.join('/')} only`}
                                                {promo.categories?.length > 0 && ` · ${promo.categories.join('/')} only`}
                                                {promo.firstOrderOnly && ' · first order only'}
                                            </p>
                                            <p className="text-xs text-gray-400 mt-1">
                                                {new Date(promo.validFrom).toLocaleDateString()} – {new Date(promo.validTill).toLocaleDateString()}
                                                {' · '}
                                                used {promo.usedCount}
                                                {promo.totalUsageLimit === null ? ' (unlimited)' : ` / ${promo.totalUsageLimit}`}
                                                {' · '}
                                                {promo.perUserUsageLimit} per customer
                                            </p>
                                        </div>

                                        <div className="flex gap-2 shrink-0">
                                            <button
                                                onClick={() => viewRedemptions(promo)}
                                                className="text-xs font-semibold rounded-md cursor-pointer"
                                                style={{ padding: '7px 12px', border: '1px solid #e5e7eb', color: '#6b7280', backgroundColor: 'transparent' }}
                                            >
                                                {redemptions.id === promo._id ? 'Hide uses' : 'View uses'}
                                            </button>
                                            <button
                                                onClick={() => startEdit(promo)}
                                                className="text-xs font-semibold rounded-md cursor-pointer"
                                                style={{ padding: '7px 12px', border: '1px solid #111827', color: '#111827', backgroundColor: 'transparent' }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => toggleActive(promo)}
                                                className="text-xs font-semibold rounded-md cursor-pointer"
                                                style={{
                                                    padding: '7px 12px',
                                                    border: `1px solid ${promo.isActive ? '#ef4444' : '#10b981'}`,
                                                    color: promo.isActive ? '#ef4444' : '#059669',
                                                    backgroundColor: 'transparent',
                                                }}
                                            >
                                                {promo.isActive ? 'Deactivate' : 'Activate'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Audit trail */}
                                    {redemptions.id === promo._id && (
                                        <div className="mt-3 pt-3" style={{ borderTop: '1px solid #f3f4f6' }}>
                                            {redemptions.rows.length === 0 ? (
                                                <p className="text-xs text-gray-400">No redemptions yet.</p>
                                            ) : (
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-xs" style={{ minWidth: '520px' }}>
                                                        <thead>
                                                            <tr className="text-gray-500 text-left">
                                                                <th className="pb-1.5 pr-3 font-semibold">Customer</th>
                                                                <th className="pb-1.5 pr-3 font-semibold">Status</th>
                                                                <th className="pb-1.5 pr-3 font-semibold">Discount</th>
                                                                <th className="pb-1.5 pr-3 font-semibold">Order</th>
                                                                <th className="pb-1.5 font-semibold">When</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {redemptions.rows.map((r) => (
                                                                <tr key={r._id} style={{ borderTop: '1px solid #f9fafb' }}>
                                                                    <td className="py-1.5 pr-3 text-gray-700">
                                                                        {r.user?.email || '—'}
                                                                    </td>
                                                                    <td className="py-1.5 pr-3 text-gray-500">{r.status}</td>
                                                                    <td className="py-1.5 pr-3 text-gray-700">{formatPrice(r.discountAmount)}</td>
                                                                    <td className="py-1.5 pr-3 text-gray-500">{r.order?.orderId || '—'}</td>
                                                                    <td className="py-1.5 text-gray-400">
                                                                        {new Date(r.createdAt).toLocaleString()}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminPromoCodesPage;
