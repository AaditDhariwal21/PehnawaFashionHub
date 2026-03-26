import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import formatPrice from '../utils/formatPrice';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const PRESET_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const categories = ['Anarkalis', 'Coord Sets', 'Lehangas', 'Indo Western', 'Suits & Kurtis', 'Sarees', 'Blouses', 'Kidswear', "Men's Kurta", 'Dupattas', 'Pashminas'];
const specialTags = ['', 'New Arrival', 'Best Seller', 'Sale', 'Trending'];

/* ═══════════════════════════════ Edit Modal ═══════════════════════════════ */
const ProductEditModal = ({ product, onClose, onSaved, onDeleted }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: '',
        specialTag: '',
        weight: '',
        isCategoryCover: false,
    });
    const [sizes, setSizes] = useState([]);
    const [customSize, setCustomSize] = useState('');
    const [existingImages, setExistingImages] = useState([]);
    const [newFiles, setNewFiles] = useState([]);
    const [newPreviews, setNewPreviews] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const totalStock = sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);

    useEffect(() => {
        if (product) {
            const initForm = async () => {
                let isActiveCover = product.isCategoryCover || false;
                if (!isActiveCover && product.category) {
                    try {
                        const res = await fetch(`${API_BASE_URL}/products/categories/covers`);
                        const data = await res.json();
                        if (data.success && data.covers[product.category]) {
                            if (data.covers[product.category].productId === product._id) {
                                isActiveCover = true;
                            }
                        }
                    } catch { /* silent */ }
                }

                setFormData({
                    name: product.name || '',
                    description: product.description || '',
                    price: product.price ?? '',
                    category: product.category || '',
                    specialTag: product.specialTag || '',
                    weight: product.weight ?? '',
                    isCategoryCover: isActiveCover,
                });
            };

            initForm();
            setSizes(product.sizes && product.sizes.length > 0
                ? product.sizes.map(s => ({ size: s.size, stock: s.stock }))
                : []);
            setExistingImages(product.images || []);
            setNewFiles([]);
            setNewPreviews([]);
            setError('');
        }
    }, [product]);

    if (!product) return null;

    const token = localStorage.getItem('token');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    /* ── Size helpers ── */
    const addSize = (sizeName) => {
        if (!sizeName.trim()) return;
        if (sizes.some(s => s.size === sizeName.trim())) return;
        setSizes(prev => [...prev, { size: sizeName.trim(), stock: 0 }]);
    };
    const removeSize = (index) => setSizes(prev => prev.filter((_, i) => i !== index));
    const updateSizeStock = (index, stock) => {
        const val = Math.max(0, Number(stock) || 0);
        setSizes(prev => prev.map((s, i) => i === index ? { ...s, stock: val } : s));
    };

    /* ── Image helpers ── */
    const removeExistingImage = (index) => setExistingImages(prev => prev.filter((_, i) => i !== index));
    const handleNewImages = (e) => {
        const files = Array.from(e.target.files);
        setNewFiles(prev => [...prev, ...files]);
        setNewPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
    };
    const removeNewImage = (index) => {
        setNewFiles(prev => prev.filter((_, i) => i !== index));
        setNewPreviews(prev => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    /* ── Save ── */
    const handleSave = async () => {
        setError('');
        setIsLoading(true);
        try {
            let uploadedImages = [];
            if (newFiles.length > 0) {
                const fd = new FormData();
                newFiles.forEach(f => fd.append('images', f));
                const uploadRes = await fetch(`${API_BASE_URL}/adminDashboard/upload`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd,
                });
                const uploadData = await uploadRes.json();
                if (!uploadRes.ok) {
                    setError(uploadData.message || 'Image upload failed');
                    setIsLoading(false);
                    return;
                }
                uploadedImages = uploadData.images.map(img => ({ url: img.url, publicId: img.public_id }));
            }

            const body = {
                name: formData.name,
                description: formData.description,
                price: Number(formData.price),
                category: formData.category,
                sizes,
                totalStock,
                weight: Number(formData.weight) || 0,
                specialTag: formData.specialTag || null,
                isCategoryCover: formData.isCategoryCover,
                images: [...existingImages, ...uploadedImages],
            };

            const res = await fetch(`${API_BASE_URL}/products/${product._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.message || 'Failed to update product');
                setIsLoading(false);
                return;
            }
            onSaved(data.product);
        } catch (err) {
            console.error(err);
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    /* ── Delete ── */
    const handleDelete = async () => {
        if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/products/${product._id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                const data = await res.json();
                setError(data.message || 'Failed to delete product');
                setIsLoading(false);
                return;
            }
            onDeleted(product._id);
        } catch (err) {
            console.error(err);
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBackdropClick = (e) => { if (e.target === e.currentTarget) onClose(); };

    const inputStyles = 'w-full text-sm border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all';
    const inputPadding = { padding: '12px 14px' };
    const labelStyles = 'block text-xs font-medium text-gray-500 mb-2';
    const sectionTitle = 'text-sm font-semibold text-gray-700';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
            onClick={handleBackdropClick}
        >
            <div
                className="relative w-full max-h-[90vh] overflow-hidden flex flex-col"
                style={{ maxWidth: 'min(920px,95vw)', backgroundColor: '#FFF', borderRadius: '16px', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)' }}
            >
                {/* ── Header ── */}
                <div className="flex items-center justify-between shrink-0" style={{ padding: '20px 32px', borderBottom: '1px solid #E5E7EB' }}>
                    <h2 className="text-lg font-semibold text-gray-900">Edit Product</h2>
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* ── Body ── */}
                <div className="flex-1 overflow-y-auto" style={{ padding: '28px 32px' }}>
                    {error && <div style={{ marginBottom: '24px', padding: '12px 16px' }} className="bg-red-50 border border-red-200 rounded-lg"><p className="text-red-600 text-sm">{error}</p></div>}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Product Name */}
                        <div>
                            <label className={labelStyles}>Product Name <span className="text-red-400">*</span></label>
                            <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Enter product name" className={inputStyles} style={inputPadding} />
                        </div>

                        {/* Description */}
                        <div>
                            <label className={labelStyles}>Description <span className="text-red-400">*</span></label>
                            <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Enter product description" rows={3} className={`${inputStyles} resize-none`} style={inputPadding} />
                        </div>

                        {/* Price & Weight */}
                        <div className="grid grid-cols-2" style={{ gap: '20px' }}>
                            <div>
                                <label className={labelStyles}>Price ($) <span className="text-red-400">*</span></label>
                                <input type="number" name="price" value={formData.price} onChange={handleInputChange} placeholder="0" min="0" className={inputStyles} style={inputPadding} />
                            </div>
                            <div>
                                <label className={labelStyles}>Weight (lbs) <span className="text-red-400">*</span></label>
                                <input type="number" name="weight" value={formData.weight} onChange={handleInputChange} placeholder="0.66" min="0.01" step="0.01" className={inputStyles} style={inputPadding} />
                            </div>
                        </div>

                        {/* Category & Tag */}
                        <div className="grid grid-cols-2" style={{ gap: '20px' }}>
                            <div>
                                <label className={labelStyles}>Category <span className="text-red-400">*</span></label>
                                <select name="category" value={formData.category} onChange={handleInputChange} className={`${inputStyles} cursor-pointer`} style={inputPadding}>
                                    <option value="">Select category</option>
                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelStyles}>Special Tag</label>
                                <select name="specialTag" value={formData.specialTag} onChange={handleInputChange} className={`${inputStyles} cursor-pointer`} style={inputPadding}>
                                    <option value="">None</option>
                                    {specialTags.filter(t => t).map(tag => <option key={tag} value={tag}>{tag}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* ── Size Inventory ── */}
                        <div style={{ padding: '20px 24px', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '12px' }}>
                            <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
                                <p className={sectionTitle}>Size Inventory</p>
                                <span className="text-xs font-bold rounded-full" style={{ padding: '4px 12px', backgroundColor: totalStock > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)', color: totalStock > 0 ? '#16a34a' : '#dc2626' }}>
                                    Total: {totalStock}
                                </span>
                            </div>

                            {/* Preset sizes */}
                            <div className="flex flex-wrap" style={{ gap: '10px', marginBottom: '16px' }}>
                                {PRESET_SIZES.map(s => {
                                    const added = sizes.some(sz => sz.size === s);
                                    return (
                                        <button key={s} type="button" onClick={() => addSize(s)} disabled={added}
                                            className="text-xs font-semibold rounded-full border-[1.5px] transition-all"
                                            style={{ padding: '6px 16px', borderColor: added ? '#d1d5db' : '#EFBF04', color: added ? '#9ca3af' : '#EFBF04', backgroundColor: added ? '#f3f4f6' : 'transparent', cursor: added ? 'default' : 'pointer' }}>
                                            {added ? `${s} \u2713` : `+ ${s}`}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Custom size */}
                            <div className="flex" style={{ gap: '10px', marginBottom: '16px' }}>
                                <input type="text" value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder="Custom size (e.g. Free Size)" className={`flex-1 ${inputStyles}`} style={{ padding: '10px 14px', fontSize: '0.8rem' }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize(customSize); setCustomSize(''); } }} />
                                <button type="button" onClick={() => { addSize(customSize); setCustomSize(''); }} className="text-xs font-semibold rounded-lg text-white cursor-pointer hover:opacity-90 transition-opacity" style={{ padding: '10px 20px', backgroundColor: '#EFBF04' }}>Add</button>
                            </div>

                            {/* Size rows */}
                            {sizes.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {sizes.map((s, idx) => (
                                        <div key={s.size} className="flex items-center bg-white rounded-lg" style={{ padding: '10px 14px', border: '1px solid #E5E7EB', gap: '12px' }}>
                                            <span className="text-sm font-semibold text-gray-700" style={{ minWidth: '48px' }}>{s.size}</span>
                                            <input type="number" value={s.stock} onChange={(e) => updateSizeStock(idx, e.target.value)} min="0" className="text-sm border border-gray-200 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ padding: '6px 10px', width: '72px' }} />
                                            <span className="text-xs text-gray-400">units</span>
                                            <div className="flex-1" />
                                            <button type="button" onClick={() => removeSize(idx)} className="text-gray-300 hover:text-red-500 transition-colors cursor-pointer">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400 text-center" style={{ padding: '8px 0' }}>No sizes added yet.</p>
                            )}
                        </div>

                        {/* Category Cover */}
                        {formData.category && (
                            <div style={{ padding: '16px 20px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '12px' }}>
                                <p className={sectionTitle} style={{ marginBottom: '12px' }}>Category Cover</p>
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={formData.isCategoryCover} onChange={(e) => setFormData(prev => ({ ...prev, isCategoryCover: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-amber-500" />
                                    <span className="text-sm text-gray-600">Use this product image as the category cover</span>
                                </label>
                            </div>
                        )}

                        {/* Images */}
                        <div>
                            <label className={labelStyles}>Product Images</label>
                            {existingImages.length > 0 && (
                                <div className="flex flex-wrap gap-3" style={{ marginBottom: '16px' }}>
                                    {existingImages.map((img, idx) => (
                                        <div key={idx} className="relative">
                                            <img src={img.url} alt={`Existing ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                                            <button type="button" onClick={() => removeExistingImage(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 cursor-pointer">x</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="border-2 border-dashed border-gray-200 rounded-xl text-center hover:border-amber-400 transition-colors cursor-pointer bg-gray-50/50 hover:bg-amber-50/50" style={{ padding: '28px 20px' }}
                                onClick={() => document.getElementById('edit-image-upload').click()}>
                                <input id="edit-image-upload" type="file" accept="image/*" multiple onChange={handleNewImages} className="hidden" />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                <p className="text-sm text-gray-500 font-medium">Click to upload new images</p>
                                <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG up to 10MB each</p>
                            </div>
                            {newPreviews.length > 0 && (
                                <div className="flex flex-wrap gap-3 mt-4">
                                    {newPreviews.map((preview, idx) => (
                                        <div key={idx} className="relative">
                                            <img src={preview} alt={`New ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                                            <button type="button" onClick={() => removeNewImage(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 cursor-pointer">x</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Footer ── */}
                <div className="shrink-0 flex items-center" style={{ padding: '20px 32px', borderTop: '1px solid #E5E7EB', gap: '12px' }}>
                    <button type="button" onClick={handleDelete} disabled={isLoading} className="px-5 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors cursor-pointer" style={{ height: '48px' }}>Delete</button>
                    <div className="flex-1" />
                    <button type="button" onClick={onClose} className="px-5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" style={{ height: '48px', minWidth: '100px' }}>Cancel</button>
                    <button type="button" onClick={handleSave} disabled={isLoading}
                        className={`px-6 text-sm font-semibold text-white rounded-lg transition-all cursor-pointer ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
                        style={{ backgroundColor: '#EFBF04', height: '48px', minWidth: '130px' }}>
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                Saving...
                            </span>
                        ) : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ═══════════════════════════ Admin Manage Products Page ═══════════════════════════ */
const AdminManageProducts = () => {
    const { user, isLoggedIn, logout } = useAuth();
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editProduct, setEditProduct] = useState(null);
    const navigate = useNavigate();

    /* ── Filters ── */
    const [categoryFilter, setCategoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    /* ── Bulk selection ── */
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    /* Auth guard */
    useEffect(() => {
        if (!isLoggedIn) { navigate('/'); return; }
        if (user?.role !== 'admin') { navigate('/'); return; }
    }, [isLoggedIn, user, navigate]);

    /* Fetch products */
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/products`);
                const data = await res.json();
                if (data.success) setProducts(data.products);
            } catch (err) {
                console.error('Failed to fetch products', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProducts();
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    /* Modal callbacks */
    const handleSaved = (updatedProduct) => {
        setProducts(prev => prev.map(p => p._id === updatedProduct._id ? updatedProduct : p));
        setEditProduct(null);
    };
    const handleDeleted = (id) => {
        setProducts(prev => prev.filter(p => p._id !== id));
        setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
        setEditProduct(null);
    };

    /* ── Filtered products ── */
    const filtered = products.filter(p => {
        if (categoryFilter && p.category !== categoryFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!p.name.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    /* ── Selection helpers ── */
    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
    };
    const toggleSelectAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filtered.map(p => p._id)));
        }
    };

    /* ── Bulk delete ── */
    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Delete ${selectedIds.size} product(s)? This cannot be undone.`)) return;
        setBulkDeleting(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE_URL}/products/bulk`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ productIds: [...selectedIds] }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setProducts(prev => prev.filter(p => !selectedIds.has(p._id)));
                setSelectedIds(new Set());
            }
        } catch (err) {
            console.error('Bulk delete error', err);
        } finally {
            setBulkDeleting(false);
        }
    };

    if (!user || user.role !== 'admin') {
        return (
            <div className="w-full h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }} />
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
            {/* ── Header ── */}
            <header className="sticky top-0 z-40 w-full" style={{ backgroundColor: '#FFFFFF', borderBottom: '2px solid #FAD76C', boxShadow: '0 4px 20px rgba(250,215,108,0.3)' }}>
                <div className="w-full flex items-center justify-between" style={{ padding: '1.25rem 2.5rem' }}>
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full border-2 flex items-center justify-center" style={{ borderColor: '#EFBF04' }}>
                            <span className="font-serif text-xl italic" style={{ color: '#EFBF04' }}>P</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">Manage Products</h1>
                            <p className="text-sm text-gray-500">Pehnawa</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-5">
                        <button onClick={() => navigate('/adminDashboard')} className="text-sm font-medium cursor-pointer rounded-md"
                            style={{ padding: '10px 16px', border: '1.5px solid #e5e7eb', color: '#6b7280', backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => { e.target.style.borderColor = '#EFBF04'; e.target.style.color = '#EFBF04'; }}
                            onMouseLeave={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.color = '#6b7280'; }}>
                            &larr; Dashboard
                        </button>
                        <button onClick={handleLogout} className="text-sm font-medium transition-all cursor-pointer rounded-md"
                            style={{ padding: '10px 16px', border: '1.5px solid #EFBF04', color: '#EFBF04', backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => { e.target.style.backgroundColor = '#EFBF04'; e.target.style.color = '#FFFFFF'; }}
                            onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; e.target.style.color = '#EFBF04'; }}>
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Main ── */}
            <main style={{ padding: '2.5rem 3rem' }}>
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                    Manage <span style={{ color: '#EFBF04' }}>Products</span>
                </h2>
                <p className="text-sm text-gray-500 mb-4">{products.length} product{products.length !== 1 && 's'} in your catalog.</p>

                {/* ── Filters & Bulk Actions Bar ── */}
                <div className="flex flex-wrap items-center gap-3 mb-5">
                    {/* Search */}
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name..."
                        className="text-sm border border-gray-200 rounded-md text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                        style={{ padding: '9px 14px', width: '220px' }}
                    />
                    {/* Category filter */}
                    <select
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="text-sm border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                        style={{ padding: '9px 14px' }}
                    >
                        <option value="">All Categories</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>

                    <div className="flex-1" />

                    {/* Bulk actions */}
                    {selectedIds.size > 0 && (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-gray-500 font-medium">{selectedIds.size} selected</span>
                            <button
                                onClick={handleBulkDelete}
                                disabled={bulkDeleting}
                                className="text-sm font-medium rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                style={{ padding: '8px 16px' }}
                            >
                                {bulkDeleting ? 'Deleting...' : 'Delete Selected'}
                            </button>
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Product list ── */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }} />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-gray-400 text-lg">No products found.</p>
                    </div>
                ) : (
                    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: '#FFFFFF', border: '2px solid #FAD76C', boxShadow: '0 2px 12px rgba(250,215,108,0.15)' }}>
                        {/* Table header */}
                        <div className="hidden md:grid text-xs font-semibold text-gray-400 uppercase tracking-wider"
                            style={{ gridTemplateColumns: '40px 56px 1fr 140px 100px 80px 100px', padding: '12px 20px', borderBottom: '1px solid #F3F4F6' }}>
                            <span className="flex items-center justify-center">
                                <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="w-4 h-4 accent-amber-500 cursor-pointer" />
                            </span>
                            <span />
                            <span>Product</span>
                            <span>Category</span>
                            <span className="text-right">Price</span>
                            <span className="text-center">Stock</span>
                            <span className="text-center">Status</span>
                        </div>

                        {filtered.map((product, index) => {
                            const thumb = product.images?.[0]?.url;
                            const stock = product.totalStock ?? 0;
                            const inStock = stock > 0;
                            const isSelected = selectedIds.has(product._id);
                            const sizeBreakdown = product.sizes && product.sizes.length > 0
                                ? product.sizes.map(s => `${s.size}: ${s.stock}`).join(', ')
                                : null;

                            return (
                                <div
                                    key={product._id}
                                    className="flex flex-col md:grid items-center transition-colors hover:bg-amber-50/40"
                                    style={{
                                        gridTemplateColumns: '40px 56px 1fr 140px 100px 80px 100px',
                                        padding: '10px 20px',
                                        minHeight: '68px',
                                        borderBottom: index < filtered.length - 1 ? '1px solid #F3F4F6' : 'none',
                                        backgroundColor: isSelected ? 'rgba(239,191,4,0.06)' : 'transparent',
                                    }}
                                >
                                    {/* Checkbox */}
                                    <span className="flex items-center justify-center">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleSelect(product._id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-4 h-4 accent-amber-500 cursor-pointer"
                                        />
                                    </span>

                                    {/* Thumbnail */}
                                    <div className="w-11 h-11 rounded-md overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center cursor-pointer" onClick={() => setEditProduct(product)}>
                                        {thumb ? (
                                            <img src={thumb} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        )}
                                    </div>

                                    {/* Name */}
                                    <p className="text-sm font-medium text-gray-900 truncate cursor-pointer mt-2 md:mt-0" onClick={() => setEditProduct(product)}>{product.name}</p>

                                    {/* Category */}
                                    <span className="text-xs text-gray-500 md:text-sm">{product.category}</span>

                                    {/* Price */}
                                    <span className="text-sm font-semibold text-gray-800 md:text-right">{formatPrice(product.price)}</span>

                                    {/* Stock with tooltip */}
                                    <span className="text-sm text-gray-600 md:text-center relative group" title={sizeBreakdown || ''}>
                                        {stock}
                                        {sizeBreakdown && (
                                            <span className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap z-10">
                                                {sizeBreakdown}
                                            </span>
                                        )}
                                    </span>

                                    {/* Status badge */}
                                    <div className="md:flex md:justify-center">
                                        <span className="inline-block text-xs font-medium rounded-full"
                                            style={{ padding: '3px 10px', backgroundColor: inStock ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: inStock ? '#16a34a' : '#dc2626' }}>
                                            {inStock ? 'In Stock' : 'Out of Stock'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Edit Modal */}
            <ProductEditModal
                product={editProduct}
                onClose={() => setEditProduct(null)}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
            />
        </div>
    );
};

export default AdminManageProducts;
