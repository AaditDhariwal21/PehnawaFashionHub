import { useState } from 'react';
import { X, Plus, Trash2, Upload } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const PRESET_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const API_BASE_URL = import.meta.env.VITE_API_URL;
const categories = ['Anarkalis', 'Coord Sets', 'Lehangas', 'Indo Western', 'Suits & Kurtis', 'Sarees', 'Blouses', 'Kidswear', "Men's Kurta", 'Dupattas', 'Pashminas'];
const specialTags = ['', 'New Arrival', 'Best Seller', 'Sale', 'Trending'];

const quillModules = {
    toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link'],
        ['clean'],
    ],
};
const quillFormats = ['bold', 'italic', 'underline', 'list', 'link'];

const ProductUploadModal = ({ isOpen, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        name: '', shortDescription: '', description: '',
        price: '', sellingPrice: '',
        category: '', specialTag: '', weight: '',
        isCategoryCover: false,
    });
    const [sizes, setSizes] = useState([]);
    const [customSize, setCustomSize] = useState('');

    // All images live under colors — first color is the default display
    const [colors, setColors] = useState([]); // [{ colorName, files: [], previews: [] }]
    const [newColorName, setNewColorName] = useState('');
    const [activeColorIdx, setActiveColorIdx] = useState(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const totalStock = sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    /* ── Size management ── */
    const addSize = (sizeName) => {
        if (!sizeName.trim()) return;
        if (sizes.some((s) => s.size === sizeName.trim())) return;
        setSizes((prev) => [...prev, { size: sizeName.trim(), stock: 0, price: '' }]);
    };
    const removeSize = (index) => setSizes((prev) => prev.filter((_, i) => i !== index));
    const updateSize = (index, field, value) => {
        setSizes((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
    };

    /* ── Color management ── */
    const addColor = () => {
        const name = newColorName.trim();
        if (!name || colors.some((c) => c.colorName === name)) return;
        setColors((prev) => [...prev, { colorName: name, files: [], previews: [] }]);
        setActiveColorIdx(colors.length);
        setNewColorName('');
    };
    const removeColor = (index) => {
        setColors((prev) => prev.filter((_, i) => i !== index));
        if (activeColorIdx === index) setActiveColorIdx(null);
        else if (activeColorIdx > index) setActiveColorIdx((p) => p - 1);
    };
    const handleColorImages = (colorIdx, e) => {
        const files = Array.from(e.target.files);
        setColors((prev) =>
            prev.map((c, i) =>
                i === colorIdx
                    ? { ...c, files: [...c.files, ...files], previews: [...c.previews, ...files.map((f) => URL.createObjectURL(f))] }
                    : c
            )
        );
    };
    const removeColorImage = (colorIdx, imgIdx) => {
        setColors((prev) =>
            prev.map((c, i) =>
                i === colorIdx
                    ? { ...c, files: c.files.filter((_, j) => j !== imgIdx), previews: c.previews.filter((_, j) => j !== imgIdx) }
                    : c
            )
        );
    };

    /* ── Upload helper ── */
    const uploadFiles = async (files, token) => {
        if (files.length === 0) return [];
        const fd = new FormData();
        files.forEach((f) => fd.append('images', f));
        const res = await fetch(`${API_BASE_URL}/adminDashboard/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Image upload failed');
        return data.images.map((img) => ({ url: img.url, publicId: img.public_id }));
    };

    /* ── Submit ── */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            const token = localStorage.getItem('token');
            if (!token) { setError('You must be logged in.'); setIsLoading(false); return; }
            if (!formData.name || !formData.description || !formData.price || !formData.category || !formData.weight) {
                setError('Please fill in all required fields.'); setIsLoading(false); return;
            }
            if (sizes.length === 0) { setError('Please add at least one size.'); setIsLoading(false); return; }
            if (colors.length === 0) { setError('Please add at least one color with images.'); setIsLoading(false); return; }
            if (colors[0].files.length === 0) { setError('Please upload images for the default color.'); setIsLoading(false); return; }
            if (formData.sellingPrice && Number(formData.sellingPrice) >= Number(formData.price)) {
                setError('Selling price must be less than MRP.'); setIsLoading(false); return;
            }

            // Upload per-color images
            const uploadedColors = [];
            for (const color of colors) {
                const imgs = await uploadFiles(color.files, token);
                uploadedColors.push({ colorName: color.colorName, images: imgs });
            }

            // Build sizes array (strip empty price)
            const cleanSizes = sizes.map((s) => ({
                size: s.size,
                stock: Math.max(0, Number(s.stock) || 0),
                ...(s.price !== '' && s.price != null ? { price: Number(s.price) } : {}),
            }));

            // First color's images become the product's main images (for cards)
            const body = {
                name: formData.name,
                shortDescription: formData.shortDescription,
                description: formData.description,
                price: Number(formData.price),
                sellingPrice: formData.sellingPrice ? Number(formData.sellingPrice) : null,
                category: formData.category,
                weight: Number(formData.weight),
                sizes: cleanSizes,
                images: uploadedColors[0].images,
                colors: uploadedColors,
                specialTag: formData.specialTag || null,
                isCategoryCover: formData.isCategoryCover,
            };

            const res = await fetch(`${API_BASE_URL}/products`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.success) { setError(data.message || 'Failed to create product.'); setIsLoading(false); return; }

            // Reset form
            setFormData({ name: '', shortDescription: '', description: '', price: '', sellingPrice: '', category: '', specialTag: '', weight: '', isCategoryCover: false });
            setSizes([]); setColors([]); setActiveColorIdx(null);

            if (onSuccess) onSuccess(data.product);
            onClose();
        } catch (err) {
            console.error('Upload error:', err);
            setError(err.message || 'Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    const inputCls = 'w-full text-sm border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all';
    const inputPad = { padding: '10px 14px' };
    const labelCls = 'block text-xs font-medium text-gray-500 mb-1.5';

    const activeColor = activeColorIdx != null ? colors[activeColorIdx] : null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="relative w-full max-h-[92vh] overflow-hidden flex flex-col" style={{ maxWidth: '1100px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)' }}>
                {/* Header */}
                <div className="flex items-center justify-between shrink-0" style={{ padding: '18px 28px', borderBottom: '1px solid #e5e7eb' }}>
                    <h2 className="text-lg font-semibold text-gray-900">Add New Product</h2>
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body — 2-column layout */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto" style={{ padding: '24px 28px' }}>
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-lg mb-5" style={{ padding: '10px 16px' }}>
                                <p className="text-red-600 text-sm">{error}</p>
                            </div>
                        )}

                        <div className="flex flex-col lg:flex-row gap-8">
                            {/* ═══ LEFT COLUMN — Images by Color ═══ */}
                            <div className="w-full lg:w-[42%] flex-shrink-0">
                                <div>
                                    <p className="text-sm font-semibold text-gray-700 mb-1">Product Colors & Images <span className="text-red-400">*</span></p>
                                    <p className="text-xs text-gray-400 mb-3">First color added is the default display. Add at least one color with images.</p>

                                    {/* Add color */}
                                    <div className="flex gap-2 mb-3">
                                        <input
                                            type="text" value={newColorName}
                                            onChange={(e) => setNewColorName(e.target.value)}
                                            placeholder="e.g. Red, Navy Blue, Teal"
                                            className={`flex-1 ${inputCls}`}
                                            style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } }}
                                        />
                                        <button type="button" onClick={addColor} className="text-xs font-semibold rounded-lg text-white cursor-pointer hover:opacity-90" style={{ padding: '8px 16px', backgroundColor: '#EFBF04' }}>
                                            <Plus className="w-3.5 h-3.5 inline -mt-0.5" /> Add
                                        </button>
                                    </div>

                                    {/* Color tabs */}
                                    {colors.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {colors.map((c, i) => (
                                                <div
                                                    key={c.colorName}
                                                    className="flex items-center gap-1.5 rounded-full cursor-pointer transition-all text-xs font-semibold"
                                                    style={{
                                                        padding: '5px 12px',
                                                        border: activeColorIdx === i ? '2px solid #EFBF04' : '1.5px solid #e5e7eb',
                                                        backgroundColor: activeColorIdx === i ? '#fffbeb' : '#fff',
                                                    }}
                                                    onClick={() => setActiveColorIdx(i)}
                                                >
                                                    {i === 0 && <span className="text-[0.55rem] text-amber-600 font-bold uppercase mr-0.5">Default</span>}
                                                    <span className="text-gray-700">{c.colorName}</span>
                                                    <span className="text-gray-400 text-[0.65rem]">({c.files.length})</span>
                                                    <button type="button" onClick={(e) => { e.stopPropagation(); removeColor(i); }} className="text-gray-300 hover:text-red-500 ml-0.5 cursor-pointer">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Active color image upload */}
                                    {activeColor && (
                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                            <p className="text-xs font-semibold text-gray-600 mb-2">
                                                Images for "{activeColor.colorName}"
                                                {activeColorIdx === 0 && <span className="text-amber-600 ml-1">(default — shown on cards & page load)</span>}
                                            </p>
                                            <div
                                                className="border-2 border-dashed border-gray-200 rounded-lg text-center cursor-pointer hover:border-amber-400 transition-colors"
                                                style={{ padding: '16px 12px' }}
                                                onClick={() => document.getElementById(`color-upload-${activeColorIdx}`).click()}
                                            >
                                                <input id={`color-upload-${activeColorIdx}`} type="file" accept="image/*" multiple onChange={(e) => handleColorImages(activeColorIdx, e)} className="hidden" />
                                                <Upload className="w-5 h-5 mx-auto text-gray-300 mb-1" />
                                                <p className="text-xs text-gray-400">Upload images for this color</p>
                                            </div>
                                            {activeColor.previews.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mt-3">
                                                    {activeColor.previews.map((p, j) => (
                                                        <div key={j} className="relative">
                                                            <img src={p} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                                                            <button type="button" onClick={() => removeColorImage(activeColorIdx, j)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[0.55rem] cursor-pointer">x</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Empty state */}
                                    {colors.length === 0 && (
                                        <div className="border-2 border-dashed border-gray-200 rounded-xl text-center bg-gray-50/50" style={{ padding: '32px 16px' }}>
                                            <Upload className="w-6 h-6 mx-auto text-gray-300 mb-2" />
                                            <p className="text-xs text-gray-400">Add a color above to start uploading images</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ═══ RIGHT COLUMN — Product Data ═══ */}
                            <div className="flex-1 flex flex-col gap-5">
                                {/* Name */}
                                <div>
                                    <label className={labelCls}>Product Name <span className="text-red-400">*</span></label>
                                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Enter product name" className={inputCls} style={inputPad} />
                                </div>

                                {/* Short Description */}
                                <div>
                                    <label className={labelCls}>Short Description <span className="text-xs text-gray-400">(meta)</span></label>
                                    <input type="text" name="shortDescription" value={formData.shortDescription} onChange={handleInputChange} placeholder="Brief one-liner for product cards" className={inputCls} style={inputPad} />
                                </div>

                                {/* Full Description — Rich Text */}
                                <div>
                                    <label className={labelCls}>Full Description <span className="text-red-400">*</span></label>
                                    <div className="quill-wrapper" style={{ borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                                        <ReactQuill
                                            theme="snow"
                                            value={formData.description}
                                            onChange={(val) => setFormData((p) => ({ ...p, description: val }))}
                                            placeholder="Detailed product description..."
                                            modules={quillModules}
                                            formats={quillFormats}
                                            style={{ minHeight: '140px' }}
                                        />
                                    </div>
                                </div>

                                {/* Pricing Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>MRP ($) <span className="text-red-400">*</span></label>
                                        <input type="number" name="price" value={formData.price} onChange={handleInputChange} placeholder="0" min="0" className={inputCls} style={inputPad} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Selling Price ($) <span className="text-xs text-gray-400">(optional)</span></label>
                                        <input type="number" name="sellingPrice" value={formData.sellingPrice} onChange={handleInputChange} placeholder="Discounted price" min="0" className={inputCls} style={inputPad} />
                                    </div>
                                </div>

                                {/* Weight + Category Row */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Weight (lbs) <span className="text-red-400">*</span></label>
                                        <input type="number" name="weight" value={formData.weight} onChange={handleInputChange} placeholder="e.g. 0.66" min="0.01" step="0.01" className={inputCls} style={inputPad} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>Category <span className="text-red-400">*</span></label>
                                        <select name="category" value={formData.category} onChange={handleInputChange} className={`${inputCls} cursor-pointer`} style={inputPad}>
                                            <option value="">Select category</option>
                                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Special Tag */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Special Tag</label>
                                        <select name="specialTag" value={formData.specialTag} onChange={handleInputChange} className={`${inputCls} cursor-pointer`} style={inputPad}>
                                            <option value="">None</option>
                                            {specialTags.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    {formData.category && (
                                        <div className="flex items-end pb-1">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input type="checkbox" checked={formData.isCategoryCover} onChange={(e) => setFormData((p) => ({ ...p, isCategoryCover: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-amber-500" />
                                                <span className="text-xs text-gray-600">Use as category cover</span>
                                            </label>
                                        </div>
                                    )}
                                </div>

                                {/* Size & Pricing */}
                                <div className="bg-gray-50 border border-gray-200 rounded-xl" style={{ padding: '1.25rem 1.5rem' }}>
                                    {/* Header */}
                                    <div className="flex items-center justify-between" style={{ marginBottom: '1.25rem' }}>
                                        <p className="text-sm font-semibold text-gray-700">Size & Pricing <span className="text-red-400">*</span></p>
                                        <span className="text-xs font-bold rounded-full" style={{ padding: '4px 12px', backgroundColor: totalStock > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)', color: totalStock > 0 ? '#16a34a' : '#dc2626' }}>
                                            Total: {totalStock}
                                        </span>
                                    </div>

                                    {/* Row 1: Preset size buttons */}
                                    <div className="flex flex-wrap" style={{ gap: '0.6rem', marginBottom: '1rem' }}>
                                        {PRESET_SIZES.map((s) => {
                                            const added = sizes.some((sz) => sz.size === s);
                                            return (
                                                <button
                                                    key={s} type="button" onClick={() => addSize(s)} disabled={added}
                                                    className="text-xs font-semibold rounded-full border-[1.5px] transition-all"
                                                    style={{
                                                        padding: '7px 18px',
                                                        borderColor: added ? '#d1d5db' : '#EFBF04',
                                                        color: added ? '#9ca3af' : '#EFBF04',
                                                        backgroundColor: added ? '#f3f4f6' : 'transparent',
                                                        cursor: added ? 'default' : 'pointer',
                                                    }}
                                                >
                                                    {added ? `${s} ✓` : `+ ${s}`}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Row 2: Custom size input */}
                                    <div className="flex" style={{ gap: '0.5rem', marginBottom: '1.25rem' }}>
                                        <input
                                            type="text" value={customSize}
                                            onChange={(e) => setCustomSize(e.target.value)}
                                            placeholder="Custom size (e.g. Free Size)"
                                            className={`flex-1 ${inputCls}`}
                                            style={{ padding: '9px 14px', fontSize: '0.8rem' }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize(customSize); setCustomSize(''); } }}
                                        />
                                        <button type="button" onClick={() => { addSize(customSize); setCustomSize(''); }} className="text-xs font-semibold rounded-lg text-white cursor-pointer hover:opacity-90" style={{ padding: '9px 20px', backgroundColor: '#EFBF04' }}>
                                            Add
                                        </button>
                                    </div>

                                    {/* Row 3: Added sizes list */}
                                    {sizes.length > 0 ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                            {sizes.map((s, idx) => (
                                                <div
                                                    key={s.size}
                                                    className="flex items-center bg-white rounded-xl shadow-sm"
                                                    style={{ padding: '0.75rem 1rem', border: '1px solid #e5e7eb', gap: '1rem' }}
                                                >
                                                    <span
                                                        className="text-sm font-bold text-gray-800 bg-gray-100 rounded-lg text-center flex-shrink-0"
                                                        style={{ padding: '0.3rem 0', width: '3rem' }}
                                                    >
                                                        {s.size}
                                                    </span>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className="text-[0.6rem] text-gray-400 font-semibold uppercase mb-0.5">Stock</span>
                                                        <input
                                                            type="number" value={s.stock}
                                                            onChange={(e) => updateSize(idx, 'stock', Math.max(0, Number(e.target.value) || 0))}
                                                            min="0"
                                                            className="text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                            style={{ padding: '6px 10px', width: '100%' }}
                                                        />
                                                    </div>
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <span className="text-[0.6rem] text-gray-400 font-semibold uppercase mb-0.5">Price ($)</span>
                                                        <input
                                                            type="number" value={s.price}
                                                            onChange={(e) => updateSize(idx, 'price', e.target.value)}
                                                            placeholder="—"
                                                            min="0"
                                                            className="text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                            style={{ padding: '6px 10px', width: '100%' }}
                                                        />
                                                    </div>
                                                    <button
                                                        type="button" onClick={() => removeSize(idx)}
                                                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center" style={{ padding: '1.5rem 0' }}>
                                            <p className="text-xs text-gray-400">Click a size above or add a custom size to get started.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="shrink-0 flex" style={{ padding: '16px 28px', borderTop: '1px solid #e5e7eb', gap: '12px' }}>
                        <button type="button" onClick={onClose} className="flex-1 px-4 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" style={{ height: '44px' }}>Cancel</button>
                        <button type="submit" disabled={isLoading} className={`flex-1 px-4 text-sm font-semibold text-white rounded-lg transition-all cursor-pointer ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`} style={{ backgroundColor: '#EFBF04', height: '44px' }}>
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
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
