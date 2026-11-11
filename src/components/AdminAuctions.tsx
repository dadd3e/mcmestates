import React, { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Auction, Lot, Consignee } from '../types';
import { calculateLotFinancials } from '../lib/financials';
import { Search, Plus, X, Edit2, Check, Calendar, ExternalLink, ListCollapse, Trash2, Info, Clock, Megaphone, DollarSign, Sliders, Users, Database, Grid, List, Eye } from 'lucide-react';

import { PlatformConfig, DEFAULT_PLATFORM_CONFIG } from '../lib/platformConfig';
import MaxsoldCSVImporter from './MaxsoldCSVImporter';

interface AdminAuctionsProps {
  auctions: Auction[];
  lots: Lot[];
  consignees: Consignee[];
  onRefresh: () => void;
  config?: PlatformConfig;
}

export default function AdminAuctions({ auctions, lots, consignees, onRefresh, config }: AdminAuctionsProps) {
  const activeConfig = config || DEFAULT_PLATFORM_CONFIG;
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('Active');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<'25' | '50' | '100' | 'all'>('25');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isMaxsoldModalOpen, setIsMaxsoldModalOpen] = useState(false);

  const handleQuickView = (auction: Auction, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAuction(auction);
    setEditForm(auction);
    setIsEditing(false);
    setActiveDetailTab('identity');
  };

  const handleQuickEdit = (auction: Auction, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedAuction(auction);
    setEditForm(auction);
    setIsEditing(true);
    setActiveDetailTab('identity');
  };

  const [activeDetailTab, setActiveDetailTab] = useState<'identity' | 'schedule' | 'marketing' | 'financials' | 'terms' | 'operations' | 'lots'>('identity');
  const [activeAddTab, setActiveAddTab] = useState<'identity' | 'schedule' | 'marketing' | 'financials' | 'terms' | 'operations'>('identity');

  // States for interactive lot adding/removing/editing inside event details window
  const [selectedLotToAssign, setSelectedLotToAssign] = useState<string>('');
  const [isQuickCreatingLot, setIsQuickCreatingLot] = useState(false);
  const [editingLot, setEditingLot] = useState<Lot | null>(null);

  // Form for quick-creating a lot for this auction
  const [quickLotForm, setQuickLotForm] = useState<Partial<Lot>>({
    lotTitle: '',
    category: 'Furniture',
    estimateLow: 50,
    estimateHigh: 150,
    commissionRate: 15,
    consigneeId: '',
    lotStatus: 'Active',
    hammerPrice: null
  });

  // Form for editing a specific lot
  const [editingLotForm, setEditingLotForm] = useState<Partial<Lot>>({});

  // Forms state
  const [editForm, setEditForm] = useState<Partial<Auction>>({});
  const [addForm, setAddForm] = useState<Partial<Auction>>({
    auctionName: '',
    auctionStatus: 'Scheduled',
    auctionType: 'Online Only',
    auctionPlatform: activeConfig.platforms?.[0] || 'HiBid',
    externalAuctionId: '',
    auctionURL: '',
    internalReferenceCode: '',
    startDate: '',
    endDate: '',
    deadlineForDropOffs: '',
    pickupDate: '',
    startTime: activeConfig.operations?.defaultStartTime || '10:00',
    endTime: activeConfig.operations?.defaultEndTime || '18:00',
    pickupStartDate: '',
    pickupEndDate: '',
    pickupHoursNotes: activeConfig.operations?.defaultPickupHoursNotes || '9 AM - 4 PM',
    pickupLocation: activeConfig.operations?.defaultPickupLocation || 'MCM Warehouse, Suite A',
    auctionTheme: '',
    auctionDescription: '',
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
    defaultCommissionRate: 15,
    buyersPremiumRate: 18,
    platformFeeRate: 0,
    shippingOffered: true,
    paymentMethodsAccepted: ['Credit', 'Debit', 'Cash'],
    paymentDueWindow: '48 Hours',
    auctioneerLeadStaff: 'Sarah',
    numberOfConsignees: 0,
    settlementsComplete: false,
    internalNotes: ''
  });

  // Status Counts for Top Filter Tabs
  const statusCounts = useMemo(() => {
    const term = search.toLowerCase();
    const base = auctions.filter(a =>
      a.auctionName.toLowerCase().includes(term) ||
      (a.internalReferenceCode && a.internalReferenceCode.toLowerCase().includes(term)) ||
      (a.auctionPlatform && a.auctionPlatform.toLowerCase().includes(term))
    );

    return {
      all: base.length,
      Active: base.filter(a => a.auctionStatus === 'Live' || a.auctionStatus === 'Active').length,
      Scheduled: base.filter(a => a.auctionStatus === 'Scheduled').length,
      Building: base.filter(a => a.auctionStatus === 'Building').length,
      Closed: base.filter(a => a.auctionStatus === 'Closed').length,
      Settled: base.filter(a => a.auctionStatus === 'Settled').length,
    };
  }, [auctions, search]);

  // Filter auctions
  const filteredAuctions = useMemo(() => {
    return auctions.filter(a => {
      const term = search.toLowerCase();
      const matchesSearch = 
        a.auctionName.toLowerCase().includes(term) ||
        (a.internalReferenceCode && a.internalReferenceCode.toLowerCase().includes(term)) ||
        (a.auctionPlatform && a.auctionPlatform.toLowerCase().includes(term));

      const matchesStatus = 
        filterStatus === 'all' ? true :
        filterStatus === 'Active' ? (a.auctionStatus === 'Live' || a.auctionStatus === 'Active') :
        a.auctionStatus === filterStatus;

      return matchesSearch && matchesStatus;
    });
  }, [auctions, search, filterStatus]);

  // Reset pagination on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, itemsPerPage]);

  const pageSize = itemsPerPage === 'all' ? filteredAuctions.length : Number(itemsPerPage);
  const totalPages = Math.ceil(filteredAuctions.length / (pageSize || 1)) || 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedAuctions = useMemo(() => {
    if (itemsPerPage === 'all') return filteredAuctions;
    const start = (validCurrentPage - 1) * pageSize;
    return filteredAuctions.slice(start, start + pageSize);
  }, [filteredAuctions, validCurrentPage, pageSize, itemsPerPage]);

  // Filter and dynamically calculate lots assigned to selected auction
  const auctionLots = useMemo(() => {
    if (!selectedAuction) return [];
    return lots
      .filter(l => l.auctionId === selectedAuction.id)
      .map(l => {
        const matchedConsignee = consignees.find(c => c.id === l.consigneeId || c.consigneeId === l.consigneeId);
        const computed = calculateLotFinancials(l, selectedAuction, matchedConsignee);
        return {
          ...l,
          ...computed
        };
      });
  }, [lots, selectedAuction, consignees]);

  const unassignedLots = lots.filter(l => !l.auctionId);

  const handleRowClick = (auction: Auction) => {
    setSelectedAuction(auction);
    setEditForm(auction);
    setIsEditing(false);
    setActiveDetailTab('identity');
  };

  const numericFields = [
    'totalLots', 'totalLotsSold', 'totalLotsUnsold', 'sellThroughRate', 
    'grossSales', 'totalBuyersPremiumCollected', 'totalRevenue', 
    'totalCommissionsEarned', 'totalConsigneePayouts', 'highestHammerPrice', 
    'averageHammerPrice', 'platformFeeRate', 
    'defaultCommissionRate', 'buyersPremiumRate', 'numberOfConsignees'
  ];

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (numericFields.includes(name)) {
      finalValue = Number(value);
    }
    setEditForm(prev => {
      const updated = { ...prev, [name]: finalValue };
      if (name === 'auctionPlatform') {
        if (finalValue === 'Maxsold') {
          updated.buyersPremiumRate = 0;
          updated.platformFeeRate = 18;
        } else {
          updated.buyersPremiumRate = 18;
          updated.platformFeeRate = 0;
        }
      }
      return updated;
    });
  };

  const handleAddChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (numericFields.includes(name)) {
      finalValue = Number(value);
    }
    setAddForm(prev => {
      const updated = { ...prev, [name]: finalValue };
      if (name === 'auctionPlatform') {
        if (finalValue === 'Maxsold') {
          updated.buyersPremiumRate = 0;
          updated.platformFeeRate = 18;
        } else {
          updated.buyersPremiumRate = 18;
          updated.platformFeeRate = 0;
        }
      }
      return updated;
    });
  };

  const togglePaymentMethod = (formType: 'edit' | 'add', method: string) => {
    if (formType === 'edit') {
      setEditForm(prev => {
        const current = prev.paymentMethodsAccepted || [];
        const updated = current.includes(method)
          ? current.filter(m => m !== method)
          : [...current, method];
        return { ...prev, paymentMethodsAccepted: updated };
      });
    } else {
      setAddForm(prev => {
        const current = prev.paymentMethodsAccepted || [];
        const updated = current.includes(method)
          ? current.filter(m => m !== method)
          : [...current, method];
        return { ...prev, paymentMethodsAccepted: updated };
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedAuction?.id) return;
    setSaving(true);
    try {
      const docRef = doc(db, 'auctions', selectedAuction.id);
      await updateDoc(docRef, editForm);

      // Recalculate and update all lots assigned to this auction in Firestore
      const assignedLots = lots.filter(l => l.auctionId === selectedAuction.id);
      for (const lot of assignedLots) {
        const matchedConsignee = consignees.find(c => c.id === lot.consigneeId || c.consigneeId === lot.consigneeId);
        // Compute new financials using the updated auction settings
        const computed = calculateLotFinancials(lot, editForm as Auction, matchedConsignee);
        const lotRef = doc(db, 'lots', lot.id);
        await updateDoc(lotRef, {
          ...computed
        });
      }

      setSelectedAuction({ ...selectedAuction, ...editForm } as Auction);
      setIsEditing(false);
      onRefresh();
    } catch (err) {
      console.error("Error saving auction: ", err);
      alert("Error saving auction edits.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const prefix = activeConfig.operations?.defaultInternalRefPrefix || 'MCM';
      const finalCode = addForm.internalReferenceCode || `${prefix}-${new Date().getFullYear()}-${Math.floor(Math.random() * 95 + 5)}`;
      const finalForm = {
        ...addForm,
        internalReferenceCode: finalCode
      };

      const collRef = collection(db, 'auctions');
      await addDoc(collRef, finalForm);
      setIsAdding(false);
      onRefresh();
    } catch (err) {
      console.error("Error creating auction: ", err);
      alert("Error saving auction.");
    } finally {
      setSaving(false);
    }
  };

  // Interactive lot handlers inside the event detail modal
  const handleAssignLot = async () => {
    if (!selectedLotToAssign || !selectedAuction) return;
    try {
      setSaving(true);
      const lotRef = doc(db, 'lots', selectedLotToAssign);
      const targetLot = lots.find(l => l.id === selectedLotToAssign);
      if (!targetLot) return;
      
      const matchedConsignee = consignees.find(c => c.id === targetLot.consigneeId || c.consigneeId === targetLot.consigneeId);
      const computed = calculateLotFinancials({ ...targetLot, auctionId: selectedAuction.id }, selectedAuction, matchedConsignee);
      
      await updateDoc(lotRef, {
        auctionId: selectedAuction.id,
        ...computed
      });
      
      setSelectedLotToAssign('');
      onRefresh();
    } catch (err) {
      console.error("Error assigning lot to auction:", err);
      alert("Error assigning lot.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLot = async (lotId: string) => {
    if (!selectedAuction) return;
    if (!confirm("Are you sure you want to remove this item from the auction event?")) return;
    try {
      setSaving(true);
      const lotRef = doc(db, 'lots', lotId);
      
      await updateDoc(lotRef, {
        auctionId: null,
        buyersPremium: null,
        totalSalePrice: null,
        platformFeeRate: 0,
        platformFeeAmount: null,
        commissionAmount: null,
        commissionTaxAmount: null,
        consigneePayout: null
      });
      
      onRefresh();
    } catch (err) {
      console.error("Error removing lot from auction:", err);
      alert("Error removing lot.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEditingLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLot || !selectedAuction) return;
    try {
      setSaving(true);
      const lotRef = doc(db, 'lots', editingLot.id);
      
      const matchedConsignee = consignees.find(c => c.id === editingLotForm.consigneeId || c.consigneeId === editingLotForm.consigneeId);
      const computed = calculateLotFinancials({
        ...editingLotForm,
        auctionId: selectedAuction.id
      }, selectedAuction, matchedConsignee);

      await updateDoc(lotRef, {
        ...editingLotForm,
        ...computed
      });

      setEditingLot(null);
      onRefresh();
    } catch (err) {
      console.error("Error saving lot:", err);
      alert("Error saving lot changes.");
    } finally {
      setSaving(false);
    }
  };

  const handleQuickCreateLot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAuction) return;
    if (!quickLotForm.consigneeId) {
      alert("Please select a consignee.");
      return;
    }
    try {
      setSaving(true);
      
      const finalLotNumber = quickLotForm.lotNumber || `${lots.length + 101}`;
      const finalSku = `SKU-${quickLotForm.category?.substring(0, 3).toUpperCase()}-${finalLotNumber}`;
      
      const matchedConsignee = consignees.find(c => c.id === quickLotForm.consigneeId || c.consigneeId === quickLotForm.consigneeId);
      const computed = calculateLotFinancials({
        ...quickLotForm,
        auctionId: selectedAuction.id
      }, selectedAuction, matchedConsignee);

      const payload = {
        ...quickLotForm,
        ...computed,
        lotNumber: finalLotNumber,
        internalSKU: finalSku,
        auctionId: selectedAuction.id,
        lotStatus: quickLotForm.lotStatus || 'Active',
        payoutStatus: 'Unpaid',
        payoutDate: '',
        primaryPhotoURL: quickLotForm.primaryPhotoURL || '',
        additionalPhotoURLs: [],
        photoCount: quickLotForm.primaryPhotoURL ? 1 : 0,
        videoURL: '',
        provenanceDocURL: '',
        reservePrice: 0,
        reserveMet: false,
        quantity: 1,
        shippingAvailable: true,
        shippingWeightClass: 'Medium',
        buyerNameId: '',
        unsoldActionTaken: '',
        internalNotes: 'Quick-created within Auction Details Modal.'
      };

      await addDoc(collection(db, 'lots'), payload);
      setIsQuickCreatingLot(false);
      
      setQuickLotForm({
        lotTitle: '',
        category: 'Furniture',
        estimateLow: 50,
        estimateHigh: 150,
        commissionRate: 15,
        consigneeId: '',
        lotStatus: 'Active',
        hammerPrice: null
      });

      onRefresh();
    } catch (err) {
      console.error("Error quick-creating lot:", err);
      alert("Error creating lot.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="admin-auctions" className="space-y-6 font-sans">
      {/* Search and Status Filter Container */}
      <div className="bg-white border border-[#E5E5E0] overflow-hidden shadow-xs">
        {/* Status Filter Tabs */}
        <div className="border-b border-[#E5E5E0] bg-[#FCFCFB] flex flex-wrap gap-1 px-4 pt-2">
          {[
            { id: 'Active', label: 'Active / Live' },
            { id: 'Scheduled', label: 'Scheduled' },
            { id: 'Building', label: 'Building' },
            { id: 'Closed', label: 'Closed' },
            { id: 'Settled', label: 'Settled' },
            { id: 'all', label: 'All Events' },
          ].map((tab) => {
            const isActive = filterStatus === tab.id;
            const count = tab.id === 'all' ? statusCounts.all : (statusCounts[tab.id as keyof typeof statusCounts] || 0);
            return (
              <button
                key={tab.id}
                id={`tab-auction-status-${tab.id.toLowerCase()}`}
                type="button"
                onClick={() => {
                  setFilterStatus(tab.id);
                  setCurrentPage(1);
                }}
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-150 border-b-2 cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'border-amber-600 text-amber-900 bg-amber-500/10 font-bold'
                    : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-100/50'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded-full ${
                  isActive ? 'bg-amber-200 text-amber-900 font-bold' : 'bg-gray-200 text-gray-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Bar & Actions */}
        <div className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              id="auction-search"
              type="text"
              placeholder="Search auctions by name or reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-[#E5E5E0] focus:outline-none focus:ring-1 focus:ring-[#1A1A19] sm:text-sm bg-white"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* List / Grid view selector toggle */}
            <div className="flex items-center border border-gray-300 bg-gray-50 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                id="btn-auction-view-list"
                className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'list' ? 'bg-white text-black shadow-xs font-bold' : 'text-gray-500 hover:text-black'
                }`}
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                id="btn-auction-view-grid"
                className={`px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  viewMode === 'grid' ? 'bg-white text-black shadow-xs font-bold' : 'text-gray-500 hover:text-black'
                }`}
                title="Grid View"
              >
                <Grid className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>
            </div>

            <button
              id="btn-maxsold-import-auctions"
              type="button"
              onClick={() => setIsMaxsoldModalOpen(true)}
              className="inline-flex items-center justify-center px-4 py-2 border border-blue-600 bg-blue-50 text-blue-900 hover:bg-blue-100 font-semibold text-xs cursor-pointer transition-colors"
            >
              <Database className="h-4 w-4 mr-2 text-blue-700" />
              Maxsold Bulk Import
            </button>
            <button
              id="btn-add-auction"
              onClick={() => {
                setAddForm({
                  auctionName: '',
                  auctionStatus: 'Scheduled',
                  auctionType: 'Online Only',
                  auctionPlatform: activeConfig.platforms?.[0] || 'HiBid',
                  externalAuctionId: '',
                  auctionURL: '',
                  internalReferenceCode: '',
                  startDate: '',
                  endDate: '',
                  deadlineForDropOffs: '',
                  pickupDate: '',
                  startTime: activeConfig.operations?.defaultStartTime || '10:00',
                  endTime: activeConfig.operations?.defaultEndTime || '18:00',
                  pickupStartDate: '',
                  pickupEndDate: '',
                  pickupHoursNotes: activeConfig.operations?.defaultPickupHoursNotes || '9 AM - 4 PM',
                  pickupLocation: activeConfig.operations?.defaultPickupLocation || 'MCM Warehouse, Suite A',
                  auctionTheme: '',
                  auctionDescription: '',
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
                });
                setIsAdding(true);
              }}
              className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium text-white bg-[#1A1A19] hover:bg-black cursor-pointer shadow-xs"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Auction Event
            </button>
          </div>
        </div>
      </div>

      {/* Auction List or Grid Rendering */}
      {viewMode === 'list' ? (
        /* List View */
        <div className="bg-white border border-[#E5E5E0] shadow-xs overflow-x-auto">
          <table id="table-admin-auctions-list" className="w-full min-w-[850px] divide-y divide-gray-200 text-xs text-left font-sans">
            <thead className="bg-[#FCFCFB] text-gray-500 font-medium uppercase text-[10px] tracking-wider">
              <tr>
                <th className="px-4 py-3">Ref Code & Status</th>
                <th className="px-4 py-3">Event Name & Theme</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Dates</th>
                <th className="px-4 py-3 text-center">Assigned Lots</th>
                <th className="px-4 py-3 text-right">Gross Sales</th>
                <th className="px-4 py-3">Lead Staff</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 font-sans">
              {filteredAuctions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 italic">
                    No auction events match your search query.
                  </td>
                </tr>
              ) : (
                paginatedAuctions.map((a) => {
                  const associatedLots = lots.filter(l => l.auctionId === a.id);
                  const totalSoldLots = associatedLots.filter(l => l.lotStatus === 'Sold').length;
                  const totalLotsCount = associatedLots.length;
                  const calculatedGross = associatedLots.reduce((sum, l) => sum + (l.hammerPrice || 0), 0);

                  return (
                    <tr
                      id={`row-auction-${a.id}`}
                      key={a.id}
                      onClick={() => handleRowClick(a)}
                      className="hover:bg-gray-50/80 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-mono">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-gray-900">{a.internalReferenceCode || 'N/A'}</span>
                          <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border text-center w-fit ${
                            a.auctionStatus === 'Live' || a.auctionStatus === 'Active' ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold' :
                            a.auctionStatus === 'Scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            a.auctionStatus === 'Building' ? 'bg-purple-50 text-purple-700 border-purple-200 font-semibold' :
                            a.auctionStatus === 'Settled' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                            'bg-gray-100 text-gray-700 border-gray-300'
                          }`}>
                            {a.auctionStatus}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-[180px]">
                          <p className="font-bold text-gray-900 text-sm">{a.auctionName}</p>
                          <p className="text-[11px] text-gray-500 truncate max-w-xs">{a.auctionTheme || 'Estate auction'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800 font-mono">{a.auctionPlatform}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-[11px]">
                        <div>{a.startDate || 'TBD'} to {a.endDate || 'TBD'}</div>
                        {a.pickupDate && <div className="text-[10px] text-gray-400">Pickup: {a.pickupDate}</div>}
                      </td>
                      <td className="px-4 py-3 text-center font-mono">
                        <span className="font-bold text-gray-900">{totalLotsCount}</span>
                        <span className="text-gray-400 text-[10px]"> ({totalSoldLots} sold)</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">
                        ${calculatedGross > 0 ? calculatedGross.toFixed(2) : (a.grossSales || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.auctioneerLeadStaff || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleQuickView(a, e)}
                            id={`btn-quick-view-auction-${a.id}`}
                            className="inline-flex items-center px-2.5 py-1 text-xs border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 font-medium cursor-pointer transition-colors"
                            title="View Auction Details"
                          >
                            <Eye className="h-3 w-3 mr-1 text-blue-600" />
                            View
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleQuickEdit(a, e)}
                            id={`btn-quick-edit-auction-${a.id}`}
                            className="inline-flex items-center px-2.5 py-1 text-xs border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 font-bold cursor-pointer transition-colors"
                            title="Edit Auction Details"
                          >
                            <Edit2 className="h-3 w-3 mr-1 text-amber-600" />
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {paginatedAuctions.map((a) => {
            const associatedLots = lots.filter(l => l.auctionId === a.id);
            const totalSoldLots = associatedLots.filter(l => l.lotStatus === 'Sold').length;
            const totalLotsCount = associatedLots.length;

            return (
              <div
                id={`card-auction-${a.id}`}
                key={a.id}
                onClick={() => handleRowClick(a)}
                className="bg-white border border-[#E5E5E0] p-6 hover:shadow-md transition-shadow duration-150 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold border ${
                      a.auctionStatus === 'Live' || a.auctionStatus === 'Active' ? 'bg-emerald-50 text-emerald-800 border-emerald-300 animate-pulse font-bold' :
                      a.auctionStatus === 'Scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      a.auctionStatus === 'Building' ? 'bg-purple-50 text-purple-700 border-purple-200 font-semibold' :
                      a.auctionStatus === 'Settled' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      'bg-gray-100 text-gray-700 border-gray-300'
                    }`}>
                      {a.auctionStatus}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">{a.internalReferenceCode}</span>
                  </div>
                  <h4 className="text-base font-semibold text-gray-900 mb-1">{a.auctionName}</h4>
                  <p className="text-xs text-gray-500 mb-4 font-sans">{a.auctionTheme || 'Estate collectibles auction'}</p>
                  
                  <div className="space-y-1.5 text-xs text-gray-600 mb-6 font-mono">
                    <div className="flex justify-between">
                      <span>Platform:</span>
                      <span className="font-semibold text-gray-800">{a.auctionPlatform}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Date Range:</span>
                      <span className="font-semibold text-gray-800">{a.startDate} to {a.endDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Assigned Lots:</span>
                      <span className="font-semibold text-gray-800">{totalLotsCount} lots ({totalSoldLots} sold)</span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>Lead: {a.auctioneerLeadStaff}</span>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => handleQuickView(a, e)}
                      className="px-2.5 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleQuickEdit(a, e)}
                      className="px-2.5 py-1 bg-[#1A1A19] text-white text-xs font-semibold hover:bg-black transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      <div className="bg-white border border-[#E5E5E0] px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-sans shadow-xs">
        <div className="flex items-center gap-3 text-gray-600">
          <span className="font-medium">Show</span>
          <select
            id="select-auctions-per-page"
            value={itemsPerPage}
            onChange={(e) => setItemsPerPage(e.target.value as any)}
            className="border border-[#E5E5E0] px-2.5 py-1 bg-white font-mono font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer shadow-2xs"
          >
            <option value="25">25 per page</option>
            <option value="50">50 per page</option>
            <option value="100">100 per page</option>
            <option value="all">All events ({filteredAuctions.length})</option>
          </select>
          <span className="text-gray-500">
            {itemsPerPage === 'all' ? (
              <>Showing all <strong className="text-gray-900 font-mono">{filteredAuctions.length}</strong> events</>
            ) : (
              <>
                Showing <strong className="text-gray-900 font-mono">
                  {filteredAuctions.length === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1}
                </strong>–<strong className="text-gray-900 font-mono">
                  {Math.min(validCurrentPage * pageSize, filteredAuctions.length)}
                </strong> of <strong className="text-gray-900 font-mono">{filteredAuctions.length}</strong> events
              </>
            )}
          </span>
        </div>

        {itemsPerPage !== 'all' && totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              id="btn-auction-page-first"
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={validCurrentPage === 1}
              className="px-2.5 py-1 border border-[#E5E5E0] bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[11px] cursor-pointer"
            >
              « First
            </button>
            <button
              id="btn-auction-page-prev"
              type="button"
              onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
              disabled={validCurrentPage === 1}
              className="px-2.5 py-1 border border-[#E5E5E0] bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer"
            >
              Previous
            </button>
            <span className="px-3 py-1 font-mono text-gray-600 font-semibold">
              Page {validCurrentPage} of {totalPages}
            </span>
            <button
              id="btn-auction-page-next"
              type="button"
              onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
              disabled={validCurrentPage === totalPages}
              className="px-2.5 py-1 border border-[#E5E5E0] bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer"
            >
              Next
            </button>
            <button
              id="btn-auction-page-last"
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={validCurrentPage === totalPages}
              className="px-2.5 py-1 border border-[#E5E5E0] bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[11px] cursor-pointer"
            >
              Last »
            </button>
          </div>
        )}
      </div>

      {/* Auction detailed modal */}
      {selectedAuction && (
        <div id="auction-detail-modal" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E0] shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FCFCFB]">
              <div>
                <h3 className="text-lg font-medium text-gray-900 font-sans">
                  {isEditing ? 'Edit Auction Event' : 'Auction Event Details'}
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">{selectedAuction.internalReferenceCode} • Platform: {selectedAuction.auctionPlatform}</p>
              </div>
              <div className="flex items-center gap-3">
                {isEditing ? (
                  <button
                    id="btn-save-auction"
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="inline-flex items-center px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 text-xs font-medium cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Save Event
                  </button>
                ) : (
                  <button
                    id="btn-edit-auction"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 text-xs font-medium cursor-pointer"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Edit Details
                  </button>
                )}
                <button
                  id="btn-close-auction"
                  onClick={() => { setSelectedAuction(null); setIsEditing(false); }}
                  className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Tab bar (sticky/fixed at top of modal contents) */}
            <div className="flex flex-wrap border-b border-[#E5E5E0] bg-[#FCFCFB] px-6">
              <button
                type="button"
                id="tab-detail-identity"
                onClick={() => setActiveDetailTab('identity')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeDetailTab === 'identity' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Info className="h-3.5 w-3.5" />
                Identity & Tracking
              </button>
              <button
                type="button"
                id="tab-detail-schedule"
                onClick={() => setActiveDetailTab('schedule')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeDetailTab === 'schedule' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Schedule & Dates
              </button>
              <button
                type="button"
                id="tab-detail-marketing"
                onClick={() => setActiveDetailTab('marketing')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeDetailTab === 'marketing' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Megaphone className="h-3.5 w-3.5" />
                Content & Marketing
              </button>
              <button
                type="button"
                id="tab-detail-terms"
                onClick={() => setActiveDetailTab('terms')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeDetailTab === 'terms' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                Terms & Settings
              </button>
              <button
                type="button"
                id="tab-detail-operations"
                onClick={() => setActiveDetailTab('operations')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeDetailTab === 'operations' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Operations
              </button>
              <button
                type="button"
                id="tab-detail-financials"
                onClick={() => setActiveDetailTab('financials')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeDetailTab === 'financials' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <DollarSign className="h-3.5 w-3.5" />
                Financials & KPI
              </button>
              <button
                type="button"
                id="tab-detail-lots"
                onClick={() => setActiveDetailTab('lots')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeDetailTab === 'lots' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <ListCollapse className="h-3.5 w-3.5" />
                Assigned Lots ({auctionLots.length})
              </button>
            </div>

            {/* Scrollable details view */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              
              {activeDetailTab === 'identity' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Auction Event Name *</label>
                    {isEditing ? (
                      <input required type="text" name="auctionName" value={editForm.auctionName || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" />
                    ) : (
                      <p className="font-semibold text-gray-900 text-sm font-sans">{selectedAuction.auctionName || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Status</label>
                    {isEditing ? (
                      <select name="auctionStatus" value={editForm.auctionStatus} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]">
                        <option value="Building">Building</option>
                        <option value="Scheduled">Scheduled</option>
                        <option value="Live">Live / Active</option>
                        <option value="Closed">Closed</option>
                        <option value="Settled">Settled</option>
                      </select>
                    ) : (
                      <span className={`inline-flex px-2 py-0.5 text-xs font-semibold border ${
                        selectedAuction.auctionStatus === 'Live' || selectedAuction.auctionStatus === 'Active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        selectedAuction.auctionStatus === 'Scheduled' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                        selectedAuction.auctionStatus === 'Building' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                        selectedAuction.auctionStatus === 'Settled' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        'bg-gray-100 text-gray-700 border-gray-300'
                      }`}>
                        {selectedAuction.auctionStatus || '-'}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Platform</label>
                    {isEditing ? (
                      <select name="auctionPlatform" value={editForm.auctionPlatform} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]">
                        {activeConfig.platforms.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-gray-900 font-semibold font-sans">{selectedAuction.auctionPlatform || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Internal Reference Code</label>
                    {isEditing ? (
                      <input type="text" name="internalReferenceCode" value={editForm.internalReferenceCode || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                    ) : (
                      <p className="text-gray-900 font-mono">{selectedAuction.internalReferenceCode || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Public Catalog URL</label>
                    {isEditing ? (
                      <input type="url" name="auctionURL" value={editForm.auctionURL || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" placeholder="https://" />
                    ) : (
                      selectedAuction.auctionURL ? (
                        <a href={selectedAuction.auctionURL} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold inline-flex items-center hover:underline font-mono truncate max-w-xs">
                          {selectedAuction.auctionURL}
                          <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      ) : <p className="text-gray-400 italic font-sans">No URL configured</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">External Platform Event ID</label>
                    {isEditing ? (
                      <input type="text" name="externalAuctionId" value={editForm.externalAuctionId || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" placeholder="e.g. 104592" />
                    ) : (
                      <p className="text-gray-900 font-mono">{selectedAuction.externalAuctionId || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Auction ID (Firestore Key)</label>
                    <p className="text-gray-400 font-mono select-all bg-gray-50 px-2 py-1 border border-dashed border-gray-200 inline-block">{selectedAuction.id}</p>
                  </div>
                </div>
              )}

              {activeDetailTab === 'schedule' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Deadline for Drop Offs</label>
                    {isEditing ? (
                      <input type="date" name="deadlineForDropOffs" value={editForm.deadlineForDropOffs || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900 font-mono" />
                    ) : (
                      <p className="text-gray-900 font-mono">{selectedAuction.deadlineForDropOffs || '-'}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Start Date</label>
                      {isEditing ? (
                        <input type="date" name="startDate" value={editForm.startDate || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedAuction.startDate || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Start Time</label>
                      {isEditing ? (
                        <input type="time" name="startTime" value={editForm.startTime || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedAuction.startTime || '-'}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">End Date</label>
                      {isEditing ? (
                        <input type="date" name="endDate" value={editForm.endDate || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedAuction.endDate || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">End Time</label>
                      {isEditing ? (
                        <input type="time" name="endTime" value={editForm.endTime || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedAuction.endTime || '-'}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Pickup Date</label>
                    {isEditing ? (
                      <input type="date" name="pickupDate" value={editForm.pickupDate || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900 font-mono" />
                    ) : (
                      <p className="text-gray-900 font-mono">{selectedAuction.pickupDate || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Pickup Location</label>
                    {isEditing ? (
                      <input type="text" name="pickupLocation" value={editForm.pickupLocation || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white" />
                    ) : (
                      <p className="text-gray-900 font-sans">{selectedAuction.pickupLocation || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Pickup Hours / Notes</label>
                    {isEditing ? (
                      <input type="text" name="pickupHoursNotes" value={editForm.pickupHoursNotes || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white" />
                    ) : (
                      <p className="text-gray-900 font-sans">{selectedAuction.pickupHoursNotes || '-'}</p>
                    )}
                  </div>
                </div>
              )}

              {activeDetailTab === 'marketing' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Auction Theme / Focus</label>
                    {isEditing ? (
                      <input type="text" name="auctionTheme" value={editForm.auctionTheme || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white" />
                    ) : (
                      <p className="text-gray-900 font-sans font-medium">{selectedAuction.auctionTheme || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Auction Description</label>
                    {isEditing ? (
                      <textarea name="auctionDescription" value={editForm.auctionDescription || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-sans min-h-[100px]" />
                    ) : (
                      <p className="text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{selectedAuction.auctionDescription || '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Marketing Notes</label>
                    {isEditing ? (
                      <textarea name="marketingNotes" value={editForm.marketingNotes || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-sans min-h-[100px]" />
                    ) : (
                      <p className="text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{selectedAuction.marketingNotes || '-'}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                    <div className="border border-gray-200 p-4 space-y-4 bg-gray-50/50">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <input type="checkbox" name="emailCampaignSent" checked={!!editForm.emailCampaignSent} onChange={handleEditChange} className="h-4 w-4 border-gray-300 text-black focus:ring-black" />
                        ) : (
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${selectedAuction.emailCampaignSent ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                        )}
                        <span className="font-semibold text-gray-800 font-sans">Email Campaign Sent</span>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Email Campaign Date</label>
                        {isEditing ? (
                          <input type="date" name="emailCampaignDate" value={editForm.emailCampaignDate || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                        ) : (
                          <p className="text-gray-900 font-mono">{selectedAuction.emailCampaignDate || '-'}</p>
                        )}
                      </div>
                    </div>

                    <div className="border border-gray-200 p-4 space-y-4 bg-gray-50/50">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <input type="checkbox" name="socialMediaPosted" checked={!!editForm.socialMediaPosted} onChange={handleEditChange} className="h-4 w-4 border-gray-300 text-black focus:ring-black" />
                        ) : (
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${selectedAuction.socialMediaPosted ? 'bg-blue-600' : 'bg-gray-300'}`}></span>
                        )}
                        <span className="font-semibold text-gray-800 font-sans">Social Media Posted</span>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Social Post Date</label>
                        {isEditing ? (
                          <input type="date" name="socialPostDate" value={editForm.socialPostDate || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                        ) : (
                          <p className="text-gray-900 font-mono">{selectedAuction.socialPostDate || '-'}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeDetailTab === 'terms' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {(isEditing ? editForm.auctionPlatform === 'HiBid' : selectedAuction.auctionPlatform === 'HiBid') && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Default Reserve Policy</label>
                      {isEditing ? (
                        <select name="defaultReservePolicy" value={editForm.defaultReservePolicy || 'No Reserves'} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900">
                          <option value="No Reserves">No Reserves</option>
                          <option value="Reserves Allowed">Reserves Allowed</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 font-sans font-medium">{selectedAuction.defaultReservePolicy || '-'}</p>
                      )}
                    </div>
                  )}

                  {(isEditing ? editForm.auctionPlatform === 'Maxsold' : selectedAuction.auctionPlatform === 'Maxsold') && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Platform Fees (%)</label>
                      {isEditing ? (
                        <div className="relative">
                          <input type="number" name="platformFeeRate" value={editForm.platformFeeRate !== undefined ? editForm.platformFeeRate : ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] pr-6 p-2 bg-white text-gray-900 font-mono" />
                          <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500 font-sans">%</span>
                        </div>
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedAuction.platformFeeRate !== undefined ? `${selectedAuction.platformFeeRate}%` : '-'}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Default Commission Rate (%)</label>
                    {isEditing ? (
                      <div className="relative">
                        <input type="number" name="defaultCommissionRate" value={editForm.defaultCommissionRate !== undefined ? editForm.defaultCommissionRate : ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] pr-6 p-2 bg-white text-gray-900 font-mono" />
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500 font-sans">%</span>
                      </div>
                    ) : (
                      <p className="text-gray-900 font-mono">{selectedAuction.defaultCommissionRate !== undefined ? `${selectedAuction.defaultCommissionRate}%` : '-'}</p>
                    )}
                  </div>

                  {(isEditing ? editForm.auctionPlatform === 'HiBid' : selectedAuction.auctionPlatform === 'HiBid') && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Buyer's Premium Rate (%)</label>
                      {isEditing ? (
                        <div className="relative">
                          <input type="number" name="buyersPremiumRate" value={editForm.buyersPremiumRate !== undefined ? editForm.buyersPremiumRate : ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] pr-6 p-2 bg-white text-gray-900 font-mono" />
                          <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500 font-sans">%</span>
                        </div>
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedAuction.buyersPremiumRate !== undefined ? `${selectedAuction.buyersPremiumRate}%` : '-'}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Payment Due Window</label>
                    {isEditing ? (
                      <input type="text" name="paymentDueWindow" value={editForm.paymentDueWindow || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white" placeholder="e.g. 48 Hours" />
                    ) : (
                      <p className="text-gray-900 font-sans">{selectedAuction.paymentDueWindow || '-'}</p>
                    )}
                  </div>

                  {(isEditing ? editForm.auctionPlatform === 'HiBid' : selectedAuction.auctionPlatform === 'HiBid') && (
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Payment Methods Accepted</label>
                      <div className="flex flex-wrap gap-4 mt-2 bg-gray-50 p-3 border border-gray-100">
                        {['Credit', 'Debit', 'Cash', 'Paypal', 'e-Transfer'].map(method => {
                          const isChecked = (isEditing ? editForm.paymentMethodsAccepted : selectedAuction.paymentMethodsAccepted)?.includes(method) || false;
                          return (
                            <label key={method} className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!isEditing}
                                onChange={() => togglePaymentMethod('edit', method)}
                                className="h-4 w-4 border-gray-300 text-black focus:ring-black rounded-none"
                              />
                              {method}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="col-span-2 border-t border-gray-100 pt-4">
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <input type="checkbox" name="shippingOffered" checked={!!editForm.shippingOffered} onChange={handleEditChange} className="h-4 w-4 border-gray-300 text-black focus:ring-black" />
                      ) : (
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${selectedAuction.shippingOffered ? 'bg-green-600' : 'bg-gray-300'}`}></span>
                      )}
                      <span className="font-semibold text-gray-800 font-sans">Shipping Offered</span>
                    </div>
                  </div>
                </div>
              )}

              {activeDetailTab === 'operations' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Number of Consignees</label>
                    {isEditing ? (
                      <input type="number" name="numberOfConsignees" value={editForm.numberOfConsignees !== undefined ? editForm.numberOfConsignees : ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                    ) : (
                      <p className="text-gray-900 font-mono font-medium">{selectedAuction.numberOfConsignees !== undefined ? selectedAuction.numberOfConsignees : '-'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Lead Staff Member</label>
                    {isEditing ? (
                      <input type="text" name="auctioneerLeadStaff" value={editForm.auctioneerLeadStaff || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white" />
                    ) : (
                      <p className="text-gray-900 font-sans font-medium">{selectedAuction.auctioneerLeadStaff || '-'}</p>
                    )}
                  </div>

                  <div className="col-span-2 bg-amber-50/20 p-4 border border-amber-200">
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <input type="checkbox" name="settlementsComplete" checked={!!editForm.settlementsComplete} onChange={handleEditChange} className="h-4 w-4 border-amber-400 text-amber-900 focus:ring-amber-900" />
                      ) : (
                        <span className={`inline-block w-2.5 h-2.5 rounded-full ${selectedAuction.settlementsComplete ? 'bg-amber-600 animate-pulse' : 'bg-gray-300'}`}></span>
                      )}
                      <span className="font-semibold text-amber-900 font-sans">All Settlements Complete</span>
                    </div>
                    <p className="text-[10px] text-amber-700/80 mt-1">Check this flag once payouts have been disbursed and consignee reporting generated.</p>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Internal Operations Notes</label>
                    {isEditing ? (
                      <textarea name="internalNotes" value={editForm.internalNotes || ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-sans min-h-[100px]" placeholder="Consignee-hidden tracking notes, logistical summaries..." />
                    ) : (
                      <p className="text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 p-3 border border-gray-100 min-h-[50px]">{selectedAuction.internalNotes || '-'}</p>
                    )}
                  </div>
                </div>
              )}

              {activeDetailTab === 'financials' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="border border-gray-200 p-4 bg-white">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Total Lots</span>
                      {isEditing ? (
                        <input type="number" name="totalLots" value={editForm.totalLots !== undefined ? editForm.totalLots : ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-1 font-mono text-xs" />
                      ) : (
                        <p className="text-lg font-mono font-semibold text-gray-900">{selectedAuction.totalLots !== undefined ? selectedAuction.totalLots : '-'}</p>
                      )}
                    </div>
                    <div className="border border-gray-200 p-4 bg-white">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Lots Sold</span>
                      {isEditing ? (
                        <input type="number" name="totalLotsSold" value={editForm.totalLotsSold !== undefined ? editForm.totalLotsSold : ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-1 font-mono text-xs" />
                      ) : (
                        <p className="text-lg font-mono font-semibold text-green-700">{selectedAuction.totalLotsSold !== undefined ? selectedAuction.totalLotsSold : '-'}</p>
                      )}
                    </div>
                    <div className="border border-gray-200 p-4 bg-white">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Lots Unsold</span>
                      {isEditing ? (
                        <input type="number" name="totalLotsUnsold" value={editForm.totalLotsUnsold !== undefined ? editForm.totalLotsUnsold : ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-1 font-mono text-xs" />
                      ) : (
                        <p className="text-lg font-mono font-semibold text-gray-500">{selectedAuction.totalLotsUnsold !== undefined ? selectedAuction.totalLotsUnsold : '-'}</p>
                      )}
                    </div>
                    <div className="border border-gray-200 p-4 bg-white">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Sell-Through Rate</span>
                      {isEditing ? (
                        <div className="relative">
                          <input type="number" name="sellThroughRate" value={editForm.sellThroughRate !== undefined ? editForm.sellThroughRate : ''} onChange={handleEditChange} className="w-full border border-[#E5E5E0] p-1 font-mono text-xs pr-4" />
                          <span className="absolute right-1 top-1 text-gray-400 text-xs font-sans">%</span>
                        </div>
                      ) : (
                        <p className="text-lg font-mono font-semibold text-gray-900">{selectedAuction.sellThroughRate !== undefined ? `${selectedAuction.sellThroughRate}%` : '-'}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider font-sans">Gross sales & revenues</h4>
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500">Gross Sales (Hammer):</span>
                          {isEditing ? (
                            <input type="number" name="grossSales" value={editForm.grossSales !== undefined ? editForm.grossSales : ''} onChange={handleEditChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                          ) : (
                            <span className="font-semibold text-gray-900">{(selectedAuction.grossSales !== undefined && selectedAuction.grossSales !== null) ? `$${selectedAuction.grossSales.toLocaleString()}` : '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500">Buyer's Premium Collected:</span>
                          {isEditing ? (
                            <input type="number" name="totalBuyersPremiumCollected" value={editForm.totalBuyersPremiumCollected !== undefined ? editForm.totalBuyersPremiumCollected : ''} onChange={handleEditChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                          ) : (
                            <span className="font-semibold text-gray-900">{(selectedAuction.totalBuyersPremiumCollected !== undefined && selectedAuction.totalBuyersPremiumCollected !== null) ? `$${selectedAuction.totalBuyersPremiumCollected.toLocaleString()}` : '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500 font-semibold text-black">Total Event Revenue:</span>
                          {isEditing ? (
                            <input type="number" name="totalRevenue" value={editForm.totalRevenue !== undefined ? editForm.totalRevenue : ''} onChange={handleEditChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                          ) : (
                            <span className="font-semibold text-black">{(selectedAuction.totalRevenue !== undefined && selectedAuction.totalRevenue !== null) ? `$${selectedAuction.totalRevenue.toLocaleString()}` : '-'}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider font-sans">Commissions & Payouts</h4>
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500">Total Commissions Earned:</span>
                          {isEditing ? (
                            <input type="number" name="totalCommissionsEarned" value={editForm.totalCommissionsEarned !== undefined ? editForm.totalCommissionsEarned : ''} onChange={handleEditChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                          ) : (
                            <span className="font-semibold text-green-700">{(selectedAuction.totalCommissionsEarned !== undefined && selectedAuction.totalCommissionsEarned !== null) ? `$${selectedAuction.totalCommissionsEarned.toLocaleString()}` : '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500">Total Consignee Payouts:</span>
                          {isEditing ? (
                            <input type="number" name="totalConsigneePayouts" value={editForm.totalConsigneePayouts !== undefined ? editForm.totalConsigneePayouts : ''} onChange={handleEditChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                          ) : (
                            <span className="font-semibold text-blue-700">{(selectedAuction.totalConsigneePayouts !== undefined && selectedAuction.totalConsigneePayouts !== null) ? `$${selectedAuction.totalConsigneePayouts.toLocaleString()}` : '-'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 bg-gray-50/50 p-4 border">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider font-sans col-span-2">Lot price highlights</h4>
                    <div className="flex justify-between font-mono text-xs">
                      <span className="text-gray-500">Highest Lot Hammer Price:</span>
                      {isEditing ? (
                        <input type="number" name="highestHammerPrice" value={editForm.highestHammerPrice !== undefined ? editForm.highestHammerPrice : ''} onChange={handleEditChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right bg-white" />
                      ) : (
                        <span className="font-semibold text-gray-900">{(selectedAuction.highestHammerPrice !== undefined && selectedAuction.highestHammerPrice !== null) ? `$${selectedAuction.highestHammerPrice.toLocaleString()}` : '-'}</span>
                      )}
                    </div>
                    <div className="flex justify-between font-mono text-xs">
                      <span className="text-gray-500">Average Lot Hammer Price:</span>
                      {isEditing ? (
                        <input type="number" name="averageHammerPrice" value={editForm.averageHammerPrice !== undefined ? editForm.averageHammerPrice : ''} onChange={handleEditChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right bg-white" />
                      ) : (
                        <span className="font-semibold text-gray-900">{(selectedAuction.averageHammerPrice !== undefined && selectedAuction.averageHammerPrice !== null) ? `$${selectedAuction.averageHammerPrice.toLocaleString()}` : '-'}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeDetailTab === 'lots' && (
                <div className="space-y-6">
                  {/* Nested Lots Catalog Section */}
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center font-sans">
                        <ListCollapse className="h-4 w-4 mr-1.5 text-gray-600" />
                        Assigned Catalog Lots ({auctionLots.length})
                      </h4>
                      <button
                        type="button"
                        id="btn-quick-create-lot-modal"
                        onClick={() => {
                          setIsQuickCreatingLot(true);
                          setQuickLotForm({
                            lotTitle: '',
                            category: 'Furniture',
                            estimateLow: 50,
                            estimateHigh: 150,
                            commissionRate: 15,
                            consigneeId: consignees[0]?.id || consignees[0]?.consigneeId || '',
                            lotStatus: 'Active',
                            hammerPrice: null
                          });
                        }}
                        className="inline-flex items-center px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 text-xs font-semibold rounded-none cursor-pointer"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Create & Assign New Lot
                      </button>
                    </div>

                    {/* Quick assignment toolbar */}
                    <div className="bg-[#FCFCFB] border border-[#E5E5E0] p-4 mb-4 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1">
                          <label className="block text-gray-500 font-semibold mb-1">Assign an Existing Unassigned Lot</label>
                          <select
                            id="auction-assign-lot-select"
                            value={selectedLotToAssign}
                            onChange={(e) => setSelectedLotToAssign(e.target.value)}
                            className="w-full border border-gray-300 p-1.5 bg-white font-sans text-xs"
                          >
                            <option value="">-- Choose unassigned lot --</option>
                            {unassignedLots.map(l => {
                              const consigneeName = consignees.find(c => c.id === l.consigneeId || c.consigneeId === l.consigneeId)?.displayName || l.consigneeId || 'Unknown Consignee';
                              return (
                                <option key={l.id} value={l.id}>
                                  Lot #{l.lotNumber || 'No #'}: {l.lotTitle} (Consignee: {consigneeName})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                        <button
                          type="button"
                          id="btn-confirm-assign-lot"
                          onClick={handleAssignLot}
                          disabled={!selectedLotToAssign || saving}
                          className="inline-flex items-center justify-center px-4 py-1.5 bg-[#1A1A19] text-white font-semibold text-xs hover:bg-black disabled:opacity-40 cursor-pointer sm:self-end h-8"
                        >
                          Assign to Catalog
                        </button>
                      </div>
                    </div>

                    <div className="bg-white border border-gray-200 overflow-hidden text-xs">
                      <table id="auction-lots-subtable" className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Lot #</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Title</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600">Status</th>
                            <th className="px-4 py-2 text-right font-semibold text-gray-600">Hammer Price</th>
                            <th className="px-4 py-2 text-right font-semibold text-gray-600">Payout</th>
                            <th className="px-4 py-2 text-center font-semibold text-gray-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {auctionLots.map(l => (
                            <tr id={`subtable-row-lot-${l.id}`} key={l.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-mono font-medium">{l.lotNumber}</td>
                              <td className="px-4 py-2 font-medium text-gray-900 truncate max-w-[180px]">{l.lotTitle}</td>
                              <td className="px-4 py-2">
                                <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-xs border ${
                                  l.lotStatus === 'Sold' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-gray-50 text-gray-800 border-gray-200'
                                }`}>{l.lotStatus}</span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-amber-950">{l.hammerPrice !== null ? `$${l.hammerPrice}` : '-'}</td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-green-700">{l.consigneePayout !== null ? `$${l.consigneePayout}` : '-'}</td>
                              <td className="px-4 py-2 text-center flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  id={`btn-subtable-edit-lot-${l.id}`}
                                  onClick={() => {
                                    setEditingLot(l);
                                    setEditingLotForm(l);
                                  }}
                                  className="p-1 text-gray-500 hover:text-blue-600 hover:bg-gray-100 cursor-pointer"
                                  title="Edit Lot"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  id={`btn-subtable-remove-lot-${l.id}`}
                                  onClick={() => handleRemoveLot(l.id)}
                                  className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-100 cursor-pointer"
                                  title="Unassign Lot"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {auctionLots.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-6 text-center text-gray-400 italic">No lots registered to this auction event yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-modal: Quick Create & Assign New Lot */}
              {isQuickCreatingLot && (
                <div id="quick-create-lot-modal" className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-[#E5E5E0] shadow-2xl w-full max-w-xl flex flex-col text-xs">
                    <div className="px-6 py-4 border-b border-[#E5E5E0] bg-[#FCFCFB] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 font-sans">Quick-Create & Assign New Lot</h3>
                      <button
                        id="btn-close-quick-create-modal"
                        onClick={() => setIsQuickCreatingLot(false)}
                        className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <form onSubmit={handleQuickCreateLot} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block font-medium text-gray-600 mb-1">Lot Title *</label>
                          <input
                            required
                            type="text"
                            value={quickLotForm.lotTitle || ''}
                            onChange={(e) => setQuickLotForm(p => ({ ...p, lotTitle: e.target.value }))}
                            className="w-full border border-gray-300 p-1.5"
                            placeholder="e.g. Teak Mid Century Coffee Table"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Lot # (Optional)</label>
                          <input
                            type="text"
                            value={quickLotForm.lotNumber || ''}
                            onChange={(e) => setQuickLotForm(p => ({ ...p, lotNumber: e.target.value }))}
                            className="w-full border border-gray-300 p-1.5 font-mono"
                            placeholder="e.g. 104"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Category</label>
                          <select
                            value={quickLotForm.category || 'Furniture'}
                            onChange={(e) => setQuickLotForm(p => ({ ...p, category: e.target.value }))}
                            className="w-full border border-gray-300 p-1.5 bg-white"
                          >
                            <option value="Furniture">Furniture</option>
                            <option value="Lighting">Lighting</option>
                            <option value="Art">Art & Wall Decor</option>
                            <option value="Ceramics">Ceramics & Glass</option>
                            <option value="Textiles">Textiles & Rugs</option>
                            <option value="Metalware">Metalware</option>
                            <option value="Clock">Clocks & Instruments</option>
                            <option value="Other">Other Collectibles</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block font-medium text-gray-600 mb-1">Consignee Partner *</label>
                          <select
                            required
                            value={quickLotForm.consigneeId || ''}
                            onChange={(e) => setQuickLotForm(p => ({ ...p, consigneeId: e.target.value }))}
                            className="w-full border border-gray-300 p-1.5 bg-white font-sans text-xs"
                          >
                            <option value="">-- Choose Consignee --</option>
                            {consignees.map(c => (
                              <option key={c.id || c.consigneeId} value={c.id || c.consigneeId}>
                                {c.displayName} ({c.consigneeId})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Commission Rate (%)</label>
                          <input
                            type="number"
                            value={quickLotForm.commissionRate || 15}
                            onChange={(e) => setQuickLotForm(p => ({ ...p, commissionRate: Number(e.target.value) }))}
                            className="w-full border border-gray-300 p-1.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Est. Low ($)</label>
                          <input
                            type="number"
                            value={quickLotForm.estimateLow || 50}
                            onChange={(e) => setQuickLotForm(p => ({ ...p, estimateLow: Number(e.target.value) }))}
                            className="w-full border border-gray-300 p-1.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Est. High ($)</label>
                          <input
                            type="number"
                            value={quickLotForm.estimateHigh || 150}
                            onChange={(e) => setQuickLotForm(p => ({ ...p, estimateHigh: Number(e.target.value) }))}
                            className="w-full border border-gray-300 p-1.5 font-mono"
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t border-gray-100 flex justify-end gap-2 bg-white">
                        <button
                          id="btn-cancel-quick-create"
                          type="button"
                          onClick={() => setIsQuickCreatingLot(false)}
                          className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          id="btn-submit-quick-create"
                          type="submit"
                          disabled={saving}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer"
                        >
                          {saving ? 'Creating...' : 'Create & Assign'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Sub-modal: Edit Catalog Lot Details */}
              {editingLot && (
                <div id="subtable-edit-lot-modal" className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                  <div className="bg-white border border-[#E5E5E0] shadow-2xl w-full max-w-xl flex flex-col text-xs">
                    <div className="px-6 py-4 border-b border-[#E5E5E0] bg-[#FCFCFB] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 font-sans">Edit Catalog Lot #{editingLot.lotNumber}</h3>
                      <button
                        id="btn-close-edit-lot-modal"
                        onClick={() => setEditingLot(null)}
                        className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveEditingLot} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block font-medium text-gray-600 mb-1">Lot Title *</label>
                          <input
                            required
                            type="text"
                            value={editingLotForm.lotTitle || ''}
                            onChange={(e) => setEditingLotForm(p => ({ ...p, lotTitle: e.target.value }))}
                            className="w-full border border-gray-300 p-1.5"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Lot # *</label>
                          <input
                            required
                            type="text"
                            value={editingLotForm.lotNumber || ''}
                            onChange={(e) => setEditingLotForm(p => ({ ...p, lotNumber: e.target.value }))}
                            className="w-full border border-gray-300 p-1.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Status</label>
                          <select
                            value={editingLotForm.lotStatus || 'Active'}
                            onChange={(e) => setEditingLotForm(p => ({ ...p, lotStatus: e.target.value as any }))}
                            className="w-full border border-gray-300 p-1.5 bg-white"
                          >
                            <option value="Draft">Draft</option>
                            <option value="Active">Active</option>
                            <option value="Sold">Sold</option>
                            <option value="Unsold">Unsold</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block font-medium text-gray-600 mb-1">Consignee Partner *</label>
                          <select
                            required
                            value={editingLotForm.consigneeId || ''}
                            onChange={(e) => setEditingLotForm(p => ({ ...p, consigneeId: e.target.value }))}
                            className="w-full border border-gray-300 p-1.5 bg-white font-sans text-xs"
                          >
                            <option value="">-- Choose Consignee --</option>
                            {consignees.map(c => (
                              <option key={c.id || c.consigneeId} value={c.id || c.consigneeId}>
                                {c.displayName} ({c.consigneeId})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Commission Rate (%)</label>
                          <input
                            type="number"
                            value={editingLotForm.commissionRate || 15}
                            onChange={(e) => setEditingLotForm(p => ({ ...p, commissionRate: Number(e.target.value) }))}
                            className="w-full border border-gray-300 p-1.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Est. Low ($)</label>
                          <input
                            type="number"
                            value={editingLotForm.estimateLow || 0}
                            onChange={(e) => setEditingLotForm(p => ({ ...p, estimateLow: Number(e.target.value) }))}
                            className="w-full border border-gray-300 p-1.5 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-gray-600 mb-1">Est. High ($)</label>
                          <input
                            type="number"
                            value={editingLotForm.estimateHigh || 0}
                            onChange={(e) => setEditingLotForm(p => ({ ...p, estimateHigh: Number(e.target.value) }))}
                            className="w-full border border-gray-300 p-1.5 font-mono"
                          />
                        </div>

                        {editingLotForm.lotStatus === 'Sold' && (
                          <div>
                            <label className="block font-semibold text-amber-900 mb-1">Hammer Price ($) *</label>
                            <input
                              required
                              type="number"
                              value={editingLotForm.hammerPrice === null ? '' : editingLotForm.hammerPrice}
                              onChange={(e) => setEditingLotForm(p => ({ ...p, hammerPrice: e.target.value === '' ? null : Number(e.target.value) }))}
                              className="w-full border border-amber-300 p-1.5 font-mono bg-amber-50/20"
                            />
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-gray-100 flex justify-end gap-2 bg-white">
                        <button
                          id="btn-cancel-edit-lot"
                          type="button"
                          onClick={() => setEditingLot(null)}
                          className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          id="btn-submit-edit-lot"
                          type="submit"
                          disabled={saving}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-medium cursor-pointer"
                        >
                          {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Auction Modal */}
      {isAdding && (
        <div id="add-auction-modal" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddSubmit} className="bg-white border border-[#E5E5E0] shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FCFCFB]">
              <h3 className="text-lg font-medium text-gray-900 font-sans flex items-center">
                <Calendar className="h-5 w-5 mr-2 text-gray-700" />
                Schedule New Auction Event
              </h3>
              <button
                id="btn-close-add-auction"
                type="button"
                onClick={() => setIsAdding(false)}
                className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tab bar (fixed at top of modal contents) */}
            <div className="flex flex-wrap border-b border-[#E5E5E0] bg-[#FCFCFB] px-6">
              <button
                type="button"
                id="tab-add-identity"
                onClick={() => setActiveAddTab('identity')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeAddTab === 'identity' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Info className="h-3.5 w-3.5" />
                Identity & Tracking
              </button>
              <button
                type="button"
                id="tab-add-schedule"
                onClick={() => setActiveAddTab('schedule')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeAddTab === 'schedule' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Schedule & Dates
              </button>
              <button
                type="button"
                id="tab-add-marketing"
                onClick={() => setActiveAddTab('marketing')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeAddTab === 'marketing' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Megaphone className="h-3.5 w-3.5" />
                Content & Marketing
              </button>
              <button
                type="button"
                id="tab-add-terms"
                onClick={() => setActiveAddTab('terms')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeAddTab === 'terms' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                Terms & Settings
              </button>
              <button
                type="button"
                id="tab-add-operations"
                onClick={() => setActiveAddTab('operations')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeAddTab === 'operations' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Operations
              </button>
              <button
                type="button"
                id="tab-add-financials"
                onClick={() => setActiveAddTab('financials')}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                  activeAddTab === 'financials' ? 'border-[#1A1A19] text-[#1A1A19] bg-white border-b-2' : 'border-transparent text-gray-500 hover:text-gray-800'
                }`}
              >
                <DollarSign className="h-3.5 w-3.5" />
                Financials & KPI
              </button>
            </div>

            {/* Scrollable details view */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              
              {activeAddTab === 'identity' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Auction Event Name *</label>
                    <input required type="text" name="auctionName" value={addForm.auctionName} onChange={handleAddChange} placeholder="e.g. Fine Art Summer Clearance" className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Status</label>
                    <select name="auctionStatus" value={addForm.auctionStatus} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]">
                      <option value="Building">Building</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="Live">Live / Active</option>
                      <option value="Closed">Closed</option>
                      <option value="Settled">Settled</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Platform</label>
                    <select name="auctionPlatform" value={addForm.auctionPlatform} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]">
                      {activeConfig.platforms.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Internal Reference Code (optional)</label>
                    <input type="text" name="internalReferenceCode" value={addForm.internalReferenceCode} onChange={handleAddChange} placeholder="e.g. M24-05 (or blank for auto)" className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Public Catalog URL</label>
                    <input type="url" name="auctionURL" value={addForm.auctionURL} onChange={handleAddChange} placeholder="https://hibid.com/..." className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">External Platform Event ID</label>
                    <input type="text" name="externalAuctionId" value={addForm.externalAuctionId} onChange={handleAddChange} placeholder="e.g. 104592" className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                  </div>
                </div>
              )}

              {activeAddTab === 'schedule' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Deadline for Drop Offs</label>
                    <input type="date" name="deadlineForDropOffs" value={addForm.deadlineForDropOffs} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Start Date</label>
                      <input type="date" name="startDate" value={addForm.startDate} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Start Time</label>
                      <input type="time" name="startTime" value={addForm.startTime} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">End Date</label>
                      <input type="date" name="endDate" value={addForm.endDate} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">End Time</label>
                      <input type="time" name="endTime" value={addForm.endTime} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Pickup Date</label>
                    <input type="date" name="pickupDate" value={addForm.pickupDate} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Pickup Location</label>
                    <input type="text" name="pickupLocation" value={addForm.pickupLocation} onChange={handleAddChange} placeholder="e.g. Warehouse A" className="w-full border border-[#E5E5E0] p-2 bg-white" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Pickup Hours / Notes</label>
                    <input type="text" name="pickupHoursNotes" value={addForm.pickupHoursNotes} onChange={handleAddChange} placeholder="e.g. 10am - 4pm" className="w-full border border-[#E5E5E0] p-2 bg-white" />
                  </div>
                </div>
              )}

              {activeAddTab === 'marketing' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Auction Theme / Focus</label>
                    <input type="text" name="auctionTheme" value={addForm.auctionTheme} onChange={handleAddChange} placeholder="Fine Danish Mid-Century Furniture collections..." className="w-full border border-[#E5E5E0] p-2 bg-white" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Auction Description</label>
                    <textarea name="auctionDescription" value={addForm.auctionDescription} onChange={handleAddChange} placeholder="A brief public description of the auction event..." className="w-full border border-[#E5E5E0] p-2 bg-white font-sans min-h-[100px]" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Marketing Notes</label>
                    <textarea name="marketingNotes" value={addForm.marketingNotes} onChange={handleAddChange} placeholder="Target audiences, budget codes, flyers..." className="w-full border border-[#E5E5E0] p-2 bg-white font-sans min-h-[100px]" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                    <div className="border border-gray-200 p-4 space-y-4 bg-gray-50/50">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="emailCampaignSent" checked={!!addForm.emailCampaignSent} onChange={handleAddChange} className="h-4 w-4 border-gray-300 text-black focus:ring-black" />
                        <span className="font-semibold text-gray-800 font-sans text-xs">Email Campaign Sent</span>
                      </label>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Email Campaign Date</label>
                        <input type="date" name="emailCampaignDate" value={addForm.emailCampaignDate} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                      </div>
                    </div>

                    <div className="border border-gray-200 p-4 space-y-4 bg-gray-50/50">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" name="socialMediaPosted" checked={!!addForm.socialMediaPosted} onChange={handleAddChange} className="h-4 w-4 border-gray-300 text-black focus:ring-black" />
                        <span className="font-semibold text-gray-800 font-sans text-xs">Social Media Posted</span>
                      </label>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Social Post Date</label>
                        <input type="date" name="socialPostDate" value={addForm.socialPostDate} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeAddTab === 'terms' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {addForm.auctionPlatform === 'HiBid' && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Default Reserve Policy</label>
                      <select name="defaultReservePolicy" value={addForm.defaultReservePolicy} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white text-gray-900">
                        <option value="No Reserves">No Reserves</option>
                        <option value="Reserves Allowed">Reserves Allowed</option>
                      </select>
                    </div>
                  )}

                  {addForm.auctionPlatform === 'Maxsold' && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Platform Fees (%)</label>
                      <div className="relative">
                        <input type="number" name="platformFeeRate" value={addForm.platformFeeRate !== undefined ? addForm.platformFeeRate : 18} onChange={handleAddChange} className="w-full border border-[#E5E5E0] pr-6 p-2 bg-white text-gray-900 font-mono" />
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500 font-sans">%</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Default Commission Rate (%)</label>
                    <div className="relative">
                      <input type="number" name="defaultCommissionRate" value={addForm.defaultCommissionRate !== undefined ? addForm.defaultCommissionRate : 15} onChange={handleAddChange} className="w-full border border-[#E5E5E0] pr-6 p-2 bg-white text-gray-900 font-mono" />
                      <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500 font-sans">%</span>
                    </div>
                  </div>

                  {addForm.auctionPlatform === 'HiBid' && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Buyer's Premium Rate (%)</label>
                      <div className="relative">
                        <input type="number" name="buyersPremiumRate" value={addForm.buyersPremiumRate !== undefined ? addForm.buyersPremiumRate : 18} onChange={handleAddChange} className="w-full border border-[#E5E5E0] pr-6 p-2 bg-white text-gray-900 font-mono" />
                        <span className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-500 font-sans">%</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Payment Due Window</label>
                    <input type="text" name="paymentDueWindow" value={addForm.paymentDueWindow} onChange={handleAddChange} placeholder="e.g. 48 Hours" className="w-full border border-[#E5E5E0] p-2 bg-white" />
                  </div>

                  {addForm.auctionPlatform === 'HiBid' && (
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Payment Methods Accepted</label>
                      <div className="flex flex-wrap gap-4 mt-2 bg-gray-50 p-3 border border-gray-100">
                        {['Credit', 'Debit', 'Cash', 'Paypal', 'e-Transfer'].map(method => {
                          const isChecked = addForm.paymentMethodsAccepted?.includes(method) || false;
                          return (
                            <label key={method} className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePaymentMethod('add', method)}
                                className="h-4 w-4 border-gray-300 text-black focus:ring-black rounded-none"
                              />
                              {method}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="col-span-2 border-t border-gray-100 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="shippingOffered" checked={!!addForm.shippingOffered} onChange={handleAddChange} className="h-4 w-4 border-gray-300 text-black focus:ring-black" />
                      <span className="font-semibold text-gray-800 font-sans text-xs">Shipping Offered</span>
                    </label>
                  </div>
                </div>
              )}

              {activeAddTab === 'operations' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Number of Consignees</label>
                    <input type="number" name="numberOfConsignees" value={addForm.numberOfConsignees !== undefined ? addForm.numberOfConsignees : 0} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white font-mono" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Lead Staff Member</label>
                    <input type="text" name="auctioneerLeadStaff" value={addForm.auctioneerLeadStaff} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-2 bg-white" />
                  </div>

                  <div className="col-span-2 bg-amber-50/20 p-4 border border-amber-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" name="settlementsComplete" checked={!!addForm.settlementsComplete} onChange={handleAddChange} className="h-4 w-4 border-amber-400 text-amber-900 focus:ring-amber-900" />
                      <span className="font-semibold text-amber-900 font-sans text-xs">All Settlements Complete</span>
                    </label>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Internal Operations Notes</label>
                    <textarea name="internalNotes" value={addForm.internalNotes} onChange={handleAddChange} placeholder="Internal tracking details..." className="w-full border border-[#E5E5E0] p-2 bg-white font-sans min-h-[100px]" />
                  </div>
                </div>
              )}

              {activeAddTab === 'financials' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="border border-gray-200 p-4 bg-white">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Total Lots</span>
                      <input type="number" name="totalLots" value={addForm.totalLots !== undefined ? addForm.totalLots : 0} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-1 font-mono text-xs" />
                    </div>
                    <div className="border border-gray-200 p-4 bg-white">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Lots Sold</span>
                      <input type="number" name="totalLotsSold" value={addForm.totalLotsSold !== undefined ? addForm.totalLotsSold : 0} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-1 font-mono text-xs" />
                    </div>
                    <div className="border border-gray-200 p-4 bg-white">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Lots Unsold</span>
                      <input type="number" name="totalLotsUnsold" value={addForm.totalLotsUnsold !== undefined ? addForm.totalLotsUnsold : 0} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-1 font-mono text-xs" />
                    </div>
                    <div className="border border-gray-200 p-4 bg-white">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 font-sans mb-1">Sell-Through Rate</span>
                      <div className="relative">
                        <input type="number" name="sellThroughRate" value={addForm.sellThroughRate !== undefined ? addForm.sellThroughRate : 0} onChange={handleAddChange} className="w-full border border-[#E5E5E0] p-1 font-mono text-xs pr-4" />
                        <span className="absolute right-1 top-1 text-gray-400 text-xs font-sans">%</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider font-sans">Gross sales & revenues</h4>
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500">Gross Sales (Hammer):</span>
                          <input type="number" name="grossSales" value={addForm.grossSales !== undefined ? addForm.grossSales : 0} onChange={handleAddChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500">Buyer's Premium Collected:</span>
                          <input type="number" name="totalBuyersPremiumCollected" value={addForm.totalBuyersPremiumCollected !== undefined ? addForm.totalBuyersPremiumCollected : 0} onChange={handleAddChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500 font-semibold text-black">Total Event Revenue:</span>
                          <input type="number" name="totalRevenue" value={addForm.totalRevenue !== undefined ? addForm.totalRevenue : 0} onChange={handleAddChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider font-sans">Commissions & Payouts</h4>
                      <div className="space-y-3 font-mono text-xs">
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500">Total Commissions Earned:</span>
                          <input type="number" name="totalCommissionsEarned" value={addForm.totalCommissionsEarned !== undefined ? addForm.totalCommissionsEarned : 0} onChange={handleAddChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                        </div>
                        <div className="flex justify-between border-b pb-2">
                          <span className="text-gray-500">Total Consignee Payouts:</span>
                          <input type="number" name="totalConsigneePayouts" value={addForm.totalConsigneePayouts !== undefined ? addForm.totalConsigneePayouts : 0} onChange={handleAddChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100 bg-gray-50/50 p-4 border">
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider font-sans col-span-2">Lot price highlights</h4>
                    <div className="flex justify-between font-mono text-xs">
                      <span className="text-gray-500">Highest Lot Hammer Price:</span>
                      <input type="number" name="highestHammerPrice" value={addForm.highestHammerPrice !== undefined ? addForm.highestHammerPrice : 0} onChange={handleAddChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right bg-white" />
                    </div>
                    <div className="flex justify-between font-mono text-xs">
                      <span className="text-gray-500">Average Lot Hammer Price:</span>
                      <input type="number" name="averageHammerPrice" value={addForm.averageHammerPrice !== undefined ? addForm.averageHammerPrice : 0} onChange={handleAddChange} className="border border-[#E5E5E0] p-0.5 w-24 text-right bg-white" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E5E5E0] bg-[#FCFCFB] flex justify-end gap-3">
              <button
                id="btn-cancel-add-auction"
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-submit-add-auction"
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1A1A19] hover:bg-black cursor-pointer"
              >
                {saving ? 'Creating...' : 'Create Auction Event'}
              </button>
            </div>
          </form>
        </div>
      )}

      <MaxsoldCSVImporter
        isOpen={isMaxsoldModalOpen}
        onClose={() => setIsMaxsoldModalOpen(false)}
        auctions={auctions}
        lots={lots}
        consignees={consignees}
        onSuccess={onRefresh}
        config={config}
      />
    </div>
  );
}
