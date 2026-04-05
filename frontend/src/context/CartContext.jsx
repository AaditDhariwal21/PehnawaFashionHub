import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const CartContext = createContext();

const STORAGE_KEY = 'pehnawa_cart';
const BUYNOW_KEY = 'pehnawa_buyNow';

const readCart = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const items = raw ? JSON.parse(raw) : [];
        // Migrate old items that lack `color` field
        return items.map((i) => ({ ...i, color: i.color || '' }));
    } catch {
        return [];
    }
};

const writeCart = (items) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

const readBuyNow = () => {
    try {
        const raw = localStorage.getItem(BUYNOW_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

/* Cart item identity: productId + size + color */
const itemMatch = (a, b) =>
    a.productId === b.productId && a.size === b.size && (a.color || '') === (b.color || '');

export const CartProvider = ({ children }) => {
    const [cartItems, setCartItems] = useState(readCart);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [justAdded, setJustAdded] = useState(false);
    const [buyNowItem, setBuyNowItemState] = useState(readBuyNow);
    const addTimerRef = useRef(null);

    // Persist to localStorage on every change
    useEffect(() => {
        writeCart(cartItems);
    }, [cartItems]);

    const openCart = useCallback(() => setIsCartOpen(true), []);
    const closeCart = useCallback(() => setIsCartOpen(false), []);

    const addToCart = useCallback((item) => {
        const normalized = { ...item, color: item.color || '' };
        setCartItems((prev) => {
            const idx = prev.findIndex((i) => itemMatch(i, normalized));
            if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + (normalized.quantity || 1) };
                return updated;
            }
            return [...prev, { ...normalized, quantity: normalized.quantity || 1 }];
        });
        setJustAdded(true);
        if (addTimerRef.current) clearTimeout(addTimerRef.current);
        addTimerRef.current = setTimeout(() => setJustAdded(false), 3000);
    }, []);

    const removeFromCart = useCallback((productId, size, color = '') => {
        setCartItems((prev) => prev.filter(
            (i) => !(i.productId === productId && i.size === size && (i.color || '') === color)
        ));
    }, []);

    const updateQuantity = useCallback((productId, size, color = '', qty) => {
        if (qty < 1) return;
        setCartItems((prev) =>
            prev.map((i) =>
                i.productId === productId && i.size === size && (i.color || '') === color
                    ? { ...i, quantity: qty }
                    : i
            )
        );
    }, []);

    const getSubtotal = useCallback(() => {
        return cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    }, [cartItems]);

    const getTotalQuantity = useCallback(() => {
        return cartItems.reduce((sum, i) => sum + i.quantity, 0);
    }, [cartItems]);

    const clearCart = useCallback(() => {
        setCartItems([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    const setBuyNowItem = useCallback((item) => {
        setBuyNowItemState(item);
        localStorage.setItem(BUYNOW_KEY, JSON.stringify(item));
    }, []);

    const clearBuyNowItem = useCallback(() => {
        setBuyNowItemState(null);
        localStorage.removeItem(BUYNOW_KEY);
    }, []);

    return (
        <CartContext.Provider
            value={{
                cartItems,
                isCartOpen,
                justAdded,
                openCart,
                closeCart,
                addToCart,
                removeFromCart,
                updateQuantity,
                getSubtotal,
                getTotalQuantity,
                clearCart,
                buyNowItem,
                setBuyNowItem,
                clearBuyNowItem,
            }}
        >
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const ctx = useContext(CartContext);
    if (!ctx) throw new Error('useCart must be used inside CartProvider');
    return ctx;
};
