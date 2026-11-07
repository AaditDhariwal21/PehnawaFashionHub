import mongoose from "mongoose";

/**
 * Index changes that Mongoose's automatic index build cannot make on its own,
 * because they alter an index that already exists (Mongoose only ever creates
 * missing indexes; an existing index with different options is reported as a
 * conflict and left alone).
 *
 * Runs at server startup, before the server accepts requests. Every step is
 * idempotent — it inspects the current index first and does nothing when it
 * is already correct — so it is safe on every boot and on every instance.
 *
 * Neither change rewrites or deletes any document:
 *
 *  1. pendingorders  createdAt TTL 30 min → 7 days.
 *     Existing in-flight checkouts simply live longer. See models/PendingOrder.js.
 *
 *  2. promoredemptions  { promoCode, user, slot } unique index is replaced by
 *     two partial unique indexes — one for account redemptions (now filtered
 *     on `user` existing), one for guest redemptions. Every existing document
 *     has a `user`, so it satisfies the new account index exactly as it did
 *     the old one. See models/PromoRedemption.js.
 *
 * A failure is logged loudly and startup continues: the site keeps working on
 * the old indexes, and only the new behaviour (longer checkout retention,
 * guest promo redemptions) is degraded until it is fixed.
 */

export const PENDING_ORDER_TTL_SECONDS = 7 * 24 * 60 * 60;

const SLOT_STATES = ["RESERVED", "CONFIRMED"];

const listIndexes = async (collection) => {
    try {
        return await collection.indexes();
    } catch (error) {
        // Collection doesn't exist yet (fresh database) — nothing to inspect.
        if (error?.codeName === "NamespaceNotFound" || error?.code === 26) return [];
        throw error;
    }
};

const sameKeys = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const ensurePendingOrderTtl = async (db) => {
    const collection = db.collection("pendingorders");
    const indexes = await listIndexes(collection);
    const existing = indexes.find((i) => sameKeys(i.key, { createdAt: 1 }));

    if (existing?.expireAfterSeconds === PENDING_ORDER_TTL_SECONDS) return "unchanged";

    if (existing) await collection.dropIndex(existing.name);
    await collection.createIndex(
        { createdAt: 1 },
        { name: "createdAt_1", expireAfterSeconds: PENDING_ORDER_TTL_SECONDS }
    );
    return existing ? `ttl ${existing.expireAfterSeconds ?? "none"}s -> ${PENDING_ORDER_TTL_SECONDS}s` : "created";
};

const ensurePromoRedemptionSlotIndexes = async (db) => {
    const collection = db.collection("promoredemptions");
    const indexes = await listIndexes(collection);
    const changes = [];

    const legacy = indexes.find((i) => i.name === "promoCode_1_user_1_slot_1");
    if (legacy) {
        await collection.dropIndex(legacy.name);
        changes.push("dropped legacy promoCode_1_user_1_slot_1");
    }

    const wanted = [
        {
            name: "promo_user_slot_unique",
            key: { promoCode: 1, user: 1, slot: 1 },
            partialFilterExpression: {
                status: { $in: SLOT_STATES },
                user: { $type: "objectId" },
            },
        },
        {
            name: "promo_guest_slot_unique",
            key: { promoCode: 1, guestEmailKey: 1, slot: 1 },
            partialFilterExpression: {
                status: { $in: SLOT_STATES },
                guestEmailKey: { $type: "string" },
            },
        },
    ];

    for (const spec of wanted) {
        if (indexes.some((i) => i.name === spec.name)) continue;
        await collection.createIndex(spec.key, {
            name: spec.name,
            unique: true,
            partialFilterExpression: spec.partialFilterExpression,
        });
        changes.push(`created ${spec.name}`);
    }

    return changes.length ? changes.join(", ") : "unchanged";
};

export const runIndexMigrations = async () => {
    const db = mongoose.connection.db;
    const steps = [
        ["pendingorders TTL", ensurePendingOrderTtl],
        ["promoredemptions slot indexes", ensurePromoRedemptionSlotIndexes],
    ];

    for (const [label, step] of steps) {
        try {
            const result = await step(db);
            console.log(`[migrations] ${label}: ${result}`);
        } catch (error) {
            console.error(`[migrations] ${label} FAILED — continuing on existing indexes:`, error.message);
        }
    }
};
