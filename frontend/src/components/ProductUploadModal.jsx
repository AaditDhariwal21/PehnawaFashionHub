import { useState } from 'react';
import { X } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import VariantMatrix from './VariantMatrix';
import ColorImagesManager, { finalizeColors } from './ColorImagesManager';
import { buildVariantMatrix } from '../utils/variants.js';

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
        price: '',
        category: '', specialTag: '', weight: '',
        isCategoryCover: false,
    });

    // Single source of truth for color/image state.
    // [{ colorName, images: [{kind:'new', file, preview}] }]
    const [colors, setColors] = useState([]);

    // Variant matrix
    const [sizes, setSizes] = useState([]);
    const [variants, setVariants] = useState([]);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    /* ── Sync variant matrix when colors change ── */
    const handleColorsChange = (nextColors) => {
        setColors(nextColors);
        const colorNames = nextColors.map((c) => c.colorName);
        setVariants(buildVariantMatrix(colorNames, sizes, variants));
    };

    const handleMatrixChange = (nextSizes, nextVariants) => {
        setSizes(nextSizes);
        setVariants(nextVariants);
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
            if (colors.length === 0) {
                setError('Please add at least one color.'); setIsLoading(false); return;
            }
            if (colors[0].images.length === 0) {
                setError(`Please upload at least one image for "${colors[0].colorName}" (used as the card thumbnail).`);
                setIsLoading(false); return;
            }
            if (variants.length === 0) {
                setError('Please add at least one size to generate variants.'); setIsLoading(false); return;
            }
            for (const v of variants) {
                const price = Number(v.price);
                const stock = Number(v.stock);
                if (!Number.isFinite(price) || price <= 0) {
                    setError(`Set a valid price for ${v.color} / ${v.size}.`); setIsLoading(false); return;
                }
                if (!Number.isFinite(stock) || stock < 0) {
                    setError(`Set a valid stock for ${v.color} / ${v.size}.`); setIsLoading(false); return;
                }
            }

            // Upload all `kind: 'new'` files in place, producing the API payload.
            const finalColors = await finalizeColors(colors, (files) => uploadFiles(files, token));

            const cleanVariants = variants.map((v) => ({
                color: v.color,
                size: v.size,
                price: Number(v.price),
                stock: Math.max(0, Number(v.stock) || 0),
            }));

            const body = {
                name: formData.name,
                shortDescription: formData.shortDescription,
                description: formData.description,
                price: Number(formData.price),
                category: formData.category,
                weight: Number(formData.weight),
                // The first color's first image is the canonical card thumbnail.
                images: finalColors[0].images,
                colors: finalColors,
                variants: cleanVariants,
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
            setFormData({ name: '', shortDescription: '', description: '', price: '', category: '', specialTag: '', weight: '', isCategoryCover: false });
            setColors([]);
            setSizes([]); setVariants([]);

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
                            {/* ═══ LEFT — Color × Image manager ═══ */}
                            <div className="w-full lg:w-[42%] flex-shrink-0">
                                <ColorImagesManager colors={colors} onChange={handleColorsChange} />
                            </div>

                            {/* ═══ RIGHT — Product Data ═══ */}
                            <div className="flex-1 flex flex-col gap-5">
                                <div>
                                    <label className={labelCls}>Product Name <span className="text-red-400">*</span></label>
                                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Enter product name" className={inputCls} style={inputPad} />
                                </div>

                                <div>
                                    <label className={labelCls}>Short Description <span className="text-xs text-gray-400">(meta)</span></label>
                                    <input type="text" name="shortDescription" value={formData.shortDescription} onChange={handleInputChange} placeholder="Brief one-liner for product cards" className={inputCls} style={inputPad} />
                                </div>

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

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>MRP ($) <span className="text-red-400">*</span></label>
                                        <input type="number" name="price" value={formData.price} onChange={handleInputChange} placeholder="0" min="0" className={inputCls} style={inputPad} />
                                        <p className="text-[0.65rem] text-gray-400" style={{ marginTop: '0.25rem' }}>List price — used as the strikethrough on cards.</p>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Weight (lbs) <span className="text-red-400">*</span></label>
                                        <input type="number" name="weight" value={formData.weight} onChange={handleInputChange} placeholder="e.g. 0.66" min="0.01" step="0.01" className={inputCls} style={inputPad} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelCls}>Category <span className="text-red-400">*</span></label>
                                        <select name="category" value={formData.category} onChange={handleInputChange} className={`${inputCls} cursor-pointer`} style={inputPad}>
                                            <option value="">Select category</option>
                                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Special Tag</label>
                                        <select name="specialTag" value={formData.specialTag} onChange={handleInputChange} className={`${inputCls} cursor-pointer`} style={inputPad}>
                                            <option value="">None</option>
                                            {specialTags.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {formData.category && (
                                    <label className="flex items-center gap-2 cursor-pointer" style={{ marginTop: '-0.5rem' }}>
                                        <input type="checkbox" checked={formData.isCategoryCover} onChange={(e) => setFormData((p) => ({ ...p, isCategoryCover: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 cursor-pointer accent-amber-500" />
                                        <span className="text-xs text-gray-600">Use as category cover</span>
                                    </label>
                                )}

                                <VariantMatrix
                                    colors={colors.map((c) => c.colorName)}
                                    sizes={sizes}
                                    variants={variants}
                                    onChange={handleMatrixChange}
                                />
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
