export interface UserProfile {
  uid: string;
  email: string;
  role: 'staff' | 'consignee';
  consigneeDocId?: string; // Reference to the consignees collection document
  displayName: string;
}

export interface Consignee {
  id?: string; // Document ID in Firestore
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phonePrimary: string;
  phoneSecondary: string;
  preferredContactMethod: 'Email' | 'Phone' | 'Text';
  streetAddress1: string;
  streetAddress2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  serviceType: 'Full Service' | 'Self Service';
  consigneeId: string; // Unique identifier - First Initial + Two letters of Last Name
  accountStatus: 'Active' | 'Inactive' | 'Suspended' | 'Pending Review';
  accountCreatedDate: string;
  lastActivityDate: string;
  referredBy: string;
  referralSource: string;
  internalNotes: string;
  paymentMethod: 'Interac e-Transfer' | 'Cash' | 'PayPal';
  emailForETransfer: string;
  commissionRate: number; // e.g. 15 for 15%
  minimumReservePolicy?: string;
  taxExempt?: boolean;
  taxIdLast4?: string;
  lifetimeGrossSales: number;
  lifetimePayouts: number;
  outstandingBalance: number;
  preferredAuctionFrequency?: string;
  lotMinimumValueThreshold?: number;
  preferredCategories?: string[];
  acceptsUnsoldReturns: boolean;
  unsoldDisposalPreference: 'Donate' | 'Discard' | 'Return';
  buyersPremiumWaiver?: boolean;
  photoAuthorization: boolean; // Mandatory
  signedAgreement: boolean;
  agreementDateSigned: string;
  agreementVersion: string;
  pickupAddress: string;
  pickupAvailabilityNotes: string;
  deliveryPreference: 'Drop-off' | 'Pickup' | 'Either';
  storageLocation: string;
  portalAccessEnabled: boolean;
  portalLoginEmail: string;
}

export interface Auction {
  id?: string; // Document ID in Firestore
  auctionName: string;
  auctionStatus: 'Building' | 'Scheduled' | 'Live' | 'Active' | 'Closed' | 'Settled';
  auctionType: 'Online Only' | 'Live & Online' | 'Estate Sale';
  auctionPlatform: 'HiBid' | 'Maxsold';
  platformFeeRate?: number; // e.g. 18 for 18% (default for Maxsold)
  externalAuctionId: string;
  auctionURL: string;
  internalReferenceCode: string; // e.g. "MCM-2026-07"
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  previewDates?: string;
  previewLocation?: string;
  pickupStartDate?: string;
  pickupEndDate?: string;
  pickupDate?: string; // Single date for pickup as requested in the sheet
  deadlineForDropOffs?: string; // Deadline date for drop offs as requested in the sheet
  pickupHoursNotes: string;
  pickupLocation: string;
  auctionTheme: string;
  auctionDescription: string;
  marketingNotes: string;
  emailCampaignSent: boolean;
  emailCampaignDate: string;
  socialMediaPosted: boolean;
  socialPostDate: string;
  totalLots: number;
  totalLotsSold: number;
  totalLotsUnsold: number;
  sellThroughRate: number; // percentage
  grossSales: number;
  totalBuyersPremiumCollected: number;
  totalRevenue: number;
  totalCommissionsEarned: number;
  totalConsigneePayouts: number;
  highestHammerPrice: number;
  averageHammerPrice: number;
  defaultStartingBid?: number;
  defaultReservePolicy: string;
  defaultCommissionRate: number;
  buyersPremiumRate: number; // e.g. 18 for 18%
  bidIncrementSchedule?: string;
  shippingOffered: boolean;
  shippingProviderNotes?: string;
  paymentMethodsAccepted: string[];
  paymentDueWindow: string;
  auctioneerLeadStaff: string;
  numberOfConsignees: number;
  settlementsComplete: boolean;
  internalNotes: string;
}

export interface Lot {
  id?: string; // Document ID in Firestore
  uniqueItemId?: string; // Unique identifier separate from lotNumber, e.g. CWI-1000
  lotNumber: string;
  lotTitle: string;
  lotStatus: 'Pending' | 'Active' | 'Sold' | 'Unsold' | 'Withdrawn' | 'Donated' | 'Discarded';
  consigneeId: string; // references consignees document ID
  auctionId: string | null; // references auctions document ID (null if pending)
  dateReceived: string;
  dateListed: string;
  dateSold: string;
  internalSKU: string;
  storageLocation: string;
  category: string;
  subcategory: string;
  eraPeriod: string;
  originCountry: string;
  makerManufacturer: string;
  artistDesigner: string;
  mediumMaterial: string;
  style: string;
  condition: 'Mint' | 'Excellent' | 'Very Good' | 'Good' | 'Fair' | 'Poor' | 'As-Is';
  conditionNotes: string;
  shortDescription: string;
  fullDescription: string;
  description?: string; // CSV field
  dimensions: string;
  weight: number;
  colors: string;
  quantity: number;
  keywords: string;
  primaryPhotoURL: string;
  additionalPhotoURLs: string[];
  photoCount: number;
  videoURL: string;
  provenanceDocURL: string;
  startingBid?: number;
  reserveRequested?: 'Yes' | 'No'; // CSV field
  reservePrice: number;
  reserveMet: boolean;
  hammerPrice: number | null;
  buyersPremium: number | null;
  totalSalePrice: number | null;
  commissionRate: number; // percentage, e.g. 15 for 15%
  commissionAmount: number | null;
  platformFeeRate?: number; // e.g. 18 for 18% (default for Maxsold)
  platformFeeAmount?: number | null;
  commissionTaxAmount?: number | null; // QST/GST applied to commission
  consigneePayout: number | null;
  payoutStatus?: 'Pending' | 'Issued' | 'Paid' | 'Void' | 'Unpaid' | 'N/A';
  payoutDate?: string;
  shippingAvailable: boolean;
  shippingWeightClass: string;
  buyerNameId: string;
  unsoldActionTaken: string;
  internalNotes: string;
}

export interface SellerSettlement {
  id?: string; // Firestore document ID, e.g., `${auctionId}_${consigneeId}`
  settlementId?: string; // e.g., SET-2026-001
  auctionId: string;
  auctionName: string;
  externalAuctionId?: string;
  consigneeId: string;
  consigneeName: string;
  consigneeEmail?: string;
  paymentMethod?: string;
  status: 'Pending' | 'Processing' | 'Approved' | 'Paid' | 'Void';
  grossHammerPrice: number;
  totalPlatformFees: number;
  ourCommissionAmount: number;
  netPayout: number;
  totalItems: number;
  payoutDate?: string;
  paymentReference?: string; // Check #, e-Transfer confirmation #, etc.
  internalNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}
