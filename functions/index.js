const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
admin.initializeApp();

/**
 * Firestore Trigger for 'lots' collection.
 * Computes financial fields on write:
 * - commissionAmount = hammerPrice * (commissionRate / 100)
 * - consigneePayout = hammerPrice - commissionAmount
 * - buyersPremium = hammerPrice * (auction.buyersPremiumRate / 100)
 * - totalSalePrice = hammerPrice + buyersPremium
 * - reserveMet = hammerPrice >= reservePrice
 */
exports.computeLotFields = functions.firestore
  .document('lots/{lotId}')
  .onWrite(async (change, context) => {
    const data = change.after.exists ? change.after.data() : null;
    const previousData = change.before.exists ? change.before.data() : null;

    // Exit if document was deleted
    if (!data) {
      console.log(`Lot ${context.params.lotId} was deleted, skipping computation.`);
      return null;
    }

    const hammerPrice = (data.hammerPrice !== undefined && data.hammerPrice !== null) ? Number(data.hammerPrice) : null;
    const reservePrice = (data.reservePrice !== undefined && data.reservePrice !== null) ? Number(data.reservePrice) : 0;
    const commissionRate = (data.commissionRate !== undefined && data.commissionRate !== null) ? Number(data.commissionRate) : 0;

    // If hammerPrice is provided, compute all financials
    if (hammerPrice !== null && hammerPrice >= 0) {
      const reserveMet = hammerPrice >= reservePrice;

      // Retrieve buyers premium rate from the referenced auction
      let buyersPremiumRate = 18; // Default fallback premium rate (18%)
      if (data.auctionId) {
        try {
          const auctionDoc = await admin.firestore().collection('auctions').doc(data.auctionId).get();
          if (auctionDoc.exists) {
            const auctionData = auctionDoc.data();
            if (auctionData && typeof auctionData.buyersPremiumRate === 'number') {
              buyersPremiumRate = auctionData.buyersPremiumRate;
            }
          }
        } catch (error) {
          console.error(`Error retrieving auction ${data.auctionId} for lot ${context.params.lotId}:`, error);
        }
      }

      // Perform calculations
      const buyersPremium = Number((hammerPrice * (buyersPremiumRate / 100)).toFixed(2));
      const totalSalePrice = Number((hammerPrice + buyersPremium).toFixed(2));
      const commissionAmount = Number((hammerPrice * (commissionRate / 100)).toFixed(2));
      const consigneePayout = Number((hammerPrice - commissionAmount).toFixed(2));

      // Guard: Only update if any computed fields have actually changed (prevents infinite recursive trigger loop)
      if (
        data.reserveMet === reserveMet &&
        data.buyersPremium === buyersPremium &&
        data.totalSalePrice === totalSalePrice &&
        data.commissionAmount === commissionAmount &&
        data.consigneePayout === consigneePayout
      ) {
        return null;
      }

      console.log(`Updating computed financials for lot ${context.params.lotId}: Payout $${consigneePayout}, Comm $${commissionAmount}`);
      return change.after.ref.update({
        reserveMet,
        buyersPremium,
        totalSalePrice,
        commissionAmount,
        consigneePayout
      });
    } else {
      // If hammerPrice is null, ensure calculated fields are cleared or initialized safely
      if (
        data.reserveMet !== false ||
        data.buyersPremium !== null ||
        data.totalSalePrice !== null ||
        data.commissionAmount !== null ||
        data.consigneePayout !== null
      ) {
        console.log(`Clearing computed financials for lot ${context.params.lotId} as hammerPrice is null.`);
        return change.after.ref.update({
          reserveMet: false,
          buyersPremium: null,
          totalSalePrice: null,
          commissionAmount: null,
          consigneePayout: null
        });
      }
    }

    return null;
  });
