/**
 * Cloudinary delivery-time image optimization — single source of truth.
 *
 * WHY THIS EXISTS
 * ---------------
 * Product images are uploaded to Cloudinary as raw originals (often 4–5 MB
 * PNGs) and were previously served untouched into slots a few hundred pixels
 * wide. This module rewrites those delivery URLs on the fly so the browser
 * downloads a correctly-sized, modern-format image instead of the original.
 *
 * It does this purely by string-injecting a transformation segment after the
 * `/upload/` marker in an existing Cloudinary URL. That means:
 *   - It works on EVERY stored URL, old or new — no DB migration, no re-upload.
 *   - It preserves whatever cloud name / version / folder the URL already has.
 *   - Non-Cloudinary URLs (local /assets, blob:, data:, order snapshots that
 *     aren't Cloudinary) and empty values are returned untouched, so it is
 *     always safe to call.
 *
 * The transformations we use:
 *   f_auto   — pick the best format the browser accepts (AVIF/WebP), JPEG/PNG
 *              fallback for old browsers (never larger than the original).
 *   q_auto   — visually-lossless automatic quality (not a fixed low setting).
 *   c_limit  — only ever DOWNSCALE, never upscale. Guarantees a legacy image
 *              smaller than the requested width is served at its own size
 *              rather than erroring or being blown up. CSS `object-cover` keeps
 *              doing the visual cropping exactly as before, so layouts and the
 *              visible crop are unchanged.
 */

const UPLOAD_MARKER = "/image/upload/";

/**
 * True when `url` is a Cloudinary delivery URL we can transform.
 */
function isCloudinaryUrl(url) {
    return typeof url === "string" && url.includes(UPLOAD_MARKER);
}

/**
 * Detect a transformation segment that is ALREADY present right after
 * `/upload/` (e.g. `f_auto,q_auto,w_600`). Stored URLs in this app never carry
 * one — the segment there is always the version (`v1777…`) or the folder — but
 * we detect it so we never double-transform if that ever changes.
 *
 * A Cloudinary transform segment is comma-separated `key_value` tokens; the
 * version segment (`v` + digits) and folder names never contain an underscore.
 */
function hasExistingTransform(afterUpload) {
    const firstSegment = afterUpload.split("/")[0] || "";
    if (firstSegment.includes(",")) return true;
    // `key_value` param with no file extension → a transform, not a filename.
    return /^[a-z]{1,3}_[^/.]+$/i.test(firstSegment);
}

/**
 * Build the transformation string from options. Order is cosmetic to Cloudinary
 * but kept stable so generated URLs are cache-friendly and diff-friendly.
 */
function buildTransform({ width, height, crop = "limit", quality = "auto", format = "auto", extra } = {}) {
    const parts = [`f_${format}`, `q_${quality}`, `c_${crop}`];
    if (width) parts.push(`w_${Math.round(width)}`);
    if (height) parts.push(`h_${Math.round(height)}`);
    if (extra) parts.push(extra);
    return parts.join(",");
}

/**
 * Return `url` with a Cloudinary transformation injected. Safe on any input:
 * non-Cloudinary or empty values come back unchanged.
 */
export function cloudinaryUrl(url, options = {}) {
    if (!isCloudinaryUrl(url)) return url;

    const idx = url.indexOf(UPLOAD_MARKER);
    const start = idx + UPLOAD_MARKER.length;
    const afterUpload = url.slice(start);

    if (hasExistingTransform(afterUpload)) return url;

    const transform = buildTransform(options);
    return `${url.slice(0, start)}${transform}/${afterUpload}`;
}

/**
 * Build a `srcset` string of width-descriptor candidates so the browser can
 * pick the right resolution for the element's layout size AND device pixel
 * ratio. `c_limit` means over-large candidates for a small original are simply
 * capped, so listing generous widths is harmless.
 */
export function cloudinarySrcSet(url, widths, options = {}) {
    if (!isCloudinaryUrl(url) || !Array.isArray(widths) || widths.length === 0) {
        return undefined;
    }
    return widths
        .map((w) => `${cloudinaryUrl(url, { ...options, width: w })} ${w}w`)
        .join(", ");
}

/**
 * Presets map each rendering context to (a) a base width for the `src`
 * fallback, (b) the `srcset` candidate widths, (c) the `sizes` hint describing
 * how wide the element actually renders, and (d) quality. Widths cover 1×
 * through ~3× device pixel ratios for the context's largest layout size.
 *
 * Keep contexts here rather than scattering magic numbers across components —
 * every surface then benefits from one tuning change.
 */
export const IMAGE_PRESETS = {
    // Product cards: carousels, related, wishlist, search & category grids.
    // Largest layout ~260px CSS; retina → ~640px.
    card: {
        baseWidth: 400,
        widths: [180, 240, 320, 400, 500, 640],
        sizes: "(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 260px",
        quality: "auto",
    },
    // Square "Shop by Category" cover tiles.
    cover: {
        baseWidth: 400,
        widths: [180, 240, 320, 400, 560],
        sizes: "(max-width: 640px) 45vw, (max-width: 768px) 30vw, (max-width: 1024px) 22vw, 280px",
        quality: "auto",
    },
    // Product detail hero — viewed largest, so slightly richer quality budget.
    detailMain: {
        baseWidth: 900,
        widths: [400, 600, 800, 1000, 1200],
        sizes: "(max-width: 768px) 92vw, 450px",
        quality: "auto:good",
    },
    // Small thumbnails: detail gallery strip, colour swatches, admin lists.
    thumb: {
        baseWidth: 200,
        widths: [96, 160, 208, 256],
        sizes: "120px",
        quality: "auto",
    },
    // Cart / order line-item thumbnails (rendered from stored snapshot URLs).
    cartThumb: {
        baseWidth: 200,
        widths: [96, 160, 200, 256],
        sizes: "96px",
        quality: "auto",
    },
};

/**
 * Resolve the full set of `<img>` attributes for a given source + preset in one
 * call, so the component layer stays tiny. Returns `{ src, srcSet, sizes }`.
 * Callers may override `sizes` (e.g. a surface that renders wider than the
 * preset's default).
 */
export function imageAttrs(url, presetName = "card", { sizes } = {}) {
    const preset = IMAGE_PRESETS[presetName] || IMAGE_PRESETS.card;
    const opts = { quality: preset.quality };
    return {
        src: cloudinaryUrl(url, { ...opts, width: preset.baseWidth }),
        srcSet: cloudinarySrcSet(url, preset.widths, opts),
        sizes: sizes || preset.sizes,
    };
}
