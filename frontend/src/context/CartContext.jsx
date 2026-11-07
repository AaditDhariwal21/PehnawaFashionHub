import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

const CartContext = createContext();

const STORAGE_KEY = 'pehnawa_cart';
const BUYNOW_KEY = 'pehnawa_buyNow';
const API = import.meta.env.VITE_API_URL;

/** Mirrors the server's per-line cap (CHECKOUT_LIMITS.MAX_QTY_PER_LINE). */
const MAX_QTY_PER_LINE = 20;

const readCart = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const items = raw ? JSON.parse(raw) : [];
        // Migrate old items that lack `color` field
        return Array.isArray(items) ? items.map((i) => ({ ...i, color: i.color || '' })) : [];
    } catch {
        return [];
    }
};

const writeCart = (items) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        /* storage unavailable */
    }
};

const removeStoredCart = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* storage unavailable */
    }
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

const lineKey = (item) => ({ productId: item.productId, color: item.color || '', size: item.size || '' });

/**
 * Cart state.
 *
 * Signed out: the cart lives in localStorage only, exactly as before.
 * Signed in:  the cart lives on the server (/api/cart) and follows the account
 *             across devices. localStorage holds no cart while signed in.
 *
 * Transitions:
 *   sign in   the signed-out cart is merged into the account cart (same item
 *             in both → quantities added, capped), then cleared from the
 *             browser.
 *   sign out  the cart disappears from this browser, so the next person on a
 *             shared device doesn't see it. It stays saved on the account.
 *
 * The functions exposed to components are unchanged, so nothing that adds,
 * removes or reads cart items needed to change. Buy Now stays browser-only:
 * it is a one-off purchase, not part of the saved cart.
 */
export const CartProvider = ({ children }) => {
    const { isLoggedIn } = useAuth();
    const [cartItems, setCartItems] = useState(() => (isLoggedIn ? [] : readCart()));
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [justAdded, setJustAdded] = useState(false);
    const [buyNowItem, setBuyNowItemState] = useState(readBuyNow);
    const addTimerRef = useRef(null);

    /** 'local' while signed out, 'server' while signed in. Read synchronously by the mutators. */
    const modeRef = useRef(isLoggedIn ? 'server' : 'local');
    /** Only the newest server response may set the cart, so out-of-order replies to rapid taps can't revert it. */
    const requestSeqRef = useRef(0);
    /** True while the sign-in merge/fetch is running. */
    const syncingRef = useRef(false);

    /**
     * The promo the server validated for this cart, exactly as it came back
     * from /api/promo/validate — every figure in it is server-computed and
     * nothing here recalculates a discount locally.
     *
     * Deliberately NOT persisted: a discount is only ever valid against a
     * specific cart at a specific moment. Every mutator below drops it;
     * create-checkout re-validates independently in any case.
     */
    const [appliedPromo, setAppliedPromo] = useState(null);

    const applyPromo = useCallback((serverPromo) => setAppliedPromo(serverPromo), []);
    const clearPromo = useCallback(() => setAppliedPromo(null), []);

    /* Persist to localStorage on every change — signed-out mode only. */
    useEffect(() => {
        if (modeRef.current === 'local') writeCart(cartItems);
    }, [cartItems]);

    /* ── Server calls ── */

    const serverRequest = useCallback(async (method, path, body) => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Not signed in');
        const seq = ++requestSeqRef.current;
        const res = await fetch(`${API}/cart${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || `Cart request failed (${res.status})`);
        if (seq === requestSeqRef.current && modeRef.current === 'server') {
            setCartItems(Array.isArray(data.items) ? data.items : []);
        }
        return data.items;
    }, []);

    const refreshCart = useCallback(async () => {
        if (modeRef.current !== 'server') return;
        try {
            await serverRequest('GET', '');
        } catch (err) {
            console.error('Cart refresh error:', err);
        }
    }, [serverRequest]);

    /**
     * Apply a change optimistically, send it, and re-sync from the server if it
     * fails. Changes are sent one at a time, in order, so rapid taps (+, +, +)
     * reach the server in the order they were made.
     */
    const changeQueueRef = useRef(Promise.resolve());
    const sendServerChange = useCallback((method, path, body) => {
        changeQueueRef.current = changeQueueRef.current
            .then(() => serverRequest(method, path, body))
            .catch((err) => {
                console.error('Cart update error:', err);
                return refreshCart();
            });
    }, [serverRequest, refreshCart]);

    /* ── Sign-in / sign-out transitions ── */
    useEffect(() => {
        let cancelled = false;

        if (isLoggedIn) {
            modeRef.current = 'server';
            /* One sync per sign-in. Without this, React StrictMode's double
               effect run in development would merge the same items twice. */
            if (syncingRef.current) return () => { cancelled = true; };
            syncingRef.current = true;
            const localItems = readCart();

            (async () => {
                try {
                    if (localItems.length > 0) {
                        await serverRequest('POST', '/merge', {
                            items: localItems.map((i) => ({
                                ...lineKey(i),
                                quantity: Math.min(MAX_QTY_PER_LINE, Math.max(1, Math.floor(Number(i.quantity) || 1))),
                            })),
                        });
                        /* Only once the merge is saved: on failure the browser
                           copy survives and the merge is retried next load. */
                        removeStoredCart();
                    } else {
                        await serverRequest('GET', '');
                    }
                } catch (err) {
                    console.error('Cart sync error:', err);
                    if (localItems.length > 0 && modeRef.current === 'server') setCartItems(localItems);
                } finally {
                    syncingRef.current = false;
                }
            })();
        } else if (modeRef.current === 'server') {
            /* Signed out after being signed in. */
            modeRef.current = 'local';
            requestSeqRef.current += 1; // discard any reply still in flight
            removeStoredCart();
            Promise.resolve().then(() => {
                if (cancelled) return;
                setCartItems([]);
                setAppliedPromo(null);
            });
        }

        return () => { cancelled = true; };
    }, [isLoggedIn, serverRequest]);

    const openCart = useCallback(() => setIsCartOpen(true), []);
    const closeCart = useCallback(() => setIsCartOpen(false), []);

    const addToCart = useCallback((item) => {
        const normalized = { ...item, color: item.color || '', quantity: item.quantity || 1 };
        setCartItems((prev) => {
            const idx = prev.findIndex((i) => itemMatch(i, normalized));
            if (idx !== -1) {
                const updated = [...prev];
                updated[idx] = {
                    ...updated[idx],
                    quantity: Math.min(MAX_QTY_PER_LINE, updated[idx].quantity + normalized.quantity),
                };
                return updated;
            }
            return [...prev, { ...normalized, quantity: Math.min(MAX_QTY_PER_LINE, normalized.quantity) }];
        });
        if (modeRef.current === 'server') {
            sendServerChange('POST', '/items', { ...lineKey(normalized), quantity: Math.min(MAX_QTY_PER_LINE, normalized.quantity) });
        }
        setJustAdded(true);
        setAppliedPromo(null);
        if (addTimerRef.current) clearTimeout(addTimerRef.current);
        addTimerRef.current = setTimeout(() => setJustAdded(false), 3000);
    }, [sendServerChange]);

    const removeFromCart = useCallback((productId, size, color = '') => {
        setCartItems((prev) => prev.filter(
            (i) => !(i.productId === productId && i.size === size && (i.color || '') === color)
        ));
        if (modeRef.current === 'server') {
            sendServerChange('DELETE', '/items', { productId, color, size });
        }
        setAppliedPromo(null);
    }, [sendServerChange]);

    const updateQuantity = useCallback((productId, size, color = '', qty) => {
        if (qty < 1) return;
        const capped = Math.min(MAX_QTY_PER_LINE, qty);
        setCartItems((prev) =>
            prev.map((i) =>
                i.productId === productId && i.size === size && (i.color || '') === color
                    ? { ...i, quantity: capped }
                    : i
            )
        );
        if (modeRef.current === 'server') {
            sendServerChange('PUT', '/items', { productId, color, size, quantity: capped });
        }
        setAppliedPromo(null);
    }, [sendServerChange]);

    const getSubtotal = useCallback(() => {
        return cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    }, [cartItems]);

    const getTotalQuantity = useCallback(() => {
        return cartItems.reduce((sum, i) => sum + i.quantity, 0);
    }, [cartItems]);

    const clearCart = useCallback(() => {
        setCartItems([]);
        setAppliedPromo(null);
        if (modeRef.current === 'server') {
            sendServerChange('DELETE', '', null);
        } else {
            removeStoredCart();
        }
    }, [sendServerChange]);

    /* Buy Now swaps the checkout set to a single item, so a promo validated
       against the cart can't carry over to it (or back again). */
    const setBuyNowItem = useCallback((item) => {
        setBuyNowItemState(item);
        setAppliedPromo(null);
        try {
            localStorage.setItem(BUYNOW_KEY, JSON.stringify(item));
        } catch {
            /* storage unavailable */
        }
    }, []);

    const clearBuyNowItem = useCallback(() => {
        setBuyNowItemState(null);
        setAppliedPromo(null);
        try {
            localStorage.removeItem(BUYNOW_KEY);
        } catch {
            /* storage unavailable */
        }
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
                refreshCart,
                buyNowItem,
                setBuyNowItem,
                clearBuyNowItem,
                appliedPromo,
                applyPromo,
                clearPromo,
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
