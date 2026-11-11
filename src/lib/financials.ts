import { Lot, Auction, Consignee } from '../types';
import { PlatformConfig, DEFAULT_PLATFORM_CONFIG, evaluateFormula } from './platformConfig';

export interface CalculatedFinancials {
  reserveMet: boolean;
  buyersPremium: number | null;
  totalSalePrice: number | null;
  platformFeeRate: number;
  platformFeeAmount: number | null;
  commissionAmount: number | null;
  commissionTaxAmount: number | null;
  consigneePayout: number | null;
}

/**
 * Utility helper to format any monetary amount as $X.XX with two decimal places and commas for thousands.
 */
export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '' || isNaN(Number(amount))) {
    return '$0.00';
  }
  const num = Number(amount);
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Calculates all computed financial fields for a Lot based on its hammer price, 
 * the platform of the associated Auction, the tax status of the Consignee, 
 * and optional platform-wide dynamic config settings.
 */
export function calculateLotFinancials(
  lotData: Partial<Lot>,
  auction?: Auction,
  consignee?: Consignee,
  config?: PlatformConfig
): CalculatedFinancials {
  const hp = lotData.hammerPrice !== undefined && lotData.hammerPrice !== null ? Number(lotData.hammerPrice) : null;
  const rp = lotData.reservePrice !== undefined ? Number(lotData.reservePrice) : 0;
  const cr = lotData.commissionRate !== undefined ? Number(lotData.commissionRate) : (config?.defaultCommissionRate ?? 15);

  const activeConfig = config || DEFAULT_PLATFORM_CONFIG;

  if (hp === null || hp < 0) {
    return {
      reserveMet: false,
      buyersPremium: null,
      totalSalePrice: null,
      platformFeeRate: 0,
      platformFeeAmount: null,
      commissionAmount: null,
      commissionTaxAmount: null,
      consigneePayout: null,
    };
  }

  const reserveMet = hp >= rp;
  const platform = auction?.auctionPlatform || (lotData.platformFeeRate ? 'Maxsold' : 'HiBid');

  // Extract variables for calculation
  const bpRate = auction?.buyersPremiumRate !== undefined ? auction.buyersPremiumRate : activeConfig.buyersPremiumRate;
  const gstRate = activeConfig.gstRate ?? 5;
  const qstRate = activeConfig.qstRate ?? 9.975;

  let totalSalePrice = hp;
  let buyersPremium = 0;
  let platformFeeRate = 0;
  let platformFeeAmount = 0;

  if (platform === 'Maxsold') {
    platformFeeRate = lotData.platformFeeRate !== undefined && lotData.platformFeeRate !== null
      ? Number(lotData.platformFeeRate)
      : (auction?.platformFeeRate !== undefined ? auction.platformFeeRate : 21);
    platformFeeAmount = Number((hp * (platformFeeRate / 100)).toFixed(2));
    buyersPremium = 0;
    totalSalePrice = hp; // No Buyer's Premium on Maxsold
  } else {
    // Dynamic evaluate using configuration formulas
    const evaluatedTotal = evaluateFormula(activeConfig.formulas.buyerTotal, {
      hammerPrice: hp,
      commissionRate: cr,
      platformFeeRate: 0,
      bpRate,
      gstRate,
      qstRate
    });
    totalSalePrice = Number(evaluatedTotal.toFixed(2));
    buyersPremium = Number((totalSalePrice - hp).toFixed(2));
    platformFeeRate = 0;
    platformFeeAmount = 0;
  }

  // Commission is always based on the hammer price
  const commissionAmount = Number((hp * (cr / 100)).toFixed(2));

  // Dynamic taxes on commission
  const isTaxExempt = consignee?.taxExempt === true;
  const taxRate = isTaxExempt ? 0 : (gstRate + qstRate) / 100;
  const commissionTaxAmount = Number((commissionAmount * taxRate).toFixed(2));

  // Consignee Payout calculation using the config's formula
  let consigneePayout = 0;
  if (platform === 'Maxsold') {
    const formulaStr = activeConfig.formulas.consigneePayoutMaxsold || 'hammerPrice - (hammerPrice * commissionRate / 100) - (hammerPrice * platformFeeRate / 100)';
    consigneePayout = evaluateFormula(formulaStr, {
      hammerPrice: hp,
      commissionRate: cr,
      platformFeeRate,
      bpRate,
      gstRate,
      qstRate
    });
  } else {
    consigneePayout = evaluateFormula(activeConfig.formulas.consigneePayoutStandard, {
      hammerPrice: hp,
      commissionRate: cr,
      platformFeeRate,
      bpRate,
      gstRate,
      qstRate
    });
    // Subtract the taxes on commission for standard platforms
    consigneePayout = Number((consigneePayout - commissionTaxAmount).toFixed(2));
  }

  consigneePayout = Math.max(0, Number(consigneePayout.toFixed(2)));

  return {
    reserveMet,
    buyersPremium: platform === 'Maxsold' ? null : buyersPremium,
    totalSalePrice,
    platformFeeRate,
    platformFeeAmount: platform === 'Maxsold' ? platformFeeAmount : null,
    commissionAmount,
    commissionTaxAmount,
    consigneePayout,
  };
}
