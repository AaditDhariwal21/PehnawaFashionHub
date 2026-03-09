import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import Navbar from '../components/Navbar';
import formatPrice from '../utils/formatPrice';
import './SearchResultsPage.css';

const SearchResultsPage = () => {
    const [searchParams] = useSearchParams();
    const query = searchParams.get('q') || '';
    const navigate = useNavigate();

    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!query.trim()) {
            setProducts([]);
            setLoading(false);
            return;
        }

        const fetchResults = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch(
                    `${import.meta.env.VITE_API_URL}/products/search?q=${encodeURIComponent(query)}`
                );
                const data = await res.json();

                if (!data.success) {
                    throw new Error(data.message || 'Search failed');
                }

                setProducts(data.products);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
    }, [query]);

    /* ── Loading ── */
    if (loading) {
        return (
            <div className="search-results">
                <Navbar />
                <div className="search-results__loader">
                    <div className="search-results__spinner" />
                </div>
            </div>
        );
    }

    /* ── Error ── */
    if (error) {
        return (
            <div className="search-results">
                <Navbar />
                <div className="search-results__empty">
                    <div className="search-results__empty-icon">⚠️</div>
                    <h3>Something went wrong</h3>
                    <p>{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        style={{
                            marginTop: '1rem',
                            padding: '0.6rem 1.5rem',
                            backgroundColor: '#111827',
                            color: '#fff',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            border: 'none',
                            cursor: 'pointer',
                        }}
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    /* ── Page ── */
    return (
        <div className="search-results">
            <Navbar />

            {/* Breadcrumb */}
            <div className="search-results__breadcrumb">
                <button onClick={() => navigate('/')}>
                    <ChevronLeft size={16} />
                    Home
                </button>
                <span>/</span>
                <span className="current">Search</span>
            </div>

            {/* Header */}
            <div className="search-results__header">
                <h1 className="search-results__title">
                    Search results for "<span>{query}</span>"
                </h1>
                <p className="search-results__count">
                    {products.length} {products.length === 1 ? 'product' : 'products'} found
                </p>
            </div>

            {/* Results */}
            <div style={{ padding: '1.5rem 2rem 4rem' }}>
                {products.length === 0 ? (
                    <div className="search-results__empty">
                        <div className="search-results__empty-icon">🔍</div>
                        <h3>No products found</h3>
                        <p>Try a different search term.</p>
                    </div>
                ) : (
                    <div className="search-results__grid">
                        {products.map((product) => {
                            const imageUrl = product.images?.[0]?.url;
                            return (
                                <div
                                    key={product._id}
                                    className="search-results__card"
                                    onClick={() => navigate(`/product/${product._id}`)}
                                >
                                    {/* Image */}
                                    <div className="search-results__card-img-wrap">
                                        {imageUrl ? (
                                            <img
                                                src={imageUrl}
                                                alt={product.name}
                                                className="search-results__card-img"
                                            />
                                        ) : (
                                            <div className="search-results__card-placeholder">📷</div>
                                        )}
                                        <div className="search-results__card-overlay" />
                                        {product.specialTag && (
                                            <span className="search-results__card-tag">{product.specialTag}</span>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="search-results__card-info">
                                        <h3 className="search-results__card-name">{product.name}</h3>
                                        <p className="search-results__card-price">
                                            {formatPrice(product.price)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchResultsPage;
