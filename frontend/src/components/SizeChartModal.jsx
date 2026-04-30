import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * SizeChartModal renders a single chart from `sizeCharts.js` as a
 * responsive table inside a centered modal. It owns no chart data —
 * the parent passes a `chart` shaped as { title, unit?, columns, rows }.
 */
const SizeChartModal = ({ isOpen, onClose, chart }) => {
    // ESC closes; lock body scroll while open.
    useEffect(() => {
        if (!isOpen) return;
        const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handleEsc);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = prev;
        };
    }, [isOpen, onClose]);

    if (!isOpen || !chart) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                className="relative w-full max-h-[88vh] overflow-hidden flex flex-col"
                style={{ maxWidth: '720px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.18)' }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between shrink-0"
                    style={{ padding: '18px 24px', borderBottom: '1px solid #e5e7eb' }}
                >
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">{chart.title}</h2>
                        {chart.unit && (
                            <p className="text-xs text-gray-400" style={{ marginTop: '0.15rem' }}>
                                All measurements in {chart.unit}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body — table */}
                <div className="flex-1 overflow-auto" style={{ padding: '20px 24px' }}>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#fffbeb' }}>
                                    {chart.columns.map((col) => (
                                        <th
                                            key={col}
                                            style={{
                                                textAlign: 'left',
                                                padding: '0.7rem 0.85rem',
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: '#92400e',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.06em',
                                                borderBottom: '1.5px solid #fde68a',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {col}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {chart.rows.map((row, i) => (
                                    <tr
                                        key={i}
                                        style={{
                                            backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafafa',
                                            borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
                                        }}
                                    >
                                        {row.map((cell, j) => (
                                            <td
                                                key={j}
                                                style={{
                                                    padding: '0.65rem 0.85rem',
                                                    color: j === 0 ? '#111827' : '#4b5563',
                                                    fontWeight: j === 0 ? 600 : 400,
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {cell}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-gray-400" style={{ marginTop: '0.85rem', lineHeight: 1.6 }}>
                        Measurements may vary slightly depending on fabric and style. If your size sits between two
                        rows, we recommend going up.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SizeChartModal;
