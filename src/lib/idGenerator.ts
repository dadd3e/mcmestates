import { Consignee, Lot } from '../types';

/**
 * Generates a 3-letter acronym from First Name and Last Name.
 * First letter of First Name + First two letters of Last Name.
 * Example: Carol Williamson => CWI
 * Example: John Doe => JDO
 */
export function generateConsigneeAcronym(firstName: string, lastName: string): string {
  const first = (firstName || '').trim().replace(/[^a-zA-Z]/g, '');
  const last = (lastName || '').trim().replace(/[^a-zA-Z]/g, '');

  const firstChar = first.charAt(0).toUpperCase() || 'X';
  let lastChars = last.slice(0, 2).toUpperCase();

  if (lastChars.length < 2) {
    // If last name is missing or 1 letter, fill with extra chars or 'X'
    const extra = (first.slice(1, 3) || 'XX').toUpperCase();
    lastChars = (lastChars + extra).slice(0, 2);
  }

  const base = `${firstChar}${lastChars}`;
  return base.padEnd(3, 'X').slice(0, 3);
}

/**
 * Gets the 3-letter acronym for a consignee, prioritizing consigneeId if present.
 */
export function getConsigneeAcronym(consignee: Partial<Consignee> | null | undefined): string {
  if (consignee?.consigneeId && consignee.consigneeId.trim()) {
    return consignee.consigneeId.trim().toUpperCase();
  }
  return generateConsigneeAcronym(consignee?.firstName || '', consignee?.lastName || '');
}

/**
 * Generates the next Unique Item Identifier for a given consignee acronym and list of existing lots.
 * Format: [ACRONYM]-[SEQUENCE] starting at 1000 (e.g., CWI-1000).
 */
export function generateNextUniqueItemId(
  acronym: string,
  existingLots: Lot[],
  consignees?: Consignee[],
  targetConsigneeId?: string
): string {
  const cleanAcronym = (acronym || 'XXX').trim().toUpperCase();
  const prefix = `${cleanAcronym}-`;

  let maxSequence = 999; // so the first generated number is 1000

  existingLots.forEach(lot => {
    // Check if lot belongs to target consignee OR lot's uniqueItemId starts with prefix
    const matchesConsignee = targetConsigneeId && (lot.consigneeId === targetConsigneeId);
    const lotId = (lot.uniqueItemId || '').trim().toUpperCase();

    if (lotId.startsWith(prefix)) {
      const seqStr = lotId.replace(prefix, '');
      const seqNum = parseInt(seqStr, 10);
      if (!isNaN(seqNum) && seqNum > maxSequence) {
        maxSequence = seqNum;
      }
    } else if (matchesConsignee && lotId) {
      // Check if lot has another prefix-number pattern
      const parts = lotId.split('-');
      if (parts.length === 2) {
        const seqNum = parseInt(parts[1], 10);
        if (!isNaN(seqNum) && seqNum > maxSequence) {
          maxSequence = seqNum;
        }
      }
    }
  });

  const nextSeq = maxSequence + 1;
  return `${cleanAcronym}-${nextSeq}`;
}

/**
 * Returns a lot's unique item ID, falling back to a computed default if missing.
 */
export function getLotUniqueItemId(lot: Lot, consignees?: Consignee[]): string {
  if (lot.uniqueItemId && lot.uniqueItemId.trim()) {
    return lot.uniqueItemId.trim();
  }

  // Fallback if uniqueItemId is missing on older lots
  let acronym = 'MCM';
  if (consignees && lot.consigneeId) {
    const matched = consignees.find(c => c.id === lot.consigneeId || c.consigneeId === lot.consigneeId);
    if (matched) {
      acronym = getConsigneeAcronym(matched);
    }
  }

  const cleanNum = (lot.lotNumber || '1000').replace(/[^0-9]/g, '') || '1000';
  const numVal = parseInt(cleanNum, 10);
  const seq = isNaN(numVal) ? 1000 : (numVal < 1000 ? numVal + 1000 : numVal);

  return `${acronym}-${seq}`;
}
