import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Auction, Lot, Consignee } from '../types';
import { calculateLotFinancials } from './financials';
import { PlatformConfig, DEFAULT_PLATFORM_CONFIG } from './platformConfig';
import { generateConsigneeAcronym, getConsigneeAcronym, generateNextUniqueItemId } from './idGenerator';

export interface MaxsoldCSVRow {
  itemName: string;
  auctionId: string;
  endDate: string;
  lotNumber: string;
  soldForPrice: number;
  consigneeName: string;
  photoUrl: string;
  maxsoldFee: number;
  mcmFee: number;
  netPayout: number;
  commissionRate: number;
  maxsoldRate: number;
  rawRow: Record<string, string>;
}

export interface MaxsoldImportSummary {
  totalRowsProcessed: number;
  auctionsCreated: number;
  auctionsUpdated: number;
  consigneesCreated: number;
  consigneesMatched: number;
  lotsCreated: number;
  lotsUpdated: number;
  errors: string[];
}

/**
  Parse a currency string like "$80.00" or "$1,250.50" into a numeric value.
 */
export function parseCurrency(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^0-9.-]+/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
  Parse a percentage string like "21%" or "15%" into a numeric value.
 */
export function parsePercentage(val: string | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/[^0-9.-]+/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
  Parse dates like "4/30/2026" or "2026-04-30" into a standard YYYY-MM-DD string.
 */
export function normalizeDate(val: string | undefined): string {
  if (!val) return new Date().toISOString().split('T')[0];
  const trimmed = val.trim();
  
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  
  // If MM/DD/YYYY or M/D/YYYY
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    let year = parts[2];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  
  return trimmed;
}

/**
  Parse CSV text handling quoted fields, commas, escaped quotes, and headers.
 */
export function parseMaxsoldCSV(csvText: string): MaxsoldCSVRow[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvText[i + 1] === '\n') {
        i++;
      }
      if (currentLine.trim()) {
        lines.push(currentLine);
      }
      currentLine = '';
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const row: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        row.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    row.push(field.trim());
    return row;
  };

  const rawHeaders = parseRow(lines[0]);
  const headers = rawHeaders.map(h => h.replace(/^["\uFEFF]+|["\uFEFF]+$/g, '').trim());

  // Key normalization helper
  const getKey = (rowObj: Record<string, string>, possibleKeys: string[]): string => {
    for (const key of possibleKeys) {
      const foundKey = Object.keys(rowObj).find(k => k.toLowerCase().trim() === key.toLowerCase().trim());
      if (foundKey && rowObj[foundKey] !== undefined) {
        return rowObj[foundKey];
      }
    }
    return '';
  };

  const parsedRows: MaxsoldCSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
    
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      let val = values[idx] || '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      rowObj[h] = val.trim();
    });

    const itemName = getKey(rowObj, ['Item Name', 'Lot Title', 'Title', 'Item']);
    const auctionId = getKey(rowObj, ['Auction ID', 'Auction', 'Auction Event']);
    const endDate = normalizeDate(getKey(rowObj, ['End Date', 'EndDate', 'Auction End Date']));
    const lotNumber = getKey(rowObj, ['Lot Number', 'Lot #', 'Lot']);
    const soldForRaw = getKey(rowObj, ['Sold For Price', 'Sold For', 'Hammer Price', 'Sold Price']);
    const soldForPrice = parseCurrency(soldForRaw);
    const consigneeName = getKey(rowObj, ['Consignee', 'Consignee Name', 'Client']);
    const photoUrl = getKey(rowObj, ['Photos', 'Photo', 'Primary Photo', 'Image URL', 'Photo URL']);
    const maxsoldFee = parseCurrency(getKey(rowObj, ['Maxsold Fee', 'Platform Fee']));
    const mcmFee = parseCurrency(getKey(rowObj, ['MCM Fee', 'Commission Fee']));
    const netPayout = parseCurrency(getKey(rowObj, ['Consignee Net Payout', 'Net Payout', 'Consignee Payout', 'Payout']));
    const commissionRate = parsePercentage(getKey(rowObj, ['Commission', 'Commission %', 'Commission Rate']));
    const maxsoldRate = parsePercentage(getKey(rowObj, ['Maxsold Rate', 'Platform Rate', 'Maxsold %']));

    if (!itemName && !lotNumber && !auctionId) continue;

    parsedRows.push({
      itemName: itemName || `Lot #${lotNumber}`,
      auctionId: auctionId || '100000',
      endDate,
      lotNumber: lotNumber || '1',
      soldForPrice,
      consigneeName: consigneeName || 'Default Consignee',
      photoUrl,
      maxsoldFee,
      mcmFee,
      netPayout,
      commissionRate,
      maxsoldRate: maxsoldRate || 21,
      rawRow: rowObj
    });
  }

  return parsedRows;
}

/**
  Executes the full bulk import pipeline in Firestore.
 */
export async function executeMaxsoldBulkImport(
  csvRows: MaxsoldCSVRow[],
  existingAuctions: Auction[],
  existingLots: Lot[],
  existingConsignees: Consignee[],
  config?: PlatformConfig,
  onProgress?: (progressText: string, percentage: number) => void
): Promise<MaxsoldImportSummary> {
  const activeConfig = config || DEFAULT_PLATFORM_CONFIG;
  const summary: MaxsoldImportSummary = {
    totalRowsProcessed: 0,
    auctionsCreated: 0,
    auctionsUpdated: 0,
    consigneesCreated: 0,
    consigneesMatched: 0,
    lotsCreated: 0,
    lotsUpdated: 0,
    errors: []
  };

  if (csvRows.length === 0) {
    summary.errors.push('No valid rows found in CSV data.');
    return summary;
  }

  // Tracking map of created/updated entities during batch run
  const consigneeMap = new Map<string, Consignee>();
  // Pre-populate consigneeMap from existing consignees
  existingConsignees.forEach(c => {
    if (c.displayName) consigneeMap.set(c.displayName.toLowerCase().trim(), c);
    if (c.consigneeId) consigneeMap.set(c.consigneeId.toLowerCase().trim(), c);
  });

  const auctionMap = new Map<string, Auction>();
  existingAuctions.forEach(a => {
    if (a.externalAuctionId) auctionMap.set(String(a.externalAuctionId).toLowerCase().trim(), a);
    if (a.auctionName) auctionMap.set(a.auctionName.toLowerCase().trim(), a);
    if (a.id) auctionMap.set(a.id.toLowerCase().trim(), a);
  });

  const totalSteps = csvRows.length;
  let currentStep = 0;

  for (const row of csvRows) {
    currentStep++;
    if (onProgress) {
      onProgress(`Processing Lot #${row.lotNumber} - ${row.itemName.slice(0, 30)}...`, Math.round((currentStep / totalSteps) * 100));
    }

    try {
      // 1. Process Consignee
      const rawConsigneeName = (row.consigneeName || 'MCM Estate Client').trim();
      const consigneeKey = rawConsigneeName.toLowerCase();
      let activeConsignee = consigneeMap.get(consigneeKey);

      if (!activeConsignee) {
        // Create new Consignee profile with required placeholder info
        const nameParts = rawConsigneeName.split(' ');
        const firstName = nameParts[0] || rawConsigneeName;
        const lastName = nameParts.slice(1).join(' ') || '';

        // Generate unique consignee ID code
        let baseCode = generateConsigneeAcronym(firstName, lastName);
        let finalCode = baseCode;
        let counter = 1;
        const existingCodes = existingConsignees.map(c => c.consigneeId);
        while (existingCodes.includes(finalCode)) {
          finalCode = `${baseCode}${counter}`;
          counter++;
        }

        const newConsigneeData: Omit<Consignee, 'id'> = {
          firstName,
          lastName,
          displayName: rawConsigneeName,
          email: 'mcmestateservices@gmail.com',
          phonePrimary: '343-462-6979',
          phoneSecondary: '',
          preferredContactMethod: 'Email',
          streetAddress1: '79 Rue Elgin',
          streetAddress2: '',
          city: 'Gatineau',
          state: 'QC',
          postalCode: 'J9H 1E4',
          country: 'Canada',
          serviceType: 'Full Service',
          consigneeId: finalCode,
          accountStatus: 'Active',
          accountCreatedDate: new Date().toISOString().split('T')[0],
          lastActivityDate: new Date().toISOString().split('T')[0],
          referredBy: 'Maxsold CSV Import',
          referralSource: 'Maxsold Bulk Upload',
          internalNotes: 'Auto-created via Maxsold CSV bulk upload with standard placeholder contact details.',
          paymentMethod: 'Interac e-Transfer',
          emailForETransfer: 'mcmestateservices@gmail.com',
          commissionRate: row.commissionRate !== undefined ? row.commissionRate : 0,
          lifetimeGrossSales: row.soldForPrice,
          lifetimePayouts: 0,
          outstandingBalance: row.soldForPrice,
          acceptsUnsoldReturns: true,
          unsoldDisposalPreference: 'Return',
          photoAuthorization: true,
          signedAgreement: true,
          agreementDateSigned: new Date().toISOString().split('T')[0],
          agreementVersion: 'v2026.1',
          pickupAddress: '79 Rue Elgin, Gatineau QC, J9H 1E4 Canada',
          pickupAvailabilityNotes: '',
          deliveryPreference: 'Drop-off',
          storageLocation: 'Main Warehouse',
          portalAccessEnabled: false,
          portalLoginEmail: 'mcmestateservices@gmail.com'
        };

        const docRef = await addDoc(collection(db, 'consignees'), newConsigneeData);
        activeConsignee = { id: docRef.id, ...newConsigneeData };
        consigneeMap.set(consigneeKey, activeConsignee);
        consigneeMap.set(finalCode.toLowerCase(), activeConsignee);
        summary.consigneesCreated++;
      } else {
        summary.consigneesMatched++;
        // Update consignee commission rate if specified in CSV
        if (row.commissionRate !== undefined && activeConsignee.id) {
          try {
            await updateDoc(doc(db, 'consignees', activeConsignee.id), {
              commissionRate: row.commissionRate,
              lastActivityDate: new Date().toISOString().split('T')[0]
            });
            activeConsignee.commissionRate = row.commissionRate;
          } catch (e) {
            console.warn('Could not update consignee rate:', e);
          }
        }
      }

      // 2. Process Auction
      const rawAuctionNum = (row.auctionId || '100000').trim();
      const expectedAuctionName = `Maxsold Auction - ${rawAuctionNum}`;
      const auctionKey = rawAuctionNum.toLowerCase();
      let activeAuction = auctionMap.get(auctionKey) || auctionMap.get(expectedAuctionName.toLowerCase());

      if (!activeAuction) {
        // Create new Auction document
        const newAuctionData: Omit<Auction, 'id'> = {
          auctionName: expectedAuctionName,
          externalAuctionId: rawAuctionNum,
          auctionURL: `https://maxsold.maxsold.com/auction/${rawAuctionNum}`,
          internalReferenceCode: `MAX-${rawAuctionNum}`,
          auctionPlatform: 'Maxsold',
          auctionStatus: 'Closed',
          auctionType: 'Online Only',
          platformFeeRate: row.maxsoldRate || 21,
          startDate: normalizeDate(row.endDate),
          endDate: normalizeDate(row.endDate),
          startTime: '10:00',
          endTime: '20:00',
          pickupHoursNotes: 'As specified in Maxsold catalog',
          pickupLocation: '79 Rue Elgin, Gatineau QC, J9H 1E4 Canada',
          auctionTheme: 'Maxsold Online Estate Auction',
          auctionDescription: `Bulk imported Maxsold Auction #${rawAuctionNum}`,
          marketingNotes: '',
          emailCampaignSent: false,
          emailCampaignDate: '',
          socialMediaPosted: false,
          socialPostDate: '',
          totalLots: 0,
          totalLotsSold: 0,
          totalLotsUnsold: 0,
          sellThroughRate: 0,
          grossSales: 0,
          totalBuyersPremiumCollected: 0,
          totalRevenue: 0,
          totalCommissionsEarned: 0,
          totalConsigneePayouts: 0,
          highestHammerPrice: 0,
          averageHammerPrice: 0,
          defaultReservePolicy: 'No Reserves',
          defaultCommissionRate: row.commissionRate || 0,
          buyersPremiumRate: 0,
          shippingOffered: true,
          paymentMethodsAccepted: ['Credit', 'Debit'],
          paymentDueWindow: '48 Hours',
          auctioneerLeadStaff: 'Maxsold Platform',
          numberOfConsignees: 1,
          settlementsComplete: false,
          internalNotes: 'Auto-created via Maxsold CSV bulk upload.'
        };

        const docRef = await addDoc(collection(db, 'auctions'), newAuctionData);
        activeAuction = { id: docRef.id, ...newAuctionData };
        auctionMap.set(auctionKey, activeAuction);
        auctionMap.set(expectedAuctionName.toLowerCase(), activeAuction);
        auctionMap.set(docRef.id.toLowerCase(), activeAuction);
        summary.auctionsCreated++;
      } else {
        summary.auctionsUpdated++;
        // Update auction details if needed
        if (activeAuction.id) {
          try {
            await updateDoc(doc(db, 'auctions', activeAuction.id), {
              platformFeeRate: row.maxsoldRate || activeAuction.platformFeeRate || 21,
              endDate: normalizeDate(row.endDate) || activeAuction.endDate
            });
            activeAuction.platformFeeRate = row.maxsoldRate || activeAuction.platformFeeRate;
            activeAuction.endDate = normalizeDate(row.endDate);
          } catch (e) {
            console.warn('Could not update auction details:', e);
          }
        }
      }

      // 3. Process Lot
      const lotNumberStr = String(row.lotNumber).trim();
      const existingLot = existingLots.find(
        l => l.auctionId === activeAuction?.id && String(l.lotNumber).trim() === lotNumberStr
      );

      // Status check: "if Sold For is $0.00, Status should be changed to 'Unsold'"
      const isUnsold = row.soldForPrice <= 0;
      const lotStatus = isUnsold ? 'Unsold' : 'Sold';
      const hammerPrice = isUnsold ? null : row.soldForPrice;

      // Generate Unique Item Identifier (e.g. CWI-1000)
      const consigneeAcronym = getConsigneeAcronym(activeConsignee);
      const uniqueItemId = existingLot?.uniqueItemId || generateNextUniqueItemId(consigneeAcronym, existingLots, existingConsignees, activeConsignee.id);

      const lotPartial: Partial<Lot> = {
        uniqueItemId,
        lotNumber: lotNumberStr,
        lotTitle: row.itemName,
        consigneeId: activeConsignee.id,
        auctionId: activeAuction.id,
        lotStatus,
        hammerPrice,
        commissionRate: row.commissionRate !== undefined ? row.commissionRate : activeConsignee.commissionRate,
        platformFeeRate: row.maxsoldRate || activeAuction.platformFeeRate || 21,
        consigneePayout: !isUnsold && row.netPayout > 0 ? row.netPayout : null,
        primaryPhotoURL: row.photoUrl || '',
        dateSold: isUnsold ? '' : normalizeDate(row.endDate),
        payoutStatus: isUnsold ? 'N/A' : 'Pending',
        internalSKU: `SKU-MAX-${rawAuctionNum}-${lotNumberStr}`,
        category: 'Estate Items',
        condition: 'Very Good',
        fullDescription: `${row.itemName} (Imported from Maxsold Auction #${rawAuctionNum}, Lot #${lotNumberStr})`
      };

      const computedFinancials = calculateLotFinancials(
        lotPartial,
        activeAuction,
        activeConsignee,
        activeConfig
      );

      const finalLotData = {
        ...lotPartial,
        ...computedFinancials,
        additionalPhotoURLs: [],
        photoCount: row.photoUrl ? 1 : 0,
        reserveRequested: 'No',
        reservePrice: 0,
        reserveMet: false,
        quantity: 1,
        shippingAvailable: true,
        internalNotes: `Bulk uploaded from Maxsold CSV. Maxsold Fee: $${row.maxsoldFee}, MCM Fee: $${row.mcmFee}, Net Payout: $${row.netPayout}.`
      };

      if (existingLot && existingLot.id) {
        await updateDoc(doc(db, 'lots', existingLot.id), finalLotData);
        summary.lotsUpdated++;
      } else {
        await addDoc(collection(db, 'lots'), finalLotData);
        summary.lotsCreated++;
      }

      summary.totalRowsProcessed++;
    } catch (err: any) {
      console.error(`Error processing CSV row #${currentStep}:`, err);
      summary.errors.push(`Row #${currentStep} (Lot #${row.lotNumber}): ${err.message || String(err)}`);
    }
  }

  // 4. Final step: Recalculate auction totals for affected auctions
  const affectedAuctionIds = Array.from(new Set(csvRows.map(r => r.auctionId)));
  for (const aNum of affectedAuctionIds) {
    const auc = auctionMap.get(aNum.toLowerCase());
    if (auc && auc.id) {
      try {
        // Query or calculate from existing state + imported rows
        const auctionLots = existingLots.filter(l => l.auctionId === auc.id);
        const soldLots = auctionLots.filter(l => l.lotStatus === 'Sold');
        const unsoldLots = auctionLots.filter(l => l.lotStatus === 'Unsold');
        const grossSales = soldLots.reduce((sum, l) => sum + (l.hammerPrice || 0), 0);
        const totalPayouts = soldLots.reduce((sum, l) => sum + (l.consigneePayout || 0), 0);
        const totalCommissions = soldLots.reduce((sum, l) => sum + (l.commissionAmount || 0), 0);
        const totalLots = auctionLots.length;

        await updateDoc(doc(db, 'auctions', auc.id), {
          totalLots,
          totalLotsSold: soldLots.length,
          totalLotsUnsold: unsoldLots.length,
          grossSales,
          totalConsigneePayouts: totalPayouts,
          totalCommissionsEarned: totalCommissions,
          sellThroughRate: totalLots > 0 ? Number(((soldLots.length / totalLots) * 100).toFixed(1)) : 0
        });
      } catch (e) {
        console.warn(`Could not update auction summary totals for ${auc.id}:`, e);
      }
    }
  }

  return summary;
}
