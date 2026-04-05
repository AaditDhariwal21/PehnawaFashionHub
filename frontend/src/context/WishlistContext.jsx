import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const WishlistContext = createContext();

const STORAGE_KEY = 'pehnawa_wishlist';
const API = import.meta.env.VITE_API_URL;

/** Read wishlist from localStorage, auto-migrate old format (string[]) to new ({productId,color,size}[]) */
const readLocal = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return parsed.map((item) =>
            typeof item === 'string'
                ? { productId: item, color: '', size: '' }
                : item
        );
    } catch {
        return [];
    }
};

const writeLocal = (items) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const getToken = () => localStorage.getItem('token');

export const WishlistProvider = ({ children }) => {
    const { isLoggedIn } = useAuth();
    const [items, setItems] = useState(readLocal);
    const [loading, setLoading] = useState(false);

    // Sync from API when user logs in
    useEffect(() => {
        if (!isLoggedIn) return;
        const token = getToken();
        if (!token) return;

        setLoading(true);
        fetch(`${API}/wishlist`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((r) => r.json())
            .then((data) => {
                if (data.success && data.products) {
                    const apiIds = data.products.map((p) => (typeof p === 'string' ? p : p._id));
                    const localItems = readLocal();
                    const localIds = localItems.map((item) => item.productId);

                    // Merge: keep local variant info, add API-only items
                    const merged = [...localItems];
                    const seen = new Set(localIds);
                    apiIds.forEach((id) => {
                        if (!seen.has(id)) {
                            merged.push({ productId: id, color: '', size: '' });
                            seen.add(id);
                        }
                    });

                    setItems(merged);
                    writeLocal(merged);

                    // Push any local-only items to backend
                    const newIds = localIds.filter((id) => !apiIds.includes(id));
                    newIds.forEach((id) => {
                        fetch(`${API}/wishlist`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ productId: id }),
                        }).catch(() => {});
                    });
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [isLoggedIn]);

    /** Check if a product (any variant) is wishlisted */
    const isWishlisted = useCallback(
        (productId) => items.some((item) => item.productId === productId),
        [items]
    );

    /** Get the stored wishlist entry for a product (includes variant info) */
    const getWishlistItem = useCallback(
        (productId) => items.find((item) => item.productId === productId) || null,
        [items]
    );

    /** Add product with optional variant info (one entry per product — deduped by productId) */
    const addToWishlist = useCallback(
        (productId, color = '', size = '') => {
            setItems((prev) => {
                if (prev.some((item) => item.productId === productId)) return prev;
                const next = [...prev, { productId, color, size }];
                writeLocal(next);
                return next;
            });

            const token = getToken();
            if (token) {
                fetch(`${API}/wishlist`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ productId }),
                }).catch(() => {});
            }
        },
        []
    );

    /** Remove product from wishlist */
    const removeFromWishlist = useCallback(
        (productId) => {
            setItems((prev) => {
                const next = prev.filter((item) => item.productId !== productId);
                writeLocal(next);
                return next;
            });

            const token = getToken();
            if (token) {
                fetch(`${API}/wishlist/${productId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                }).catch(() => {});
            }
        },
        []
    );

    /** Toggle wishlist with optional variant */
    const toggleWishlist = useCallback(
        (productId, color = '', size = '') => {
            if (items.some((item) => item.productId === productId)) {
                removeFromWishlist(productId);
            } else {
                addToWishlist(productId, color, size);
            }
        },
        [items, addToWishlist, removeFromWishlist]
    );

    // Derived: plain array of product IDs (backward compat for fetching)
    const wishlistIds = items.map((item) => item.productId);

    return (
        <WishlistContext.Provider
            value={{
                items,
                wishlistIds,
                loading,
                isWishlisted,
                getWishlistItem,
                addToWishlist,
                removeFromWishlist,
                toggleWishlist,
                wishlistCount: items.length,
            }}
        >
            {children}
        </WishlistContext.Provider>
    );
};

export const useWishlist = () => {
    const ctx = useContext(WishlistContext);
    if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
    return ctx;
};
