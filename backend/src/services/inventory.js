import Order from "../models/Order.js";
import Product from "../models/Products.js";
import { findVariant } from "../utils/variants.js";

/**
 * THE single place in this codebase that writes product stock as a consequence
 * of an order.
 *
 * Nothing else may decrement inventory. It used to live in two: a
 * deductStockAtomically() helper private to paymentController, and a
 * hand-inlined copy of the same loop in webhookController. Both were reached by
 * the same three triggers for one payment, and they had already drifted — the
 * controller answered a stock shortfall with a 400 to a customer who had
 * *already paid*, while the webhook logged and silently created no order at all.
 * One payment could therefore produce two different outcomes depending on which
 * trigger won a race. Centralising is what makes the guarantees below
 * statements about the system rather than about one handler.
 *
 * ── Ordering: the order record comes first, then the stock ──
 *
 * Both handlers previously deducted stock *before* inserting the order, then
 * compensated with restoreStock() when the insert lost the unique-index race.
 * That is a saga with a hole in it: a crash between the deduction and the
 * insert leaves stock permanently short with no order to explain it, and
 * nothing ever notices.
 *
 * The order is now inserted first. The unique partial index on
 * paymentResult.squareOrderId (see models/Order.js) means exactly one trigger
 * can ever win that insert for a given payment, so the order document itself
 * becomes the idempotency ledger — which is what applyOrderStock() below claims
 * against. Losers touch no stock at all, so there is nothing to compensate and
 * restoreStock() is gone entirely.
 *
 * The remaining window — order inserted, process dies before the stock is
 * applied — is now *self-healing* rather than silent: the order persists with
 * stockApplied:false, and every trigger calls applyOrderStock() on an order it
 * finds already existing. Square's webhook redelivery or the customer's next
 * confirm request completes the missed decrement.
 */

/**
 * How many times to retry the compare-and-set in the shortfall path before
 * giving up. Only reached when a variant is being drained concurrently, and
 * three attempts is far beyond what a real contention window needs.
 */
const MAX_CAS_ATTEMPTS = 3;

/**
 * Deduct one order line from its exact (color, size) variant.
 *
 * @returns {{deducted: number, shortfall: number, reason?: string}}
 */
const deductLine = async (item) => {
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) return { deducted: 0, shortfall: 0 };

    /* ── Primary path: one conditional atomic update ──
       The availability guard (`stock: { $gte: qty }`) lives inside the same
       query that performs the $inc, so the check and the write are a single
       document operation. There is no read-modify-write window here at all —
       not a narrow one, none: this code never reads the stock it decrements.

       The positional `$` binds to the array element the $elemMatch selected, so
       the decrement lands on the purchased variant specifically and cannot
       spill onto a sibling size or colour of the same product. */
    const full = await Product.updateOne(
        {
            _id: item.productId,
            variants: {
                $elemMatch: {
                    color: item.color,
                    size: item.size,
                    stock: { $gte: qty },
                },
            },
        },
        { $inc: { "variants.$.stock": -qty } }
    );

    if (full.modifiedCount === 1) return { deducted: qty, shortfall: 0 };

    /* ── Shortfall path ──
       The guard above refused, so either the variant is gone or it holds less
       than this line needs. Reaching here means we are reconciling a payment
       that has ALREADY been captured, so refusing to touch stock would leave
       the count overstating what is physically on the shelf. Take what is
       actually there and report the difference; the caller puts the order on
       fulfilment hold with the exact numbers.

       This is the one place that has to read before writing, because "how much
       is left" is the answer being recorded. The read is made safe by keying
       the update on the value observed (`stock: available`) — a concurrent
       deduction changes it, the update matches nothing, and the loop re-reads
       rather than writing a stale figure. Stock can never go negative. */
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
        const fresh = await Product.findById(item.productId).select("variants");
        if (!fresh) return { deducted: 0, shortfall: qty, reason: "product-deleted" };

        const variant = findVariant(fresh, item.color, item.size);
        if (!variant) return { deducted: 0, shortfall: qty, reason: "variant-removed" };

        const available = Math.max(0, Number(variant.stock) || 0);
        if (available === 0) return { deducted: 0, shortfall: qty, reason: "out-of-stock" };

        const take = Math.min(available, qty);

        const partial = await Product.updateOne(
            {
                _id: item.productId,
                variants: {
                    $elemMatch: {
                        color: item.color,
                        size: item.size,
                        stock: available,
                    },
                },
            },
            { $inc: { "variants.$.stock": -take } }
        );

        if (partial.modifiedCount === 1) {
            return {
                deducted: take,
                shortfall: qty - take,
                reason: qty - take > 0 ? "insufficient-stock" : undefined,
            };
        }
    }

    return { deducted: 0, shortfall: qty, reason: "contended" };
};

/**
 * Apply an order's stock decrements. The one entry point; call it once per
 * order, or a hundred times — the effect is identical.
 *
 * Idempotency is the atomic claim below, not a findOne-then-check. The order
 * document carries `stockApplied`, and flipping it false -> true is a single
 * conditional update on a single document: of any number of concurrent or
 * repeated callers for one order, exactly one can win that flip, and only the
 * winner decrements. Duplicate webhook deliveries, a webhook racing the
 * customer's confirm request, a double-clicked confirmation page and a Square
 * redelivery hours later all collapse to one decrement. This is the
 * pending -> confirmed transition guard, expressed on the order itself.
 *
 * Note the guard matches `stockApplied: false` exactly rather than
 * `{ $ne: true }`. Orders written before this field existed had their stock
 * deducted by the old pre-insert flow and have no such field, so they match
 * neither `false` nor `true` and can never be claimed — they cannot be
 * double-deducted by a trigger that arrives mid-deploy, and no backfill
 * migration is needed. Every order created from now on is inserted with an
 * explicit `false` by the schema default, so it is claimable exactly once.
 *
 * The claim is taken BEFORE the decrements, deliberately. A crash midway then
 * leaves an order marked applied with only some lines deducted — recorded and
 * inspectable — which is the lesser evil against a claim taken afterwards,
 * where two triggers could both pass the check and both deduct in full.
 *
 * @param {object} order an Order document (needs `_id`)
 * @returns {Promise<{applied: boolean, alreadyApplied: boolean, shortfalls: Array}>}
 */
export const applyOrderStock = async (order) => {
    if (!order?._id) {
        return { applied: false, alreadyApplied: false, shortfalls: [] };
    }

    const claimed = await Order.findOneAndUpdate(
        { _id: order._id, stockApplied: false },
        { $set: { stockApplied: true, stockAppliedAt: new Date() } },
        { new: true }
    );

    if (!claimed) {
        /* Someone else already applied it, or it predates the field. Either way
           this call must not decrement anything. */
        return { applied: false, alreadyApplied: true, shortfalls: [] };
    }

    const shortfalls = [];

    for (const item of claimed.items || []) {
        const { deducted, shortfall, reason } = await deductLine(item);

        if (shortfall > 0) {
            shortfalls.push({
                productId: item.productId,
                name: item.name,
                color: item.color || "",
                size: item.size || "",
                requested: Number(item.quantity) || 0,
                deducted,
                shortfall,
                reason: reason || "insufficient-stock",
            });
        }
    }

    if (shortfalls.length > 0) {
        /* The payment is captured and the order exists, so this cannot be
           answered by refusing the order. It is flagged instead: the admin list
           surfaces the hold and the exact per-line numbers, so a human can
           restock, part-ship or refund. Loud, never silent — the one thing this
           must not do is report success while inventory quietly disagrees. */
        await Order.updateOne(
            { _id: claimed._id },
            { $set: { fulfillmentHold: true, stockIssues: shortfalls } }
        );

        console.error(
            `[inventory] Order ${claimed.orderId} placed on fulfilment hold — ` +
            `${shortfalls.length} line(s) could not be fully deducted: ` +
            shortfalls
                .map((s) => `${s.name} (${s.color}/${s.size}) wanted ${s.requested}, got ${s.deducted}`)
                .join("; ")
        );
    }

    return { applied: true, alreadyApplied: false, shortfalls };
};
