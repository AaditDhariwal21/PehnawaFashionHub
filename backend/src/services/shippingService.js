import { Shippo } from "shippo";

const FALLBACK_RATE = {
    shippingCost: 8,
    service: "Flat Rate",
    estimatedDays: null,
};

/* ── Store origin address (fixed) ── */
const ADDRESS_FROM = {
    name: "Pehnawa Fashion Hub",
    street1: "123 Fashion Avenue",
    city: "New York",
    state: "NY",
    zip: "10001",
    country: "US",
};

/* ── Standard parcel templates for apparel shipping ── */
const PARCEL_TEMPLATES = {
    SMALL: {
        length: "10",
        width: "8",
        height: "4",
        distanceUnit: "in",
        massUnit: "lb",
        maxWeightLbs: 2.2,
    },
    MEDIUM: {
        length: "12",
        width: "10",
        height: "5",
        distanceUnit: "in",
        massUnit: "lb",
        maxWeightLbs: 6.6,
    },
    LARGE: {
        length: "14",
        width: "12",
        height: "6",
        distanceUnit: "in",
        massUnit: "lb",
        maxWeightLbs: Infinity,
    },
};

/**
 * Select the right parcel template based on total weight in lbs.
 */
const selectParcelTemplate = (totalWeightLbs) => {
    if (totalWeightLbs <= PARCEL_TEMPLATES.SMALL.maxWeightLbs) return PARCEL_TEMPLATES.SMALL;
    if (totalWeightLbs <= PARCEL_TEMPLATES.MEDIUM.maxWeightLbs) return PARCEL_TEMPLATES.MEDIUM;
    return PARCEL_TEMPLATES.LARGE;
};

let shippo;

try {
    shippo = new Shippo({ apiKeyHeader: process.env.SHIPPO_API_KEY });
} catch (err) {
    console.error("Shippo SDK initialisation failed:", err.message);
}

/**
 * Fetch the cheapest USPS shipping rate from Shippo.
 * Falls back to a flat $8 rate on any error.
 *
 * @param {{ name: string, phone: string, address: string, city: string, state: string, zip: string }} addressTo
 * @param {number} totalWeightLbs - total cart weight in lbs
 * @returns {Promise<{ shippingCost: number, service: string, estimatedDays: number|null }>}
 */
export const getShippingRate = async (addressTo, totalWeightLbs = 0) => {
    if (!shippo) {
        console.error("Shippo SDK not initialised — returning fallback rate.");
        return FALLBACK_RATE;
    }

    /* Select parcel template based on weight */
    const template = selectParcelTemplate(totalWeightLbs);
    const weightLbs = Math.max(0.1, totalWeightLbs);

    const parcel = {
        length: template.length,
        width: template.width,
        height: template.height,
        distanceUnit: template.distanceUnit,
        weight: String(Math.round(weightLbs * 100) / 100),
        massUnit: template.massUnit,
    };

    try {
        const shipment = await shippo.shipments.create({
            addressFrom: ADDRESS_FROM,
            addressTo: {
                name: addressTo.name || "Customer",
                phone: addressTo.phone || "",
                street1: addressTo.address,
                city: addressTo.city,
                state: addressTo.state,
                zip: addressTo.zip,
                country: "US",
            },
            parcels: [parcel],
            async: false, // wait for rates synchronously
        });

        /* Filter USPS rates only */
        const uspsRates = (shipment.rates || []).filter(
            (r) => r.provider?.toUpperCase() === "USPS"
        );

        if (uspsRates.length === 0) {
            console.warn("Shippo returned no USPS rates — using fallback.");
            return FALLBACK_RATE;
        }

        /* Sort ascending by amount and pick cheapest */
        uspsRates.sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
        const cheapest = uspsRates[0];

        return {
            shippingCost: parseFloat(cheapest.amount),
            service: cheapest.servicelevel?.name || cheapest.servicelevel?.token || "USPS",
            estimatedDays: cheapest.estimatedDays ?? null,
        };
    } catch (err) {
        console.error("Shippo rate fetch error:", err.message || err);
        return FALLBACK_RATE;
    }
};
