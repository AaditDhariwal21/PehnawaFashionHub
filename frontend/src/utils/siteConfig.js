import { useSyncExternalStore } from 'react';

/**
 * Runtime storefront settings from the backend (GET /api/config).
 *
 * This is how the frontend learns whether guest checkout is on: it asks the
 * backend, whose GUEST_CHECKOUT_ENABLED variable (set on Render) is the single
 * switch for the feature. Nothing is baked in at build time, so turning the
 * switch on or off on Render applies to the live site without a Vercel
 * rebuild.
 *
 *   const config = useSiteConfig();   // null while loading
 *   config?.guestCheckoutEnabled      // true | false once loaded
 *
 * Fetched once per page load and shared by every component. If the backend
 * can't be reached, features are treated as OFF — the safe fallback, which is
 * the sign-in-to-order flow the site had before — and the next page load
 * tries again.
 */

const API = import.meta.env.VITE_API_URL;

let config = null;
let request = null;
const listeners = new Set();

const publish = (value) => {
    config = value;
    listeners.forEach((listener) => listener());
};

export const loadSiteConfig = () => {
    if (!request) {
        request = fetch(`${API}/config`, { cache: 'no-store' })
            .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`config ${res.status}`))))
            .then((data) => {
                publish({ guestCheckoutEnabled: data?.config?.guestCheckoutEnabled === true });
            })
            .catch((err) => {
                console.error('Could not load site settings:', err);
                request = null; // allow a retry on the next page load
                publish({ guestCheckoutEnabled: false });
            });
    }
    return request;
};

const subscribe = (listener) => {
    listeners.add(listener);
    loadSiteConfig();
    return () => listeners.delete(listener);
};

const getSnapshot = () => config;

export const useSiteConfig = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
