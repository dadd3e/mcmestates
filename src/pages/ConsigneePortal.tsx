import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, getDoc, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { Lot, Auction, Consignee, SellerSettlement } from '../types';
import StatCard from '../components/StatCard';
import CountdownTimer from '../components/CountdownTimer';
import { 
  Package, LayoutDashboard, Send, Award, DollarSign, LogOut, Info, AlertCircle, CheckCircle, ChevronDown, ChevronUp, User, Check, HeartHandshake, Landmark, FileText, Calendar, X, Menu,
  Clock, TrendingUp, Filter, Printer, Download, HelpCircle, Layers, Mail, PhoneCall, Sparkles, ArrowRight,
  Search, Grid, List, RotateCcw, SlidersHorizontal, ArrowUpDown, Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { calculateLotFinancials } from '../lib/financials';
import { getLotUniqueItemId, generateNextUniqueItemId, getConsigneeAcronym } from '../lib/idGenerator';
import { ImageUploader } from '../components/ImageUploader';
import { listenPlatformConfig, PlatformConfig, DEFAULT_PLATFORM_CONFIG } from '../lib/platformConfig';

export type DateRangeKey = 'last30' | 'last60' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'all';

export const DATE_RANGE_OPTIONS: { key: DateRangeKey; label: string }[] = [
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'last60', label: 'Last 60 Days' },
  { key: 'last90', label: 'Last 90 Days' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'thisYear', label: 'This Year' },
  { key: 'lastYear', label: 'Last Year' },
  { key: 'all', label: 'All Time' },
];

export function isDateInRange(dateStr: string | null | undefined, rangeKey: DateRangeKey): boolean {
  if (rangeKey === 'all') return true;
  if (!dateStr) return false;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (rangeKey === 'last30') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0);
    return date >= start && date <= todayEnd;
  }
  if (rangeKey === 'last60') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60, 0, 0, 0);
    return date >= start && date <= todayEnd;
  }
  if (rangeKey === 'last90') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90, 0, 0, 0);
    return date >= start && date <= todayEnd;
  }
  if (rangeKey === 'thisMonth') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (rangeKey === 'lastMonth') {
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return date.getFullYear() === lastMonthDate.getFullYear() && date.getMonth() === lastMonthDate.getMonth();
  }
  if (rangeKey === 'thisYear') {
    return date.getFullYear() === now.getFullYear();
  }
  if (rangeKey === 'lastYear') {
    return date.getFullYear() === now.getFullYear() - 1;
  }
  return true;
}

interface ConsigneePortalProps {
  consigneeDocId: string;
  displayName: string;
  onLogout: () => void;
}

export default function ConsigneePortal({ consigneeDocId, displayName, onLogout }: ConsigneePortalProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'items' | 'submit' | 'payouts' | 'progress' | 'profile'>('dashboard');
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  
  // Date Range filter state
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');

  // My Items Filter & Search state
  const [itemsSearch, setItemsSearch] = useState('');
  const [itemsStatusFilter, setItemsStatusFilter] = useState<string>('ALL');
  const [itemsCategoryFilter, setItemsCategoryFilter] = useState<string>('ALL');
  const [itemsPayoutFilter, setItemsPayoutFilter] = useState<string>('ALL');
  const [itemsReserveFilter, setItemsReserveFilter] = useState<string>('ALL');
  const [itemsDateRange, setItemsDateRange] = useState<DateRangeKey>('all');
  const [itemsSortBy, setItemsSortBy] = useState<string>('date-desc');
  const [itemsViewMode, setItemsViewMode] = useState<'table' | 'grid'>('table');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);

  // Dashboard modal tools
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactSubject, setContactSubject] = useState('Inquiry regarding consignment lots');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);
  
  const [lots, setLots] = useState<Lot[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [profile, setProfile] = useState<Consignee | null>(null);
  const [loading, setLoading] = useState(true);

  // Form submission state
  const [submitting, setSubmitting] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Profile Edit form state
  const [profileForm, setProfileForm] = useState<Partial<Consignee>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Selected Lot for View/Edit modal
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [editLotForm, setEditLotForm] = useState<Partial<Lot>>({});
  const [isEditingLot, setIsEditingLot] = useState(false);
  const [savingLot, setSavingLot] = useState(false);

  const [submitForm, setSubmitForm] = useState({
    lotTitle: '',
    category: 'Furniture',
    subcategory: '',
    eraPeriod: '',
    originCountry: '',
    makerManufacturer: '',
    artistDesigner: '',
    mediumMaterial: '',
    style: '',
    condition: 'Excellent' as const,
    conditionNotes: '',
    shortDescription: '',
    fullDescription: '',
    dimensions: '',
    weight: 0,
    colors: '',
    quantity: 1,
    shippingAvailable: true,
    reserveRequested: 'No' as 'Yes' | 'No',
    reservePrice: 0,
    primaryPhotoURL: '',
    additionalPhotoURLs: [] as string[]
  });

  const [settlementsMap, setSettlementsMap] = useState<Record<string, SellerSettlement>>({});

  // Load profile and register real-time listeners for the consignee's items and auctions
  useEffect(() => {
    setLoading(true);

    // 1. Fetch profile
    getDoc(doc(db, 'consignees', consigneeDocId)).then(snap => {
      if (snap.exists()) {
        const data = snap.data() as Consignee;
        setProfile({ id: snap.id, ...data } as Consignee);
        setProfileForm(data);
      }
    });

    // 2. Fetch auctions (public metadata, can see all scheduled/live auctions)
    const unsubAuctions = onSnapshot(collection(db, 'auctions'), (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Auction));
      setAuctions(data);
    });

    // 3. Listen to lots matching this consignee's ID only! (Secure query matching our security rules)
    const lotsQuery = query(
      collection(db, 'lots'),
      where('consigneeId', '==', consigneeDocId)
    );

    const unsubLots = onSnapshot(lotsQuery, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Lot));
      setLots(data);
      setLoading(false);
    }, (err) => {
      console.error("Firestore loading error: ", err);
      setLoading(false);
    });

    // 4. Listen to settlements collection
    const unsubSettlements = onSnapshot(collection(db, 'settlements'), (snap) => {
      const map: Record<string, SellerSettlement> = {};
      snap.docs.forEach(d => {
        const data = d.data() as SellerSettlement;
        map[d.id] = data;
      });
      setSettlementsMap(map);
    });

    // 5. Listen to platform configuration settings
    const unsubConfig = listenPlatformConfig((newConfig) => {
      setPlatformConfig(newConfig);
    });

    return () => {
      unsubAuctions();
      unsubLots();
      unsubSettlements();
      unsubConfig();
    };
  }, [consigneeDocId]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onLogout();
    } catch (err) {
      console.error(err);
    }
  };

  const getAuctionName = (auctionId: string | null) => {
    if (!auctionId) return 'Pending / Unscheduled';
    const a = auctions.find(x => x.id === auctionId);
    return a ? a.auctionName : 'Unknown Auction';
  };

  const getAuctionDetails = (auctionId: string | null) => {
    return auctions.find(x => x.id === auctionId);
  };

  // Submit form submission to Firestore
  const handleSubmitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setSubmittedSuccess(false);

    try {
      // Setup default and computed values required for a safe lot
      const nextLotNumber = `PEND-${Date.now().toString().slice(-4)}`;
      const acronym = getConsigneeAcronym(profile);
      const nextUniqueItemId = generateNextUniqueItemId(acronym, lots, profile ? [profile] : [], consigneeDocId);

      const payload: Omit<Lot, 'id'> = {
        ...submitForm,
        uniqueItemId: nextUniqueItemId,
        lotNumber: nextLotNumber,
        lotStatus: 'Pending',
        consigneeId: consigneeDocId,
        auctionId: null,
        dateReceived: new Date().toISOString().split('T')[0],
        dateListed: '',
        dateSold: '',
        internalSKU: `SKU-PEND-${nextLotNumber}`,
        storageLocation: 'Intake Hold',
        primaryPhotoURL: submitForm.primaryPhotoURL || '',
        additionalPhotoURLs: submitForm.additionalPhotoURLs || [],
        photoCount: (submitForm.primaryPhotoURL ? 1 : 0) + (submitForm.additionalPhotoURLs || []).length,
        videoURL: '',
        provenanceDocURL: '',
        reserveMet: false,
        hammerPrice: null,
        buyersPremium: null,
        totalSalePrice: null,
        commissionRate: profile?.commissionRate || 15,
        commissionAmount: null,
        consigneePayout: null,
        payoutStatus: 'Pending',
        payoutDate: '',
        keywords: `${submitForm.category}, submitted`,
        buyerNameId: '',
        unsoldActionTaken: '',
        internalNotes: `Submitted online by consignee ${profile?.displayName || consigneeDocId}`
      };

      await addDoc(collection(db, 'lots'), payload);
      
      setSubmittedSuccess(true);
      // Reset form
      setSubmitForm({
        lotTitle: '',
        category: 'Furniture',
        subcategory: '',
        eraPeriod: '',
        originCountry: '',
        makerManufacturer: '',
        artistDesigner: '',
        mediumMaterial: '',
        style: '',
        condition: 'Excellent',
        conditionNotes: '',
        shortDescription: '',
        fullDescription: '',
        dimensions: '',
        weight: 0,
        colors: '',
        quantity: 1,
        shippingAvailable: true,
        reserveRequested: 'No',
        reservePrice: 0,
        primaryPhotoURL: '',
        additionalPhotoURLs: []
      });
    } catch (err: any) {
      console.error(err);
      setSubmitError(err.message || 'Error creating lot document.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (name === 'weight' || name === 'quantity' || name === 'reservePrice') {
      finalValue = Number(value);
    }
    setSubmitForm(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleRowClick = (lot: Lot) => {
    setSelectedLot(lot);
    setEditLotForm(lot);
    setIsEditingLot(false);
  };

  const handleSaveLotEdit = async () => {
    if (!selectedLot?.id) return;
    setSavingLot(true);
    try {
      const docRef = doc(db, 'lots', selectedLot.id);
      
      const updatableFields = {
        lotTitle: editLotForm.lotTitle || '',
        category: editLotForm.category || 'Furniture',
        eraPeriod: editLotForm.eraPeriod || '',
        originCountry: editLotForm.originCountry || '',
        makerManufacturer: editLotForm.makerManufacturer || '',
        artistDesigner: editLotForm.artistDesigner || '',
        condition: editLotForm.condition || 'Excellent',
        conditionNotes: editLotForm.conditionNotes || '',
        fullDescription: editLotForm.fullDescription || '',
        dimensions: editLotForm.dimensions || '',
        primaryPhotoURL: editLotForm.primaryPhotoURL || '',
        reserveRequested: editLotForm.reserveRequested || 'No',
        reservePrice: Number(editLotForm.reservePrice) || 0,
      };

      await updateDoc(docRef, updatableFields);
      setSelectedLot(prev => prev ? { ...prev, ...updatableFields } : null);
      setIsEditingLot(false);
    } catch (err: any) {
      console.error("Error saving lot changes: ", err);
      alert(err.message || "Failed to save changes.");
    } finally {
      setSavingLot(false);
    }
  };

  // Handle form field changes for profile editing
  const handleProfileFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    }
    setProfileForm(prev => ({ ...prev, [name]: finalValue }));
  };

  // Save changes to profile document in Firestore
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSaved(false);
    setProfileError(null);
    try {
      const docRef = doc(db, 'consignees', consigneeDocId);
      
      // Remove uneditable/system properties to prevent overwriting
      const { id, consigneeId, accountCreatedDate, lastActivityDate, serviceType, accountStatus, referredBy, referralSource, internalNotes, portalAccessEnabled, portalLoginEmail, commissionRate, lifetimeGrossSales, lifetimePayouts, outstandingBalance, signedAgreement, agreementDateSigned, agreementVersion, ...updatable } = profileForm;
      
      // Always record last updated timestamp or activity
      const updatedPayload = {
        ...updatable,
        lastActivityDate: new Date().toISOString().split('T')[0]
      };

      await updateDoc(docRef, updatedPayload);
      setProfile(prev => prev ? { ...prev, ...updatedPayload } : null);
      setProfileSaved(true);
    } catch (err: any) {
      console.error("Error saving profile: ", err);
      setProfileError(err.message || "Failed to save profile changes.");
    } finally {
      setSavingProfile(false);
    }
  };

  // Dynamically calculate and hydrate all lot fields for robust UI behavior
  const computedLots = useMemo(() => {
    return lots.map(l => {
      const auc = getAuctionDetails(l.auctionId);
      const computed = calculateLotFinancials(l, auc, profile || undefined);
      return {
        ...l,
        ...computed
      };
    });
  }, [lots, auctions, profile]);

  // Filtered KPIs and Metrics based on selected Date Range
  // 1. Items Submitted in selected date range (looking at Date of Submission - dateReceived / dateListed)
  const submittedLotsInRange = useMemo(() => {
    return computedLots.filter(l => isDateInRange(l.dateReceived || l.dateListed, dateRange));
  }, [computedLots, dateRange]);

  // 2. Currently Live items (Active in running auctions)
  const itemsLiveCount = useMemo(() => {
    return computedLots.filter(l => l.lotStatus === 'Active').length;
  }, [computedLots]);

  // 3. Pending / Processing Items in selected date range
  const pendingLotsInRange = useMemo(() => {
    return computedLots.filter(l => l.lotStatus === 'Pending' && isDateInRange(l.dateReceived || l.dateListed, dateRange));
  }, [computedLots, dateRange]);

  // 4. Sold lots in selected date range (filtered by dateSold or dateReceived)
  const soldLotsInRange = useMemo(() => {
    return computedLots.filter(l => l.lotStatus === 'Sold' && isDateInRange(l.dateSold || l.dateReceived, dateRange));
  }, [computedLots, dateRange]);

  // 5. Net Earned in date range (Consignee payout for sold items)
  const netEarnedInRange = useMemo(() => {
    return soldLotsInRange.reduce((sum, l) => sum + (l.consigneePayout || 0), 0);
  }, [soldLotsInRange]);

  // 6. Disbursed Payouts (Paid out) in date range
  const paidPayoutsInRange = useMemo(() => {
    return soldLotsInRange
      .filter(l => l.payoutStatus === 'Paid' || l.payoutStatus === 'Issued')
      .reduce((sum, l) => sum + (l.consigneePayout || 0), 0);
  }, [soldLotsInRange]);

  // 7. Pending Payouts in date range
  const pendingPayoutsInRange = useMemo(() => {
    return soldLotsInRange
      .filter(l => l.payoutStatus !== 'Paid')
      .reduce((sum, l) => sum + (l.consigneePayout || 0), 0);
  }, [soldLotsInRange]);

  // All time sold lots (fallback)
  const soldLots = useMemo(() => computedLots.filter(l => l.lotStatus === 'Sold'), [computedLots]);
  
  // Performance Insights
  const sellThroughRate = useMemo(() => {
    if (submittedLotsInRange.length === 0) return 0;
    const soldInSubmitted = submittedLotsInRange.filter(l => l.lotStatus === 'Sold').length;
    return Math.round((soldInSubmitted / submittedLotsInRange.length) * 100);
  }, [submittedLotsInRange]);

  const avgHammerPrice = useMemo(() => {
    if (soldLotsInRange.length === 0) return 0;
    const totalHammer = soldLotsInRange.reduce((sum, l) => sum + (l.hammerPrice || 0), 0);
    return totalHammer / soldLotsInRange.length;
  }, [soldLotsInRange]);

  const topPerformingLot = useMemo(() => {
    if (soldLotsInRange.length === 0) return null;
    return [...soldLotsInRange].sort((a, b) => (b.hammerPrice || 0) - (a.hammerPrice || 0))[0];
  }, [soldLotsInRange]);

  // Visual status pipeline distribution
  const statusPipeline = useMemo(() => {
    const pending = computedLots.filter(l => l.lotStatus === 'Pending').length;
    const active = computedLots.filter(l => l.lotStatus === 'Active').length;
    const sold = computedLots.filter(l => l.lotStatus === 'Sold').length;
    const other = computedLots.filter(l => ['Unsold', 'Withdrawn', 'Donated', 'Discarded'].includes(l.lotStatus)).length;
    const total = computedLots.length || 1;
    return {
      pending,
      active,
      sold,
      other,
      pendingPct: Math.round((pending / total) * 100),
      activePct: Math.round((active / total) * 100),
      soldPct: Math.round((sold / total) * 100),
      otherPct: Math.round((other / total) * 100),
    };
  }, [computedLots]);

  // Available unique categories from lots & platformConfig
  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    platformConfig.categories.forEach(c => cats.add(c));
    computedLots.forEach(l => {
      if (l.category) cats.add(l.category);
    });
    return Array.from(cats).sort();
  }, [computedLots, platformConfig]);

  // Filtered and Sorted Lots for "My Items" tab
  const filteredAndSortedItems = useMemo(() => {
    return computedLots.filter(l => {
      // 1. Keyword search (Title, Lot #, Category, Description, Maker/Designer)
      if (itemsSearch.trim()) {
        const q = itemsSearch.trim().toLowerCase();
        const matchTitle = (l.lotTitle || '').toLowerCase().includes(q);
        const matchLotNum = (l.lotNumber || '').toString().toLowerCase().includes(q);
        const matchCat = (l.category || '').toLowerCase().includes(q);
        const matchDesc = (l.description || '').toLowerCase().includes(q);
        const matchMaker = (l.makerDesigner || '').toLowerCase().includes(q);
        if (!matchTitle && !matchLotNum && !matchCat && !matchDesc && !matchMaker) {
          return false;
        }
      }

      // 2. Status filter
      if (itemsStatusFilter !== 'ALL') {
        if (itemsStatusFilter === 'Live') {
          if (l.lotStatus !== 'Active') return false;
        } else if (l.lotStatus !== itemsStatusFilter) {
          return false;
        }
      }

      // 3. Category filter
      if (itemsCategoryFilter !== 'ALL' && l.category !== itemsCategoryFilter) {
        return false;
      }

      // 4. Payout status filter
      if (itemsPayoutFilter === 'Paid') {
        if (l.payoutStatus !== 'Paid' && l.payoutStatus !== 'Issued') return false;
      } else if (itemsPayoutFilter === 'Pending Payout') {
        if (l.lotStatus !== 'Sold' || l.payoutStatus === 'Paid' || l.payoutStatus === 'Issued') return false;
      } else if (itemsPayoutFilter === 'Unsold') {
        if (l.lotStatus === 'Sold') return false;
      }

      // 5. Reserve filter
      if (itemsReserveFilter === 'With Reserve') {
        if (l.reserveRequested !== 'Yes' || !(l.reservePrice && l.reservePrice > 0)) return false;
      } else if (itemsReserveFilter === 'No Reserve') {
        if (l.reserveRequested === 'Yes' && l.reservePrice && l.reservePrice > 0) return false;
      }

      // 6. Date Range filter
      if (itemsDateRange !== 'all') {
        const lotDate = l.dateReceived || l.dateListed || l.dateSold;
        if (!isDateInRange(lotDate, itemsDateRange)) return false;
      }

      return true;
    }).sort((a, b) => {
      if (itemsSortBy === 'date-desc') {
        const dA = new Date(a.dateReceived || a.dateListed || 0).getTime();
        const dB = new Date(b.dateReceived || b.dateListed || 0).getTime();
        return dB - dA;
      }
      if (itemsSortBy === 'date-asc') {
        const dA = new Date(a.dateReceived || a.dateListed || 0).getTime();
        const dB = new Date(b.dateReceived || b.dateListed || 0).getTime();
        return dA - dB;
      }
      if (itemsSortBy === 'lot-asc') {
        return (parseInt(a.lotNumber || '0', 10) || 0) - (parseInt(b.lotNumber || '0', 10) || 0);
      }
      if (itemsSortBy === 'lot-desc') {
        return (parseInt(b.lotNumber || '0', 10) || 0) - (parseInt(a.lotNumber || '0', 10) || 0);
      }
      if (itemsSortBy === 'title-asc') {
        return (a.lotTitle || '').localeCompare(b.lotTitle || '');
      }
      if (itemsSortBy === 'title-desc') {
        return (b.lotTitle || '').localeCompare(a.lotTitle || '');
      }
      if (itemsSortBy === 'hammer-desc') {
        return (b.hammerPrice || 0) - (a.hammerPrice || 0);
      }
      if (itemsSortBy === 'payout-desc') {
        return (b.consigneePayout || 0) - (a.consigneePayout || 0);
      }
      return 0;
    });
  }, [computedLots, itemsSearch, itemsStatusFilter, itemsCategoryFilter, itemsPayoutFilter, itemsReserveFilter, itemsDateRange, itemsSortBy]);

  // Metrics for filtered items
  const filteredMetrics = useMemo(() => {
    const totalCount = filteredAndSortedItems.length;
    const soldCount = filteredAndSortedItems.filter(l => l.lotStatus === 'Sold').length;
    const activeCount = filteredAndSortedItems.filter(l => l.lotStatus === 'Active').length;
    const pendingCount = filteredAndSortedItems.filter(l => l.lotStatus === 'Pending').length;
    const totalHammer = filteredAndSortedItems.reduce((sum, l) => sum + (l.hammerPrice || 0), 0);
    const totalPayout = filteredAndSortedItems.reduce((sum, l) => sum + (l.consigneePayout || 0), 0);
    return {
      totalCount,
      soldCount,
      activeCount,
      pendingCount,
      totalHammer,
      totalPayout
    };
  }, [filteredAndSortedItems]);

  const hasActiveFilters = itemsSearch !== '' || itemsStatusFilter !== 'ALL' || itemsCategoryFilter !== 'ALL' || itemsPayoutFilter !== 'ALL' || itemsReserveFilter !== 'ALL' || itemsDateRange !== 'all';

  const resetItemsFilters = () => {
    setItemsSearch('');
    setItemsStatusFilter('ALL');
    setItemsCategoryFilter('ALL');
    setItemsPayoutFilter('ALL');
    setItemsReserveFilter('ALL');
    setItemsDateRange('all');
    setItemsSortBy('date-desc');
  };

  const handleExportCSV = () => {
    const headers = ["Lot #", "Title", "Category", "Status", "Date Submitted", "Reserve Requested", "Reserve Price ($)", "Hammer Price ($)", "Est. Net Payout ($)", "Payout Status"];
    const rows = filteredAndSortedItems.map(l => [
      `"${l.lotNumber || ''}"`,
      `"${(l.lotTitle || '').replace(/"/g, '""')}"`,
      `"${l.category || ''}"`,
      `"${l.lotStatus || ''}"`,
      `"${l.dateReceived || l.dateListed || ''}"`,
      `"${l.reserveRequested || 'No'}"`,
      l.reserveRequested === 'Yes' ? (l.reservePrice || 0).toFixed(2) : '0.00',
      l.hammerPrice !== null ? l.hammerPrice.toFixed(2) : '-',
      l.consigneePayout !== null ? l.consigneePayout.toFixed(2) : '-',
      `"${l.payoutStatus || 'Pending'}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Consignment_Items_Filtered_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Expanded/collapsed states for payout settlement lines
  const [expandedAuctions, setExpandedAuctions] = useState<Record<string, boolean>>({});

  // Group sold lots by auction -> Seller Settlement per auction
  const aggregatedPayouts = useMemo(() => {
    const groups: Record<string, {
      auctionId: string | null;
      auctionName: string;
      auctionPlatform: string;
      endDate: string;
      totalHammer: number;
      totalPlatformFee: number;
      totalCommission: number;
      totalTax: number;
      totalPayout: number;
      payoutStatus: string;
      payoutDate: string;
      paymentReference?: string;
      lots: Lot[];
    }> = {};

    soldLots.forEach(l => {
      const aid = l.auctionId || 'unscheduled';
      if (!groups[aid]) {
        const auc = getAuctionDetails(l.auctionId);
        groups[aid] = {
          auctionId: l.auctionId,
          auctionName: getAuctionName(l.auctionId),
          auctionPlatform: auc?.auctionPlatform || 'HiBid',
          endDate: l.dateSold || auc?.endDate || '-',
          totalHammer: 0,
          totalPlatformFee: 0,
          totalCommission: 0,
          totalTax: 0,
          totalPayout: 0,
          payoutStatus: 'Pending',
          payoutDate: '',
          paymentReference: '',
          lots: []
        };
      }

      const g = groups[aid];
      g.lots.push(l);
      g.totalHammer += l.hammerPrice || 0;
      g.totalPlatformFee += l.platformFeeAmount || 0;
      g.totalCommission += l.commissionAmount || 0;
      g.totalTax += l.commissionTaxAmount || 0;
      g.totalPayout += l.consigneePayout || 0;
    });

    Object.values(groups).forEach(g => {
      const key = `${g.auctionId}_${consigneeDocId}`;
      const savedSettlement = settlementsMap[key] || Object.values(settlementsMap).find((s: SellerSettlement) => s.auctionId === g.auctionId && (s.consigneeId === profile?.consigneeId || s.consigneeId === consigneeDocId));

      if (savedSettlement) {
        g.payoutStatus = savedSettlement.status || 'Pending';
        g.payoutDate = savedSettlement.payoutDate || '';
        g.paymentReference = savedSettlement.paymentReference || '';
      } else {
        g.payoutStatus = 'Pending';
      }
    });

    return Object.values(groups);
  }, [soldLots, auctions, settlementsMap, consigneeDocId, profile]);

  const pendingPayout = useMemo(() => {
    return aggregatedPayouts
      .filter(p => p.payoutStatus !== 'Paid')
      .reduce((sum, p) => sum + p.totalPayout, 0);
  }, [aggregatedPayouts]);

  const toggleAuctionExpanded = (auctionId: string | null) => {
    const key = auctionId || 'unscheduled';
    setExpandedAuctions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Active lots for countdown preview
  const liveLotsWithAuction = computedLots.filter(l => l.lotStatus === 'Active' && l.auctionId);

  return (
    <div id="consignee-portal-layout" className="min-h-screen bg-[#FBFBFA] flex flex-col md:flex-row">
      
      {/* MOBILE TOP BAR HEADER */}
      <div className="md:hidden bg-[#1A1A19] text-white p-4 border-b border-[#2C2C2A] flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 font-bold">✦</span>
          <span className="font-semibold text-sm tracking-tight">{platformConfig.branding?.appName || 'MCM Estate Services'} Portal</span>
        </div>
        <button
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          className="p-1.5 text-gray-300 hover:text-white hover:bg-[#313130] rounded transition-colors"
          aria-label="Toggle navigation"
        >
          {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* PERSISTENT / COLLAPSIBLE SIDEBAR */}
      <aside className={`w-full md:w-64 bg-[#1A1A19] text-white flex flex-col border-r border-[#2C2C2A] md:min-h-screen ${
        isMobileNavOpen ? 'block' : 'hidden md:flex'
      }`}>
        <div className="p-6 border-b border-[#2C2C2A]">
          <h2 className="text-xl font-sans font-medium tracking-tight">
            {(() => {
              const parts = (platformConfig.branding?.appName || 'MCM Estate Services').split(' ');
              const first = parts[0] || '';
              const rest = parts.slice(1).join(' ') || '';
              return (
                <>
                  {first} <span className="font-light text-gray-400">{rest || 'Portal'}</span>
                </>
              );
            })()}
          </h2>
          <p className="text-[9px] text-gray-500 uppercase tracking-widest font-mono mt-1">Consignee Dashboard</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button
            id="tab-consignee-dashboard"
            onClick={() => { setActiveTab('dashboard'); setSubmittedSuccess(false); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium transition-all duration-150 rounded-none cursor-pointer ${
              activeTab === 'dashboard' ? 'bg-[#313130] text-white' : 'text-gray-400 hover:text-white hover:bg-[#252524]'
            }`}
          >
            <LayoutDashboard className="h-4.5 w-4.5 mr-3" />
            Home Console
          </button>
          
          <button
            id="tab-consignee-items"
            onClick={() => { setActiveTab('items'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium transition-all duration-150 rounded-none cursor-pointer ${
              activeTab === 'items' ? 'bg-[#313130] text-white' : 'text-gray-400 hover:text-white hover:bg-[#252524]'
            }`}
          >
            <Package className="h-4.5 w-4.5 mr-3" />
            My Items
          </button>
          
          <button
            id="tab-consignee-submit"
            onClick={() => { setActiveTab('submit'); setSubmittedSuccess(false); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium transition-all duration-150 rounded-none cursor-pointer ${
              activeTab === 'submit' ? 'bg-[#313130] text-white' : 'text-gray-400 hover:text-white hover:bg-[#252524]'
            }`}
          >
            <Send className="h-4.5 w-4.5 mr-3" />
            Submit an Item
          </button>
          
          <button
            id="tab-consignee-payouts"
            onClick={() => { setActiveTab('payouts'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium transition-all duration-150 rounded-none cursor-pointer ${
              activeTab === 'payouts' ? 'bg-[#313130] text-white' : 'text-gray-400 hover:text-white hover:bg-[#252524]'
            }`}
          >
            <DollarSign className="h-4.5 w-4.5 mr-3" />
            My Payouts
          </button>

          <button
            id="tab-consignee-progress"
            onClick={() => { setActiveTab('progress'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium transition-all duration-150 rounded-none cursor-pointer ${
              activeTab === 'progress' ? 'bg-[#313130] text-white' : 'text-gray-400 hover:text-white hover:bg-[#252524]'
            }`}
          >
            <Award className="h-4.5 w-4.5 mr-3" />
            Auction Progress
          </button>

          <button
            id="tab-consignee-profile"
            onClick={() => { setActiveTab('profile'); setProfileSaved(false); setProfileError(null); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center px-4 py-3 text-sm font-medium transition-all duration-150 rounded-none cursor-pointer ${
              activeTab === 'profile' ? 'bg-[#313130] text-white' : 'text-gray-400 hover:text-white hover:bg-[#252524]'
            }`}
          >
            <User className="h-4.5 w-4.5 mr-3" />
            My Profile
          </button>
        </nav>

        <div className="p-4 border-t border-[#2C2C2A] bg-[#141413]">
          <div className="text-xs text-gray-400">Logged in as:</div>
          <div className="text-sm font-medium text-gray-200 truncate">{displayName}</div>
          {profile && (
            <div className="text-[10px] text-amber-400 font-mono mt-0.5">Rate: {profile.commissionRate}% comm.</div>
          )}
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        
        {/* TOP BAR */}
        <header className="h-16 bg-white border-b border-[#E5E5E0] flex items-center justify-between px-8">
          <h2 className="text-sm font-semibold text-gray-500 font-mono tracking-widest uppercase">
            {(platformConfig.branding?.appName || 'MCM Estate Services')} Consignor Portal
          </h2>
          <div className="flex items-center gap-3">
            <button
              id="btn-consignee-logout"
              onClick={handleLogout}
              className="inline-flex items-center px-3 py-1.5 border border-[#E5E5E0] text-xs font-medium text-gray-700 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors duration-150 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              Exit Portal
            </button>
          </div>
        </header>

        {/* CONTAINER */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <svg className="animate-spin h-8 w-8 text-[#1A1A19]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-8"
                >
                  {/* Welcome banner & Quick Action Tools */}
                  <div className="bg-white border border-[#E5E5E0] p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                      <h3 className="text-2xl font-serif text-[#1A1A19]">Welcome, {profile?.displayName || displayName}</h3>
                      <p className="text-gray-500 mt-1 text-sm">Monitor your cataloged lots, submit new items, and track payout disbursements live.</p>
                      {profile?.consigneeId && (
                        <div className="inline-flex items-center gap-2 mt-2 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-mono font-medium">
                          <span>Account ID: #{profile.consigneeId}</span>
                          <span>•</span>
                          <span>Commission Rate: {profile.commissionRate}%</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => { setActiveTab('submit'); setSubmittedSuccess(false); }}
                        className="inline-flex items-center px-3.5 py-2 text-xs font-semibold bg-[#1A1A19] text-white hover:bg-black transition-colors cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Submit New Item
                      </button>
                      <button
                        onClick={() => setShowStatementModal(true)}
                        className="inline-flex items-center px-3.5 py-2 text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                        Account Statement
                      </button>
                      <button
                        onClick={() => setShowContactModal(true)}
                        className="inline-flex items-center px-3.5 py-2 text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                      >
                        <Mail className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                        Contact Staff
                      </button>
                    </div>
                  </div>

                  {/* Date Range Selector Header */}
                  <div id="cp-date-range-bar" className="bg-[#1A1A19] text-white p-5 border border-[#2C2C2A] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-amber-400" />
                        <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-gray-200">
                          Dashboard Timeframe Range
                        </h4>
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono flex items-center gap-2">
                        <span>Items submitted filtered by Date of Submission</span>
                        <span className="hidden md:inline px-2 py-0.5 bg-[#2C2C2A] text-amber-300 font-semibold uppercase">
                          Active: {DATE_RANGE_OPTIONS.find(o => o.key === dateRange)?.label}
                        </span>
                      </div>
                    </div>

                    {/* Date Range Option Pills / Selector */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {DATE_RANGE_OPTIONS.map(opt => (
                        <button
                          key={opt.key}
                          id={`btn-date-range-${opt.key}`}
                          onClick={() => setDateRange(opt.key)}
                          className={`px-3 py-1.5 text-xs font-mono font-medium transition-all duration-150 cursor-pointer ${
                            dateRange === opt.key
                              ? 'bg-amber-500 text-black font-bold shadow-xs'
                              : 'bg-[#292928] text-gray-300 hover:bg-[#383836] hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 6 Stat Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <StatCard
                      id="cp-stat-submitted"
                      title="Items Submitted"
                      value={submittedLotsInRange.length}
                      subtitle={`Date of Submission in ${DATE_RANGE_OPTIONS.find(o => o.key === dateRange)?.label}`}
                      icon={<Package className="h-5 w-5" />}
                      color="purple"
                    />
                    <StatCard
                      id="cp-stat-live"
                      title="Currently Live"
                      value={itemsLiveCount}
                      subtitle="Bidding in active live auctions"
                      icon={<Award className="h-5 w-5" />}
                      color="blue"
                    />
                    <StatCard
                      id="cp-stat-pending"
                      title="Pending / Processing"
                      value={pendingLotsInRange.length}
                      subtitle="Awaiting cataloging & intake review"
                      icon={<Clock className="h-5 w-5" />}
                      color="amber"
                    />
                    <StatCard
                      id="cp-stat-earned"
                      title="Net Earned"
                      value={`$${netEarnedInRange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      subtitle={`Consignee payout for sold lots (${DATE_RANGE_OPTIONS.find(o => o.key === dateRange)?.label})`}
                      icon={<DollarSign className="h-5 w-5" />}
                      color="dark"
                    />
                    <StatCard
                      id="cp-stat-payouts-disbursed"
                      title="Payouts Disbursed"
                      value={`$${paidPayoutsInRange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      subtitle="Funds transferred (Paid status)"
                      icon={<Landmark className="h-5 w-5" />}
                      color="emerald"
                    />
                    <StatCard
                      id="cp-stat-pending-payouts"
                      title="Pending Payouts"
                      value={`$${pendingPayoutsInRange.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      subtitle="Sold lots awaiting payout processing"
                      icon={<DollarSign className="h-5 w-5" />}
                      color="red"
                    />
                  </div>

                  {/* Consignment Status Pipeline & Key Insights */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Visual Status Pipeline */}
                    <div className="lg:col-span-2 bg-white border border-[#E5E5E0] p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold uppercase text-gray-900 tracking-wider font-sans">
                            Consignment Catalog Status Pipeline
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">Visual distribution across all {computedLots.length} items</p>
                        </div>
                        <button
                          onClick={() => setActiveTab('items')}
                          className="text-xs text-blue-600 hover:underline font-medium inline-flex items-center cursor-pointer"
                        >
                          View Full Item Catalog <ArrowRight className="h-3 w-3 ml-1" />
                        </button>
                      </div>

                      {/* Stacked Progress Bar */}
                      <div className="space-y-2">
                        <div className="h-4 w-full bg-gray-100 flex overflow-hidden rounded-xs border border-gray-200">
                          <div
                            style={{ width: `${statusPipeline.pendingPct}%` }}
                            className="bg-amber-500 transition-all duration-500"
                            title={`Pending: ${statusPipeline.pending}`}
                          />
                          <div
                            style={{ width: `${statusPipeline.activePct}%` }}
                            className="bg-blue-600 transition-all duration-500"
                            title={`Active / Live: ${statusPipeline.active}`}
                          />
                          <div
                            style={{ width: `${statusPipeline.soldPct}%` }}
                            className="bg-emerald-600 transition-all duration-500"
                            title={`Sold: ${statusPipeline.sold}`}
                          />
                          <div
                            style={{ width: `${statusPipeline.otherPct}%` }}
                            className="bg-gray-400 transition-all duration-500"
                            title={`Other: ${statusPipeline.other}`}
                          />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
                          <div className="flex items-center space-x-2 bg-amber-50/50 p-2 border border-amber-100">
                            <span className="h-2.5 w-2.5 bg-amber-500 shrink-0" />
                            <div>
                              <span className="block text-gray-500 font-medium text-[10px] uppercase">Pending</span>
                              <span className="font-bold text-gray-900">{statusPipeline.pending} lots</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 bg-blue-50/50 p-2 border border-blue-100">
                            <span className="h-2.5 w-2.5 bg-blue-600 shrink-0" />
                            <div>
                              <span className="block text-gray-500 font-medium text-[10px] uppercase">Live in Auction</span>
                              <span className="font-bold text-gray-900">{statusPipeline.active} lots</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 bg-emerald-50/50 p-2 border border-emerald-100">
                            <span className="h-2.5 w-2.5 bg-emerald-600 shrink-0" />
                            <div>
                              <span className="block text-gray-500 font-medium text-[10px] uppercase">Sold</span>
                              <span className="font-bold text-gray-900">{statusPipeline.sold} lots</span>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 bg-gray-50/50 p-2 border border-gray-200">
                            <span className="h-2.5 w-2.5 bg-gray-400 shrink-0" />
                            <div>
                              <span className="block text-gray-500 font-medium text-[10px] uppercase">Other / Unsold</span>
                              <span className="font-bold text-gray-900">{statusPipeline.other} lots</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Performance Insights Sidebar Card */}
                    <div className="bg-white border border-[#E5E5E0] p-6 space-y-4">
                      <h4 className="text-sm font-bold uppercase text-gray-900 tracking-wider font-sans flex items-center">
                        <TrendingUp className="h-4 w-4 mr-2 text-amber-600" />
                        Performance Metrics
                      </h4>
                      
                      <div className="space-y-3 text-xs">
                        <div className="p-3 bg-gray-50 border border-gray-200 flex justify-between items-center">
                          <div>
                            <span className="text-gray-500 font-medium block">Sell-Through Rate</span>
                            <span className="text-[10px] text-gray-400">Sold vs submitted in period</span>
                          </div>
                          <span className="text-lg font-bold font-mono text-gray-900">{sellThroughRate}%</span>
                        </div>

                        <div className="p-3 bg-gray-50 border border-gray-200 flex justify-between items-center">
                          <div>
                            <span className="text-gray-500 font-medium block">Avg Hammer Price</span>
                            <span className="text-[10px] text-gray-400">Average hammer per sold lot</span>
                          </div>
                          <span className="text-lg font-bold font-mono text-gray-900">
                            ${avgHammerPrice.toFixed(2)}
                          </span>
                        </div>

                        {topPerformingLot && (
                          <div className="p-3 bg-amber-50/50 border border-amber-200 space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-amber-800">
                              <span>Top Performing Lot</span>
                              <Sparkles className="h-3 w-3 text-amber-600" />
                            </div>
                            <div className="flex gap-2.5 items-center">
                              {topPerformingLot.primaryPhotoURL && !topPerformingLot.primaryPhotoURL.includes('unsplash.com') ? (
                                <img src={topPerformingLot.primaryPhotoURL} alt={topPerformingLot.lotTitle} referrerPolicy="no-referrer" className="h-10 w-10 object-cover border bg-white" />
                              ) : (
                                <div className="h-10 w-10 border bg-gray-100 shrink-0 flex items-center justify-center text-[9px] text-gray-400 font-medium text-center leading-none p-1">No Img</div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-gray-900 truncate">{topPerformingLot.lotTitle}</p>
                                <p className="text-gray-500 text-[11px] font-mono">Hammer: ${topPerformingLot.hammerPrice?.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active lot lists with countdown timers */}
                  <div className="bg-white border border-[#E5E5E0] p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold uppercase text-gray-900 tracking-wider font-sans">
                        Active Lots Live in Auction ({liveLotsWithAuction.length})
                      </h4>
                      <span className="text-xs text-gray-400">Live auction status</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {liveLotsWithAuction.map(l => {
                        const auc = getAuctionDetails(l.auctionId);
                        return (
                          <div id={`cp-active-lot-${l.id}`} key={l.id} className="border border-gray-200 p-4 flex gap-4 bg-gray-50/50 hover:bg-white transition-colors">
                            {l.primaryPhotoURL && !l.primaryPhotoURL.includes('unsplash.com') ? (
                              <img src={l.primaryPhotoURL} alt={l.lotTitle} referrerPolicy="no-referrer" className="h-16 w-16 object-cover bg-gray-200 border" />
                            ) : (
                              <div className="h-16 w-16 bg-gray-100 border shrink-0 flex flex-col items-center justify-center text-[9px] text-gray-400 font-medium text-center p-1">
                                <span>Image Not</span>
                                <span>Available</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h5 className="text-sm font-semibold text-gray-900 truncate">{l.lotTitle}</h5>
                              <p className="text-xs text-gray-500 truncate mb-2">{getAuctionName(l.auctionId)} • Lot #{l.lotNumber}</p>
                              {auc && <CountdownTimer targetDate={auc.endDate} targetTime={auc.endTime} />}
                            </div>
                          </div>
                        );
                      })}
                      {liveLotsWithAuction.length === 0 && (
                        <p className="text-sm text-gray-400 italic col-span-2 py-4 text-center border border-dashed border-gray-200">
                          No items are currently active in running live auctions.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Recent Submissions Feed */}
                  <div className="bg-white border border-[#E5E5E0] p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold uppercase text-gray-900 tracking-wider font-sans">
                          Recent Consignment Submissions
                        </h4>
                        <p className="text-xs text-gray-500">Latest submissions in your account catalog</p>
                      </div>
                      <button
                        onClick={() => setActiveTab('items')}
                        className="text-xs text-blue-600 hover:underline font-medium inline-flex items-center cursor-pointer"
                      >
                        All Items ({computedLots.length}) <ArrowRight className="h-3 w-3 ml-1" />
                      </button>
                    </div>

                    <div className="overflow-x-auto border border-gray-200">
                      <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                        <thead className="bg-[#FCFCFB] text-gray-500 font-sans">
                          <tr>
                            <th className="px-4 py-2 font-medium">Item</th>
                            <th className="px-4 py-2 font-medium">Category</th>
                            <th className="px-4 py-2 font-medium">Submission Date</th>
                            <th className="px-4 py-2 font-medium">Reserve</th>
                            <th className="px-4 py-2 font-medium text-center">Status</th>
                            <th className="px-4 py-2 font-medium text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {computedLots.slice(0, 5).map(l => (
                            <tr key={l.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center space-x-3">
                                  {l.primaryPhotoURL && !l.primaryPhotoURL.includes('unsplash.com') ? (
                                    <img src={l.primaryPhotoURL} alt={l.lotTitle} referrerPolicy="no-referrer" className="h-8 w-8 object-cover border bg-gray-100" />
                                  ) : (
                                    <div className="h-8 w-8 border bg-gray-100 flex items-center justify-center text-[8px] text-gray-400 font-medium text-center leading-none p-0.5">No Img</div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 truncate max-w-[200px]">{l.lotTitle}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">Lot #{l.lotNumber}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-gray-600">{l.category}</td>
                              <td className="px-4 py-3 font-mono text-gray-500">{l.dateReceived || l.dateListed || 'Recent'}</td>
                              <td className="px-4 py-3 font-mono text-gray-700">{l.reserveRequested === 'Yes' ? `$${(l.reservePrice || 0).toFixed(2)}` : 'None'}</td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold border ${
                                  l.lotStatus === 'Sold' ? 'bg-green-50 text-green-700 border-green-200' :
                                  l.lotStatus === 'Active' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  'bg-amber-50 text-amber-800 border-amber-200'
                                }`}>
                                  {l.lotStatus}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleRowClick(l)}
                                  className="text-xs font-medium text-gray-700 hover:text-black underline cursor-pointer"
                                >
                                  View Lot
                                </button>
                              </td>
                            </tr>
                          ))}
                          {computedLots.length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-gray-400 italic">
                                No items submitted yet. Click "Submit New Item" above to get started.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'items' && (
                <motion.div key="items" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                  {/* Top Bar: Title & Primary Actions */}
                  <div className="bg-white border border-[#E5E5E0] p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-serif text-gray-900 font-bold flex items-center gap-2">
                        <span>My Consignment Catalog</span>
                        <span className="text-xs font-mono font-normal px-2.5 py-0.5 bg-gray-100 text-gray-700 border border-gray-200">
                          {filteredMetrics.totalCount} of {computedLots.length} items
                        </span>
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">
                        Search, filter, inspect, and export your cataloged pieces across all stages.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleExportCSV}
                        id="btn-export-items-csv"
                        className="inline-flex items-center px-3.5 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                        title="Download CSV spreadsheet of filtered items"
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5 text-blue-600" />
                        Export CSV
                      </button>

                      <button
                        onClick={() => window.print()}
                        className="inline-flex items-center px-3.5 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer"
                        title="Print current catalog view"
                      >
                        <Printer className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
                        Print Catalog
                      </button>

                      <div className="flex items-center border border-gray-300 bg-gray-50 p-0.5">
                        <button
                          onClick={() => setItemsViewMode('table')}
                          id="btn-view-mode-table"
                          className={`p-1.5 text-xs transition-colors cursor-pointer ${
                            itemsViewMode === 'table' ? 'bg-white text-black shadow-xs font-bold' : 'text-gray-500 hover:text-black'
                          }`}
                          title="Table View"
                        >
                          <List className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setItemsViewMode('grid')}
                          id="btn-view-mode-grid"
                          className={`p-1.5 text-xs transition-colors cursor-pointer ${
                            itemsViewMode === 'grid' ? 'bg-white text-black shadow-xs font-bold' : 'text-gray-500 hover:text-black'
                          }`}
                          title="Grid View"
                        >
                          <Grid className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Search and Multi-Filter Control Panel */}
                  <div className="bg-white border border-[#E5E5E0] p-6 space-y-4">
                    {/* Primary Row: Search input + Quick Status Pills + Filter toggle */}
                    <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                      {/* Search Bar */}
                      <div className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          id="input-search-items"
                          value={itemsSearch}
                          onChange={(e) => setItemsSearch(e.target.value)}
                          placeholder="Search by lot title, lot #, maker, category..."
                          className="w-full pl-9 pr-8 py-2 text-xs border border-gray-300 focus:outline-none focus:border-black bg-white"
                        />
                        {itemsSearch && (
                          <button
                            onClick={() => setItemsSearch('')}
                            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-700 text-xs"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Quick Status Filter Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1 text-xs">
                        <button
                          onClick={() => setItemsStatusFilter('ALL')}
                          className={`px-3 py-1.5 font-mono font-medium transition-colors cursor-pointer ${
                            itemsStatusFilter === 'ALL'
                              ? 'bg-[#1A1A19] text-white font-bold'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          All ({computedLots.length})
                        </button>
                        <button
                          onClick={() => setItemsStatusFilter('Live')}
                          className={`px-3 py-1.5 font-mono font-medium transition-colors cursor-pointer ${
                            itemsStatusFilter === 'Live'
                              ? 'bg-blue-600 text-white font-bold'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          Live ({computedLots.filter(l => l.lotStatus === 'Active').length})
                        </button>
                        <button
                          onClick={() => setItemsStatusFilter('Pending')}
                          className={`px-3 py-1.5 font-mono font-medium transition-colors cursor-pointer ${
                            itemsStatusFilter === 'Pending'
                              ? 'bg-amber-600 text-white font-bold'
                              : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          Pending ({computedLots.filter(l => l.lotStatus === 'Pending').length})
                        </button>
                        <button
                          onClick={() => setItemsStatusFilter('Sold')}
                          className={`px-3 py-1.5 font-mono font-medium transition-colors cursor-pointer ${
                            itemsStatusFilter === 'Sold'
                              ? 'bg-emerald-600 text-white font-bold'
                              : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          }`}
                        >
                          Sold ({computedLots.filter(l => l.lotStatus === 'Sold').length})
                        </button>
                        <button
                          onClick={() => setItemsStatusFilter('Unsold')}
                          className={`px-3 py-1.5 font-mono font-medium transition-colors cursor-pointer ${
                            itemsStatusFilter === 'Unsold'
                              ? 'bg-gray-700 text-white font-bold'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          Unsold / Other ({computedLots.filter(l => ['Unsold', 'Withdrawn', 'Donated', 'Discarded'].includes(l.lotStatus)).length})
                        </button>
                      </div>

                      {/* Toggle Advanced Filters */}
                      <button
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        id="btn-toggle-advanced-filters"
                        className={`inline-flex items-center px-3.5 py-2 text-xs font-semibold border transition-colors cursor-pointer ${
                          showAdvancedFilters || hasActiveFilters
                            ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />
                        Filters & Sort
                        {hasActiveFilters && (
                          <span className="ml-1.5 h-2 w-2 rounded-full bg-amber-600 inline-block" />
                        )}
                        {showAdvancedFilters ? <ChevronUp className="h-3.5 w-3.5 ml-1.5" /> : <ChevronDown className="h-3.5 w-3.5 ml-1.5" />}
                      </button>
                    </div>

                    {/* Collapsible Advanced Filters Bar */}
                    <AnimatePresence>
                      {showAdvancedFilters && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs"
                        >
                          {/* Category Filter */}
                          <div>
                            <label className="block text-gray-500 font-bold uppercase text-[10px] mb-1">Category</label>
                            <select
                              value={itemsCategoryFilter}
                              onChange={(e) => setItemsCategoryFilter(e.target.value)}
                              className="w-full border border-gray-300 p-2 bg-white"
                            >
                              <option value="ALL">All Categories</option>
                              {availableCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>

                          {/* Payout Status Filter */}
                          <div>
                            <label className="block text-gray-500 font-bold uppercase text-[10px] mb-1">Payout Status</label>
                            <select
                              value={itemsPayoutFilter}
                              onChange={(e) => setItemsPayoutFilter(e.target.value)}
                              className="w-full border border-gray-300 p-2 bg-white"
                            >
                              <option value="ALL">All Payout Statuses</option>
                              <option value="Paid">Disbursed (Paid)</option>
                              <option value="Pending Payout">Pending Payout</option>
                              <option value="Unsold">Not Sold / No Payout</option>
                            </select>
                          </div>

                          {/* Reserve Filter */}
                          <div>
                            <label className="block text-gray-500 font-bold uppercase text-[10px] mb-1">Reserve Status</label>
                            <select
                              value={itemsReserveFilter}
                              onChange={(e) => setItemsReserveFilter(e.target.value)}
                              className="w-full border border-gray-300 p-2 bg-white"
                            >
                              <option value="ALL">All Reserve Types</option>
                              <option value="With Reserve">Has Reserve Price</option>
                              <option value="No Reserve">No Reserve</option>
                            </select>
                          </div>

                          {/* Date Range Filter */}
                          <div>
                            <label className="block text-gray-500 font-bold uppercase text-[10px] mb-1">Submission Timeframe</label>
                            <select
                              value={itemsDateRange}
                              onChange={(e) => setItemsDateRange(e.target.value as DateRangeKey)}
                              className="w-full border border-gray-300 p-2 bg-white"
                            >
                              {DATE_RANGE_OPTIONS.map(opt => (
                                <option key={opt.key} value={opt.key}>{opt.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* Sort By Order */}
                          <div>
                            <label className="block text-gray-500 font-bold uppercase text-[10px] mb-1">Sort By</label>
                            <select
                              value={itemsSortBy}
                              onChange={(e) => setItemsSortBy(e.target.value)}
                              className="w-full border border-gray-300 p-2 bg-white font-mono"
                            >
                              <option value="date-desc">Newest First</option>
                              <option value="date-asc">Oldest First</option>
                              <option value="lot-asc">Lot # Ascending</option>
                              <option value="lot-desc">Lot # Descending</option>
                              <option value="title-asc">Title: A to Z</option>
                              <option value="title-desc">Title: Z to A</option>
                              <option value="hammer-desc">Hammer Price: High to Low</option>
                              <option value="payout-desc">Est. Net Payout: High to Low</option>
                            </select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Active Filters Badges & Clear button */}
                    {hasActiveFilters && (
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-dashed border-gray-200 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-gray-400 font-mono text-[11px] mr-1">Active Filters:</span>
                          {itemsSearch && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-800 border border-gray-300">
                              Search: "{itemsSearch}"
                              <button onClick={() => setItemsSearch('')} className="ml-1 text-gray-500 hover:text-black">×</button>
                            </span>
                          )}
                          {itemsStatusFilter !== 'ALL' && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-800 border border-blue-200">
                              Status: {itemsStatusFilter}
                              <button onClick={() => setItemsStatusFilter('ALL')} className="ml-1 text-blue-500 hover:text-black">×</button>
                            </span>
                          )}
                          {itemsCategoryFilter !== 'ALL' && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-purple-50 text-purple-800 border border-purple-200">
                              Category: {itemsCategoryFilter}
                              <button onClick={() => setItemsCategoryFilter('ALL')} className="ml-1 text-purple-500 hover:text-black">×</button>
                            </span>
                          )}
                          {itemsPayoutFilter !== 'ALL' && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Payout: {itemsPayoutFilter}
                              <button onClick={() => setItemsPayoutFilter('ALL')} className="ml-1 text-emerald-500 hover:text-black">×</button>
                            </span>
                          )}
                          {itemsReserveFilter !== 'ALL' && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200">
                              Reserve: {itemsReserveFilter}
                              <button onClick={() => setItemsReserveFilter('ALL')} className="ml-1 text-amber-500 hover:text-black">×</button>
                            </span>
                          )}
                          {itemsDateRange !== 'all' && (
                            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-800 border border-gray-300">
                              Range: {DATE_RANGE_OPTIONS.find(o => o.key === itemsDateRange)?.label}
                              <button onClick={() => setItemsDateRange('all')} className="ml-1 text-gray-500 hover:text-black">×</button>
                            </span>
                          )}
                        </div>
                        <button
                          onClick={resetItemsFilters}
                          className="text-xs text-red-600 hover:underline font-semibold inline-flex items-center cursor-pointer"
                        >
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Reset All Filters
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Summary Metric Strip for Filtered Items */}
                  <div className="bg-[#1A1A19] text-white p-4 border border-[#2C2C2A] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase block">Matching Items</span>
                      <span className="text-base font-bold text-white">{filteredMetrics.totalCount} lots</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase block">Sold in Selection</span>
                      <span className="text-base font-bold text-amber-400">{filteredMetrics.soldCount} lots</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase block">Gross Hammer Total</span>
                      <span className="text-base font-bold text-white">${filteredMetrics.totalHammer.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 text-[10px] uppercase block">Est. Net Consignee Payout</span>
                      <span className="text-base font-bold text-emerald-400">${filteredMetrics.totalPayout.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Main Display: Table or Grid */}
                  <div className="bg-white border border-[#E5E5E0] p-6 space-y-4">
                    {filteredAndSortedItems.length === 0 ? (
                      <div className="py-12 text-center space-y-3">
                        <Package className="h-12 w-12 text-gray-300 mx-auto" />
                        <h4 className="text-base font-bold text-gray-800">No items match your search or filter criteria</h4>
                        <p className="text-xs text-gray-500 max-w-md mx-auto">
                          Try adjusting your search terms, changing the category or status filter, or clearing active filters to see all lots.
                        </p>
                        <button
                          onClick={resetItemsFilters}
                          className="px-4 py-2 bg-[#1A1A19] text-white text-xs font-semibold hover:bg-black transition-colors cursor-pointer inline-flex items-center"
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                          Clear Filters & Show All Lots
                        </button>
                      </div>
                    ) : itemsViewMode === 'table' ? (
                      /* Table View */
                      <div className="overflow-x-auto border border-gray-200">
                        <table id="cp-items-table" className="min-w-full divide-y divide-gray-200 text-xs text-left">
                          <thead className="bg-[#FCFCFB] text-gray-500 font-sans">
                            <tr>
                              <th className="px-4 py-3 font-medium">Item ID</th>
                              <th className="px-4 py-3 font-medium">Lot #</th>
                              <th className="px-4 py-3 font-medium">Item Details</th>
                              <th className="px-4 py-3 font-medium">Category</th>
                              <th className="px-4 py-3 font-medium text-center">Status</th>
                              <th className="px-4 py-3 text-right font-medium">Reserve Price</th>
                              <th className="px-4 py-3 text-right font-medium">Hammer Price</th>
                              <th className="px-4 py-3 text-right font-medium">Est. Net Payout</th>
                              <th className="px-4 py-3 text-right font-medium">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 font-sans">
                            {filteredAndSortedItems.map(l => (
                              <tr id={`row-cp-lot-${l.id}`} key={l.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 font-mono font-bold text-gray-900 bg-gray-50/60">{getLotUniqueItemId(l, profile ? [profile] : [])}</td>
                                <td className="px-4 py-3 font-mono font-medium text-gray-500">#{l.lotNumber || 'Pending'}</td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center space-x-3">
                                    {l.primaryPhotoURL && !l.primaryPhotoURL.includes('unsplash.com') ? (
                                      <img src={l.primaryPhotoURL} alt={l.lotTitle} referrerPolicy="no-referrer" className="h-10 w-10 object-cover border bg-gray-100 shrink-0" />
                                    ) : (
                                      <div className="h-10 w-10 border bg-gray-100 shrink-0 flex items-center justify-center text-[9px] text-gray-400 font-medium text-center leading-none p-1">No Img</div>
                                    )}
                                    <div className="min-w-0">
                                      <p className="font-bold text-gray-900 truncate max-w-[240px]">{l.lotTitle}</p>
                                      {l.makerDesigner && <p className="text-[10px] text-gray-500 truncate">{l.makerDesigner}</p>}
                                      {l.dateReceived && <p className="text-[10px] text-gray-400 font-mono">Submitted: {l.dateReceived}</p>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-600">{l.category}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex px-2 py-0.5 text-[10px] font-bold border ${
                                    l.lotStatus === 'Sold' ? 'bg-green-50 text-green-700 border-green-200' :
                                    l.lotStatus === 'Active' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}>
                                    {l.lotStatus}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right font-mono">
                                  {l.reserveRequested === 'Yes' ? `$${(l.reservePrice || 0).toFixed(2)}` : <span className="text-gray-400">No Reserve</span>}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-gray-900 font-semibold">
                                  {l.hammerPrice !== null ? `$${l.hammerPrice.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-emerald-700 font-bold">
                                  {l.consigneePayout !== null ? `$${l.consigneePayout.toFixed(2)}` : '-'}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    onClick={() => handleRowClick(l)}
                                    className="px-2.5 py-1 text-xs border border-gray-300 font-semibold hover:bg-gray-100 cursor-pointer"
                                  >
                                    View Details
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      /* Grid Card View */
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredAndSortedItems.map(l => (
                          <div
                            key={l.id}
                            id={`grid-cp-lot-${l.id}`}
                            className="bg-white border border-gray-200 hover:border-gray-400 transition-all duration-150 flex flex-col justify-between"
                          >
                            <div>
                              <div className="relative h-44 bg-gray-100 border-b border-gray-200 overflow-hidden">
                                {l.primaryPhotoURL && !l.primaryPhotoURL.includes('unsplash.com') ? (
                                  <img src={l.primaryPhotoURL} alt={l.lotTitle} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gray-100 flex flex-col items-center justify-center text-gray-400 p-4">
                                    <Package className="h-8 w-8 mb-1 opacity-40" />
                                    <span className="text-xs font-medium">Image Not Available</span>
                                  </div>
                                )}
                                <div className="absolute top-2 left-2 flex gap-1">
                                  <span className={`px-2 py-0.5 text-[10px] font-bold border ${
                                    l.lotStatus === 'Sold' ? 'bg-green-100 text-green-800 border-green-300' :
                                    l.lotStatus === 'Active' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                                    'bg-amber-100 text-amber-900 border-amber-300'
                                  }`}>
                                    {l.lotStatus}
                                  </span>
                                </div>
                                <div className="absolute top-2 right-2">
                                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-black/75 text-white">
                                    Lot #{l.lotNumber || 'N/A'}
                                  </span>
                                </div>
                              </div>

                              <div className="p-4 space-y-2">
                                <div className="flex items-center justify-between text-[11px] text-gray-500 font-mono">
                                  <span>{l.category}</span>
                                  <span>{l.dateReceived || l.dateListed}</span>
                                </div>
                                <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{l.lotTitle}</h4>
                                {l.description && (
                                  <p className="text-xs text-gray-500 line-clamp-2">{l.description}</p>
                                )}
                              </div>
                            </div>

                            <div className="p-4 pt-0 border-t border-gray-100 mt-2 space-y-3">
                              <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                                <div className="bg-gray-50 p-2 border border-gray-200">
                                  <span className="text-[10px] text-gray-400 uppercase block font-medium">Reserve</span>
                                  <span className="font-mono font-semibold text-gray-800">
                                    {l.reserveRequested === 'Yes' ? `$${(l.reservePrice || 0).toFixed(2)}` : 'None'}
                                  </span>
                                </div>
                                <div className="bg-emerald-50/60 p-2 border border-emerald-200">
                                  <span className="text-[10px] text-emerald-800 uppercase block font-medium">Est. Net Payout</span>
                                  <span className="font-mono font-bold text-emerald-900">
                                    {l.consigneePayout !== null ? `$${l.consigneePayout.toFixed(2)}` : '-'}
                                  </span>
                                </div>
                              </div>

                              <button
                                onClick={() => handleRowClick(l)}
                                className="w-full py-2 bg-[#1A1A19] text-white text-xs font-semibold hover:bg-black transition-colors cursor-pointer"
                              >
                                View Full Lot Record
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'submit' && (
                <motion.div key="submit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="bg-white border border-[#E5E5E0] p-6 max-w-3xl mx-auto space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 font-sans">Submit an Item for Consignment</h3>
                      <p className="text-xs text-gray-400">Provide cataloging details below. Upon submission, our staff will review and assign to upcoming auctions.</p>
                    </div>

                    {submittedSuccess && (
                      <div className="bg-green-50 border border-green-200 text-green-800 p-4 flex gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div>
                          <h4 className="font-semibold text-sm">Submission Received!</h4>
                          <p className="text-xs text-green-700 mt-1">Your item was registered with lot status 'Pending'. Sarah and our admin staff can view and catalog it immediately.</p>
                        </div>
                      </div>
                    )}

                    {submitError && (
                      <div className="bg-red-50 border border-red-200 text-red-800 p-4 flex gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <div>
                          <h4 className="font-semibold text-sm">Error Submitting</h4>
                          <p className="text-xs text-red-700 mt-1">{submitError}</p>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmitItem} className="space-y-4 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-gray-500 font-semibold mb-1">Item Title *</label>
                          <input required type="text" name="lotTitle" value={submitForm.lotTitle} onChange={handleFormChange} placeholder="e.g. Vintage Italian Ceramic Lamp" className="w-full border border-gray-300 p-2" />
                        </div>
                        <div>
                          <label className="block text-gray-500 font-semibold mb-1">Category *</label>
                          <select name="category" value={submitForm.category} onChange={handleFormChange} className="w-full border border-gray-300 p-2 bg-white">
                            {platformConfig.categories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-500 font-semibold mb-1">Condition</label>
                          <select name="condition" value={submitForm.condition} onChange={handleFormChange} className="w-full border border-gray-300 p-2 bg-white">
                            <option value="Mint">Mint / Brand New</option>
                            <option value="Excellent">Excellent</option>
                            <option value="Very Good">Very Good</option>
                            <option value="Good">Good</option>
                            <option value="Fair">Fair</option>
                            <option value="Poor">Poor</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-500 font-semibold mb-1">Maker / Designer</label>
                          <input type="text" name="artistDesigner" value={submitForm.artistDesigner} onChange={handleFormChange} placeholder="e.g. Alessi, Eames" className="w-full border border-gray-300 p-2" />
                        </div>
                        <div>
                          <label className="block text-gray-500 font-semibold mb-1">Dimensions</label>
                          <input type="text" name="dimensions" value={submitForm.dimensions} onChange={handleFormChange} placeholder="e.g. 12H x 8W inches" className="w-full border border-gray-300 p-2" />
                        </div>
                        <div>
                          <label className="block text-gray-500 font-semibold mb-1">Material / Medium</label>
                          <input type="text" name="mediumMaterial" value={submitForm.mediumMaterial} onChange={handleFormChange} placeholder="e.g. Solid Brass, Blown Glass" className="w-full border border-gray-300 p-2" />
                        </div>
                        <div>
                          <label className="block text-gray-500 font-semibold mb-1">Reserve Requested</label>
                          <select name="reserveRequested" value={submitForm.reserveRequested} onChange={handleFormChange} className="w-full border border-gray-300 p-2 bg-white">
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-gray-500 font-semibold mb-1">Reserve Price ($)</label>
                          <input type="number" name="reservePrice" value={submitForm.reservePrice} onChange={handleFormChange} placeholder="0" className="w-full border border-gray-300 p-2" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-gray-500 font-semibold mb-1">Short Description *</label>
                        <input required type="text" name="shortDescription" value={submitForm.shortDescription} onChange={handleFormChange} placeholder="e.g. Mid-Century Space Age lamp in working order." className="w-full border border-gray-300 p-2" />
                      </div>

                      <div>
                        <label className="block text-gray-500 font-semibold mb-1">Full Description & Provenance Details</label>
                        <textarea name="fullDescription" value={submitForm.fullDescription} onChange={handleFormChange} rows={4} className="w-full border border-gray-300 p-2" />
                      </div>

                      <div className="bg-[#FCFCFB] p-4 border border-[#E5E5E0] rounded">
                        <ImageUploader
                          primaryPhotoURL={submitForm.primaryPhotoURL}
                          additionalPhotoURLs={submitForm.additionalPhotoURLs}
                          onChange={(primary, additionals) => setSubmitForm(prev => ({
                            ...prev,
                            primaryPhotoURL: primary,
                            additionalPhotoURLs: additionals
                          }))}
                        />
                      </div>

                      <div>
                        <button
                          id="btn-submit-item-portal"
                          type="submit"
                          disabled={submitting}
                          className="px-6 py-2 border border-transparent font-semibold text-white bg-[#1A1A19] hover:bg-black transition-colors duration-150 cursor-pointer text-sm"
                        >
                          {submitting ? 'Submitting...' : 'Submit Lot Item'}
                        </button>
                      </div>
                    </form>
                  </div>
                </motion.div>
              )}              {activeTab === 'payouts' && (
                <motion.div key="payouts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="bg-white border border-[#E5E5E0] p-6 space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 font-sans">Payout History</h3>
                        <p className="text-xs text-gray-400">Track final hammer prices, commissions, and payout disbursement details grouped by Auction event.</p>
                      </div>
                      <span className="text-xs text-gray-500 font-mono">
                        {aggregatedPayouts.length} Auction {aggregatedPayouts.length === 1 ? 'Settlement' : 'Settlements'}
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-gray-200">
                      <table id="cp-payouts-table" className="min-w-full divide-y divide-gray-200 text-xs text-left">
                        <thead className="bg-[#FCFCFB] text-gray-500">
                          <tr>
                            <th className="px-4 py-2 font-semibold w-1/4">Auction</th>
                            <th className="px-4 py-2 font-semibold">Date Sold</th>
                            <th className="px-4 py-2 text-right font-semibold">Total Hammer</th>
                            <th className="px-4 py-2 text-right font-semibold">Platform Fee</th>
                            <th className="px-4 py-2 text-right font-semibold">Commission</th>
                            <th className="px-4 py-2 text-right font-semibold">GST/QST</th>
                            <th className="px-4 py-2 text-right font-semibold">Net Payout</th>
                            <th className="px-4 py-2 text-center font-semibold">Status</th>
                            <th className="px-4 py-2 font-semibold">Payout Date</th>
                            <th className="px-4 py-2 text-center font-semibold">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {aggregatedPayouts.map(group => {
                            const groupKey = group.auctionId || 'unscheduled';
                            const isExpanded = !!expandedAuctions[groupKey];
                            const hasPlatformFee = group.auctionPlatform === 'Maxsold';
                            
                            return (
                              <React.Fragment key={groupKey}>
                                {/* Aggregated Settlement Row */}
                                <tr 
                                  id={`row-cp-payout-group-${groupKey}`}
                                  className={`hover:bg-[#FAF9F5] transition-colors cursor-pointer ${isExpanded ? 'bg-[#F9F8F4]' : ''}`}
                                  onClick={() => toggleAuctionExpanded(group.auctionId)}
                                >
                                  <td className="px-4 py-3.5 font-semibold text-gray-900">
                                    <div className="flex items-center space-x-2">
                                      {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />}
                                      <span className="truncate">{group.auctionName}</span>
                                      <span className="px-1.5 py-0.5 text-[9px] bg-gray-100 text-gray-600 rounded-xs font-sans font-medium whitespace-nowrap">
                                        {group.auctionPlatform}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3.5 font-mono text-gray-500">{group.endDate || '-'}</td>
                                  <td className="px-4 py-3.5 text-right font-mono font-semibold text-gray-900">
                                    ${group.totalHammer.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3.5 text-right font-mono text-red-600">
                                    {hasPlatformFee && group.totalPlatformFee > 0 ? `-$${group.totalPlatformFee.toFixed(2)}` : '-'}
                                  </td>
                                  <td className="px-4 py-3.5 text-right font-mono text-red-600">
                                    {group.totalCommission > 0 ? `-$${group.totalCommission.toFixed(2)}` : '$0.00'}
                                  </td>
                                  <td className="px-4 py-3.5 text-right font-mono text-red-600">
                                    {group.totalTax > 0 ? `-$${group.totalTax.toFixed(2)}` : '$0.00'}
                                  </td>
                                  <td className="px-4 py-3.5 text-right font-mono font-bold text-green-700">
                                    ${group.totalPayout.toFixed(2)}
                                  </td>
                                  <td className="px-4 py-3.5 text-center">
                                    <span className={`inline-flex px-2 py-0.5 font-bold text-[9px] rounded-full uppercase tracking-wider ${
                                      group.payoutStatus === 'Paid' 
                                        ? 'bg-green-100 text-green-800' 
                                        : group.payoutStatus === 'Mixed'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}>
                                      {group.payoutStatus}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3.5 font-mono text-gray-500">{group.payoutDate || 'Processing'}</td>
                                  <td className="px-4 py-3.5 text-center">
                                    <button 
                                      className="px-2 py-1 text-[10px] font-semibold bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 cursor-pointer"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleAuctionExpanded(group.auctionId);
                                      }}
                                    >
                                      {isExpanded ? 'Hide Items' : 'View Items'}
                                    </button>
                                  </td>
                                </tr>

                                {/* Expanded Lots Detail Row */}
                                {isExpanded && (
                                  <tr>
                                    <td colSpan={10} className="px-6 py-4 bg-[#FAF9F5] border-t border-b border-gray-200">
                                      <div className="space-y-3">
                                        <div className="flex items-center justify-between border-b border-gray-200 pb-1.5">
                                          <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider font-sans">
                                            Lot Breakdown - {group.auctionName} ({group.lots.length} {group.lots.length === 1 ? 'item' : 'items'})
                                          </h4>
                                          <span className="text-[10px] font-mono text-gray-500">
                                            Platform: {group.auctionPlatform}
                                          </span>
                                        </div>
                                        
                                        <table className="min-w-full text-xs text-left divide-y divide-gray-200">
                                          <thead>
                                            <tr className="text-gray-500 bg-white/50">
                                              <th className="px-3 py-2 font-semibold">Lot #</th>
                                              <th className="px-3 py-2 font-semibold">Item Title</th>
                                              <th className="px-3 py-2 font-semibold">Category</th>
                                              <th className="px-3 py-2 text-right font-semibold">Hammer Price</th>
                                              <th className="px-3 py-2 text-right font-semibold">Platform Fee</th>
                                              <th className="px-3 py-2 text-right font-semibold">Commission ({group.lots[0]?.commissionRate || 15}%)</th>
                                              <th className="px-3 py-2 text-right font-semibold">Commission Tax</th>
                                              <th className="px-3 py-2 text-right font-semibold">Net Payout</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100 bg-white">
                                            {group.lots.map(l => (
                                              <tr key={l.id} className="hover:bg-gray-50/80">
                                                <td className="px-3 py-2.5 font-mono text-gray-400">{l.lotNumber}</td>
                                                <td className="px-3 py-2.5 font-semibold text-gray-900">{l.lotTitle}</td>
                                                <td className="px-3 py-2.5 text-gray-500">{l.category}</td>
                                                <td className="px-3 py-2.5 text-right font-mono">${l.hammerPrice !== null ? l.hammerPrice.toFixed(2) : '0.00'}</td>
                                                <td className="px-3 py-2.5 text-right font-mono text-red-600">
                                                  {hasPlatformFee && l.platformFeeAmount ? `-$${l.platformFeeAmount.toFixed(2)}` : '-'}
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-mono text-red-600">
                                                  {l.commissionAmount ? `-$${l.commissionAmount.toFixed(2)}` : '0.00'}
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-mono text-red-600">
                                                  {l.commissionTaxAmount ? `-$${l.commissionTaxAmount.toFixed(2)}` : '0.00'}
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-mono font-bold text-green-700">
                                                  ${l.consigneePayout !== null ? l.consigneePayout.toFixed(2) : '0.00'}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                          {aggregatedPayouts.length === 0 && (
                            <tr>
                              <td colSpan={10} className="px-4 py-8 text-center text-gray-400 italic">No sold items recorded yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'progress' && (
                <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="space-y-6">
                    {auctions.filter(a => a.auctionStatus === 'Live' || a.auctionStatus === 'Scheduled').map(auc => {
                      const associatedLots = lots.filter(l => l.auctionId === auc.id);

                      return (
                        <div id={`cp-progress-auction-${auc.id}`} key={auc.id} className="bg-white border border-[#E5E5E0] p-6 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                            <div>
                              <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">{auc.internalReferenceCode} • {auc.auctionPlatform}</span>
                              <h4 className="text-base font-semibold text-gray-900 mt-0.5">{auc.auctionName}</h4>
                            </div>
                            <CountdownTimer targetDate={auc.endDate} targetTime={auc.endTime} />
                          </div>

                          <div className="overflow-x-auto">
                            <table id={`cp-progress-lots-table-${auc.id}`} className="min-w-full text-xs text-left divide-y divide-gray-200">
                              <thead>
                                <tr className="text-gray-400 font-semibold uppercase tracking-wider">
                                  <th className="py-2">Lot #</th>
                                  <th className="py-2">Title</th>
                                  <th className="py-2">Category</th>
                                  <th className="py-2">Condition</th>
                                  <th className="py-2 text-right">Reserve Price</th>
                                  <th className="py-2 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                                {associatedLots.map(l => (
                                  <tr id={`row-cp-progress-lot-${l.id}`} key={l.id}>
                                    <td className="py-2.5 font-mono text-gray-400">{l.lotNumber}</td>
                                    <td className="py-2.5 text-gray-900 font-semibold">{l.lotTitle}</td>
                                    <td className="py-2.5">{l.category}</td>
                                    <td className="py-2.5">{l.condition}</td>
                                    <td className="py-2.5 text-right font-mono">{l.reserveRequested === 'Yes' ? `$${l.reservePrice}` : 'No Reserve'}</td>
                                    <td className="py-2.5 text-center">
                                      <span className="inline-flex px-1.5 py-0.5 font-semibold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                                        {l.lotStatus}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                                {associatedLots.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="py-4 text-center text-gray-400 italic">You have no lots cataloged in this event.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <form onSubmit={handleSaveProfile} className="bg-white border border-[#E5E5E0] p-6 max-w-4xl mx-auto space-y-6">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 font-sans">My Consignor Profile</h3>
                      <p className="text-xs text-gray-400">View your registration terms and update your active contact, payment, or logistics details live.</p>
                    </div>

                    {profileSaved && (
                      <div className="bg-green-50 border border-green-200 text-green-800 p-4 flex gap-3">
                        <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div>
                          <h4 className="font-semibold text-sm">Profile Updated Successfully!</h4>
                          <p className="text-xs text-green-700 mt-1">Your modified settings have been synced to the database instantly.</p>
                        </div>
                      </div>
                    )}

                    {profileError && (
                      <div className="bg-red-50 border border-red-200 text-red-800 p-4 flex gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                        <div>
                          <h4 className="font-semibold text-sm">Failed to Save Profile</h4>
                          <p className="text-xs text-red-700 mt-1">{profileError}</p>
                        </div>
                      </div>
                    )}

                    {/* Form Fields split into Grid Panels */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                      
                      {/* Section 1: Contact Details */}
                      <div className="border border-gray-100 p-4 bg-gray-50/30 space-y-4">
                        <div className="flex items-center space-x-2 pb-1.5 border-b border-gray-200">
                          <User className="h-4 w-4 text-gray-500" />
                          <h4 className="font-semibold text-gray-700 uppercase tracking-wider">1. Contact & Identity</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">First Name (Read-Only)</label>
                            <input disabled type="text" value={profile?.firstName || ''} className="w-full border border-gray-200 p-1.5 bg-gray-50 text-gray-500 cursor-not-allowed" />
                          </div>
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Last Name (Read-Only)</label>
                            <input disabled type="text" value={profile?.lastName || ''} className="w-full border border-gray-200 p-1.5 bg-gray-50 text-gray-500 cursor-not-allowed" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-gray-500 font-medium mb-1">Display / Business Name (Read-Only)</label>
                            <input disabled type="text" value={profile?.displayName || ''} className="w-full border border-gray-200 p-1.5 bg-gray-50 text-gray-500 cursor-not-allowed" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-gray-500 font-medium mb-1">Email Address *</label>
                            <input required type="email" name="email" value={profileForm.email || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white" />
                          </div>
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Phone (Primary) *</label>
                            <input required type="text" name="phonePrimary" value={profileForm.phonePrimary || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white" />
                          </div>
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Phone (Secondary / Mobile)</label>
                            <input type="text" name="phoneSecondary" value={profileForm.phoneSecondary || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-black bg-white" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-gray-500 font-medium mb-1">Preferred Contact Method</label>
                            <select name="preferredContactMethod" value={profileForm.preferredContactMethod || 'Email'} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 bg-white">
                              <option value="Email">Email</option>
                              <option value="Phone">Phone</option>
                              <option value="Text">Text</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Section 2: Address Info */}
                      <div className="border border-gray-100 p-4 bg-gray-50/30 space-y-4">
                        <div className="flex items-center space-x-2 pb-1.5 border-b border-gray-200">
                          <Landmark className="h-4 w-4 text-gray-500" />
                          <h4 className="font-semibold text-gray-700 uppercase tracking-wider">2. Address Info</h4>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Street Address Line 1</label>
                            <input type="text" name="streetAddress1" value={profileForm.streetAddress1 || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Street Address Line 2</label>
                            <input type="text" name="streetAddress2" value={profileForm.streetAddress2 || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-gray-500 font-medium mb-1">City</label>
                              <input type="text" name="city" value={profileForm.city || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                            </div>
                            <div>
                              <label className="block text-gray-500 font-medium mb-1">State / Province</label>
                              <input type="text" name="state" value={profileForm.state || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                            </div>
                            <div>
                              <label className="block text-gray-500 font-medium mb-1">Postal Code</label>
                              <input type="text" name="postalCode" value={profileForm.postalCode || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none font-mono" />
                            </div>
                            <div>
                              <label className="block text-gray-500 font-medium mb-1">Country</label>
                              <input type="text" name="country" value={profileForm.country || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Financials & Payout Preferences */}
                      <div className="border border-gray-100 p-4 bg-gray-50/30 space-y-4">
                        <div className="flex items-center space-x-2 pb-1.5 border-b border-gray-200">
                          <DollarSign className="h-4 w-4 text-gray-500" />
                          <h4 className="font-semibold text-gray-700 uppercase tracking-wider">3. Financials & Payout Preferences</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Payment Method</label>
                            <select name="paymentMethod" value={profileForm.paymentMethod || 'Interac e-Transfer'} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 bg-white">
                              <option value="Interac e-Transfer">Interac e-Transfer</option>
                              <option value="Cash">Cash</option>
                              <option value="PayPal">PayPal</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Email for e-Transfer / PayPal</label>
                            <input type="text" name="emailForETransfer" value={profileForm.emailForETransfer || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none font-mono" />
                          </div>
                          <div className="col-span-2 bg-amber-50/50 p-2.5 border border-amber-200/50 text-amber-900 rounded-sm">
                            <span className="font-bold">Commission Term:</span> Your registered rate is <span className="font-bold text-amber-700">{profile?.commissionRate || 15}%</span>.
                          </div>
                          <div>
                            <label className="block text-gray-400 font-medium mb-0.5">Outstanding Balance (Read-Only)</label>
                            <p className="text-base font-bold text-red-600 font-mono">${(profile?.outstandingBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                          <div>
                            <label className="block text-gray-400 font-medium mb-0.5">Lifetime Gross Sales (Read-Only)</label>
                            <p className="text-base font-bold text-gray-900 font-mono">${(profile?.lifetimeGrossSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                          </div>
                        </div>
                      </div>

                      {/* Section 4: Consignment Terms */}
                      <div className="border border-gray-100 p-4 bg-gray-50/30 space-y-4">
                        <div className="flex items-center space-x-2 pb-1.5 border-b border-gray-200">
                          <HeartHandshake className="h-4 w-4 text-gray-500" />
                          <h4 className="font-semibold text-gray-700 uppercase tracking-wider">4. Consignment Terms</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex items-center">
                            <input type="checkbox" name="photoAuthorization" checked={!!profileForm.photoAuthorization} onChange={handleProfileFormChange} className="h-4 w-4 mr-2 cursor-pointer text-black" />
                            <span className="text-gray-700 font-semibold">Photo Auth (Mandatory)</span>
                          </div>
                          <div className="flex items-center">
                            <input type="checkbox" name="acceptsUnsoldReturns" checked={!!profileForm.acceptsUnsoldReturns} onChange={handleProfileFormChange} className="h-4 w-4 mr-2 cursor-pointer text-black" />
                            <span className="text-gray-700 font-medium">Accepts Unsold Returns</span>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-gray-500 font-medium mb-1">Unsold Item Disposal Preference</label>
                            <select name="unsoldDisposalPreference" value={profileForm.unsoldDisposalPreference || 'Return'} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 bg-white">
                              <option value="Return">Return</option>
                              <option value="Donate">Donate</option>
                              <option value="Discard">Discard</option>
                            </select>
                          </div>
                          <div className="col-span-2 pt-1 border-t border-gray-100">
                            <div className="text-[10px] text-gray-400 font-mono">Agreement Version: {profile?.agreementVersion || 'v1.0'}</div>
                            <div className="text-[10px] text-gray-400 font-mono">Signed Status: {profile?.signedAgreement ? `Signed on ${profile?.agreementDateSigned}` : 'Pending signature'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Section 5: Logistics & Storage */}
                      <div className="col-span-2 border border-gray-100 p-4 bg-gray-50/30 space-y-4">
                        <div className="flex items-center space-x-2 pb-1.5 border-b border-gray-200">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <h4 className="font-semibold text-gray-700 uppercase tracking-wider">5. Logistics & Preferences</h4>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Pickup Address (If different than above)</label>
                            <textarea name="pickupAddress" value={profileForm.pickupAddress || ''} onChange={handleProfileFormChange} rows={2} className="w-full border border-gray-300 p-1.5 text-xs focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Pickup Availability / Schedule Notes</label>
                            <textarea name="pickupAvailabilityNotes" value={profileForm.pickupAvailabilityNotes || ''} onChange={handleProfileFormChange} rows={2} className="w-full border border-gray-300 p-1.5 text-xs focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Delivery / Drop-off Preference</label>
                            <select name="deliveryPreference" value={profileForm.deliveryPreference || 'Drop-off'} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 bg-white">
                              <option value="Drop-off">Drop-off</option>
                              <option value="Pickup">Pickup</option>
                              <option value="Either">Either</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-gray-500 font-medium mb-1">Storage Location (Preferred / Assigned)</label>
                            <input type="text" name="storageLocation" value={profileForm.storageLocation || ''} onChange={handleProfileFormChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* Submit Bar */}
                    <div className="flex justify-end pt-4 border-t border-[#E5E5E0]">
                      <button
                        id="btn-save-portal-profile"
                        type="submit"
                        disabled={savingProfile}
                        className="inline-flex items-center px-6 py-2.5 bg-[#1A1A19] text-white hover:bg-black font-semibold text-sm cursor-pointer transition-colors"
                      >
                        {savingProfile ? 'Saving Changes...' : 'Save Profile Settings'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Item Detail & Edit Modal for Consignees */}
      {selectedLot && (
        <div id="consignee-lot-modal" className="fixed inset-0 bg-black/55 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E0] shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FCFCFB]">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 font-sans uppercase tracking-wider">
                  {isEditingLot ? 'Edit Consigned Item' : 'Consigned Item Details'}
                </h3>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">Lot #{selectedLot.lotNumber} • Status: {selectedLot.lotStatus}</p>
              </div>
              <div className="flex items-center gap-3">
                {profile?.serviceType === 'Self Service' && !selectedLot.auctionId ? (
                  isEditingLot ? (
                    <button
                      id="btn-consignee-save-lot"
                      onClick={handleSaveLotEdit}
                      disabled={savingLot}
                      className="inline-flex items-center px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {savingLot ? 'Saving...' : 'Save Changes'}
                    </button>
                  ) : (
                    <button
                      id="btn-consignee-edit-lot"
                      onClick={() => setIsEditingLot(true)}
                      className="inline-flex items-center px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 text-xs font-semibold cursor-pointer"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      Edit Item
                    </button>
                  )
                ) : null}
                <button
                  id="btn-consignee-close-lot"
                  onClick={() => { setSelectedLot(null); setIsEditingLot(false); }}
                  className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              
              {/* Context Banners */}
              <div className="space-y-2">
                {selectedLot.auctionId && (
                  <div className="bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span><strong>Locked:</strong> Once an item is included in an auction, it can no longer be edited by the consignee.</span>
                  </div>
                )}
                {profile?.serviceType !== 'Self Service' && (
                  <div className="bg-gray-100 border border-gray-200 p-3 text-xs text-gray-600 flex items-center gap-2">
                    <Info className="h-4 w-4 shrink-0 text-gray-500" />
                    <span><strong>Read-Only:</strong> Your service type is <strong>{profile?.serviceType}</strong>. Only "Self Service" accounts are permitted to edit items.</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Image Showcase */}
                <div className="space-y-4">
                  <div className="border border-gray-200 bg-gray-50 aspect-square flex items-center justify-center relative overflow-hidden">
                    {selectedLot.primaryPhotoURL && !selectedLot.primaryPhotoURL.includes('unsplash.com') ? (
                      <img src={selectedLot.primaryPhotoURL} alt={selectedLot.lotTitle} referrerPolicy="no-referrer" className="object-cover w-full h-full" />
                    ) : (
                      <div className="text-center p-4">
                        <Package className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                        <span className="text-xs text-gray-400 font-medium">Image Not Available</span>
                      </div>
                    )}
                  </div>
                  {isEditingLot && (
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Primary Photo URL</label>
                      <input type="text" name="primaryPhotoURL" value={editLotForm.primaryPhotoURL || ''} onChange={(e) => setEditLotForm(p => ({ ...p, primaryPhotoURL: e.target.value }))} className="w-full border border-gray-300 p-1.5 font-mono" />
                    </div>
                  )}
                </div>

                {/* Form Fields Column */}
                <div className="space-y-4 col-span-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Item Title *</label>
                      {isEditingLot ? (
                        <input type="text" value={editLotForm.lotTitle || ''} onChange={(e) => setEditLotForm(p => ({ ...p, lotTitle: e.target.value }))} className="w-full border border-gray-300 p-1.5 font-medium" />
                      ) : (
                        <p className="font-semibold text-gray-900 text-sm">{selectedLot.lotTitle}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Category *</label>
                      {isEditingLot ? (
                        <select value={editLotForm.category || 'Furniture'} onChange={(e) => setEditLotForm(p => ({ ...p, category: e.target.value }))} className="w-full border border-gray-300 p-1.5 bg-white">
                          {platformConfig.categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-gray-950 font-medium">{selectedLot.category}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Era / Period</label>
                      {isEditingLot ? (
                        <input type="text" value={editLotForm.eraPeriod || ''} onChange={(e) => setEditLotForm(p => ({ ...p, eraPeriod: e.target.value }))} className="w-full border border-gray-300 p-1.5" />
                      ) : (
                        <p className="text-gray-900">{selectedLot.eraPeriod || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Origin / Country of Origin</label>
                      {isEditingLot ? (
                        <input type="text" value={editLotForm.originCountry || ''} onChange={(e) => setEditLotForm(p => ({ ...p, originCountry: e.target.value }))} className="w-full border border-gray-300 p-1.5" />
                      ) : (
                        <p className="text-gray-900">{selectedLot.originCountry || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Maker / Manufacturer</label>
                      {isEditingLot ? (
                        <input type="text" value={editLotForm.makerManufacturer || ''} onChange={(e) => setEditLotForm(p => ({ ...p, makerManufacturer: e.target.value }))} className="w-full border border-gray-300 p-1.5" />
                      ) : (
                        <p className="text-gray-900">{selectedLot.makerManufacturer || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Artist / Designer</label>
                      {isEditingLot ? (
                        <input type="text" value={editLotForm.artistDesigner || ''} onChange={(e) => setEditLotForm(p => ({ ...p, artistDesigner: e.target.value }))} className="w-full border border-gray-300 p-1.5" />
                      ) : (
                        <p className="text-gray-900">{selectedLot.artistDesigner || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Condition</label>
                      {isEditingLot ? (
                        <select value={editLotForm.condition || 'Excellent'} onChange={(e) => setEditLotForm(p => ({ ...p, condition: e.target.value as any }))} className="w-full border border-gray-300 p-1.5 bg-white">
                          <option value="Excellent">Excellent</option>
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                          <option value="Poor">Poor</option>
                          <option value="As-Is">As-Is</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 font-medium">{selectedLot.condition}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-gray-500 font-semibold mb-1">Dimensions (L x W x H)</label>
                      {isEditingLot ? (
                        <input type="text" value={editLotForm.dimensions || ''} onChange={(e) => setEditLotForm(p => ({ ...p, dimensions: e.target.value }))} className="w-full border border-gray-300 p-1.5" />
                      ) : (
                        <p className="text-gray-900">{selectedLot.dimensions || '-'}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Condition Notes & Reserve Info */}
              <div className="border-t border-gray-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-500 font-semibold mb-1">Condition Notes</label>
                  {isEditingLot ? (
                    <textarea value={editLotForm.conditionNotes || ''} onChange={(e) => setEditLotForm(p => ({ ...p, conditionNotes: e.target.value }))} rows={2} className="w-full border border-gray-300 p-1.5" />
                  ) : (
                    <p className="text-gray-700 bg-gray-50 p-2 border italic">{selectedLot.conditionNotes || 'No issues noted.'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-gray-500 font-semibold mb-1">Reserve Pricing Term</label>
                  <div className="grid grid-cols-2 gap-2 bg-gray-50/50 p-2.5 border border-gray-200">
                    <div>
                      <span className="block text-[9px] text-gray-400 font-semibold uppercase">Reserve Requested</span>
                      {isEditingLot ? (
                        <select value={editLotForm.reserveRequested || 'No'} onChange={(e) => setEditLotForm(p => ({ ...p, reserveRequested: e.target.value as any }))} className="w-full border border-gray-300 p-1 bg-white mt-1">
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 font-semibold mt-1">{selectedLot.reserveRequested || 'No'}</p>
                      )}
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 font-semibold uppercase">Reserve Price ($)</span>
                      {isEditingLot ? (
                        <input type="number" value={editLotForm.reservePrice || 0} onChange={(e) => setEditLotForm(p => ({ ...p, reservePrice: Number(e.target.value) }))} className="w-full border border-gray-300 p-1 mt-1" />
                      ) : (
                        <p className="text-gray-900 font-mono font-semibold mt-1">${(selectedLot.reservePrice || 0).toFixed(2)}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Catalog Description */}
              <div className="border-t border-gray-100 pt-4">
                <label className="block text-gray-500 font-semibold mb-1">Description / Catalog Copy</label>
                {isEditingLot ? (
                  <textarea value={editLotForm.fullDescription || ''} onChange={(e) => setEditLotForm(p => ({ ...p, fullDescription: e.target.value }))} rows={3} className="w-full border border-gray-300 p-1.5" />
                ) : (
                  <p className="text-gray-700 leading-relaxed bg-gray-50/20 p-2 border border-gray-100">{selectedLot.fullDescription || 'No description cataloged.'}</p>
                )}
              </div>

              {/* Read Only Sale & Payout Info */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 font-mono">Disbursement Settlement Details</h4>
                <div className="bg-gray-50/50 border border-gray-200 p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-gray-400 block font-semibold text-[10px]">Hammer Price</span>
                    <span className="font-mono font-bold text-gray-900 text-sm">
                      {selectedLot.hammerPrice !== null ? `$${selectedLot.hammerPrice.toFixed(2)}` : 'Lot Not Sold'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold text-[10px]">Net Payout</span>
                    <span className="font-mono font-bold text-green-700 text-sm">
                      {selectedLot.consigneePayout !== null ? `$${selectedLot.consigneePayout.toFixed(2)}` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold text-[10px]">Payout Status</span>
                    <span className={`inline-flex px-1.5 py-0.5 mt-0.5 text-[10px] font-bold border ${
                      selectedLot.payoutStatus === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {selectedLot.payoutStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block font-semibold text-[10px]">Payout Date</span>
                    <span className="font-mono text-gray-700 block mt-0.5">{selectedLot.payoutDate || 'Settle Pending'}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ACCOUNT STATEMENT MODAL */}
      {showStatementModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white max-w-4xl w-full p-8 space-y-6 shadow-2xl border border-gray-300 my-8">
            <div className="flex items-center justify-between border-b border-gray-200 pb-4">
              <div>
                <h3 className="text-xl font-serif text-gray-900 font-bold">Consignment Account Activity Statement</h3>
                <p className="text-xs text-gray-500 font-mono">Timeframe: {DATE_RANGE_OPTIONS.find(o => o.key === dateRange)?.label} • Generated on {new Date().toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-[#1A1A19] text-white text-xs font-semibold hover:bg-black inline-flex items-center cursor-pointer"
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  Print Statement
                </button>
                <button
                  onClick={() => setShowStatementModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-900 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Statement Header info */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 border border-gray-200 text-xs">
              <div>
                <p className="text-gray-400 uppercase text-[10px] font-bold">Consignor Account</p>
                <p className="font-bold text-gray-900 text-sm">{profile?.displayName || displayName}</p>
                <p className="text-gray-600">ID: #{profile?.consigneeId || consigneeDocId}</p>
                <p className="text-gray-600">{profile?.email}</p>
                <p className="text-gray-600">{profile?.phone}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 uppercase text-[10px] font-bold">Estate Services Platform</p>
                <p className="font-bold text-gray-900">{platformConfig.branding?.appName || 'MCM Estate Services'}</p>
                <p className="text-gray-600">Standard Commission: {profile?.commissionRate || 30}%</p>
                <p className="text-amber-700 font-semibold font-mono mt-1">Status: Active Consignor</p>
              </div>
            </div>

            {/* Statement Table */}
            <div className="overflow-x-auto border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-[#1A1A19] text-white font-mono">
                  <tr>
                    <th className="px-3 py-2 text-left">Lot #</th>
                    <th className="px-3 py-2 text-left">Title</th>
                    <th className="px-3 py-2 text-left">Submitted Date</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Hammer ($)</th>
                    <th className="px-3 py-2 text-right">Net Payout ($)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {submittedLotsInRange.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-500">#{l.lotNumber}</td>
                      <td className="px-3 py-2 font-medium text-gray-900">{l.lotTitle}</td>
                      <td className="px-3 py-2 font-mono text-gray-500">{l.dateReceived || l.dateListed || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <span className="font-semibold text-gray-700">{l.lotStatus}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-gray-900">
                        {l.hammerPrice !== null ? `$${l.hammerPrice.toFixed(2)}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-green-700">
                        {l.consigneePayout !== null ? `$${l.consigneePayout.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))}
                  {submittedLotsInRange.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                        No lots found in the selected timeframe.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary Box */}
            <div className="bg-[#1A1A19] text-white p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
              <div>
                <span className="text-gray-400 text-[10px] uppercase block">Total Items</span>
                <span className="text-base font-bold">{submittedLotsInRange.length}</span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] uppercase block">Gross Hammer</span>
                <span className="text-base font-bold">${soldLotsInRange.reduce((s, l) => s + (l.hammerPrice || 0), 0).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] uppercase block">Total Net Earned</span>
                <span className="text-base font-bold text-amber-400">${netEarnedInRange.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] uppercase block">Pending Payout</span>
                <span className="text-base font-bold text-emerald-400">${pendingPayoutsInRange.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowStatementModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50 cursor-pointer"
              >
                Close Statement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTACT STAFF MODAL */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white max-w-lg w-full p-6 space-y-4 shadow-xl border border-gray-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-serif font-bold text-gray-900 flex items-center">
                <Mail className="h-5 w-5 mr-2 text-blue-600" />
                Contact Account Manager
              </h3>
              <button onClick={() => { setShowContactModal(false); setContactSent(false); }} className="text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            {contactSent ? (
              <div className="p-6 bg-green-50 border border-green-200 text-center space-y-3">
                <CheckCircle className="h-10 w-10 text-green-600 mx-auto" />
                <h4 className="font-bold text-green-900 text-base">Inquiry Sent Successfully!</h4>
                <p className="text-xs text-green-800">Your account manager has received your note regarding your consignment account. We will reply within 24 business hours.</p>
                <button
                  onClick={() => { setShowContactModal(false); setContactSent(false); }}
                  className="px-4 py-2 bg-green-700 text-white text-xs font-bold hover:bg-green-800 cursor-pointer"
                >
                  Return to Dashboard
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); setContactSent(true); }} className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Inquiry Subject</label>
                  <input
                    type="text"
                    required
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    className="w-full border border-gray-300 p-2 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Your Message / Question</label>
                  <textarea
                    required
                    rows={4}
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    placeholder="Enter details regarding item intake, payouts, or general questions..."
                    className="w-full border border-gray-300 p-2"
                  />
                </div>
                <div className="bg-gray-50 p-3 border border-gray-200 text-gray-500 space-y-1 text-[11px]">
                  <p><strong>Consignor:</strong> {profile?.displayName || displayName} (#{profile?.consigneeId})</p>
                  <p><strong>Contact Email:</strong> {profile?.email || 'Registered account email'}</p>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowContactModal(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#1A1A19] text-white font-semibold hover:bg-black cursor-pointer inline-flex items-center"
                  >
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    Send Message
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
