import { useEffect } from 'react';

/*
 * useBodyScrollLock — ref-counted body scroll lock.
 *
 * Multiple overlays (mobile menu, cart drawer, search overlay) can want the
 * body locked at the same time. If each toggled `document.body.style.overflow`
 * directly, one closing would unlock scroll while another is still open.
 * A shared counter fixes that: scroll is only restored once every locker has
 * released. The previous inline `overflow` value is preserved and restored.
 */
let lockCount = 0;
let previousOverflow = '';

export default function useBodyScrollLock(active) {
    useEffect(() => {
        if (!active) return;

        if (lockCount === 0) {
            previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        lockCount += 1;

        return () => {
            lockCount -= 1;
            if (lockCount === 0) {
                document.body.style.overflow = previousOverflow;
            }
        };
    }, [active]);
}
