import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import formatPrice from '../utils/formatPrice';

const NewArrivalsSection = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animationClass, setAnimationClass] = useState('');
    const itemsPerPage = 5;

    // Fetch products from backend
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await fetch('https://pehnawafashionhub.onrender.com/api/products/tag/New Arrival');
                const data = await response.json();
                if (data.success) {
                    setProducts(data.products);
                }
            } catch (error) {
                console.error('Error fetching products:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, []);

    const totalPages = Math.ceil(products.length / itemsPerPage);

    const handlePrev = () => {
        if (isAnimating) return;
        setIsAnimating(true);
        setAnimationClass('slide-out-right');

        setTimeout(() => {
            setCurrentIndex((prev) => (prev === 0 ? totalPages - 1 : prev - 1));
            setAnimationClass('slide-in-left');
        }, 250);

        setTimeout(() => {
            setAnimationClass('');
            setIsAnimating(false);
        }, 500);
    };

    const handleNext = () => {
        if (isAnimating) return;
        setIsAnimating(true);
        setAnimationClass('slide-out-left');

        setTimeout(() => {
            setCurrentIndex((prev) => (prev === totalPages - 1 ? 0 : prev + 1));
            setAnimationClass('slide-in-right');
        }, 250);

        setTimeout(() => {
            setAnimationClass('');
            setIsAnimating(false);
        }, 500);
    };

    const handleDotClick = (index) => {
        if (isAnimating || index === currentIndex) return;
        const direction = index > currentIndex ? 'next' : 'prev';

        setIsAnimating(true);
        setAnimationClass(direction === 'next' ? 'slide-out-left' : 'slide-out-right');

        setTimeout(() => {
            setCurrentIndex(index);
            setAnimationClass(direction === 'next' ? 'slide-in-right' : 'slide-in-left');
        }, 250);

        setTimeout(() => {
            setAnimationClass('');
            setIsAnimating(false);
        }, 500);
    };

    const visibleProducts = products.slice(
        currentIndex * itemsPerPage,
        currentIndex * itemsPerPage + itemsPerPage
    );

    // Animation styles
    const getAnimationStyle = () => {
        switch (animationClass) {
            case 'slide-out-left':
                return { transform: 'translateX(-100%)', opacity: 0, transition: 'all 0.25s ease-in' };
            case 'slide-out-right':
                return { transform: 'translateX(100%)', opacity: 0, transition: 'all 0.25s ease-in' };
            case 'slide-in-right':
                return { transform: 'translateX(0)', opacity: 1, transition: 'all 0.25s ease-out' };
            case 'slide-in-left':
                return { transform: 'translateX(0)', opacity: 1, transition: 'all 0.25s ease-out' };
            default:
                return { transform: 'translateX(0)', opacity: 1 };
        }
    };

    // Initial position for slide-in animations
    useEffect(() => {
        if (animationClass === 'slide-in-right') {
            // Start from right, slide to center
            const el = document.getElementById('products-grid');
            if (el) {
                el.style.transform = 'translateX(100%)';
                el.style.opacity = '0';
                requestAnimationFrame(() => {
                    el.style.transition = 'all 0.25s ease-out';
                    el.style.transform = 'translateX(0)';
                    el.style.opacity = '1';
                });
            }
        } else if (animationClass === 'slide-in-left') {
            // Start from left, slide to center
            const el = document.getElementById('products-grid');
            if (el) {
                el.style.transform = 'translateX(-100%)';
                el.style.opacity = '0';
                requestAnimationFrame(() => {
                    el.style.transition = 'all 0.25s ease-out';
                    el.style.transform = 'translateX(0)';
                    el.style.opacity = '1';
                });
            }
        }
    }, [animationClass]);

    return (
        <div className="w-full flex flex-col justify-center items-center" style={{ paddingTop: '3rem', paddingBottom: '6rem', gap: '3rem', background: 'linear-gradient(to bottom, #FFFFFF 0%, #FFFFFF 85%, #FAD76C 100%)' }}>
            {/* Section Title */}
            <div className="flex justify-center items-center">
                <h2 className="text-5xl font-light text-gray-900 tracking-wide uppercase">
                    New Arrivals
                </h2>
            </div>

            {/* Products Grid */}
            <div className="flex justify-evenly items-center w-full overflow-hidden">
                {/* Left Arrow */}
                <button
                    onClick={handlePrev}
                    disabled={isAnimating || products.length === 0}
                    className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center text-gray-600 hover:text-gray-900 hover:shadow-lg transition-all z-10 disabled:opacity-50 cursor-pointer"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>

                {/* Products */}
                <div
                    id="products-grid"
                    className="grid grid-cols-5"
                    style={{
                        gap: '1.5rem',
                        ...(animationClass.startsWith('slide-out') ? getAnimationStyle() : {})
                    }}
                >
                    {loading ? (
                        // Loading skeleton
                        Array.from({ length: itemsPerPage }).map((_, index) => (
                            <div key={index} className="group" style={{ width: '18rem' }}>
                                <div className="aspect-[3/4] bg-stone-200 rounded-lg animate-pulse" style={{ marginBottom: '1rem' }}></div>
                                <div className="h-4 bg-stone-200 rounded animate-pulse mb-2"></div>
                                <div className="h-4 bg-stone-200 rounded animate-pulse w-1/3"></div>
                            </div>
                        ))
                    ) : visibleProducts.length > 0 ? (
                        visibleProducts.map((product) => (
                            <div key={product._id} className="group cursor-pointer" style={{ width: '18rem' }} onClick={() => navigate(`/product/${product._id}`)}>
                                {/* Product Image */}
                                <div className="aspect-[3/4] bg-stone-100 rounded-lg overflow-hidden relative" style={{ marginBottom: '1rem' }}>
                                    {product.images && product.images.length > 0 ? (
                                        <img
                                            src={product.images[0].url}
                                            alt={product.name}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-b from-stone-200 to-stone-300 flex items-center justify-center">
                                            <div className="w-20 h-20 rounded-full bg-stone-400/30"></div>
                                        </div>
                                    )}
                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </div>

                                {/* Product Info */}
                                <div>
                                    <h3 className="text-base text-gray-800 font-normal leading-snug mb-1 line-clamp-2">
                                        {product.name} - {product.category}
                                    </h3>
                                    <p className="text-base text-gray-600 font-medium">
                                        {formatPrice(product.price)}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-5 text-center text-gray-500 py-10">
                            No products available
                        </div>
                    )}
                </div>

                {/* Right Arrow */}
                <button
                    onClick={handleNext}
                    disabled={isAnimating || products.length === 0}
                    className="w-12 h-12 bg-white rounded-full shadow-md flex items-center justify-center text-gray-600 hover:text-gray-900 hover:shadow-lg transition-all z-10 disabled:opacity-50 cursor-pointer"
                >
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>

            {/* Page Indicators */}
            <div className="flex items-center" style={{ gap: '0.5rem' }}>
                {Array.from({ length: totalPages }).map((_, index) => (
                    <button
                        key={index}
                        onClick={() => handleDotClick(index)}
                        disabled={isAnimating}
                        className={`h-2 rounded-full transition-all duration-300 ${currentIndex === index
                            ? 'bg-gray-900 w-6'
                            : 'bg-gray-300 hover:bg-gray-400 w-2'
                            }`}
                    />
                ))}
            </div>
        </div>
    );
};

export default NewArrivalsSection;
