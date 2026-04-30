import { useRef, useState } from 'react';
import { Plus, X, Upload } from 'lucide-react';

/**
 * Image manager for products: one row per color, images live ONLY under
 * their color, drag-drop reassigns an image to another color.
 *
 * Controlled component — owns no canonical state. The parent passes:
 *   colors: Array<{
 *     colorName: string,
 *     images: Array<
 *       { kind: 'existing', url: string, publicId: string } |
 *       { kind: 'new',      file: File, preview: string }
 *     >
 *   }>
 *   onChange(nextColors)    called whenever the colors/images change
 *
 * On save, the parent uploads every `kind: 'new'` file, swaps each one
 * for its returned {url, publicId}, and sends `colors` to the API.
 */

const DRAG_MIME = 'application/x-pehnawa-image';

const ColorImagesManager = ({ colors, onChange }) => {
    const [draftColor, setDraftColor] = useState('');
    const [dragOverColor, setDragOverColor] = useState(null);
    const fileInputs = useRef({}); // { [colorName]: HTMLInputElement }

    /* ────── color CRUD ────── */
    const addColor = () => {
        const name = draftColor.trim();
        if (!name) return;
        if (colors.some((c) => c.colorName.toLowerCase() === name.toLowerCase())) {
            setDraftColor('');
            return;
        }
        onChange([...colors, { colorName: name, images: [] }]);
        setDraftColor('');
    };

    const removeColor = (colorName) => {
        onChange(colors.filter((c) => c.colorName !== colorName));
    };

    /* ────── image CRUD ────── */
    const addFiles = (colorName, fileList) => {
        const files = Array.from(fileList || []);
        if (files.length === 0) return;
        const additions = files.map((file) => ({
            kind: 'new',
            file,
            preview: URL.createObjectURL(file),
        }));
        onChange(
            colors.map((c) =>
                c.colorName === colorName ? { ...c, images: [...c.images, ...additions] } : c
            )
        );
    };

    const removeImage = (colorName, idx) => {
        onChange(
            colors.map((c) =>
                c.colorName === colorName
                    ? { ...c, images: c.images.filter((_, i) => i !== idx) }
                    : c
            )
        );
    };

    /* ────── drag & drop reassignment ────── */
    const onDragStart = (e, fromColor, fromIdx) => {
        // Encoding the source as JSON in a custom MIME so we don't confuse
        // ourselves with arbitrary external drags.
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ fromColor, fromIdx }));
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOverRow = (e, toColor) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverColor !== toColor) setDragOverColor(toColor);
    };

    const onDragLeaveRow = (e) => {
        // Only clear when leaving the row entirely, not when crossing
        // child elements.
        if (!e.currentTarget.contains(e.relatedTarget)) setDragOverColor(null);
    };

    const onDropRow = (e, toColor) => {
        e.preventDefault();
        setDragOverColor(null);
        const raw = e.dataTransfer.getData(DRAG_MIME);
        if (!raw) return;
        const { fromColor, fromIdx } = JSON.parse(raw);
        if (fromColor === toColor) return; // same row, nothing to do

        const fromEntry = colors.find((c) => c.colorName === fromColor);
        if (!fromEntry) return;
        const moving = fromEntry.images[fromIdx];
        if (!moving) return;

        onChange(
            colors.map((c) => {
                if (c.colorName === fromColor) {
                    return { ...c, images: c.images.filter((_, i) => i !== fromIdx) };
                }
                if (c.colorName === toColor) {
                    return { ...c, images: [...c.images, moving] };
                }
                return c;
            })
        );
    };

    return (
        <div>
            <div className="flex items-baseline justify-between" style={{ marginBottom: '0.6rem' }}>
                <p className="text-sm font-semibold text-gray-700">
                    Product Colors & Images <span className="text-red-400">*</span>
                </p>
                {colors.length > 0 && colors[0].images.length > 0 && (
                    <span className="text-[0.65rem] text-amber-700 font-bold uppercase tracking-wider">
                        First image of "{colors[0].colorName}" is the card thumbnail
                    </span>
                )}
            </div>

            {/* ── Add color ── */}
            <div className="flex gap-2" style={{ marginBottom: '0.6rem' }}>
                <input
                    type="text"
                    value={draftColor}
                    onChange={(e) => setDraftColor(e.target.value)}
                    placeholder="Add a color (e.g. Red, Navy Blue)"
                    className="flex-1 text-sm border border-gray-200 rounded-lg text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    style={{ padding: '8px 12px' }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColor(); } }}
                />
                <button
                    type="button"
                    onClick={addColor}
                    disabled={!draftColor.trim()}
                    className="text-xs font-semibold rounded-lg text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ padding: '8px 16px', backgroundColor: '#EFBF04' }}
                >
                    <Plus className="w-3.5 h-3.5 inline -mt-0.5" /> Add
                </button>
            </div>

            {/* ── Color chips ── */}
            {colors.length > 0 && (
                <div className="flex flex-wrap gap-1.5" style={{ marginBottom: '0.85rem' }}>
                    {colors.map((c) => (
                        <span
                            key={c.colorName}
                            className="inline-flex items-center gap-1 rounded-full text-xs font-semibold"
                            style={{
                                padding: '4px 10px',
                                border: '1.5px solid #fde68a',
                                backgroundColor: '#fffbeb',
                                color: '#92400e',
                            }}
                        >
                            {c.colorName}
                            <span className="text-amber-700/70" style={{ fontSize: '0.65rem' }}>
                                ({c.images.length})
                            </span>
                            <button
                                type="button"
                                onClick={() => removeColor(c.colorName)}
                                className="text-amber-700/60 hover:text-red-500 cursor-pointer"
                                title={`Remove "${c.colorName}"`}
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* ── Empty state ── */}
            {colors.length === 0 ? (
                <div
                    className="border-2 border-dashed border-gray-200 rounded-xl text-center bg-gray-50/50"
                    style={{ padding: '32px 16px' }}
                >
                    <Upload className="w-6 h-6 mx-auto text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400">
                        Add a color above. Each color gets its own row of images below.
                    </p>
                </div>
            ) : (
                <>
                    {/* ── Per-color image rows ── */}
                    <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                        {/* Header */}
                        <div
                            className="grid items-center"
                            style={{
                                gridTemplateColumns: '110px 1fr',
                                padding: '0.55rem 0.85rem',
                                backgroundColor: '#f9fafb',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                color: '#6b7280',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                borderBottom: '1px solid #e5e7eb',
                            }}
                        >
                            <span>Color</span>
                            <span>Images</span>
                        </div>

                        {colors.map((c, rowIdx) => {
                            const isDropTarget = dragOverColor === c.colorName;
                            return (
                                <div
                                    key={c.colorName}
                                    onDragOver={(e) => onDragOverRow(e, c.colorName)}
                                    onDragLeave={onDragLeaveRow}
                                    onDrop={(e) => onDropRow(e, c.colorName)}
                                    className="grid items-center transition-colors"
                                    style={{
                                        gridTemplateColumns: '110px 1fr',
                                        padding: '0.65rem 0.85rem',
                                        borderTop: rowIdx === 0 ? 'none' : '1px solid #f3f4f6',
                                        backgroundColor: isDropTarget ? '#fffbeb' : 'transparent',
                                    }}
                                >
                                    {/* Color label */}
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold text-gray-800">{c.colorName}</span>
                                        {rowIdx === 0 && (
                                            <span className="text-[0.6rem] uppercase tracking-wider text-amber-600 font-bold">
                                                Default
                                            </span>
                                        )}
                                    </div>

                                    {/* Image strip */}
                                    <div
                                        className="flex items-center gap-2 overflow-x-auto"
                                        style={{ minHeight: '4.5rem', paddingBottom: '0.15rem' }}
                                    >
                                        {c.images.map((img, idx) => {
                                            const src = img.kind === 'existing' ? img.url : img.preview;
                                            return (
                                                <div
                                                    key={idx}
                                                    draggable
                                                    onDragStart={(e) => onDragStart(e, c.colorName, idx)}
                                                    className="relative flex-shrink-0 group cursor-grab active:cursor-grabbing"
                                                    title="Drag to another color to reassign"
                                                    style={{
                                                        width: '3.75rem',
                                                        height: '3.75rem',
                                                    }}
                                                >
                                                    <img
                                                        src={src}
                                                        alt=""
                                                        className="w-full h-full object-cover rounded-lg border border-gray-200"
                                                        draggable={false}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeImage(c.colorName, idx)}
                                                        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[0.55rem] cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remove image"
                                                    >
                                                        ×
                                                    </button>
                                                    {img.kind === 'new' && (
                                                        <span
                                                            className="absolute bottom-0.5 left-0.5 text-[0.55rem] font-bold uppercase rounded-sm"
                                                            style={{
                                                                padding: '1px 4px',
                                                                backgroundColor: 'rgba(239,191,4,0.95)',
                                                                color: '#fff',
                                                            }}
                                                        >
                                                            NEW
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Add (+) button */}
                                        <button
                                            type="button"
                                            onClick={() => fileInputs.current[c.colorName]?.click()}
                                            className="flex-shrink-0 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 hover:border-amber-400 hover:bg-amber-50/40 transition-colors cursor-pointer"
                                            style={{ width: '3.75rem', height: '3.75rem' }}
                                            title={`Upload images for "${c.colorName}"`}
                                        >
                                            <Plus className="w-5 h-5 text-gray-300" />
                                        </button>
                                        <input
                                            ref={(el) => { fileInputs.current[c.colorName] = el; }}
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => {
                                                addFiles(c.colorName, e.target.files);
                                                e.target.value = ''; // allow re-uploading the same file
                                            }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-[0.7rem] text-gray-400" style={{ marginTop: '0.5rem' }}>
                        Drag any image onto another color row to reassign it.
                    </p>
                </>
            )}
        </div>
    );
};

/**
 * Helper used by parents to upload pending `kind: 'new'` images and
 * produce the final `colors` payload to send to the API. Preserves
 * intra-color ordering.
 */
export const finalizeColors = async (colors, uploadFiles) => {
    const result = [];
    for (const c of colors) {
        const newFiles = c.images.filter((i) => i.kind === 'new').map((i) => i.file);
        const uploaded = newFiles.length ? await uploadFiles(newFiles) : [];

        let nIdx = 0;
        const finalImages = c.images.map((i) =>
            i.kind === 'existing'
                ? { url: i.url, publicId: i.publicId }
                : uploaded[nIdx++]
        );

        result.push({ colorName: c.colorName, images: finalImages });
    }
    return result;
};

export default ColorImagesManager;
