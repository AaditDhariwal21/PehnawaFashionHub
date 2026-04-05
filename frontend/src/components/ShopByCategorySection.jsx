import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL;

const ShopByCategorySection = () => {
    const navigate = useNavigate();
    const [covers, setCovers] = useState({});

    const categories = [
        { id: 1, name: 'New Arrivals' },
        { id: 2, name: 'Anarkalis' },
        { id: 3, name: 'Coord Sets' },
        { id: 4, name: 'Lehangas' },
        { id: 5, name: 'Indo Western' },
        { id: 6, name: 'Suits & Kurtis' },
        { id: 7, name: 'Sarees' },
        { id: 8, name: 'Blouses' },
        { id: 9, name: 'Kidswear' },
        { id: 10, name: "Men's Kurta" },
        { id: 11, name: 'Dupattas' },
        { id: 12, name: 'Pashminas' },
    ];

    useEffect(() => {
        const fetchCovers = async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/products/categories/covers`);
                const data = await res.json();
                if (data.success) {
                    setCovers(data.covers);
                }
            } catch (err) {
                console.error('Failed to fetch category covers', err);
            }
        };
        fetchCovers();
    }, []);

    return (
        <div
            className="w-full flex flex-col items-center"
            style={{
                paddingTop: 'clamp(1.5rem, 4vw, 3rem)',
                paddingBottom: 'clamp(2.5rem, 6vw, 6rem)',
                gap: 'clamp(1.25rem, 3vw, 3rem)',
                background: 'linear-gradient(to bottom, #FAD76C 0%, #FAD76C 85%, #FFFFFF 100%)',
            }}
        >
            {/* Section Title */}
            <h2
                className="font-light text-gray-900 tracking-wide uppercase text-center px-4"
                style={{ fontSize: 'clamp(1.5rem, 4vw, 3rem)' }}
            >
                Shop by Category
            </h2>

            {/*
                12 categories → equal rows at every breakpoint:
                  default : 1 col  × 12 rows
                  ≥480px  : 2 cols ×  6 rows
                  ≥640px  : 3 cols ×  4 rows
                  ≥768px  : 4 cols ×  3 rows
                  ≥1024px : 6 cols ×  2 rows
            */}
            <div
                className="
                    grid w-full mx-auto px-6 sm:px-8 lg:px-12
                    grid-cols-1
                    min-[480px]:grid-cols-2
                    sm:grid-cols-3
                    md:grid-cols-4
                    lg:grid-cols-6
                "
                style={{
                    gap: 'clamp(1rem, 2.5vw, 2.5rem)',
                    maxWidth: '1100px',
                }}
            >
                {categories.map((category) => {
                    const cover = covers[category.name];
                    const coverImage = cover?.image || null;

                    return (
                        <div
                            key={category.id}
                            className="group cursor-pointer"
                            onClick={() => navigate(`/products/${encodeURIComponent(category.name)}`)}
                        >
                            {/* Category Image */}
                            <div className="aspect-square bg-stone-100 rounded-lg overflow-hidden relative mb-2">
                                {coverImage ? (
                                    <img
                                        src={coverImage}
                                        alt={category.name}
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-b from-stone-200 to-stone-300 flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
                                        <div className="w-12 h-12 rounded-full bg-stone-400/30"></div>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </div>

                            {/* Category Name */}
                            <p
                                className="font-medium text-gray-900 uppercase tracking-wider text-center"
                                style={{ fontSize: 'clamp(0.7rem, 1.2vw, 0.875rem)' }}
                            >
                                {category.name}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ShopByCategorySection;
