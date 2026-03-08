import { SquareClient, SquareEnvironment } from "square";

const client = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment:
        process.env.SQUARE_ENVIRONMENT === "sandbox"
            ? SquareEnvironment.Sandbox
            : SquareEnvironment.Production,
});

/* ── Cache the main location ID so we only call the API once ── */
let _cachedLocationId = process.env.SQUARE_LOCATION_ID || null;

/**
 * Returns the main location ID for the Square account.
 * Uses SQUARE_LOCATION_ID from .env if present, otherwise
 * fetches the first active location from the Square API
 * and caches it for the lifetime of the process.
 */
export async function getLocationId() {
    if (_cachedLocationId) return _cachedLocationId;

    const { locations } = await client.locations.list();
    const active = locations?.find((l) => l.status === "ACTIVE");

    if (!active) {
        throw new Error("No active Square location found for this account.");
    }

    _cachedLocationId = active.id;
    console.log(`[Square] Resolved location ID: ${_cachedLocationId}`);
    return _cachedLocationId;
}

export default client;
