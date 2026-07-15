import { imageAttrs } from "../utils/cloudinaryImage.js";

/**
 * CloudinaryImage — a drop-in replacement for a product `<img>`.
 *
 * It turns a raw stored Cloudinary URL into a correctly-sized, modern-format,
 * responsive image and applies sane loading behaviour, without changing any
 * layout: pass the same `className` you'd give a plain `<img>` and it renders
 * one. Non-Cloudinary / empty `src` values pass straight through, so it is
 * safe on local assets and order snapshots too.
 *
 * Props
 *   src      raw image URL (usually product.images[0].url)
 *   alt      alt text (required for a11y; falls back to "")
 *   preset   context key from IMAGE_PRESETS: 'card' | 'cover' | 'detailMain'
 *            | 'thumb' | 'cartThumb'. Default 'card'.
 *   sizes    optional override of the preset's `sizes` hint
 *   eager    above-the-fold image: load eagerly at high fetch priority
 *            (default is lazy + async decode so below-the-fold images defer).
 *   ...rest  className, style, onClick, etc. are forwarded to the <img>.
 */
const CloudinaryImage = ({ src, alt = "", preset = "card", sizes, eager = false, ...rest }) => {
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
            {...rest}
        />
    );
};

export default CloudinaryImage;
