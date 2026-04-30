import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { buildVariantMatrix } from '../utils/variants.js';

const PRESET_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

/**
 * Variant matrix editor.
 *
 * Owns no state — the parent passes:
 *   colors    string[]     active colors (must come from the product's color list)
 *   sizes     string[]     active sizes
 *   variants  Variant[]    current variant rows
 *   onChange  (sizes, variants) => void   — called when sizes/variants change
 *
 * The matrix derives one row per (color × size). Per-row delete drops
 * a single combination; clicking a size button re-creates missing rows.
 */
const VariantMatrix = ({ colors, sizes, variants, onChange }) => {
    const totalStock = useMemo(
        () => variants.reduce((s, v) => s + (Number(v.stock) || 0), 0),
        [variants]
    );

    /* Add a size: regenerate the matrix, preserving existing rows. */
    const addSize = (raw) => {
        const size = raw.trim();
        if (!size || sizes.includes(size)) return;
        const nextSizes = [...sizes, size];
        const nextVariants = buildVariantMatrix(colors, nextSizes, variants);
        onChange(nextSizes, nextVariants);
    };

    const removeSize = (size) => {
        const nextSizes = sizes.filter((s) => s !== size);
        const nextVariants = buildVariantMatrix(colors, nextSizes, variants);
        onChange(nextSizes, nextVariants);
    };

    const updateRow = (color, size, field, value) => {
        const next = variants.map((v) =>
            v.color === color && v.size === size ? { ...v, [field]: value } : v
        );
        onChange(sizes, next);
    };

    /* Drop a single (color, size) combination from the matrix. */
    const removeRow = (color, size) => {
        const next = variants.filter((v) => !(v.color === color && v.size === size));
        onChange(sizes, next);
    };

    /* Re-create a single row that was previously removed. */
    const restoreRow = (color, size) => {
        if (variants.some((v) => v.color === color && v.size === size)) return;
        onChange(sizes, [...variants, { color, size, price: '', stock: '' }]);
    };

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

            {/* Size axis controls */}
            <div style={{ marginBottom: '1rem' }}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ marginBottom: '0.5rem' }}>
                    Sizes
                </p>
                <div className="flex flex-wrap" style={{ gap: '0.5rem', marginBottom: '0.6rem' }}>
                    {PRESET_SIZES.map((s) => {
                        const added = sizes.includes(s);
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => (added ? removeSize(s) : addSize(s))}
                                className="text-xs font-semibold rounded-full border-[1.5px] transition-all"
                                style={{
                                    padding: '6px 14px',
                                    borderColor: added ? '#EFBF04' : '#d1d5db',
                                    color: added ? '#fff' : '#6b7280',
                                    backgroundColor: added ? '#EFBF04' : 'transparent',
                                    cursor: 'pointer',
                                }}
                            >
                                {added ? `${s} ✓` : `+ ${s}`}
                            </button>
                        );
                    })}
                </div>
                <CustomSizeInput onAdd={addSize} />
            </div>

            {/* Matrix */}
            {colors.length === 0 ? (
                <div className="text-center" style={{ padding: '1.5rem 0' }}>
                    <p className="text-xs text-gray-400">Add at least one color to start the variant matrix.</p>
                </div>
            ) : sizes.length === 0 ? (
                <div className="text-center" style={{ padding: '1.5rem 0' }}>
                    <p className="text-xs text-gray-400">Pick the sizes this product comes in.</p>
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
                            {colors.flatMap((color) =>
                                sizes.map((size) => {
                                    const row = variants.find((v) => v.color === color && v.size === size);
                                    if (!row) {
                                        return (
                                            <tr key={`${color}__${size}__missing`} style={{ borderTop: '1px solid #f3f4f6' }}>
                                                <td style={tdStyle}>{color}</td>
                                                <td style={tdStyle}>{size}</td>
                                                <td colSpan={2} style={{ ...tdStyle, color: '#9ca3af', fontStyle: 'italic' }}>
                                                    Combination removed
                                                </td>
                                                <td style={tdStyle}>
                                                    <button
                                                        type="button"
                                                        onClick={() => restoreRow(color, size)}
                                                        title="Restore this combination"
                                                        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-amber-500 hover:bg-amber-50 cursor-pointer"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    }
                                    return (
                                        <tr key={`${color}__${size}`} style={{ borderTop: '1px solid #f3f4f6' }}>
                                            <td style={tdStyle}>{color}</td>
                                            <td style={tdStyle}>{size}</td>
                                            <td style={tdStyle}>
                                                <input
                                                    type="number" min="0" step="0.01"
                                                    value={row.price}
                                                    onChange={(e) => updateRow(color, size, 'price', e.target.value)}
                                                    placeholder="0.00"
                                                    className="text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                    style={{ padding: '5px 8px', width: '6rem' }}
                                                />
                                            </td>
                                            <td style={tdStyle}>
                                                <input
                                                    type="number" min="0"
                                                    value={row.stock}
                                                    onChange={(e) => updateRow(color, size, 'stock', e.target.value)}
                                                    placeholder="0"
                                                    className="text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                                                    style={{ padding: '5px 8px', width: '5rem' }}
                                                />
                                            </td>
                                            <td style={tdStyle}>
                                                <button
                                                    type="button"
                                                    onClick={() => removeRow(color, size)}
                                                    title="Remove this combination"
                                                    className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
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

/* Tiny inline component so the parent doesn't need its own state for the input. */
const CustomSizeInput = ({ onAdd }) => {
    return (
        <div className="flex" style={{ gap: '0.4rem' }}>
            <input
                type="text"
                placeholder="Custom size (e.g. Free Size)"
                className="flex-1 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                style={{ padding: '6px 10px' }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        onAdd(e.currentTarget.value);
                        e.currentTarget.value = '';
                    }
                }}
            />
            <button
                type="button"
                onClick={(e) => {
                    const input = e.currentTarget.previousSibling;
                    onAdd(input.value);
                    input.value = '';
                }}
                className="text-xs font-semibold rounded-md text-white cursor-pointer hover:opacity-90"
                style={{ padding: '6px 14px', backgroundColor: '#EFBF04' }}
            >
                Add
            </button>
        </div>
    );
};

export default VariantMatrix;
