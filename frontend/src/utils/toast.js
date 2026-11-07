import { createContext, useContext } from 'react';

/**
 * Site-wide toast notifications.
 *
 *   const toast = useToast();
 *   toast.success('Logged out successfully');
 *   toast.error('Please select a size.');
 *   toast.info('Your saved cart is back.');
 *
 * Rendered by <ToastProvider> (components/ToastProvider.jsx), which wraps the
 * app. Lives in its own module so the provider file only exports a component
 * (React Fast Refresh requirement).
 *
 * Not used for "added to cart" (the cart drawer has its own confirmation) or
 * the compare-limit notice (CompareBar) — those keep their existing UI.
 */
export const ToastContext = createContext(null);

const NOOP = { success: () => {}, error: () => {}, info: () => {}, dismiss: () => {} };

export const useToast = () => useContext(ToastContext) || NOOP;
