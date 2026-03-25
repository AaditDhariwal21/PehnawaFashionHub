import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import formatPrice from '../utils/formatPrice';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const categories = ['Anarkalis', 'Coord Sets', 'Lehangas', 'Indo Western', 'Suits & Kurtis', 'Sarees', 'Blouses', 'Kidswear', "Men's Kurta", 'Dupattas', 'Pashminas'];
const specialTags = ['', 'New Arrival', 'Best Seller', 'Sale', 'Trending'];

/* ───────────────────────────── Edit Modal ───────────────────────────── */
const ProductEditModal = ({ product, onClose, onSaved, onDeleted }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: '',
        stock: '',
        specialTag: '',
        weight: '',
        isCategoryCover: false,
    });
    const [existingImages, setExistingImages] = useState([]);
    const [newFiles, setNewFiles] = useState([]);
    const [newPreviews, setNewPreviews] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (product) {
            // Determine if this product is the active cover for its category
            const initForm = async () => {
                let isActiveCover = product.isCategoryCover || false;

                // If not explicitly marked, check if this product is the fallback cover
                if (!isActiveCover && product.category) {
                    try {
                        const res = await fetch(`${API_BASE_URL}/products/categories/covers`);
                        const data = await res.json();
                        if (data.success && data.covers[product.category]) {
                            const coverId = data.covers[product.category].productId;
                            if (coverId === product._id) {
                                isActiveCover = true;
                            }
                        }
                    } catch (err) {
                        // Silently fall back to the stored value
                    }
                }

                setFormData({
                    name: product.name || '',
                    description: product.description || '',
                    price: product.price ?? '',
                    category: product.category || '',
                    stock: product.stock ?? '',
                    specialTag: product.specialTag || '',
                    weight: product.weight ?? '',
                    isCategoryCover: isActiveCover,
                });
            };

            initForm();
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
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    /* ---- Image handling ---- */
    const removeExistingImage = (index) => {
        setExistingImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleNewImages = (e) => {
        const files = Array.from(e.target.files);
        setNewFiles((prev) => [...prev, ...files]);
        setNewPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    };

    const removeNewImage = (index) => {
        setNewFiles((prev) => prev.filter((_, i) => i !== index));
        setNewPreviews((prev) => {
            URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    /* ---- Upload new files then save ---- */
    const handleSave = async () => {
        setError('');
        setIsLoading(true);
        try {
            let uploadedImages = [];

            // Upload new files if any
            if (newFiles.length > 0) {
                const fd = new FormData();
                newFiles.forEach((f) => fd.append('images', f));

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
                // Map the response to match schema { url, publicId }
                uploadedImages = uploadData.images.map((img) => ({
                    url: img.url,
                    publicId: img.public_id,
                }));
            }

            // Merge images
            const finalImages = [...existingImages, ...uploadedImages];

            const body = {
                name: formData.name,
                description: formData.description,
                price: Number(formData.price),
                category: formData.category,
                stock: Number(formData.stock) || 0,
                weight: Number(formData.weight) || 0,
                specialTag: formData.specialTag || null,
                isCategoryCover: formData.isCategoryCover,
                images: finalImages,
            };

            const res = await fetch(`${API_BASE_URL}/products/${product._id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
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

    /* ---- Delete ---- */
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

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    // Shared styles (matches ProductUploadModal)
    const inputStyles =
        'w-full text-sm border border-gray-200 rounded-md text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all';
    const inputPadding = { padding: '12px 14px' };
    const labelStyles = 'block text-xs font-medium text-gray-600 mb-1.5';

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
            }}
            onClick={handleBackdropClick}
        >
            <div
                className="relative w-full max-h-[90vh] overflow-hidden flex flex-col"
                style={{
                    maxWidth: 'min(900px, 95vw)',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.15)',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between shrink-0"
                    style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB' }}
                >
                    <h2 className="text-lg font-semibold text-gray-900">Edit Product</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body – Scrollable */}
                <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                            <p className="text-red-600 text-sm">{error}</p>
                        </div>
                    )}

                    <div className="space-y-4">
                        {/* Product Name */}
                        <div>
                            <label className={labelStyles}>
                                Product Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleInputChange}
                                placeholder="Enter product name"
                                className={inputStyles}
                                style={inputPadding}
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className={labelStyles}>
                                Description <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleInputChange}
                                placeholder="Enter product description"
                                rows={3}
                                className={`${inputStyles} resize-none`}
                                style={inputPadding}
                            />
                        </div>

                        {/* Price & Stock */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelStyles}>
                                    Price ($) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    name="price"
                                    value={formData.price}
                                    onChange={handleInputChange}
                                    placeholder="0"
                                    min="0"
                                    className={inputStyles}
                                    style={inputPadding}
                                />
                            </div>
                            <div>
                                <label className={labelStyles}>Stock</label>
                                <input
                                    type="number"
                                    name="stock"
                                    value={formData.stock}
                                    onChange={handleInputChange}
                                    placeholder="0"
                                    min="0"
                                    className={inputStyles}
                                    style={inputPadding}
                                />
                            </div>
                        </div>

                        {/* Category & Special Tag */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className={labelStyles}>
                                    Category <span className="text-red-500">*</span>
                                </label>
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleInputChange}
                                    className={`${inputStyles} cursor-pointer`}
                                    style={inputPadding}
                                >
                                    <option value="">Select category</option>
                                    {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                            {cat}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={labelStyles}>Special Tag</label>
                                <select
                                    name="specialTag"
                                    value={formData.specialTag}
                                    onChange={handleInputChange}
                                    className={`${inputStyles} cursor-pointer`}
                                    style={inputPadding}
                                >
                                    <option value="">None</option>
                                    {specialTags
                                        .filter((t) => t)
                                        .map((tag) => (
                                            <option key={tag} value={tag}>
                                                {tag}
                                            </option>
                                        ))}
                                </select>
                            </div>
                        </div>

                        {/* Category Cover Settings */}
                        {formData.category && (
                            <div
                                style={{
                                    marginTop: '8px',
                                    padding: '12px 14px',
                                    backgroundColor: '#FFFBEB',
                                    border: '1px solid #FDE68A',
                                    borderRadius: '8px',
                                }}
                            >
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2" style={{ letterSpacing: '0.08em' }}>
                                    Category Cover Settings
                                </p>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.isCategoryCover}
                                        onChange={(e) => setFormData(prev => ({ ...prev, isCategoryCover: e.target.checked }))}
                                        className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-amber-500"
                                    />
                                    <span className="text-sm text-gray-700">
                                        Use this product image as the category cover
                                    </span>
                                </label>
                            </div>
                        )}

                        {/* Shipping Information */}
                        <div style={{ marginTop: '8px' }}>
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.08em' }}>
                                Shipping Information
                            </p>
                            <div>
                                <label className={labelStyles}>
                                    Weight (lbs) <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    name="weight"
                                    value={formData.weight}
                                    onChange={handleInputChange}
                                    placeholder="e.g. 0.66 for a kurti, 1.32 for a saree"
                                    min="0.01"
                                    step="0.01"
                                    className={inputStyles}
                                    style={inputPadding}
                                />
                            </div>
                        </div>

                        {/* ── Images ── */}
                        <div style={{ marginTop: '8px' }}>
                            <label className={labelStyles}>Product Images</label>

                            {/* Existing images */}
                            {existingImages.length > 0 && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {existingImages.map((img, idx) => (
                                        <div key={idx} className="relative">
                                            <img
                                                src={img.url}
                                                alt={`Existing ${idx + 1}`}
                                                className="w-16 h-16 object-cover rounded-md border border-gray-200"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => removeExistingImage(idx)}
                                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 cursor-pointer"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Upload area */}
                            <div
                                className="border border-dashed border-gray-300 rounded-lg text-center hover:border-amber-400 transition-colors cursor-pointer bg-gray-50 hover:bg-amber-50"
                                style={{ padding: '24px 16px' }}
                                onClick={() => document.getElementById('edit-image-upload').click()}
                            >
                                <input
                                    id="edit-image-upload"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={handleNewImages}
                                    className="hidden"
                                />
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={1.5}
                                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                    />
                                </svg>
                                <p className="text-sm text-gray-600">Click to upload new images</p>
                                <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG up to 10MB each</p>
                            </div>

                            {/* New image previews */}
                            {newPreviews.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-3">
                                    {newPreviews.map((preview, idx) => (
                                        <div key={idx} className="relative">
                                            <img src={preview} alt={`New ${idx + 1}`} className="w-16 h-16 object-cover rounded-md border border-gray-200" />
                                            <button
                                                type="button"
                                                onClick={() => removeNewImage(idx)}
                                                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 cursor-pointer"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div
                    className="shrink-0 flex items-center gap-3"
                    style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB' }}
                >
                    {/* Delete button – left */}
                    <button
                        type="button"
                        onClick={handleDelete}
                        disabled={isLoading}
                        className="px-4 text-sm font-medium rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        style={{ height: '46px' }}
                    >
                        Delete
                    </button>

                    <div className="flex-1" />

                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                        style={{ height: '46px', minWidth: '100px' }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isLoading}
                        className={`px-5 text-sm font-semibold text-white rounded-md transition-all cursor-pointer ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`}
                        style={{ backgroundColor: '#EFBF04', height: '46px', minWidth: '130px' }}
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Saving…
                            </span>
                        ) : (
                            'Save Changes'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ───────────────────────── Admin Manage Products Page ───────────────────────── */
const AdminManageProducts = () => {
    const [user, setUser] = useState(null);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editProduct, setEditProduct] = useState(null);
    const navigate = useNavigate();

    /* Auth guard */
    useEffect(() => {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        if (!token || !storedUser) { navigate('/signin'); return; }
        const parsed = JSON.parse(storedUser);
        if (parsed.role !== 'admin') { navigate('/'); return; }
        setUser(parsed);
    }, [navigate]);

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
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/');
    };

    /* Modal callbacks */
    const handleSaved = (updatedProduct) => {
        setProducts((prev) => prev.map((p) => (p._id === updatedProduct._id ? updatedProduct : p)));
        setEditProduct(null);
    };

    const handleDeleted = (id) => {
        setProducts((prev) => prev.filter((p) => p._id !== id));
        setEditProduct(null);
    };

    if (!user) {
        return (
            <div className="w-full h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }} />
            </div>
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5' }}>
            {/* ── Header (matches AdminDashboard) ── */}
            <header
                className="sticky top-0 z-40 w-full"
                style={{
                    backgroundColor: '#FFFFFF',
                    borderBottom: '2px solid #FAD76C',
                    boxShadow: '0 4px 20px rgba(250, 215, 108, 0.3)',
                }}
            >
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
                        <button
                            onClick={() => navigate('/adminDashboard')}
                            className="text-sm font-medium cursor-pointer rounded-md"
                            style={{ padding: '10px 16px', border: '1.5px solid #e5e7eb', color: '#6b7280', backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => { e.target.style.borderColor = '#EFBF04'; e.target.style.color = '#EFBF04'; }}
                            onMouseLeave={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.color = '#6b7280'; }}
                        >
                            ← Dashboard
                        </button>
                        <button
                            onClick={handleLogout}
                            className="text-sm font-medium transition-all cursor-pointer rounded-md"
                            style={{ padding: '10px 16px', border: '1.5px solid #EFBF04', color: '#EFBF04', backgroundColor: 'transparent' }}
                            onMouseEnter={(e) => { e.target.style.backgroundColor = '#EFBF04'; e.target.style.color = '#FFFFFF'; }}
                            onMouseLeave={(e) => { e.target.style.backgroundColor = 'transparent'; e.target.style.color = '#EFBF04'; }}
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </header>

            {/* ── Main ── */}
            <main style={{ padding: '2.5rem 3rem' }}>
                {/* Title row */}
                <h2 className="text-2xl font-bold text-gray-900 mb-1">
                    Manage <span style={{ color: '#EFBF04' }}>Products</span>
                </h2>
                <p className="text-sm text-gray-500 mb-6">{products.length} product{products.length !== 1 && 's'} in your catalog.</p>

                {/* ── Product list ── */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2" style={{ borderColor: '#EFBF04' }} />
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-gray-400 text-lg">No products found.</p>
                    </div>
                ) : (
                    <div
                        className="rounded-xl overflow-hidden"
                        style={{
                            backgroundColor: '#FFFFFF',
                            border: '2px solid #FAD76C',
                            boxShadow: '0 2px 12px rgba(250,215,108,0.15)',
                        }}
                    >
                        {/* Table header – hidden on mobile */}
                        <div
                            className="hidden md:grid text-xs font-semibold text-gray-400 uppercase tracking-wider"
                            style={{
                                gridTemplateColumns: '56px 1fr 140px 100px 80px 100px',
                                padding: '12px 20px',
                                borderBottom: '1px solid #F3F4F6',
                            }}
                        >
                            <span />
                            <span>Product</span>
                            <span>Category</span>
                            <span className="text-right">Price</span>
                            <span className="text-center">Stock</span>
                            <span className="text-center">Status</span>
                        </div>

                        {products.map((product, index) => {
                            const thumb = product.images?.[0]?.url;
                            const inStock = product.stock > 0;
                            return (
                                <div
                                    key={product._id}
                                    className="flex flex-col md:grid items-center cursor-pointer transition-colors hover:bg-amber-50/40"
                                    style={{
                                        gridTemplateColumns: '56px 1fr 140px 100px 80px 100px',
                                        padding: '10px 20px',
                                        minHeight: '68px',
                                        borderBottom: index < products.length - 1 ? '1px solid #F3F4F6' : 'none',
                                    }}
                                    onClick={() => setEditProduct(product)}
                                >
                                    {/* Thumbnail */}
                                    <div className="w-11 h-11 rounded-md overflow-hidden bg-gray-100 shrink-0 flex items-center justify-center">
                                        {thumb ? (
                                            <img src={thumb} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        )}
                                    </div>

                                    {/* Name (mobile: full-width row) */}
                                    <p className="text-sm font-medium text-gray-900 truncate md:pl-0 mt-2 md:mt-0">{product.name}</p>

                                    {/* Category */}
                                    <span className="text-xs text-gray-500 md:text-sm">{product.category}</span>

                                    {/* Price */}
                                    <span className="text-sm font-semibold text-gray-800 md:text-right">{formatPrice(product.price)}</span>

                                    {/* Stock */}
                                    <span className="text-sm text-gray-600 md:text-center">{product.stock}</span>

                                    {/* Status badge */}
                                    <div className="md:flex md:justify-center">
                                        <span
                                            className="inline-block text-xs font-medium rounded-full"
                                            style={{
                                                padding: '3px 10px',
                                                backgroundColor: inStock ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                                color: inStock ? '#16a34a' : '#dc2626',
                                            }}
                                        >
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
