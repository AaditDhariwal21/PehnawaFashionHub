import { useState } from 'react';

const ProductUploadModal = ({ isOpen, onClose, onSuccess }) => {
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
    const [images, setImages] = useState([]);
    const [imagePreviews, setImagePreviews] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const API_BASE_URL = import.meta.env.VITE_API_URL;

    const categories = ['Anarkalis', 'Coord Sets', 'Lehangas', 'Indo Western', 'Suits & Kurtis', 'Sarees', 'Blouses', 'Kidswear', "Men's Kurta", 'Dupattas', 'Pashminas'];
    const specialTags = ['', 'New Arrival', 'Best Seller', 'Sale', 'Trending'];

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageChange = (e) => {
        const files = Array.from(e.target.files);
        setImages(files);

        // Create previews
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

            // Validate required fields
            if (!formData.name || !formData.description || !formData.price || !formData.category || !formData.weight) {
                setError('Please fill in all required fields (including weight)');
                setIsLoading(false);
                return;
            }

            // Create FormData for file upload
            const submitData = new FormData();
            submitData.append('name', formData.name);
            submitData.append('description', formData.description);
            submitData.append('price', formData.price);
            submitData.append('category', formData.category);
            submitData.append('stock', formData.stock || '0');
            submitData.append('weight', formData.weight);
            if (formData.specialTag) {
                submitData.append('specialTag', formData.specialTag);
            }
            submitData.append('isCategoryCover', formData.isCategoryCover);

            // Append images
            images.forEach(image => {
                submitData.append('images', image);
            });

            // Send request to create product with images
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

            // Success - reset form and close modal
            setFormData({
                name: '',
                description: '',
                price: '',
                category: '',
                stock: '',
                specialTag: '',
                weight: '',
                isCategoryCover: false,
            });
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

    // Common input styles
    const inputStyles = "w-full text-sm border border-gray-200 rounded-md text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all";
    const inputPadding = { padding: '12px 14px' };
    const labelStyles = "block text-xs font-medium text-gray-600 mb-1.5";

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
                    <h2 className="text-lg font-semibold text-gray-900">Upload New Product</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Form - Scrollable */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
                        {/* Error Message */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                                <p className="text-red-600 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Form Fields Container */}
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

                            {/* Price and Stock Row */}
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
                                    <label className={labelStyles}>
                                        Stock
                                    </label>
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

                            {/* Category and Special Tag Row */}
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

                            {/* Image Upload */}
                            <div style={{ marginTop: '8px' }}>
                                <label className={labelStyles}>
                                    Product Images
                                </label>
                                <div
                                    className="border border-dashed border-gray-300 rounded-lg text-center hover:border-amber-400 transition-colors cursor-pointer bg-gray-50 hover:bg-amber-50"
                                    style={{ padding: '24px 16px' }}
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
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <p className="text-sm text-gray-600">Click to upload images</p>
                                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG up to 10MB each</p>
                                </div>

                                {/* Image Previews */}
                                {imagePreviews.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {imagePreviews.map((preview, index) => (
                                            <div key={index} className="relative">
                                                <img
                                                    src={preview}
                                                    alt={`Preview ${index + 1}`}
                                                    className="w-16 h-16 object-cover rounded-md border border-gray-200"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => removeImage(index)}
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
                        className="shrink-0 flex gap-3"
                        style={{ padding: '16px 24px', borderTop: '1px solid #E5E7EB' }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 text-sm font-medium text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors cursor-pointer"
                            style={{ height: '46px' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`flex-1 px-4 text-sm font-semibold text-white rounded-md transition-all cursor-pointer ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'
                                }`}
                            style={{ backgroundColor: '#EFBF04', height: '46px' }}
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
