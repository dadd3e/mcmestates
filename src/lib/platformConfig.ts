import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface CustomField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  placeholder?: string;
  options?: string[]; // for select dropdown
  required: boolean;
}

export interface BrandingConfig {
  appName: string;
  portalSubtitle: string;
  supportEmail: string;
  supportPhone: string;
  termsUrl: string;
  footerText: string;
  commissionLabel: string; // e.g. "MCM Commission"
}

export interface SettlementConfig {
  defaultDaysToPayout: number;
  minimumPayoutThreshold: number;
  paymentMethods: string[];
}

export interface OperationsConfig {
  defaultPickupLocation: string;
  defaultInternalRefPrefix: string;
  defaultPickupHoursNotes: string;
  defaultLotCategory: string;
  defaultLotEstimateLow: number;
  defaultLotEstimateHigh: number;
  defaultStartTime: string;
  defaultEndTime: string;
}

export interface PlatformConfig {
  buyersPremiumRate: number; // default e.g. 18
  defaultCommissionRate: number; // default e.g. 15
  gstRate: number; // e.g. 5
  qstRate: number; // e.g. 9.975
  currencySymbol: string; // e.g. "$"
  defaultLotStatus: 'Pending' | 'Active';
  categories: string[];
  platforms: string[];
  formulas: {
    buyerTotal: string; // Formula string for buyers total, e.g. "hammerPrice + (hammerPrice * bpRate / 100)"
    consigneePayoutMaxsold: string; // Formula string, e.g. "hammerPrice - (hammerPrice * commissionRate / 100) - (hammerPrice * 18 / 100)"
    consigneePayoutStandard: string; // Formula string, e.g. "hammerPrice - (hammerPrice * commissionRate / 100)"
  };
  customFields: CustomField[];
  branding: BrandingConfig;
  settlement: SettlementConfig;
  operations?: OperationsConfig;
}

export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  buyersPremiumRate: 18,
  defaultCommissionRate: 15,
  gstRate: 5,
  qstRate: 9.975,
  currencySymbol: '$',
  defaultLotStatus: 'Pending',
  categories: [
    'Furniture',
    'Glassware',
    'Lighting',
    'Clocks & Watches',
    'Rugs & Carpets',
    'Silver & Metalware',
    'Ceramics',
    'Decor',
    'Fine Art',
    'Books & Ephemera'
  ],
  platforms: ['Maxsold', 'HiBid', 'In-House Catalog'],
  formulas: {
    buyerTotal: 'hammerPrice * (1 + bpRate / 100)',
    consigneePayoutMaxsold: 'hammerPrice - (hammerPrice * commissionRate / 100) - (hammerPrice * platformFeeRate / 100)',
    consigneePayoutStandard: 'hammerPrice * (1 - commissionRate / 100)'
  },
  customFields: [
    {
      key: 'internalSKU',
      label: 'Storage SKU',
      type: 'text',
      placeholder: 'SKU-XXXX',
      required: false
    },
    {
      key: 'storageLocation',
      label: 'Storage Location',
      type: 'text',
      placeholder: 'e.g. Row B-4',
      required: false
    },
    {
      key: 'eraPeriod',
      label: 'Era / Period',
      type: 'text',
      placeholder: 'e.g. 1960s, Victorian',
      required: false
    },
    {
      key: 'originCountry',
      label: 'Origin / Country',
      type: 'text',
      placeholder: 'e.g. Denmark, Italy',
      required: false
    },
    {
      key: 'makerManufacturer',
      label: 'Maker / Manufacturer',
      type: 'text',
      placeholder: 'e.g. Louis Poulsen',
      required: false
    },
    {
      key: 'artistDesigner',
      label: 'Artist / Designer',
      type: 'text',
      placeholder: 'e.g. Poul Henningsen',
      required: false
    },
    {
      key: 'dimensions',
      label: 'Dimensions',
      type: 'text',
      placeholder: 'e.g. 20" x 20" x 15"',
      required: false
    },
    {
      key: 'style',
      label: 'Style / Era Name',
      type: 'text',
      placeholder: 'e.g. Art Deco, Mid-Century Modern',
      required: false
    },
    {
      key: 'mediumMaterial',
      label: 'Medium / Material',
      type: 'text',
      placeholder: 'e.g. Teak Wood, Blown Glass',
      required: false
    },
    {
      key: 'weight',
      label: 'Weight (lbs)',
      type: 'number',
      placeholder: 'e.g. 15',
      required: false
    },
    {
      key: 'colors',
      label: 'Colors',
      type: 'text',
      placeholder: 'e.g. Amber, Walnut',
      required: false
    },
    {
      key: 'quantity',
      label: 'Quantity',
      type: 'number',
      placeholder: 'e.g. 1',
      required: false
    },
    {
      key: 'keywords',
      label: 'Search Keywords',
      type: 'text',
      placeholder: 'e.g. midcentury, danish, storage',
      required: false
    },
    {
      key: 'videoURL',
      label: 'Video URL',
      type: 'text',
      placeholder: 'e.g. https://youtube.com/watch?v=...',
      required: false
    },
    {
      key: 'provenanceDocURL',
      label: 'Provenance Document URL',
      type: 'text',
      placeholder: 'e.g. https://...',
      required: false
    },
    {
      key: 'conditionNotes',
      label: 'Condition Notes',
      type: 'text',
      placeholder: 'Note any wear, damage, or restoration details...',
      required: false
    }
  ],
  branding: {
    appName: 'MCM Estate Services',
    portalSubtitle: 'Consignor & Inventory Management Suite',
    supportEmail: 'mcmestateservices@gmail.com',
    supportPhone: '(514) 555-0192',
    termsUrl: 'https://mcmestateservices.com/terms',
    footerText: '© 2026 MCM Estate Services. All rights reserved.',
    commissionLabel: 'MCM Commission'
  },
  settlement: {
    defaultDaysToPayout: 30,
    minimumPayoutThreshold: 10,
    paymentMethods: ['Direct Deposit', 'Cheque', 'E-Transfer']
  },
  operations: {
    defaultPickupLocation: 'MCM Warehouse, Suite A',
    defaultInternalRefPrefix: 'MCM',
    defaultPickupHoursNotes: '9 AM - 4 PM',
    defaultLotCategory: 'Furniture',
    defaultLotEstimateLow: 50,
    defaultLotEstimateHigh: 150,
    defaultStartTime: '10:00',
    defaultEndTime: '18:00'
  }
};

// Listen to changes in Firestore config, seed it if missing
export const listenPlatformConfig = (onUpdate: (config: PlatformConfig) => void) => {
  const configDocRef = doc(db, 'settings', 'platform_config');
  
  return onSnapshot(configDocRef, async (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.data();
      // Safe merge to handle any properties missing from older database seeds
      const merged: PlatformConfig = {
        ...DEFAULT_PLATFORM_CONFIG,
        ...data,
        formulas: {
          ...DEFAULT_PLATFORM_CONFIG.formulas,
          ...(data.formulas || {})
        },
        branding: {
          ...DEFAULT_PLATFORM_CONFIG.branding,
          ...(data.branding || {})
        },
        settlement: {
          ...DEFAULT_PLATFORM_CONFIG.settlement,
          ...(data.settlement || {})
        },
        operations: {
          ...DEFAULT_PLATFORM_CONFIG.operations,
          ...(data.operations || {})
        },
        categories: data.categories || DEFAULT_PLATFORM_CONFIG.categories,
        platforms: data.platforms || DEFAULT_PLATFORM_CONFIG.platforms,
        customFields: (() => {
          const dbCustomFields = data.customFields || [];
          const dbKeys = new Set(dbCustomFields.map((f: any) => f.key));
          const missingDefaults = DEFAULT_PLATFORM_CONFIG.customFields.filter(f => !dbKeys.has(f.key));
          if (missingDefaults.length > 0) {
            const merged = [...dbCustomFields, ...missingDefaults];
            // Safe background update to persist the new defaults to Firestore
            setDoc(configDocRef, { ...data, customFields: merged }, { merge: true }).catch(err => {
              console.error('Error auto-syncing custom fields back to Firestore:', err);
            });
            return merged;
          }
          return dbCustomFields;
        })()
      };
      
      // Filter out LiveAuctioneers just in case it exists in database
      if (merged.platforms.includes('LiveAuctioneers')) {
        merged.platforms = merged.platforms.filter(p => p !== 'LiveAuctioneers');
      }
      
      onUpdate(merged);
    } else {
      // Seed default config
      try {
        await setDoc(configDocRef, DEFAULT_PLATFORM_CONFIG);
        onUpdate(DEFAULT_PLATFORM_CONFIG);
      } catch (err) {
        console.error('Error seeding platform config:', err);
        onUpdate(DEFAULT_PLATFORM_CONFIG);
      }
    }
  });
};

// Save updated config
export const savePlatformConfig = async (config: PlatformConfig) => {
  const configDocRef = doc(db, 'settings', 'platform_config');
  await setDoc(configDocRef, config);
};

// Safe formula evaluator
export const evaluateFormula = (
  formula: string,
  variables: {
    hammerPrice: number;
    commissionRate: number;
    bpRate: number;
    platformFeeRate?: number;
    gstRate?: number;
    qstRate?: number;
  }
): number => {
  try {
    // Replace variable names with their actual numeric values safely
    const parsed = formula
      .replace(/hammerPrice/g, String(variables.hammerPrice ?? 0))
      .replace(/commissionRate/g, String(variables.commissionRate ?? 0))
      .replace(/bpRate/g, String(variables.bpRate ?? 0))
      .replace(/platformFeeRate/g, String(variables.platformFeeRate ?? 0))
      .replace(/gstRate/g, String(variables.gstRate ?? 0))
      .replace(/qstRate/g, String(variables.qstRate ?? 0));

    // Simple sanitization: only allow mathematical characters
    if (/[^0-9.+\-*/\s()]/g.test(parsed)) {
      throw new Error('Invalid characters in formula');
    }

    // Evaluate the expression safely using Function
    const result = new Function(`return (${parsed})`)();
    return typeof result === 'number' && !isNaN(result) ? Math.max(0, result) : 0;
  } catch (err) {
    console.error('Formula evaluation failed for:', formula, err);
    // Fallback logic in case formula has issues
    return 0;
  }
};
