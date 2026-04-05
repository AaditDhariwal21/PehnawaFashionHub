import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, Trash2, Upload } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useAuth } from '../context/AuthContext';
import formatPrice from '../utils/formatPrice';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const PRESET_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
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

/* ═══════════════════════════════ Edit Modal ═══════════════════════════════ */
const ProductEditModal = ({ product, onClose, onSaved, onDeleted }) => {
    const [formData, setFormData] = useState({ name: '', shortDescription: '', description: '', price: '', sellingPrice: '', category: '', specialTag: '', weight: '', isCategoryCover: false });
    const [sizes, setSizes] = useState([]);
    const [customSize, setCustomSize] = useState('');
    const [existingImages, setExistingImages] = useState([]);
    const [newFiles, setNewFiles] = useState([]);
    const [newPreviews, setNewPreviews] = useState([]);
    const [existingColors, setExistingColors] = useState([]); // [{colorName, images:[{url,publicId}]}]
    const [newColorFiles, setNewColorFiles] = useState({}); // {colorName: File[]}
    const [newColorPreviews, setNewColorPreviews] = useState({}); // {colorName: string[]}
    const [newColorName, setNewColorName] = useState('');
    const [activeColorTab, setActiveColorTab] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const totalStock = sizes.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);

    useEffect(() => {
        if (!product) return;
        const initForm = async () => {
            let isActiveCover = product.isCategoryCover || false;
            if (!isActiveCover && product.category) {
                try {
                    const res = await fetch(`${API_BASE_URL}/products/categories/covers`);
                    const data = await res.json();
                    if (data.success && data.covers[product.category]?.productId === product._id) isActiveCover = true;
                } catch { /* silent */ }
            }
            setFormData({
                name: product.name || '', shortDescription: product.shortDescription || '', description: product.description || '',
                price: product.price ?? '', sellingPrice: product.sellingPrice ?? '',
                category: product.category || '', specialTag: product.specialTag || '', weight: product.weight ?? '',
                isCategoryCover: isActiveCover,
            });
        };
        initForm();
        setSizes(product.sizes?.length ? product.sizes.map(s => ({ size: s.size, stock: s.stock, price: s.price ?? '' })) : []);
        setExistingImages(product.images || []);
        setExistingColors(product.colors || []);
        setNewFiles([]); setNewPreviews([]); setNewColorFiles({}); setNewColorPreviews({});
        setActiveColorTab(null); setError('');
    }, [product]);

    if (!product) return null;
    const token = localStorage.getItem('token');

    const handleInputChange = (e) => { const { name, value } = e.target; setFormData(p => ({ ...p, [name]: value })); };

    /* Size helpers */
    const addSize = (n) => { if (!n.trim() || sizes.some(s => s.size === n.trim())) return; setSizes(p => [...p, { size: n.trim(), stock: 0, price: '' }]); };
    const removeSize = (i) => setSizes(p => p.filter((_, j) => j !== i));
    const updateSize = (i, f, v) => setSizes(p => p.map((s, j) => j === i ? { ...s, [f]: v } : s));

    /* General image helpers */
    const removeExistingImage = (i) => setExistingImages(p => p.filter((_, j) => j !== i));
    const handleNewImages = (e) => { const f = Array.from(e.target.files); setNewFiles(p => [...p, ...f]); setNewPreviews(p => [...p, ...f.map(x => URL.createObjectURL(x))]); };
    const removeNewImage = (i) => { setNewFiles(p => p.filter((_, j) => j !== i)); setNewPreviews(p => p.filter((_, j) => j !== i)); };

    /* Color helpers */
    const addColor = () => { const n = newColorName.trim(); if (!n || existingColors.some(c => c.colorName === n)) return; setExistingColors(p => [...p, { colorName: n, images: [] }]); setActiveColorTab(n); setNewColorName(''); };
    const removeColor = (name) => { setExistingColors(p => p.filter(c => c.colorName !== name)); if (activeColorTab === name) setActiveColorTab(null); const nf = { ...newColorFiles }; delete nf[name]; setNewColorFiles(nf); const np = { ...newColorPreviews }; delete np[name]; setNewColorPreviews(np); };
    const removeExistingColorImage = (colorName, imgIdx) => { setExistingColors(p => p.map(c => c.colorName === colorName ? { ...c, images: c.images.filter((_, j) => j !== imgIdx) } : c)); };
    const handleColorImageUpload = (colorName, e) => { const f = Array.from(e.target.files); setNewColorFiles(p => ({ ...p, [colorName]: [...(p[colorName] || []), ...f] })); setNewColorPreviews(p => ({ ...p, [colorName]: [...(p[colorName] || []), ...f.map(x => URL.createObjectURL(x))] })); };
    const removeNewColorImage = (colorName, i) => { setNewColorFiles(p => ({ ...p, [colorName]: (p[colorName] || []).filter((_, j) => j !== i) })); setNewColorPreviews(p => ({ ...p, [colorName]: (p[colorName] || []).filter((_, j) => j !== i) })); };

    /* Upload helper */
    const uploadFiles = async (files) => {
        if (!files.length) return [];
        const fd = new FormData(); files.forEach(f => fd.append('images', f));
        const res = await fetch(`${API_BASE_URL}/adminDashboard/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Upload failed');
        return data.images.map(img => ({ url: img.url, publicId: img.public_id }));
    };

    /* Save */
    const handleSave = async () => {
        setError(''); setIsLoading(true);
        try {
            if (formData.sellingPrice && Number(formData.sellingPrice) >= Number(formData.price)) { setError('Selling price must be less than MRP.'); setIsLoading(false); return; }
            const uploadedGeneral = await uploadFiles(newFiles);
            // Per-color uploads
            const finalColors = [];
            for (const c of existingColors) {
                const newImgs = await uploadFiles(newColorFiles[c.colorName] || []);
                finalColors.push({ colorName: c.colorName, images: [...c.images, ...newImgs] });
            }
            const cleanSizes = sizes.map(s => ({ size: s.size, stock: Math.max(0, Number(s.stock) || 0), ...(s.price !== '' && s.price != null ? { price: Number(s.price) } : {}) }));
            const body = {
                name: formData.name, shortDescription: formData.shortDescription, description: formData.description,
                price: Number(formData.price), sellingPrice: formData.sellingPrice ? Number(formData.sellingPrice) : null,
                category: formData.category, sizes: cleanSizes, totalStock,
                weight: Number(formData.weight) || 0, specialTag: formData.specialTag || null, isCategoryCover: formData.isCategoryCover,
                images: [...existingImages, ...uploadedGeneral], colors: finalColors,
            };
            const res = await fetch(`${API_BASE_URL}/products/${product._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
            const data = await res.json();
            if (!res.ok) { setError(data.message || 'Failed to update.'); setIsLoading(false); return; }
            onSaved(data.product);
        } catch (err) { console.error(err); setError(err.message || 'Network error.'); } finally { setIsLoading(false); }
    };

    /* Delete */
    const handleDelete = async () => {
        if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
        setIsLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/products/${product._id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            if (!res.ok) { const d = await res.json(); setError(d.message || 'Failed to delete.'); setIsLoading(false); return; }
            onDeleted(product._id);
        } catch (err) { console.error(err); setError('Network error.'); } finally { setIsLoading(false); }
    };

    const inputCls = 'w-full text-sm border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all';
    const inputPad = { padding: '10px 14px' };
    const labelCls = 'block text-xs font-medium text-gray-500 mb-1.5';
    const activeColorEntry = existingColors.find(c => c.colorName === activeColorTab);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="relative w-full max-h-[92vh] overflow-hidden flex flex-col" style={{ maxWidth: '1100px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)' }}>
                {/* Header */}
                <div className="flex items-center justify-between shrink-0" style={{ padding: '18px 28px', borderBottom: '1px solid #e5e7eb' }}>
                    <h2 className="text-lg font-semibold text-gray-900">Edit Product</h2>
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"><X className="w-5 h-5" /></button>
                </div>

                {/* Body — 2-column */}
                <div className="flex-1 overflow-y-auto" style={{ padding: '24px 28px' }}>
                    {error && <div className="bg-red-50 border border-red-200 rounded-lg mb-5" style={{ padding: '10px 16px' }}><p className="text-red-600 text-sm">{error}</p></div>}

                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* LEFT — Images */}
                        <div className="w-full lg:w-[42%] flex-shrink-0">
                            {/* General images */}
                            <div className="mb-6">
                                <p className="text-sm font-semibold text-gray-700 mb-3">Product Images</p>
                                {existingImages.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {existingImages.map((img, i) => (
                                            <div key={i} className="relative">
                                                <img src={img.url} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" />
                                                <button type="button" onClick={() => removeExistingImage(i)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[0.55rem] cursor-pointer">x</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="border-2 border-dashed border-gray-200 rounded-xl text-center hover:border-amber-400 transition-colors cursor-pointer bg-gray-50/50 hover:bg-amber-50/30" style={{ padding: '20px 16px' }} onClick={() => document.getElementById('edit-gen-upload').click()}>
                                    <input id="edit-gen-upload" type="file" accept="image/*" multiple onChange={handleNewImages} className="hidden" />
                                    <Upload className="w-5 h-5 mx-auto text-gray-300 mb-1" />
                                    <p className="text-xs text-gray-500">Upload images</p>
                                </div>
                                {newPreviews.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{newPreviews.map((p, i) => (<div key={i} className="relative"><img src={p} alt="" className="w-14 h-14 object-cover rounded-lg border border-gray-200" /><button type="button" onClick={() => removeNewImage(i)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[0.55rem] cursor-pointer">x</button></div>))}</div>}
                            </div>

                            {/* Color Variants */}
                            <div>
                                <p className="text-sm font-semibold text-gray-700 mb-3">Color Variants</p>
                                <div className="flex gap-2 mb-3">
                                    <input type="text" value={newColorName} onChange={(e) => setNewColorName(e.target.value)} placeholder="e.g. Red" className={`flex-1 ${inputCls}`} style={{ padding: '8px 12px', fontSize: '0.8rem' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } }} />
                                    <button type="button" onClick={addColor} className="text-xs font-semibold rounded-lg text-white cursor-pointer hover:opacity-90" style={{ padding: '8px 14px', backgroundColor: '#EFBF04' }}><Plus className="w-3.5 h-3.5 inline -mt-0.5" /> Add</button>
                                </div>
                                {existingColors.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {existingColors.map(c => (
                                            <div key={c.colorName} className="flex items-center gap-1.5 rounded-full cursor-pointer transition-all text-xs font-semibold" style={{ padding: '5px 12px', border: activeColorTab === c.colorName ? '2px solid #EFBF04' : '1.5px solid #e5e7eb', backgroundColor: activeColorTab === c.colorName ? '#fffbeb' : '#fff' }} onClick={() => setActiveColorTab(c.colorName)}>
                                                <span className="text-gray-700">{c.colorName}</span>
                                                <span className="text-gray-400 text-[0.65rem]">({c.images.length + (newColorFiles[c.colorName]?.length || 0)})</span>
                                                <button type="button" onClick={(e) => { e.stopPropagation(); removeColor(c.colorName); }} className="text-gray-300 hover:text-red-500 ml-0.5 cursor-pointer"><X className="w-3 h-3" /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {activeColorEntry && (
                                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-xs font-semibold text-gray-600 mb-2">Images for "{activeColorTab}"</p>
                                        {activeColorEntry.images.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mb-2">
                                                {activeColorEntry.images.map((img, j) => (
                                                    <div key={j} className="relative"><img src={img.url} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" /><button type="button" onClick={() => removeExistingColorImage(activeColorTab, j)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[0.55rem] cursor-pointer">x</button></div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="border-2 border-dashed border-gray-200 rounded-lg text-center cursor-pointer hover:border-amber-400" style={{ padding: '14px 10px' }} onClick={() => document.getElementById(`edit-color-upload-${activeColorTab}`).click()}>
                                            <input id={`edit-color-upload-${activeColorTab}`} type="file" accept="image/*" multiple onChange={(e) => handleColorImageUpload(activeColorTab, e)} className="hidden" />
                                            <Upload className="w-4 h-4 mx-auto text-gray-300 mb-1" /><p className="text-xs text-gray-400">Upload</p>
                                        </div>
                                        {(newColorPreviews[activeColorTab] || []).length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-2">{newColorPreviews[activeColorTab].map((p, j) => (<div key={j} className="relative"><img src={p} alt="" className="w-12 h-12 object-cover rounded-lg border border-gray-200" /><button type="button" onClick={() => removeNewColorImage(activeColorTab, j)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[0.55rem] cursor-pointer">x</button></div>))}</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT — Data */}
                        <div className="flex-1 flex flex-col gap-5">
                            <div><label className={labelCls}>Product Name *</label><input type="text" name="name" value={formData.name} onChange={handleInputChange} className={inputCls} style={inputPad} /></div>
                            <div><label className={labelCls}>Short Description</label><input type="text" name="shortDescription" value={formData.shortDescription} onChange={handleInputChange} placeholder="Brief one-liner" className={inputCls} style={inputPad} /></div>
                            <div>
                                <label className={labelCls}>Full Description *</label>
                                <div style={{ borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
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
                                <div><label className={labelCls}>MRP ($) *</label><input type="number" name="price" value={formData.price} onChange={handleInputChange} min="0" className={inputCls} style={inputPad} /></div>
                                <div><label className={labelCls}>Selling Price ($)</label><input type="number" name="sellingPrice" value={formData.sellingPrice} onChange={handleInputChange} placeholder="Optional" min="0" className={inputCls} style={inputPad} /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className={labelCls}>Weight (lbs) *</label><input type="number" name="weight" value={formData.weight} onChange={handleInputChange} min="0.01" step="0.01" className={inputCls} style={inputPad} /></div>
                                <div><label className={labelCls}>Category *</label><select name="category" value={formData.category} onChange={handleInputChange} className={`${inputCls} cursor-pointer`} style={inputPad}><option value="">Select</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className={labelCls}>Special Tag</label><select name="specialTag" value={formData.specialTag} onChange={handleInputChange} className={`${inputCls} cursor-pointer`} style={inputPad}><option value="">None</option>{specialTags.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                                {formData.category && <div className="flex items-end pb-1"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={formData.isCategoryCover} onChange={(e) => setFormData(p => ({ ...p, isCategoryCover: e.target.checked }))} className="w-4 h-4 rounded cursor-pointer accent-amber-500" /><span className="text-xs text-gray-600">Category cover</span></label></div>}
                            </div>

                            {/* Size & Pricing */}
                            <div className="bg-gray-50 border border-gray-200 rounded-xl" style={{ padding: '1.25rem 1.5rem' }}>
                                <div className="flex items-center justify-between" style={{ marginBottom: '1.25rem' }}>
                                    <p className="text-sm font-semibold text-gray-700">Size & Pricing</p>
                                    <span className="text-xs font-bold rounded-full" style={{ padding: '4px 12px', backgroundColor: totalStock > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)', color: totalStock > 0 ? '#16a34a' : '#dc2626' }}>Total: {totalStock}</span>
                                </div>
                                <div className="flex flex-wrap" style={{ gap: '0.6rem', marginBottom: '1rem' }}>
                                    {PRESET_SIZES.map(s => { const added = sizes.some(sz => sz.size === s); return (<button key={s} type="button" onClick={() => addSize(s)} disabled={added} className="text-xs font-semibold rounded-full border-[1.5px] transition-all" style={{ padding: '7px 18px', borderColor: added ? '#d1d5db' : '#EFBF04', color: added ? '#9ca3af' : '#EFBF04', backgroundColor: added ? '#f3f4f6' : 'transparent', cursor: added ? 'default' : 'pointer' }}>{added ? `${s} ✓` : `+ ${s}`}</button>); })}
                                </div>
                                <div className="flex" style={{ gap: '0.5rem', marginBottom: '1.25rem' }}>
                                    <input type="text" value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder="Custom size (e.g. Free Size)" className={`flex-1 ${inputCls}`} style={{ padding: '9px 14px', fontSize: '0.8rem' }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize(customSize); setCustomSize(''); } }} />
                                    <button type="button" onClick={() => { addSize(customSize); setCustomSize(''); }} className="text-xs font-semibold rounded-lg text-white cursor-pointer hover:opacity-90" style={{ padding: '9px 20px', backgroundColor: '#EFBF04' }}>Add</button>
                                </div>
                                {sizes.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {sizes.map((s, i) => (
                                            <div key={s.size} className="flex items-center bg-white rounded-xl shadow-sm" style={{ padding: '0.75rem 1rem', border: '1px solid #e5e7eb', gap: '1rem' }}>
                                                <span className="text-sm font-bold text-gray-800 bg-gray-100 rounded-lg text-center flex-shrink-0" style={{ padding: '0.3rem 0', width: '3rem' }}>{s.size}</span>
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    <span className="text-[0.6rem] text-gray-400 font-semibold uppercase mb-0.5">Stock</span>
                                                    <input type="number" value={s.stock} onChange={(e) => updateSize(i, 'stock', Math.max(0, Number(e.target.value) || 0))} min="0" className="text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ padding: '6px 10px', width: '100%' }} />
                                                </div>
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    <span className="text-[0.6rem] text-gray-400 font-semibold uppercase mb-0.5">Price ($)</span>
                                                    <input type="number" value={s.price} onChange={(e) => updateSize(i, 'price', e.target.value)} placeholder="—" min="0" className="text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400" style={{ padding: '6px 10px', width: '100%' }} />
                                                </div>
                                                <button type="button" onClick={() => removeSize(i)} className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                        ))}
                                    </div>
                                ) : <div className="text-center" style={{ padding: '1.5rem 0' }}><p className="text-xs text-gray-400">Click a size above or add a custom size to get started.</p></div>}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 flex items-center" style={{ padding: '16px 28px', borderTop: '1px solid #e5e7eb', gap: '12px' }}>
                    <button type="button" onClick={handleDelete} disabled={isLoading} className="px-5 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors cursor-pointer" style={{ height: '44px' }}>Delete</button>
                    <div className="flex-1" />
                    <button type="button" onClick={onClose} className="px-5 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" style={{ height: '44px' }}>Cancel</button>
                    <button type="button" onClick={handleSave} disabled={isLoading} className={`px-6 text-sm font-semibold text-white rounded-lg transition-all cursor-pointer ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'}`} style={{ backgroundColor: '#EFBF04', height: '44px', minWidth: '130px' }}>
                        {isLoading ? <span className="flex items-center justify-center gap-2"><svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Saving...</span> : 'Save Changes'}
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
