import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const CompareContext = createContext();

const STORAGE_KEY = 'pehnawa_compare';
const MAX_COMPARE = 3;

/** Read compare list from localStorage */
const readCompare = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

const writeCompare = (items) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
};

export const CompareProvider = ({ children }) => {
    const [compareItems, setCompareItems] = useState(readCompare);
    // Transient flag — true for 2 s when user tries to exceed the max
    const [limitReached, setLimitReached] = useState(false);
    const limitTimer = useRef(null);

    // Persist to localStorage whenever compare list changes
    useEffect(() => {
        writeCompare(compareItems);
    }, [compareItems]);

    /** Check if a product is already in compare list */
    const isInCompare = useCallback(
        (productId) => compareItems.some((item) => item.productId === productId),
        [compareItems]
    );

    /**
     * Add a product to the compare list.
     * Stores only the lightweight info needed for the CompareBar thumbnail.
     * Full product data is fetched on the ComparePage.
     * @returns {boolean} true if added, false if limit reached or duplicate
     */
    const addToCompare = useCallback(
        ({ productId, name, image, price, category }) => {
            // Duplicate guard
            if (compareItems.some((i) => i.productId === productId)) return false;

            // Limit guard
            if (compareItems.length >= MAX_COMPARE) {
                setLimitReached(true);
                if (limitTimer.current) clearTimeout(limitTimer.current);
                limitTimer.current = setTimeout(() => setLimitReached(false), 2500);
                return false;
            }

            setCompareItems((prev) => [...prev, { productId, name, image, price, category }]);
            return true;
        },
        [compareItems]
    );

    /** Remove a product from compare list by ID */
    const removeFromCompare = useCallback((productId) => {
        setCompareItems((prev) => prev.filter((i) => i.productId !== productId));
    }, []);

    /** Toggle a product in/out of compare list */
    const toggleCompare = useCallback(
        (product) => {
            if (isInCompare(product.productId)) {
                removeFromCompare(product.productId);
            } else {
                addToCompare(product);
            }
        },
        [isInCompare, addToCompare, removeFromCompare]
    );

    /** Clear entire compare list */
    const clearCompare = useCallback(() => {
        setCompareItems([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return (
        <CompareContext.Provider
            value={{
                compareItems,
                compareCount: compareItems.length,
                limitReached,
                isInCompare,
                addToCompare,
                removeFromCompare,
                toggleCompare,
                clearCompare,
                MAX_COMPARE,
            }}
        >
            {children}
        </CompareContext.Provider>
    );
};

export const useCompare = () => {
    const ctx = useContext(CompareContext);
    if (!ctx) throw new Error('useCompare must be used inside CompareProvider');
    return ctx;
};
