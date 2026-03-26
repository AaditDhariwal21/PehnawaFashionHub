import { useState } from 'react';

const PRESET_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

const ProductUploadModal = ({ isOpen, onClose, onSuccess }) => {
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
    const [images, setImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const API_BASE_URL = import.meta.env.VITE_API_URL;

    const categories = ['Anarkalis', 'Coord Sets', 'Lehangas', 'Indo Western', 'Suits & Kurtis', 'Sarees', 'Blouses', 'Kidswear', "Men's Kurta", 'Dupattas', 'Pashminas'];
    const specialTags = ['', 'New Arrival', 'Best Seller', 'Sale', 'Trending'];

    const totalStock = sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    /* ── Size management ── */
    const addSize = (sizeName) => {
        if (!sizeName.trim()) return;
        if (sizes.some(s => s.size === sizeName.trim())) return;
        setSizes(prev => [...prev, { size: sizeName.trim(), stock: 0 }]);
    };

    const removeSize = (index) => {
        setSizes(prev => prev.filter((_, i) => i !== index));
    };

    const updateSizeStock = (index, stock) => {
        const val = Math.max(0, Number(stock) || 0);
        setSizes(prev => prev.map((s, i) => i === index ? { ...s, stock: val } : s));
    };

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files);
        setImages(files);
        const previews = files.map(file => URL.createObjectURL(file));
        setImagePreviews(previews);
    };

    const removeImage = (index) => {
        const newImages = images.filter((_, i) => i !== index);
        const newPreviews = imagePreviews.filter((_, i) => i !== index);
        setImages(newImages);
        setImagePreviews(newPreviews);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                setError('You must be logged in to upload products');
                setIsLoading(false);
                return;
            }

            if (!formData.name || !formData.description || !formData.price || !formData.category || !formData.weight) {
                setError('Please fill in all required fields (including weight)');
                setIsLoading(false);
                return;
            }

            if (sizes.length === 0) {
                setError('Please add at least one size');
                setIsLoading(false);
                return;
            }

            const submitData = new FormData();
            submitData.append('name', formData.name);
            submitData.append('description', formData.description);
            submitData.append('price', formData.price);
            submitData.append('category', formData.category);
            submitData.append('weight', formData.weight);
            submitData.append('sizes', JSON.stringify(sizes));
            if (formData.specialTag) {
                submitData.append('specialTag', formData.specialTag);
            }
            submitData.append('isCategoryCover', formData.isCategoryCover);

            images.forEach(image => {
                submitData.append('images', image);
            });

            const response = await fetch(`${API_BASE_URL}/adminDashboard/newProduct`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: submitData
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.message || 'Failed to create product');
                setIsLoading(false);
                return;
            }

            setFormData({
                name: '',
                description: '',
                price: '',
                category: '',
                specialTag: '',
                weight: '',
                isCategoryCover: false,
            });
            setSizes([]);
            setImages([]);
            setImagePreviews([]);

            if (onSuccess) {
                onSuccess(data.product);
            }
            onClose();

        } catch (err) {
            console.error('Upload error:', err);
            setError('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    /* ── Shared style tokens ── */
    const inputStyles = "w-full text-sm border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all";
    const inputPadding = { padding: '12px 14px' };
    const labelStyles = "block text-xs font-medium text-gray-500 mb-2";
    const sectionTitle = "text-sm font-semibold text-gray-700";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
                backgroundColor: 'rgba(0, 0, 0, 0.35)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)'
            }}
            onClick={handleBackdropClick}
        >
            <div
                className="relative w-full max-h-[90vh] overflow-hidden flex flex-col"
                style={{
                    maxWidth: 'min(920px, 95vw)',
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.18)',
                }}
            >
                {/* ── Header ── */}
                <div
                    className="flex items-center justify-between shrink-0"
                    style={{ padding: '20px 32px', borderBottom: '1px solid #E5E7EB' }}
                >
                    <h2 className="text-lg font-semibold text-gray-900">Upload New Product</h2>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ── Form - Scrollable ── */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto" style={{ padding: '28px 32px' }}>
                        {/* Error Message */}
                        {error && (
                            <div style={{ marginBottom: '24px', padding: '12px 16px' }} className="bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-red-600 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Form Fields */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Product Name */}
                            <div>
                                <label className={labelStyles}>
                                    Product Name <span className="text-red-400">*</span>
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
                                    Description <span className="text-red-400">*</span>
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

                            {/* Price & Weight Row */}
                            <div className="grid grid-cols-2" style={{ gap: '20px' }}>
                                <div>
                                    <label className={labelStyles}>
                                        Price ($) <span className="text-red-400">*</span>
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
                                    <label className={labelStyles}>
                                        Weight (lbs) <span className="text-red-400">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        name="weight"
                                        value={formData.weight}
                                        onChange={handleInputChange}
                                        placeholder="e.g. 0.66"
                                        min="0.01"
                                        step="0.01"
                                        className={inputStyles}
                                        style={inputPadding}
                                    />
                                </div>
                            </div>

                            {/* Category & Special Tag Row */}
                            <div className="grid grid-cols-2" style={{ gap: '20px' }}>
                                <div>
                                    <label className={labelStyles}>
                                        Category <span className="text-red-400">*</span>
                                    </label>
                                    <select
                                        name="category"
                                        value={formData.category}
                                        onChange={handleInputChange}
                                        className={`${inputStyles} cursor-pointer`}
                                        style={inputPadding}
                                    >
                                        <option value="">Select category</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelStyles}>
                                        Special Tag
                                    </label>
                                    <select
                                        name="specialTag"
                                        value={formData.specialTag}
                                        onChange={handleInputChange}
                                        className={`${inputStyles} cursor-pointer`}
                                        style={inputPadding}
                                    >
                                        <option value="">None</option>
                                        {specialTags.filter(t => t).map(tag => (
                                            <option key={tag} value={tag}>{tag}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* ── Size Inventory ── */}
                            <div
                                style={{
                                    padding: '20px 24px',
                                    backgroundColor: '#F9FAFB',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '12px',
                                }}
                            >
                                <div className="flex items-center justify-between" style={{ marginBottom: '16px' }}>
                                    <p className={sectionTitle}>
                                        Size Inventory <span className="text-red-400">*</span>
                                    </p>
                                    <span
                                        className="text-xs font-bold rounded-full"
                                        style={{
                                            padding: '4px 12px',
                                            backgroundColor: totalStock > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                                            color: totalStock > 0 ? '#16a34a' : '#dc2626',
                                        }}
                                    >
                                        Total: {totalStock}
                                    </span>
                                </div>

                                {/* Quick-add preset sizes */}
                                <div className="flex flex-wrap" style={{ gap: '10px', marginBottom: '16px' }}>
                                    {PRESET_SIZES.map(s => {
                                        const added = sizes.some(sz => sz.size === s);
                                        return (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => addSize(s)}
                                                disabled={added}
                                                className="text-xs font-semibold rounded-full border-[1.5px] transition-all"
                                                style={{
                                                    padding: '6px 16px',
                                                    borderColor: added ? '#d1d5db' : '#EFBF04',
                                                    color: added ? '#9ca3af' : '#EFBF04',
                                                    backgroundColor: added ? '#f3f4f6' : 'transparent',
                                                    cursor: added ? 'default' : 'pointer',
                                                }}
                                            >
                                                {added ? `${s} \u2713` : `+ ${s}`}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom size input */}
                                <div className="flex" style={{ gap: '10px', marginBottom: '16px' }}>
                                    <input
                                        type="text"
                                        value={customSize}
                                        onChange={(e) => setCustomSize(e.target.value)}
                                        placeholder="Custom size (e.g. Free Size)"
                                        className={`flex-1 ${inputStyles}`}
                                        style={{ padding: '10px 14px', fontSize: '0.8rem' }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addSize(customSize);
                                                setCustomSize('');
                                            }
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { addSize(customSize); setCustomSize(''); }}
                                        className="text-xs font-semibold rounded-lg text-white cursor-pointer hover:opacity-90 transition-opacity"
                                        style={{ padding: '10px 20px', backgroundColor: '#EFBF04' }}
                                    >
                                        Add
                                    </button>
                                </div>

                                {/* Size rows */}
                                {sizes.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {sizes.map((s, idx) => (
                                            <div key={s.size} className="flex items-center bg-white rounded-lg" style={{ padding: '10px 14px', border: '1px solid #E5E7EB', gap: '12px' }}>
                                                <span className="text-sm font-semibold text-gray-700" style={{ minWidth: '48px' }}>{s.size}</span>
                                                <input
                                                    type="number"
                                                    value={s.stock}
                                                    onChange={(e) => updateSizeStock(idx, e.target.value)}
                                                    min="0"
                                                    className="text-sm border border-gray-200 rounded-md text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                    style={{ padding: '6px 10px', width: '72px' }}
                                                />
                                                <span className="text-xs text-gray-400">units</span>
                                                <div className="flex-1" />
                                                <button
                                                    type="button"
                                                    onClick={() => removeSize(idx)}
                                                    className="text-gray-300 hover:text-red-500 transition-colors cursor-pointer"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-400 text-center" style={{ padding: '8px 0' }}>Click a size above or add a custom size to start.</p>
                                )}
                            </div>

                            {/* Category Cover Settings */}
                            {formData.category && (
                                <div
                                    style={{
                                        padding: '16px 20px',
                                        backgroundColor: '#FFFBEB',
                                        border: '1px solid #FDE68A',
                                        borderRadius: '12px',
                                    }}
                                >
                                    <p className={sectionTitle} style={{ marginBottom: '12px' }}>
                                        Category Cover
                                    </p>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={formData.isCategoryCover}
                                            onChange={(e) => setFormData(prev => ({ ...prev, isCategoryCover: e.target.checked }))}
                                            className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-amber-500"
                                        />
                                        <span className="text-sm text-gray-600">
                                            Use this product image as the category cover
                                        </span>
                                    </label>
                                </div>
                            )}

                            {/* Image Upload */}
                            <div>
                                <label className={labelStyles}>
                                    Product Images
                                </label>
                                <div
                                    className="border-2 border-dashed border-gray-200 rounded-xl text-center hover:border-amber-400 transition-colors cursor-pointer bg-gray-50/50 hover:bg-amber-50/50"
                                    style={{ padding: '28px 20px' }}
                                    onClick={() => document.getElementById('image-upload').click()}
                                >
                                    <input
                                        id="image-upload"
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        onChange={handleImageChange}
                                        className="hidden"
                                    />
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-sm text-gray-500 font-medium">Click to upload images</p>
                                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG up to 10MB each</p>
                                </div>

                                {/* Image Previews */}
                                {imagePreviews.length > 0 && (
                                    <div className="flex flex-wrap gap-3 mt-4">
                                        {imagePreviews.map((preview, index) => (
                                            <div key={index} className="relative">
                                                <img
                                                    src={preview}
                                                    alt={`Preview ${index + 1}`}
                                                    className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeImage(index)}
                                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 cursor-pointer"
                                                >
                                                    x
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Footer ── */}
                    <div
                        className="shrink-0 flex"
                        style={{ padding: '20px 32px', borderTop: '1px solid #E5E7EB', gap: '12px' }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                            style={{ height: '48px' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`flex-1 px-4 text-sm font-semibold text-white rounded-lg transition-all cursor-pointer ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'
                                }`}
                            style={{ backgroundColor: '#EFBF04', height: '48px' }}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Uploading...
                                </span>
                            ) : 'Save Product'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProductUploadModal;
