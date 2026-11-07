import { useState } from "react";
import { imageAttrs } from "../utils/cloudinaryImage.js";

/**
 * Shown when an image can't be loaded (a deleted asset, an empty URL, a
 * network failure) instead of the browser's broken-image icon and stray alt
 * text. A neutral tile with a hanger outline — inline, so it never needs a
 * network request of its own.
 */
const PLACEHOLDER_SRC =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100">' +
        '<rect width="80" height="100" fill="#f3f4f6"/>' +
        '<g fill="none" stroke="#c4c9d1" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M40 38a5 5 0 1 1 5-5c0 2.6-5 3.6-5 7"/>' +
        '<path d="M40 40 18 56a3 3 0 0 0 1.8 5.4h40.4A3 3 0 0 0 62 56Z"/>' +
        "</g></svg>"
    );

/**
 * CloudinaryImage — a drop-in replacement for a product `<img>`.
 *
 * It turns a raw stored Cloudinary URL into a correctly-sized, modern-format,
 * responsive image and applies sane loading behaviour, without changing any
 * layout: pass the same `className` you'd give a plain `<img>` and it renders
 * one. Non-Cloudinary / empty `src` values pass straight through, so it is
 * safe on local assets and order snapshots too. If the image fails to load,
 * it swaps in a neutral placeholder of the same size.
 *
 * Props
 *   src      raw image URL (usually product.images[0].url)
 *   alt      alt text (required for a11y; falls back to "")
 *   preset   context key from IMAGE_PRESETS: 'card' | 'cover' | 'detailMain'
 *            | 'thumb' | 'cartThumb' | 'orderThumb'. Default 'card'.
 *   sizes    optional override of the preset's `sizes` hint
 *   eager    above-the-fold image: load eagerly at high fetch priority
 *            (default is lazy + async decode so below-the-fold images defer).
 *   ...rest  className, style, onClick, etc. are forwarded to the <img>.
 */
const CloudinaryImage = ({ src, alt = "", preset = "card", sizes, eager = false, onError, ...rest }) => {
    /* Remember WHICH src failed, so a new src (e.g. a colour change) is tried
       afresh without needing an effect to reset the flag. */
    const [failedSrc, setFailedSrc] = useState(null);
    const failed = !src || failedSrc === src;

    if (failed) {
        return <img src={PLACEHOLDER_SRC} alt={alt} decoding="async" {...rest} />;
    }

    const attrs = imageAttrs(src, preset, { sizes });

    return (
        <img
            src={attrs.src}
            srcSet={attrs.srcSet}
            sizes={attrs.srcSet ? attrs.sizes : undefined}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={eager ? "high" : "auto"}
            onError={(e) => {
                setFailedSrc(src);
                onError?.(e);
            }}
            {...rest}
        />
    );
};

export default CloudinaryImage;
