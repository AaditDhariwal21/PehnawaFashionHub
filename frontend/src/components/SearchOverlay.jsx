import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';

import './SearchOverlay.css';

const API_BASE_URL = 'http://localhost:5000/api';

const popularSearches = [
    'Anarkali Suits',
    'Coord Sets',
    'Silk',
    'Lehenga',
    'Kurta',
];

const SearchOverlay = ({ isOpen, onClose }) => {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const inputRef = useRef(null);
    const debounceRef = useRef(null);
    const navigate = useNavigate();

    /* Auto-focus when opened */
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSuggestions([]);
            const t = setTimeout(() => inputRef.current?.focus(), 100);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    /* ESC key closes */
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen, onClose]);

    /* Lock body scroll */
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    /* Debounced live search */
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        const trimmed = query.trim();
        if (trimmed.length < 2) {
            setSuggestions([]);
            setLoadingSuggestions(false);
            return;
        }

        setLoadingSuggestions(true);
        debounceRef.current = setTimeout(async () => {
            try {
                const res = await fetch(
                    `${API_BASE_URL}/products/search?q=${encodeURIComponent(trimmed)}`
                );
                const data = await res.json();
                if (data.success) {
                    setSuggestions(data.products.slice(0, 4));
                }
            } catch {
                setSuggestions([]);
            } finally {
                setLoadingSuggestions(false);
            }
        }, 300);

        return () => clearTimeout(debounceRef.current);
    }, [query]);

    const handleSearch = (term) => {
        const q = (term ?? query).trim();
        if (!q) return;
        onClose();
        navigate(`/search?q=${encodeURIComponent(q)}`);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleSearch();
    };

    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    const goToProduct = (id) => {
        onClose();
        navigate(`/product/${id}`);
    };

    if (!isOpen) return null;

    const showSuggestions = query.trim().length >= 2;

    return (
        <div className="search-overlay" onClick={handleBackdrop}>
            {/* Close */}
            <button className="search-overlay__close" onClick={onClose} aria-label="Close search">
                <X size={22} strokeWidth={2} />
            </button>

            <div className="search-overlay__container">
                {/* Search input */}
                <div className="search-overlay__input-wrap">
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search products…"
                        className="search-overlay__input"
                    />
                    <Search className="search-overlay__icon" size={20} strokeWidth={2} />
                </div>

                {/* Live suggestions dropdown */}
                {showSuggestions && (
                    <div className="search-overlay__dropdown">
                        {loadingSuggestions ? (
                            <div className="search-overlay__dropdown-loading">
                                <div className="search-overlay__dropdown-spinner" />
                                <span>Searching…</span>
                            </div>
                        ) : suggestions.length > 0 ? (
                            <>
                                {suggestions.map((product) => (
                                    <div
                                        key={product._id}
                                        className="search-overlay__dropdown-item"
                                        onClick={() => goToProduct(product._id)}
                                    >
                                        <div className="search-overlay__dropdown-thumb">
                                            {product.images?.[0]?.url ? (
                                                <img src={product.images[0].url} alt={product.name} />
                                            ) : (
                                                <span className="search-overlay__dropdown-placeholder">📷</span>
                                            )}
                                        </div>
                                        <div className="search-overlay__dropdown-info">
                                            <p className="search-overlay__dropdown-name">{product.name}</p>
                                            <p className="search-overlay__dropdown-meta">
                                                <span className="search-overlay__dropdown-cat">{product.category}</span>
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                <button
                                    className="search-overlay__dropdown-viewall"
                                    onClick={() => handleSearch()}
                                >
                                    View all results →
                                </button>
                            </>
                        ) : (
                            <div className="search-overlay__dropdown-empty">
                                No products found for "{query.trim()}"
                            </div>
                        )}
                    </div>
                )}

                {/* Popular searches — hide when suggestions are showing */}
                {!showSuggestions && (
                    <div className="search-overlay__popular">
                        <span className="search-overlay__popular-label">Popular:</span>
                        {popularSearches.map((tag) => (
                            <button
                                key={tag}
                                className="search-overlay__tag"
                                onClick={() => handleSearch(tag)}
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SearchOverlay;
