import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Navbar from '../components/Navbar';
import { useCart } from '../context/CartContext';
import formatPrice from '../utils/formatPrice';

const ProductDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart, openCart, setBuyNowItem } = useCart();

    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedImage, setSelectedImage] = useState(0);
    const [selectedSize, setSelectedSize] = useState(null);

    const sizes = ['S', 'M', 'L', 'XL'];

    useEffect(() => {
        const fetchProduct = async () => {
            try {
                setLoading(true);
                const response = await fetch(`https://pehnawafashionhub.onrender.com/api/products/${id}`);
                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.message || 'Product not found');
                }

                setProduct(data.product);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchProduct();
    }, [id]);

    /* ───────────────── Loading State ───────────────── */
    if (loading) {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 4rem)' }}>
                    <div className="flex flex-col items-center gap-4">
                        <div
                            className="rounded-full border-4 border-gray-200 animate-spin"
                            style={{
                                width: '3rem',
                                height: '3rem',
                                borderTopColor: '#EFBF04',
                            }}
                        />
                        <p className="text-gray-500 text-sm">Loading product...</p>
                    </div>
                </div>
            </div>
        );
    }

    /* ───────────────── Error State ───────────────── */
    if (error || !product) {
        return (
            <div className="min-h-screen bg-white">
                <Navbar />
                <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 4rem)' }}>
                    <div className="flex flex-col items-center gap-4 text-center px-4">
                        <div
                            className="flex items-center justify-center rounded-full bg-red-50"
                            style={{ width: '4rem', height: '4rem' }}
                        >
                            <span className="text-red-400 text-2xl">!</span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-800">Product Not Found</h2>
                        <p className="text-gray-500 text-sm max-w-md">
                            {error || "We couldn't find the product you're looking for."}
                        </p>
                        <button
                            onClick={() => navigate('/')}
                            className="mt-2 px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const images = product.images || [];
    const mainImageUrl = images[selectedImage]?.url || '';

    /* ───────────────── Product Page ───────────────── */
    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Breadcrumb */}
            <div
                className="border-b border-gray-100"
                style={{ padding: '0.75rem 2rem' }}
            >
                <div className="max-w-7xl mx-auto flex items-center gap-2 text-sm text-gray-500">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center gap-1 hover:text-gray-800 transition-colors cursor-pointer"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        Home
                    </button>
                    <span>/</span>
                    <button
                        onClick={() => navigate(`/products/${product.category}`)}
                        className="hover:text-gray-800 transition-colors cursor-pointer"
                        style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: 'inherit' }}
                    >
                        {product.category}
                    </button>
                    <span>/</span>
                    <span className="text-gray-800 font-medium truncate max-w-xs">{product.name}</span>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto" style={{ padding: '2rem' }}>
                <div
                    className="flex gap-10"
                    style={{ flexWrap: 'wrap' }}
                >
                    {/* ═══════════ LEFT — Image Gallery ═══════════ */}
                    <div className="flex-1" style={{ minWidth: '320px', maxWidth: '450px' }}>
                        {/* Main Image */}
                        <div
                            className="relative overflow-hidden rounded-2xl bg-gray-50 group"
                            style={{ aspectRatio: '3/4' }}
                        >
                            {mainImageUrl ? (
                                <img
                                    src={mainImageUrl}
                                    alt={product.name}
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                    <span className="text-6xl">📷</span>
                                </div>
                            )}

                            {/* Special Tag Badge */}
                            {product.specialTag && (
                                <span
                                    className="absolute top-4 left-4 text-xs font-bold uppercase tracking-wider text-white rounded-full"
                                    style={{
                                        padding: '0.35rem 0.9rem',
                                        background: 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                    }}
                                >
                                    {product.specialTag}
                                </span>
                            )}
                        </div>

                        {/* Thumbnails */}
                        {images.length > 1 && (
                            <div
                                className="flex gap-3 mt-4 overflow-x-auto"
                                style={{ paddingBottom: '0.25rem' }}
                            >
                                {images.map((img, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedImage(index)}
                                        className="flex-shrink-0 rounded-xl overflow-hidden transition-all duration-200 cursor-pointer"
                                        style={{
                                            width: '5rem',
                                            height: '6.5rem',
                                            border: selectedImage === index
                                                ? '2.5px solid #EFBF04'
                                                : '2px solid transparent',
                                            opacity: selectedImage === index ? 1 : 0.6,
                                            transform: selectedImage === index ? 'scale(1.05)' : 'scale(1)',
                                        }}
                                    >
                                        <img
                                            src={img.url}
                                            alt={`${product.name} ${index + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ═══════════ RIGHT — Product Details ═══════════ */}
                    <div className="flex-1" style={{ minWidth: '320px' }}>
                        {/* Category */}
                        <p
                            className="uppercase tracking-widest font-semibold"
                            style={{
                                fontSize: '0.7rem',
                                color: '#EFBF04',
                                letterSpacing: '0.15em',
                                marginBottom: '0.5rem',
                            }}
                        >
                            {product.category}
                        </p>

                        {/* Product Name */}
                        <h1
                            className="font-bold text-gray-900 leading-tight"
                            style={{ fontSize: '1.85rem', marginBottom: '1rem' }}
                        >
                            {product.name}
                        </h1>

                        {/* Divider */}
                        <hr className="border-gray-100" style={{ marginBottom: '1.25rem' }} />

                        {/* Price */}
                        <div className="flex items-baseline gap-2" style={{ marginBottom: '0.4rem' }}>
                            <span
                                className="font-bold text-gray-900"
                                style={{ fontSize: '1.75rem' }}
                            >
                                {formatPrice(product.price)}
                            </span>
                        </div>


                        {/* Stock */}
                        {product.stock !== undefined && (
                            <p
                                className="text-sm"
                                style={{
                                    marginBottom: '1.5rem',
                                    color: product.stock === 0 ? '#ef4444' : '#6b7280',
                                }}
                            >
                                {product.stock === 0 ? (
                                    'Out of Stock'
                                ) : (
                                    <>
                                        In Stock —{' '}
                                        <span style={{ color: product.stock > 3 ? '#16a34a' : '#ef4444', fontWeight: 600 }}>
                                            {product.stock} left
                                        </span>
                                    </>
                                )}
                            </p>
                        )}

                        {/* Weight */}
                        {product.weight > 0 && (
                            <p
                                className="text-sm"
                                style={{
                                    marginBottom: '1.5rem',
                                    color: '#6b7280',
                                }}
                            >
                                Weight: <span style={{ fontWeight: 600, color: '#374151' }}>{product.weight}g</span>
                            </p>
                        )}

                        {/* Divider */}
                        <hr className="border-gray-100" style={{ marginBottom: '1.5rem' }} />

                        {/* Size Selector */}
                        <div style={{ marginBottom: '2rem' }}>
                            <p
                                className="font-bold text-gray-900 uppercase tracking-wide"
                                style={{ fontSize: '0.85rem', marginBottom: '0.85rem' }}
                            >
                                Select Size
                            </p>
                            <div className="flex gap-3 flex-wrap">
                                {sizes.map((size) => (
                                    <button
                                        key={size}
                                        onClick={() => setSelectedSize(size)}
                                        className="font-semibold transition-all duration-200 cursor-pointer"
                                        style={{
                                            width: '3rem',
                                            height: '3rem',
                                            borderRadius: '50%',
                                            fontSize: '0.85rem',
                                            border: selectedSize === size
                                                ? '2px solid #EFBF04'
                                                : '1.5px solid #d1d5db',
                                            backgroundColor: selectedSize === size
                                                ? '#EFBF04'
                                                : 'transparent',
                                            color: selectedSize === size
                                                ? '#ffffff'
                                                : '#374151',
                                            transform: selectedSize === size ? 'scale(1.1)' : 'scale(1)',
                                        }}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3" style={{ marginBottom: '2rem' }}>
                            {/* Buy Now */}
                            <button
                                onClick={() => {
                                    if (!selectedSize) {
                                        alert('Please select a size before proceeding.');
                                        return;
                                    }
                                    if (product.stock !== undefined && product.stock === 0) {
                                        alert('This product is currently out of stock.');
                                        return;
                                    }
                                    setBuyNowItem({
                                        productId: product._id,
                                        name: product.name,
                                        price: product.price,
                                        image: images[0]?.url || '',
                                        size: selectedSize,
                                        quantity: 1,
                                    });
                                    navigate('/checkout');
                                }}
                                disabled={product.stock !== undefined && product.stock === 0}
                                className="w-full font-bold uppercase tracking-wider text-white rounded-lg transition-all duration-200 cursor-pointer hover:shadow-lg active:scale-[0.98]"
                                style={{
                                    padding: '1rem',
                                    fontSize: '0.9rem',
                                    background: (product.stock !== undefined && product.stock === 0)
                                        ? '#d1d5db'
                                        : 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                    letterSpacing: '0.08em',
                                    cursor: (product.stock !== undefined && product.stock === 0) ? 'not-allowed' : 'pointer',
                                    opacity: (product.stock !== undefined && product.stock === 0) ? 0.6 : 1,
                                }}
                            >
                                Buy Now
                            </button>

                            {/* Add to Cart */}
                            <button
                                onClick={() => {
                                    addToCart({
                                        productId: product._id,
                                        name: product.name,
                                        price: product.price,
                                        image: images[0]?.url || '',
                                        size: selectedSize || '',
                                        quantity: 1,
                                    });
                                    openCart();
                                }}
                                className="w-full font-bold uppercase tracking-wider rounded-lg transition-all duration-200 cursor-pointer hover:bg-gray-50 active:scale-[0.98]"
                                style={{
                                    padding: '1rem',
                                    fontSize: '0.9rem',
                                    border: '2px solid #1f2937',
                                    color: '#1f2937',
                                    backgroundColor: 'white',
                                    letterSpacing: '0.08em',
                                }}
                            >
                                Add to Cart
                            </button>
                        </div>

                        {/* Divider */}
                        <hr className="border-gray-100" style={{ marginBottom: '1.5rem' }} />

                        {/* Description */}
                        <div>
                            <p
                                className="font-bold text-gray-900 uppercase tracking-wide"
                                style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}
                            >
                                Product Details
                            </p>
                            <p
                                className="text-gray-600 leading-relaxed"
                                style={{ fontSize: '0.9rem', lineHeight: '1.75' }}
                            >
                                {product.description}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductDetailsPage;
