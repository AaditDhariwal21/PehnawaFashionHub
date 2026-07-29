import { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
    addSizeToColors,
    removeSizeFromColors,
    removeVariant,
    sizesForColor,
    variantFieldIssues,
} from '../utils/variants.js';

const PRESET_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

/* Sentinel for the deliberate "every color" choice. Not a color name, so it
   cannot collide with one. */
const ALL_COLORS = '__ALL_COLORS__';

/**
 * Variant editor.
 *
 * Owns no variant state — the parent passes:
 *   colors    string[]    the product's colors, in the admin's curated order
 *   variants  Variant[]   the authoritative variant list [{color,size,price,stock}]
 *   onChange  (nextVariants) => void
 *
 * `variants` is the source of truth, NOT a derived colors × sizes product.
 * That distinction is the whole point of this component:
 *
 *   - A size belongs to a *color*, so adding one is always scoped to the
 *     color (or colors) the admin explicitly picked. Nothing fans out
 *     implicitly.
 *   - Deleting a row deletes it. There is no cartesian rebuild left that
 *     could re-create it, so the deletion survives every later edit and
 *     reaches the save payload.
 *
 * Sizes are intentionally NOT editable in place: change a variant's size by
 * deleting it and adding the size you want. That keeps (color, size) a stable
 * identity rather than something a keystroke can silently repoint.
 */
const VariantMatrix = ({ colors, variants, onChange }) => {
    /* Which color a new size applies to. Defaults to the first color rather
       than to "all", so the safe choice is the default one. */
    const [scope, setScope] = useState(colors[0] || '');
    const [draftSize, setDraftSize] = useState('');
    const [notice, setNotice] = useState('');

    /* A removed or renamed color must not leave the picker pointing at
       something that no longer exists. */
    const activeScope = scope === ALL_COLORS || colors.includes(scope)
        ? scope
        : (colors[0] || '');

    const targetColors = useMemo(
        () => (activeScope === ALL_COLORS ? colors : [activeScope]).filter(Boolean),
        [activeScope, colors]
    );

    const totalStock = useMemo(
        () => variants.reduce((s, v) => s + (Number(v.stock) || 0), 0),
        [variants]
    );

    /* Sizes already present across every color in the current scope — drives
       the preset chip state, so a chip means "this scope has this size". */
    const scopeSizes = useMemo(() => {
        if (targetColors.length === 0) return new Set();
        const perColor = targetColors.map((c) => new Set(sizesForColor(variants, c)));
        const [first, ...rest] = perColor;
        return new Set([...first].filter((s) => rest.every((set) => set.has(s))));
    }, [variants, targetColors]);

    const scopeLabel = activeScope === ALL_COLORS
        ? `all ${colors.length} colors`
        : `"${activeScope}"`;

    const addSize = (raw) => {
        setNotice('');
        const size = String(raw || '').trim();
        if (!size) return;
        if (targetColors.length === 0) {
            setNotice('Add a color first.');
            return;
        }

        const { variants: next, added, skipped } = addSizeToColors(variants, targetColors, size);
        if (added.length === 0) {
            /* Duplicate guard — a (color, size) pair is unique by definition. */
            setNotice(`${skipped.join(', ')} already exist${skipped.length === 1 ? 's' : ''}.`);
            return;
        }
        setNotice(
            skipped.length > 0
                ? `Added ${added.join(', ')}. Skipped ${skipped.join(', ')} — already there.`
                : `Added ${added.join(', ')} — set its price and stock below.`
        );
        onChange(next);
    };

    const removeSize = (size) => {
        setNotice('');
        onChange(removeSizeFromColors(variants, targetColors, size));
    };

    const updateRow = (color, size, field, value) => {
        onChange(
            variants.map((v) =>
                v.color === color && v.size === size ? { ...v, [field]: value } : v
            )
        );
    };

    /* Authoritative delete of a single (color, size) combination. */
    const removeRow = (color, size) => {
        setNotice('');
        onChange(removeVariant(variants, color, size));
    };

    const handleDraftSubmit = () => {
        addSize(draftSize);
        setDraftSize('');
    };

    /* One group per color, so it is always obvious which sizes a color has. */
    const grouped = colors.map((color) => ({
        color,
        rows: variants.filter((v) => v.color === color),
    }));

    return (
        <div className="bg-gray-50 border border-gray-200 rounded-xl" style={{ padding: '1.25rem 1.5rem' }}>
            {/* Header */}
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
                <div>
                    <p className="text-sm font-semibold text-gray-700">Variants <span className="text-red-400">*</span></p>
                    <p className="text-xs text-gray-400" style={{ marginTop: '0.15rem' }}>
                        Each color × size combination has its own price and stock.
                    </p>
                </div>
                <span
                    className="text-xs font-bold rounded-full"
                    style={{
                        padding: '4px 12px',
                        backgroundColor: totalStock > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                        color: totalStock > 0 ? '#16a34a' : '#dc2626',
                    }}
                >
                    Total: {totalStock}
                </span>
            </div>

            {/* ── Add a size, scoped to a color ── */}
            <div style={{ marginBottom: '1rem' }}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ marginBottom: '0.5rem' }}>
                    Add a size to
                </p>

                <select
                    data-testid="add-size-color"
                    value={activeScope}
                    onChange={(e) => { setScope(e.target.value); setNotice(''); }}
                    disabled={colors.length === 0}
                    className={`w-full text-sm border border-gray-200 rounded-md text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-400 ${colors.length === 0 ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                    style={{ padding: '7px 10px', marginBottom: '0.6rem' }}
                >
                    {colors.length === 0 && <option value="">Add a color first</option>}
                    {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                    {colors.length > 1 && <option value={ALL_COLORS}>All colors ({colors.length})</option>}
                </select>

                <div className="flex flex-wrap" style={{ gap: '0.5rem', marginBottom: '0.6rem' }}>
                    {PRESET_SIZES.map((s) => {
                        const added = scopeSizes.has(s);
                        return (
                            <button
                                key={s}
                                type="button"
                                data-testid={`add-size-preset-${s}`}
                                disabled={colors.length === 0}
                                onClick={() => (added ? removeSize(s) : addSize(s))}
                                title={added ? `Remove ${s} from ${scopeLabel}` : `Add ${s} to ${scopeLabel}`}
                                className="text-xs font-semibold rounded-full border-[1.5px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                    padding: '6px 14px',
                                    borderColor: added ? '#EFBF04' : '#d1d5db',
                                    color: added ? '#fff' : '#6b7280',
                                    backgroundColor: added ? '#EFBF04' : 'transparent',
                                    cursor: colors.length === 0 ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {added ? `${s} ✓` : `+ ${s}`}
                            </button>
                        );
                    })}
                </div>

                <div className="flex" style={{ gap: '0.4rem' }}>
                    <input
                        data-testid="add-size-input"
                        type="text"
                        value={draftSize}
                        onChange={(e) => setDraftSize(e.target.value)}
                        placeholder="Custom size (e.g. Free Size)"
                        disabled={colors.length === 0}
                        className="flex-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
                        style={{ padding: '6px 10px' }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleDraftSubmit(); }
                        }}
                    />
                    <button
                        data-testid="add-size-submit"
                        type="button"
                        onClick={handleDraftSubmit}
                        disabled={colors.length === 0 || !draftSize.trim()}
                        className="text-xs font-semibold rounded-md text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ padding: '6px 14px', backgroundColor: '#EFBF04' }}
                    >
                        Add
                    </button>
                </div>

                <p className="text-[0.7rem] text-gray-400" style={{ marginTop: '0.4rem' }}>
                    {colors.length === 0
                        ? 'Sizes are added per color — add a color first.'
                        : `Applies to ${scopeLabel}. To change a size, delete the row and add the size you want.`}
                </p>

                {notice && (
                    <p data-testid="add-size-notice" className="text-[0.7rem] font-medium text-amber-700" style={{ marginTop: '0.3rem' }}>
                        {notice}
                    </p>
                )}
            </div>

            {/* ── Rows ── */}
            {colors.length === 0 ? (
                <div className="text-center" style={{ padding: '1.5rem 0' }}>
                    <p className="text-xs text-gray-400">Add at least one color to start adding variants.</p>
                </div>
            ) : variants.length === 0 ? (
                <div className="text-center" style={{ padding: '1.5rem 0' }}>
                    <p className="text-xs text-gray-400">No variants yet. Pick a color above and add a size.</p>
                </div>
            ) : (
                <div className="overflow-x-auto bg-white rounded-lg border border-gray-200">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb' }}>
                                <th style={thStyle}>Color</th>
                                <th style={thStyle}>Size</th>
                                <th style={thStyle}>Price ($) <span className="text-red-400">*</span></th>
                                <th style={thStyle}>Stock <span className="text-red-400">*</span></th>
                                <th style={{ ...thStyle, width: '2.5rem' }} />
                            </tr>
                        </thead>
                        <tbody>
                            {grouped.flatMap(({ color, rows }) => {
                                if (rows.length === 0) {
                                    return [(
                                        <tr key={`${color}__empty`} style={{ borderTop: '1px solid #f3f4f6' }}>
                                            <td style={tdStyle}>{color}</td>
                                            <td colSpan={4} style={{ ...tdStyle, color: '#9ca3af', fontStyle: 'italic' }}>
                                                No sizes yet — pick "{color}" above and add one.
                                            </td>
                                        </tr>
                                    )];
                                }

                                return rows.map((row) => {
                                    const { missing, invalid } = variantFieldIssues(row);
                                    const needsAttention = missing.length > 0 || invalid.length > 0;
                                    return (
                                        <tr
                                            key={`${color}__${row.size}`}
                                            data-testid={`variant-row-${color}-${row.size}`}
                                            style={{
                                                borderTop: '1px solid #f3f4f6',
                                                backgroundColor: needsAttention ? 'rgba(239,191,4,0.07)' : 'transparent',
                                            }}
                                            title={needsAttention ? `${color} / ${row.size} needs a price and stock before you can save.` : undefined}
                                        >
                                            <td style={tdStyle}>{color}</td>
                                            <td style={tdStyle}>{row.size}</td>
                                            <td style={tdStyle}>
                                                <input
                                                    type="number" min="0" step="0.01"
                                                    value={row.price}
                                                    onChange={(e) => updateRow(color, row.size, 'price', e.target.value)}
                                                    placeholder="0.00"
                                                    className="text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                    style={{ padding: '5px 8px', width: '6rem' }}
                                                />
                                            </td>
                                            <td style={tdStyle}>
                                                <input
                                                    type="number" min="0"
                                                    value={row.stock}
                                                    onChange={(e) => updateRow(color, row.size, 'stock', e.target.value)}
                                                    placeholder="0"
                                                    className="text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                    style={{ padding: '5px 8px', width: '5rem' }}
                                                />
                                            </td>
                                            <td style={tdStyle}>
                                                <button
                                                    type="button"
                                                    onClick={() => removeRow(color, row.size)}
                                                    title="Remove this combination"
                                                    className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                });
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

const thStyle = {
    textAlign: 'left',
    padding: '0.55rem 0.75rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
};
const tdStyle = { padding: '0.5rem 0.75rem', color: '#374151' };

export default VariantMatrix;
