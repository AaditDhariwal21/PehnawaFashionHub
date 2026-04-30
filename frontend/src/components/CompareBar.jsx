import { useNavigate } from 'react-router-dom';
import { X, Scale, Trash2 } from 'lucide-react';
import { useCompare } from '../context/CompareContext';

const CompareBar = () => {
    const navigate = useNavigate();
    const { compareItems, compareCount, limitReached, removeFromCompare, clearCompare, MAX_COMPARE } = useCompare();

    // Don't render if nothing to compare
    if (compareCount === 0) return null;

    const emptySlots = MAX_COMPARE - compareCount;

    return (
        <>
            {/* Limit-reached toast */}
            {limitReached && (
                <div
                    className="compare-toast"
                    style={{
                        position: 'fixed',
                        bottom: '7rem',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: 1001,
                        backgroundColor: '#1f2937',
                        color: '#fff',
                        padding: '0.6rem 1.25rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        animation: 'compareToastIn 0.3s ease-out',
                        whiteSpace: 'nowrap',
                    }}
                >
                    Maximum {MAX_COMPARE} products can be compared
                </div>
            )}

            {/* Compare Bar */}
            <div
                style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    backgroundColor: '#fff',
                    borderTop: '1px solid #e5e7eb',
                    boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
                    animation: 'compareSlideUp 0.3s ease-out',
                }}
            >
                <div
                    style={{
                        maxWidth: '960px',
                        margin: '0 auto',
                        padding: '0.75rem clamp(1rem, 3vw, 2rem)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'clamp(0.5rem, 2vw, 1.25rem)',
                    }}
                >
                    {/* Compare icon + label */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <Scale className="w-4 h-4" style={{ color: '#EFBF04' }} />
                        <span
                            style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: '#374151',
                                letterSpacing: '0.02em',
                            }}
                        >
                            Compare
                        </span>
                        <span
                            style={{
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                color: '#9ca3af',
                            }}
                        >
                            ({compareCount}/{MAX_COMPARE})
                        </span>
                    </div>

                    {/* Product thumbnails */}
                    <div
                        className="flex items-center flex-1"
                        style={{ gap: '0.5rem', minWidth: 0 }}
                    >
                        {compareItems.map((item) => (
                            <div
                                key={item.productId}
                                className="flex-shrink-0"
                                style={{ position: 'relative' }}
                            >
                                <div
                                    style={{
                                        width: '3.25rem',
                                        height: '3.25rem',
                                        borderRadius: '0.5rem',
                                        overflow: 'hidden',
                                        border: '2px solid #EFBF04',
                                        backgroundColor: '#f8f8f8',
                                    }}
                                >
                                    {item.image ? (
                                        <img
                                            src={item.image}
                                            alt={item.name}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                            }}
                                        />
                                    ) : (
                                        <div
                                            className="flex items-center justify-center w-full h-full"
                                            style={{ fontSize: '1.2rem', color: '#d1d5db' }}
                                        >
                                            📷
                                        </div>
                                    )}
                                </div>
                                {/* Remove button */}
                                <button
                                    onClick={() => removeFromCompare(item.productId)}
                                    style={{
                                        position: 'absolute',
                                        top: '-0.35rem',
                                        right: '-0.35rem',
                                        width: '1.15rem',
                                        height: '1.15rem',
                                        borderRadius: '50%',
                                        backgroundColor: '#1f2937',
                                        color: '#fff',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: 0,
                                        transition: 'background-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ef4444'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#1f2937'; }}
                                    title={`Remove ${item.name}`}
                                >
                                    <X style={{ width: '0.65rem', height: '0.65rem' }} strokeWidth={3} />
                                </button>
                            </div>
                        ))}

                        {/* Empty slot placeholders */}
                        {Array.from({ length: emptySlots }).map((_, i) => (
                            <div
                                key={`empty-${i}`}
                                className="flex-shrink-0"
                                style={{
                                    width: '3.25rem',
                                    height: '3.25rem',
                                    borderRadius: '0.5rem',
                                    border: '2px dashed #d1d5db',
                                    backgroundColor: '#fafafa',
                                }}
                            />
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Clear all */}
                        <button
                            onClick={clearCompare}
                            className="flex items-center gap-1 cursor-pointer transition-colors"
                            style={{
                                background: 'none',
                                border: 'none',
                                fontSize: '0.75rem',
                                color: '#9ca3af',
                                padding: '0.25rem 0.5rem',
                                fontFamily: 'inherit',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = '#9ca3af'; }}
                        >
                            <Trash2 className="w-3 h-3" />
                            <span className="hidden sm:inline">Clear</span>
                        </button>

                        {/* Compare Now */}
                        <button
                            onClick={() => navigate('/compare')}
                            disabled={compareCount < 2}
                            className="cursor-pointer transition-all active:scale-[0.97]"
                            style={{
                                padding: '0.55rem 1.25rem',
                                borderRadius: '0.5rem',
                                border: 'none',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                fontFamily: 'inherit',
                                letterSpacing: '0.04em',
                                color: compareCount < 2 ? '#9ca3af' : '#fff',
                                background: compareCount < 2
                                    ? '#f3f4f6'
                                    : 'linear-gradient(135deg, #EFBF04, #d4a904)',
                                cursor: compareCount < 2 ? 'not-allowed' : 'pointer',
                                boxShadow: compareCount >= 2 ? '0 2px 10px rgba(239,191,4,0.3)' : 'none',
                            }}
                        >
                            Compare Now
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default CompareBar;
