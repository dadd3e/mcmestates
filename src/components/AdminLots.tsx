import React, { useState, useMemo, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Lot, Consignee, Auction } from '../types';
import { calculateLotFinancials } from '../lib/financials';
import { getConsigneeAcronym, generateNextUniqueItemId, getLotUniqueItemId } from '../lib/idGenerator';
import { Search, Plus, X, Edit2, Check, Filter, Image, Link, DollarSign, Database } from 'lucide-react';
import { ImageUploader } from './ImageUploader';
import MaxsoldCSVImporter from './MaxsoldCSVImporter';

import { PlatformConfig, DEFAULT_PLATFORM_CONFIG } from '../lib/platformConfig';

interface AdminLotsProps {
  lots: Lot[];
  consignees: Consignee[];
  auctions: Auction[];
  onRefresh: () => void;
  config?: PlatformConfig;
}

export default function AdminLots({ lots, consignees, auctions, onRefresh, config }: AdminLotsProps) {
  const activeConfig = config || DEFAULT_PLATFORM_CONFIG;
  const [search, setSearch] = useState('');
  const [filterAuction, setFilterAuction] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterConsignee, setFilterConsignee] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [isMaxsoldModalOpen, setIsMaxsoldModalOpen] = useState(false);

  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);

  const liveComputed = useMemo(() => {
    if (!selectedLot) return null;
    const matchedAuction = auctions.find(a => a.id === selectedLot.auctionId);
    const matchedConsignee = consignees.find(c => c.id === selectedLot.consigneeId || c.consigneeId === selectedLot.consigneeId);
    return calculateLotFinancials(selectedLot, matchedAuction, matchedConsignee, activeConfig);
  }, [selectedLot, auctions, consignees, activeConfig]);

  const [isEditing, setIsEditing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addModalTab, setAddModalTab] = useState<'general' | 'selfService'>('general');

  // Forms state
  const [editForm, setEditForm] = useState<Partial<Lot>>({});
  const [addForm, setAddForm] = useState<Partial<Lot>>({
    lotNumber: '',
    lotTitle: '',
    lotStatus: activeConfig.defaultLotStatus || 'Pending',
    consigneeId: '',
    auctionId: '',
    dateReceived: new Date().toISOString().split('T')[0],
    dateListed: '',
    dateSold: '',
    internalSKU: '',
    storageLocation: '',
    category: activeConfig.operations?.defaultLotCategory || 'Furniture',
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
    keywords: '',
    primaryPhotoURL: '',
    additionalPhotoURLs: [],
    photoCount: 0,
    videoURL: '',
    provenanceDocURL: '',
    reserveRequested: 'No',
    reservePrice: 0,
    reserveMet: false,
    hammerPrice: null,
    buyersPremium: null,
    totalSalePrice: null,
    commissionRate: activeConfig.defaultCommissionRate || 15,
    commissionAmount: null,
    consigneePayout: null,
    payoutStatus: 'Pending',
    payoutDate: '',
    shippingAvailable: true,
    shippingWeightClass: 'Medium',
    buyerNameId: '',
    unsoldActionTaken: '',
    internalNotes: '',
    estimateLow: activeConfig.operations?.defaultLotEstimateLow ?? 50,
    estimateHigh: activeConfig.operations?.defaultLotEstimateHigh ?? 150
  });

  // Unique categories list
  const categories = useMemo(() => {
    const derived = lots.map(l => l.category).filter(Boolean);
    const configured = activeConfig.categories || [];
    return Array.from(new Set([...configured, ...derived]));
  }, [lots, activeConfig.categories]);

  // Search and Filter Logic
  const filteredLots = lots.filter(lot => {
    const term = search.toLowerCase();
    const itemUniqueId = getLotUniqueItemId(lot, consignees).toLowerCase();
    const matchesSearch = 
      lot.lotTitle.toLowerCase().includes(term) ||
      lot.lotNumber.toLowerCase().includes(term) ||
      itemUniqueId.includes(term) ||
      (lot.uniqueItemId && lot.uniqueItemId.toLowerCase().includes(term)) ||
      (lot.internalSKU && lot.internalSKU.toLowerCase().includes(term));

    const matchesAuction = filterAuction === 'all' || lot.auctionId === filterAuction;
    const matchesStatus = filterStatus === 'all' || lot.lotStatus === filterStatus;
    const matchesConsignee = filterConsignee === 'all' || lot.consigneeId === filterConsignee;
    const matchesCategory = filterCategory === 'all' || lot.category === filterCategory;

    return matchesSearch && matchesAuction && matchesStatus && matchesConsignee && matchesCategory;
  });

  // Status Counts for Top Filter Tabs
  const statusCounts = useMemo(() => {
    const baseLots = lots.filter(lot => {
      const term = search.toLowerCase();
      const itemUniqueId = getLotUniqueItemId(lot, consignees).toLowerCase();
      const matchesSearch = 
        lot.lotTitle.toLowerCase().includes(term) ||
        lot.lotNumber.toLowerCase().includes(term) ||
        itemUniqueId.includes(term) ||
        (lot.uniqueItemId && lot.uniqueItemId.toLowerCase().includes(term)) ||
        (lot.internalSKU && lot.internalSKU.toLowerCase().includes(term));

      const matchesAuction = filterAuction === 'all' || lot.auctionId === filterAuction;
      const matchesConsignee = filterConsignee === 'all' || lot.consigneeId === filterConsignee;
      const matchesCategory = filterCategory === 'all' || lot.category === filterCategory;

      return matchesSearch && matchesAuction && matchesConsignee && matchesCategory;
    });

    return {
      all: baseLots.length,
      Active: baseLots.filter(l => l.lotStatus === 'Active').length,
      Pending: baseLots.filter(l => l.lotStatus === 'Pending').length,
      Sold: baseLots.filter(l => l.lotStatus === 'Sold').length,
      Unsold: baseLots.filter(l => l.lotStatus === 'Unsold').length,
    };
  }, [lots, search, filterAuction, filterConsignee, filterCategory, consignees]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<'25' | '50' | '100' | 'all'>('25');

  // Reset pagination when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterAuction, filterStatus, filterConsignee, filterCategory, itemsPerPage]);

  const pageSize = itemsPerPage === 'all' ? filteredLots.length : Number(itemsPerPage);
  const totalPages = Math.ceil(filteredLots.length / (pageSize || 1)) || 1;
  const validCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedLots = useMemo(() => {
    if (itemsPerPage === 'all') return filteredLots;
    const start = (validCurrentPage - 1) * pageSize;
    return filteredLots.slice(start, start + pageSize);
  }, [filteredLots, validCurrentPage, pageSize, itemsPerPage]);

  const getConsigneeName = (consigneeId: string) => {
    const c = consignees.find(x => x.id === consigneeId);
    return c ? c.displayName : 'Unknown Consignee';
  };

  const getAuctionName = (auctionId: string | null) => {
    if (!auctionId) return 'Not Assigned (Pending)';
    const a = auctions.find(x => x.id === auctionId);
    return a ? a.auctionName : 'Unknown Auction';
  };

  const handleRowClick = (lot: Lot) => {
    setSelectedLot(lot);
    setEditForm(lot);
    setIsEditing(false);
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (['weight', 'quantity', 'reservePrice', 'commissionRate'].includes(name)) {
      finalValue = Number(value);
    } else if (name === 'hammerPrice') {
      finalValue = value === '' ? null : Number(value);
    }
    setEditForm(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleAddChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (['weight', 'quantity', 'reservePrice', 'commissionRate'].includes(name)) {
      finalValue = Number(value);
    } else if (name === 'hammerPrice') {
      finalValue = value === '' ? null : Number(value);
    }

    setAddForm(prev => {
      const updated = { ...prev, [name]: finalValue };
      if (name === 'consigneeId' && value) {
        const selectedC = consignees.find(c => c.id === value || c.consigneeId === value);
        if (selectedC) {
          const acronym = getConsigneeAcronym(selectedC);
          updated.uniqueItemId = generateNextUniqueItemId(acronym, lots, consignees, selectedC.id);
        }
      }
      return updated;
    });
  };

  // Immediate Client-Side calculation for robust previews
  const calculateComputedFields = (data: Partial<Lot>) => {
    const matchedAuction = auctions.find(a => a.id === data.auctionId);
    const matchedConsignee = consignees.find(c => c.id === data.consigneeId);
    
    const computed = calculateLotFinancials(data, matchedAuction, matchedConsignee, activeConfig);
    return {
      ...data,
      ...computed
    };
  };

  const handleSaveEdit = async () => {
    if (!selectedLot?.id) return;
    setSaving(true);
    try {
      // Calculate locally to update state immediately before writing to Firestore
      const calculatedForm = calculateComputedFields(editForm);
      const docRef = doc(db, 'lots', selectedLot.id);
      await updateDoc(docRef, calculatedForm);
      setSelectedLot({ ...selectedLot, ...calculatedForm } as Lot);
      setIsEditing(false);
      onRefresh();
    } catch (err) {
      console.error("Error saving lot edits: ", err);
      alert("Error saving lot updates.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.consigneeId) {
      alert("Please select a consignee.");
      return;
    }
    setSaving(true);
    try {
      const calculatedForm = calculateComputedFields(addForm);
      const matchedConsignee = consignees.find(c => c.id === addForm.consigneeId || c.consigneeId === addForm.consigneeId);
      const acronym = getConsigneeAcronym(matchedConsignee);
      const finalUniqueItemId = addForm.uniqueItemId || generateNextUniqueItemId(acronym, lots, consignees, matchedConsignee?.id);
      
      // Auto assign sku and lotNumber if empty
      const finalLotNumber = addForm.lotNumber || `${lots.length + 101}`;
      const finalSku = addForm.internalSKU || `SKU-${addForm.category?.substring(0, 3).toUpperCase()}-${finalLotNumber}`;
      
      const finalForm = {
        ...calculatedForm,
        uniqueItemId: finalUniqueItemId,
        lotNumber: finalLotNumber,
        internalSKU: finalSku,
        auctionId: addForm.auctionId || null
      };

      const collRef = collection(db, 'lots');
      await addDoc(collRef, finalForm);
      setIsAdding(false);
      onRefresh();
    } catch (err) {
      console.error("Error creating new lot: ", err);
      alert("Error creating lot document.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="admin-lots" className="space-y-6 font-sans">
      {/* Search and Filters Container */}
      <div className="bg-white border border-[#E5E5E0] overflow-hidden shadow-xs">
        {/* Top Status Filter Tabs */}
        <div className="border-b border-[#E5E5E0] bg-[#FCFCFB] flex flex-wrap gap-1 px-4 pt-2">
          {[
            { id: 'all', label: 'All Lots' },
            { id: 'Active', label: 'Active / Live' },
            { id: 'Pending', label: 'Pending' },
            { id: 'Sold', label: 'Sold' },
            { id: 'Unsold', label: 'Unsold' },
          ].map((tab) => {
            const isActive = filterStatus === tab.id;
            const count = tab.id === 'all' ? statusCounts.all : (statusCounts[tab.id as keyof typeof statusCounts] || 0);
            return (
              <button
                key={tab.id}
                id={`tab-status-${tab.id.toLowerCase()}`}
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

        {/* Search Bar & Action Buttons */}
        <div className="p-4 space-y-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-md w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                id="lot-search"
                type="text"
                placeholder="Search lots by number, title, SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-[#E5E5E0] focus:outline-none focus:ring-1 focus:ring-[#1A1A19] sm:text-sm bg-[#FCFCFB]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
              <button
                id="btn-add-lot"
                onClick={() => { 
                  setAddForm({
                    lotNumber: '',
                    lotTitle: '',
                    lotStatus: activeConfig.defaultLotStatus || 'Pending',
                    consigneeId: '',
                    auctionId: '',
                    dateReceived: new Date().toISOString().split('T')[0],
                    dateListed: '',
                    dateSold: '',
                    internalSKU: '',
                    storageLocation: '',
                    category: activeConfig.operations?.defaultLotCategory || 'Furniture',
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
                    keywords: '',
                    primaryPhotoURL: '',
                    additionalPhotoURLs: [],
                    photoCount: 0,
                    videoURL: '',
                    provenanceDocURL: '',
                    reserveRequested: 'No',
                    reservePrice: 0,
                    reserveMet: false,
                    hammerPrice: null,
                    buyersPremium: null,
                    totalSalePrice: null,
                    commissionRate: activeConfig.defaultCommissionRate || 15,
                    commissionAmount: null,
                    consigneePayout: null,
                    payoutStatus: 'Pending',
                    payoutDate: '',
                    shippingAvailable: true,
                    shippingWeightClass: 'Medium',
                    buyerNameId: '',
                    unsoldActionTaken: '',
                    internalNotes: '',
                    estimateLow: activeConfig.operations?.defaultLotEstimateLow ?? 50,
                    estimateHigh: activeConfig.operations?.defaultLotEstimateHigh ?? 150
                  });
                  setAddModalTab('general'); 
                  setIsAdding(true); 
                }}
                className="w-full md:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium text-white bg-[#1A1A19] hover:bg-black cursor-pointer shadow-xs"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Lot / Item
              </button>
              <button
                id="btn-maxsold-import-lots"
                type="button"
                onClick={() => setIsMaxsoldModalOpen(true)}
                className="w-full md:w-auto inline-flex items-center justify-center px-4 py-2 border border-blue-600 bg-blue-50 text-blue-900 hover:bg-blue-100 font-semibold text-xs cursor-pointer transition-colors"
              >
                <Database className="h-4 w-4 mr-2 text-blue-700" />
                Maxsold Bulk Import
              </button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
            <div>
              <label className="block text-gray-400 font-medium mb-1 uppercase tracking-wider font-sans">Filter Auction</label>
              <select
                id="filter-auction"
                value={filterAuction}
                onChange={(e) => setFilterAuction(e.target.value)}
                className="w-full border border-[#E5E5E0] p-1.5 bg-white focus:outline-none"
              >
                <option value="all">All Auctions</option>
                {auctions.map(a => (
                  <option key={a.id} value={a.id}>{a.auctionName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 font-medium mb-1 uppercase tracking-wider font-sans">Filter Status</label>
              <select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full border border-[#E5E5E0] p-1.5 bg-white focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Active">Active / Live</option>
                <option value="Sold">Sold</option>
                <option value="Unsold">Unsold</option>
                <option value="Withdrawn">Withdrawn</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-400 font-medium mb-1 uppercase tracking-wider font-sans">Filter Consignee</label>
              <select
                id="filter-consignee"
                value={filterConsignee}
                onChange={(e) => setFilterConsignee(e.target.value)}
                className="w-full border border-[#E5E5E0] p-1.5 bg-white focus:outline-none"
              >
                <option value="all">All Consignees</option>
                {consignees.map(c => (
                  <option key={c.id} value={c.id || c.consigneeId}>{c.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 font-medium mb-1 uppercase tracking-wider font-sans">Category</label>
              <select
                id="filter-category"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full border border-[#E5E5E0] p-1.5 bg-white focus:outline-none"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Lot list table */}
      <div className="bg-white border border-[#E5E5E0] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table id="lots-table" className="w-full min-w-[900px] divide-y divide-[#E5E5E0]">
            <thead className="bg-[#FCFCFB]">
              <tr>
                <th className="px-3 py-3.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider font-sans w-12">Photo</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Item ID</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Lot #</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Title</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Consignee</th>
                <th className="px-5 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Auction</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Status</th>
                <th className="px-4 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Category</th>
                <th className="px-5 py-3.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Hammer Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0]">
              {paginatedLots.map((lot) => (
                <tr
                  id={`row-lot-${lot.id}`}
                  key={lot.id}
                  onClick={() => handleRowClick(lot)}
                  className="hover:bg-[#FCFCFB] cursor-pointer transition-colors duration-100"
                >
                  <td className="px-3 py-2.5 whitespace-nowrap text-center align-middle">
                    {lot.primaryPhotoURL && !lot.primaryPhotoURL.includes('unsplash.com') ? (
                      <img
                        src={lot.primaryPhotoURL}
                        alt={lot.lotTitle}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 object-cover border border-gray-200 bg-white inline-block shrink-0 shadow-2xs"
                      />
                    ) : (
                      <div
                        className="w-8 h-8 border border-gray-200 bg-gray-50 flex items-center justify-center inline-block shrink-0 text-[8px] text-gray-400 font-medium leading-none text-center p-0.5"
                        title="Image Not Available"
                      >
                        No Img
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm font-mono font-bold text-gray-900 bg-gray-50/60">{getLotUniqueItemId(lot, consignees)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-sm font-mono font-medium text-gray-600">{lot.lotNumber || '-'}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{lot.lotTitle}</div>
                    <div className="text-xs text-gray-400 font-mono">{lot.internalSKU || '-'}</div>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-600">{getConsigneeName(lot.consigneeId)}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-500 truncate max-w-[150px]">{getAuctionName(lot.auctionId)}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium ${
                      lot.lotStatus === 'Sold' ? 'bg-green-50 text-green-700 border border-green-200' :
                      lot.lotStatus === 'Active' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                      lot.lotStatus === 'Pending' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      lot.lotStatus === 'Unsold' ? 'bg-gray-100 text-gray-700 border border-gray-300' :
                      'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {lot.lotStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-sm text-gray-500">{lot.category}</td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-sm text-right font-mono text-gray-900">
                    {lot.hammerPrice !== null ? `$${lot.hammerPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                  </td>
                </tr>
              ))}
              {filteredLots.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-sm text-gray-500">
                    No lots found matching query filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls Footer */}
        <div className="px-6 py-3.5 bg-[#FCFCFB] border-t border-[#E5E5E0] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-sans">
          <div className="flex items-center gap-3 text-gray-600">
            <span className="font-medium">Show</span>
            <select
              id="select-items-per-page"
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(e.target.value as any)}
              className="border border-[#E5E5E0] px-2.5 py-1 bg-white font-mono font-semibold text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer shadow-2xs"
            >
              <option value="25">25 per page</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
              <option value="all">All items ({filteredLots.length})</option>
            </select>
            <span className="text-gray-500">
              {itemsPerPage === 'all' ? (
                <>Showing all <strong className="text-gray-900 font-mono">{filteredLots.length}</strong> items</>
              ) : (
                <>
                  Showing <strong className="text-gray-900 font-mono">
                    {filteredLots.length === 0 ? 0 : (validCurrentPage - 1) * pageSize + 1}
                  </strong>–<strong className="text-gray-900 font-mono">
                    {Math.min(validCurrentPage * pageSize, filteredLots.length)}
                  </strong> of <strong className="text-gray-900 font-mono">{filteredLots.length}</strong> items
                </>
              )}
            </span>
          </div>

          {itemsPerPage !== 'all' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                id="btn-page-first"
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={validCurrentPage === 1}
                className="px-2.5 py-1 border border-[#E5E5E0] bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-[11px] cursor-pointer"
              >
                « First
              </button>
              <button
                id="btn-page-prev"
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
                id="btn-page-next"
                type="button"
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={validCurrentPage === totalPages}
                className="px-2.5 py-1 border border-[#E5E5E0] bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer"
              >
                Next
              </button>
              <button
                id="btn-page-last"
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
      </div>

      {/* Lot detail modal */}
      {selectedLot && (
        <div id="lot-detail-modal" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E0] shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FCFCFB]">
              <div>
                <h3 className="text-lg font-medium text-gray-900 font-sans">
                  {isEditing ? 'Edit Lot Item' : 'Lot Item Details'}
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">Item ID: <span className="text-gray-900 font-bold">{getLotUniqueItemId(selectedLot, consignees)}</span> • Lot #{selectedLot.lotNumber} • SKU: {selectedLot.internalSKU || '-'}</p>
              </div>
              <div className="flex items-center gap-3">
                {isEditing ? (
                  <button
                    id="btn-save-lot"
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="inline-flex items-center px-3 py-1.5 bg-green-600 text-white hover:bg-green-700 text-xs font-medium cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Save Lots
                  </button>
                ) : (
                  <button
                    id="btn-edit-lot"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center px-3 py-1.5 bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 text-xs font-medium cursor-pointer"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Edit Lot
                  </button>
                )}
                <button
                  id="btn-close-lot"
                  onClick={() => { setSelectedLot(null); setIsEditing(false); }}
                  className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Scrollable details contents */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Photo Column */}
                <div className="space-y-4">
                  {isEditing ? (
                    <ImageUploader
                      primaryPhotoURL={editForm.primaryPhotoURL || ''}
                      additionalPhotoURLs={editForm.additionalPhotoURLs || []}
                      onChange={(primary, additionals) => setEditForm(prev => ({
                        ...prev,
                        primaryPhotoURL: primary,
                        additionalPhotoURLs: additionals,
                        photoCount: (primary ? 1 : 0) + additionals.length
                      }))}
                    />
                  ) : (
                    <>
                      <div className="border border-gray-200 bg-gray-50 aspect-square flex items-center justify-center relative overflow-hidden">
                        {selectedLot.primaryPhotoURL && !selectedLot.primaryPhotoURL.includes('unsplash.com') ? (
                          <img src={selectedLot.primaryPhotoURL} alt={selectedLot.lotTitle} referrerPolicy="no-referrer" className="object-cover w-full h-full" />
                        ) : (
                          <div className="text-center p-4">
                            <Image className="h-12 w-12 text-gray-300 mx-auto mb-2" />
                            <span className="text-xs text-gray-400 font-medium">Image Not Available</span>
                          </div>
                        )}
                      </div>
                      {selectedLot.additionalPhotoURLs && selectedLot.additionalPhotoURLs.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">Additional Photos ({selectedLot.additionalPhotoURLs.length})</label>
                          <div className="grid grid-cols-4 gap-2">
                            {selectedLot.additionalPhotoURLs.map((url, i) => (
                              <div key={i} className="border border-gray-200 bg-gray-50 aspect-square overflow-hidden rounded">
                                <img src={url} alt={`Additional ${i}`} referrerPolicy="no-referrer" className="object-cover w-full h-full" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Details Column 1 */}
                <div className="space-y-4 col-span-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Lot Title</label>
                      {isEditing ? (
                        <input type="text" name="lotTitle" value={editForm.lotTitle || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 font-semibold" />
                      ) : (
                        <p className="font-semibold text-gray-900 text-base">{selectedLot.lotTitle}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                      {isEditing ? (
                        <select name="lotStatus" value={editForm.lotStatus} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5">
                          <option value="Pending">Pending</option>
                          <option value="Active">Active</option>
                          <option value="Sold">Sold</option>
                          <option value="Unsold">Unsold</option>
                          <option value="Withdrawn">Withdrawn</option>
                        </select>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 border">
                          {selectedLot.lotStatus}
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Consignee</label>
                      {isEditing ? (
                        <select name="consigneeId" value={editForm.consigneeId} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5">
                          {consignees.map(c => (
                            <option key={c.id} value={c.id}>{c.displayName}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-gray-900 font-medium">{getConsigneeName(selectedLot.consigneeId)}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Auction</label>
                      {isEditing ? (
                        <select name="auctionId" value={editForm.auctionId || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5">
                          <option value="">(None - Keep Pending)</option>
                          {auctions.map(a => (
                            <option key={a.id} value={a.id}>{a.auctionName}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-gray-900">{getAuctionName(selectedLot.auctionId)}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                      {isEditing ? (
                        <select name="category" value={editForm.category || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 bg-white">
                          <option value="">(None)</option>
                          {activeConfig.categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-gray-900">{selectedLot.category || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Subcategory</label>
                      {isEditing ? (
                        <input type="text" name="subcategory" value={editForm.subcategory || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5" />
                      ) : (
                        <p className="text-gray-900">{selectedLot.subcategory || '-'}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Catalog Details */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Cataloging & Condition</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Condition</label>
                    {isEditing ? (
                      <select name="condition" value={editForm.condition} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5">
                        <option value="Mint">Mint</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Very Good">Very Good</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                        <option value="Poor">Poor</option>
                        <option value="As-Is">As-Is</option>
                      </select>
                    ) : (
                      <p className="text-gray-900 font-medium">{selectedLot.condition}</p>
                    )}
                  </div>
                </div>

                {/* Dynamic Custom & Descriptive Fields rendering in Edit Lot / View Lot modal */}
                {activeConfig.customFields && activeConfig.customFields.length > 0 && (
                  <div className="mt-4 bg-[#FCFCFB] p-4 border border-gray-100 rounded-none">
                    <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Descriptive & Custom Metadata Fields (Customizable in Settings)</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {activeConfig.customFields.map((field) => {
                        const val = isEditing ? ((editForm as any)[field.key] || '') : ((selectedLot as any)[field.key] || '');
                        const isNotes = field.key === 'conditionNotes';
                        return (
                          <div key={field.key} className={isNotes ? 'md:col-span-2' : ''}>
                            <label className="block font-medium text-gray-500 mb-1">
                              {field.label} {isEditing && field.required && <span className="text-red-500">*</span>}
                            </label>
                            {isEditing ? (
                              field.type === 'select' ? (
                                <select
                                  name={field.key}
                                  value={val}
                                  onChange={handleEditChange}
                                  required={field.required}
                                  className="w-full border border-gray-300 p-1.5 bg-white text-xs"
                                >
                                  <option value="">-- Select option --</option>
                                  {field.options?.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : isNotes ? (
                                <textarea
                                  name={field.key}
                                  value={val}
                                  onChange={handleEditChange}
                                  required={field.required}
                                  rows={2}
                                  placeholder={field.placeholder || ''}
                                  className="w-full border border-gray-300 p-2 text-xs bg-white"
                                />
                              ) : (
                                <input
                                  type={field.type}
                                  name={field.key}
                                  value={val}
                                  onChange={handleEditChange}
                                  required={field.required}
                                  placeholder={field.placeholder || ''}
                                  className="w-full border border-gray-300 p-1.5 text-xs bg-white"
                                />
                              )
                            ) : (
                              <p className={isNotes ? 'text-gray-700 bg-gray-50 p-2 border italic' : 'text-gray-900 font-semibold'}>
                                {val || <span className="text-gray-300 italic font-normal">Not set</span>}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Full Description</label>
                  {isEditing ? (
                    <textarea name="fullDescription" value={editForm.fullDescription || ''} onChange={handleEditChange} rows={3} className="w-full border border-gray-300 p-2" />
                  ) : (
                    <p className="text-gray-700">{selectedLot.fullDescription || 'No description cataloged.'}</p>
                  )}
                </div>
              </div>

              {/* Section 3: Financials */}
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Financials & Sales results</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Reserve Price ($)</label>
                    {isEditing ? (
                      <input type="number" name="reservePrice" value={editForm.reservePrice || 0} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5" />
                    ) : (
                      <p className="font-mono font-medium text-gray-900">${selectedLot.reservePrice ? selectedLot.reservePrice.toFixed(2) : '0.00'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Reserve Requested</label>
                    {isEditing ? (
                      <select name="reserveRequested" value={editForm.reserveRequested || 'No'} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    ) : (
                      <p className="font-medium text-gray-900">{selectedLot.reserveRequested || 'No'}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Commission Rate (%)</label>
                    {isEditing ? (
                      <input type="number" name="commissionRate" value={editForm.commissionRate || 15} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5" />
                    ) : (
                      <p className="font-mono text-gray-900">{selectedLot.commissionRate}%</p>
                    )}
                  </div>
                </div>

                {/* Item Tracking & Dates */}
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">Item Tracking & Dates</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date Received</label>
                      {isEditing ? (
                        <input type="date" name="dateReceived" value={editForm.dateReceived || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 text-xs bg-white" />
                      ) : (
                        <p className="font-mono text-gray-950 text-xs">{selectedLot.dateReceived || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date Listed</label>
                      {isEditing ? (
                        <input type="date" name="dateListed" value={editForm.dateListed || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 text-xs bg-white" />
                      ) : (
                        <p className="font-mono text-gray-950 text-xs">{selectedLot.dateListed || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date Sold</label>
                      {isEditing ? (
                        <input type="date" name="dateSold" value={editForm.dateSold || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 text-xs bg-white" />
                      ) : (
                        <p className="font-mono text-gray-950 text-xs">{selectedLot.dateSold || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Payout Date</label>
                      {isEditing ? (
                        <input type="date" name="payoutDate" value={editForm.payoutDate || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 text-xs bg-white" />
                      ) : (
                        <p className="font-mono text-gray-950 text-xs">{selectedLot.payoutDate || '-'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sold / Hammer Results */}
                <div className="bg-amber-50/50 border border-amber-100 p-4 mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 mb-1">Hammer Price ($)</label>
                    {isEditing ? (
                      <input type="number" name="hammerPrice" value={editForm.hammerPrice === null ? '' : editForm.hammerPrice} onChange={handleEditChange} placeholder="Unsold" className="w-full border border-amber-300 p-1.5 bg-white" />
                    ) : (
                      <p className="font-mono font-semibold text-amber-950 text-lg">
                        {selectedLot.hammerPrice !== null ? `$${selectedLot.hammerPrice.toFixed(2)}` : 'Unsold / Active'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-amber-800 mb-1">Consignee Payout</label>
                    <p className="font-mono font-medium text-amber-950">
                      {liveComputed && liveComputed.consigneePayout !== null ? `$${liveComputed.consigneePayout.toFixed(2)}` : '-'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-amber-800 mb-1">{(activeConfig.branding?.commissionLabel || 'MCM Commission')}</label>
                    <p className="font-mono text-amber-950">
                      {liveComputed && liveComputed.commissionAmount !== null ? `$${liveComputed.commissionAmount.toFixed(2)} (${liveComputed.commissionRate}%)` : '-'}
                    </p>
                  </div>
                </div>

                {/* Platform Fee, BP, & Taxes Breakdown if Sold */}
                {selectedLot.hammerPrice !== null && liveComputed && (
                  <div className="bg-gray-50 border border-gray-200 p-4 mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-sans">
                    {liveComputed.buyersPremium !== null && liveComputed.buyersPremium !== undefined && liveComputed.buyersPremium > 0 && (
                      <div>
                        <span className="text-gray-500 block">Buyer's Premium</span>
                        <span className="font-mono font-semibold text-gray-800">${liveComputed.buyersPremium.toFixed(2)}</span>
                      </div>
                    )}
                    {liveComputed.totalSalePrice !== null && liveComputed.totalSalePrice !== undefined && (
                      <div>
                        <span className="text-gray-500 block">Total Sale Price (Paid by Buyer)</span>
                        <span className="font-mono font-semibold text-gray-800">${liveComputed.totalSalePrice.toFixed(2)}</span>
                      </div>
                    )}
                    {liveComputed.platformFeeAmount !== null && liveComputed.platformFeeAmount !== undefined && liveComputed.platformFeeAmount > 0 && (
                      <div>
                        <span className="text-gray-500 block">Platform Fee (Maxsold)</span>
                        <span className="font-mono font-semibold text-red-600">-${liveComputed.platformFeeAmount.toFixed(2)} ({liveComputed.platformFeeRate}%)</span>
                      </div>
                    )}
                    {liveComputed.commissionTaxAmount !== null && liveComputed.commissionTaxAmount !== undefined && (
                      <div>
                        <span className="text-gray-500 block">Commission QST/GST Tax</span>
                        <span className="font-mono font-semibold text-red-600">-${liveComputed.commissionTaxAmount.toFixed(2)} (14.975%)</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedLot.lotStatus === 'Unsold' && (
                  <div className="mt-4">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Unsold Action Taken</label>
                    {isEditing ? (
                      <input type="text" name="unsoldActionTaken" value={editForm.unsoldActionTaken || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5" />
                    ) : (
                      <p className="text-gray-900 bg-red-50 p-2.5 border border-red-200">{selectedLot.unsoldActionTaken || 'None recorded yet.'}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lot Modal */}
      {isAdding && (
        <div id="add-lot-modal" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddSubmit} className="bg-white border border-[#E5E5E0] shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FCFCFB]">
              <h3 className="text-lg font-medium text-gray-900 font-sans">
                Catalog New Estate Lot / Item
              </h3>
              <button
                id="btn-close-add-lot"
                type="button"
                onClick={() => { setIsAdding(false); setAddModalTab('general'); }}
                className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Elegant Tab Navigation */}
            <div className="flex border-b border-[#E5E5E0] bg-[#FCFCFB] px-6">
              <button
                type="button"
                id="btn-tab-add-general"
                onClick={() => setAddModalTab('general')}
                className={`py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors duration-150 ${
                  addModalTab === 'general'
                    ? 'border-[#1A1A19] text-[#1A1A19]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                General Details
              </button>
              <button
                type="button"
                id="btn-tab-add-selfservice"
                onClick={() => setAddModalTab('selfService')}
                className={`py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors duration-150 ${
                  addModalTab === 'selfService'
                    ? 'border-[#1A1A19] text-[#1A1A19]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                Self-Service
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
              {addModalTab === 'general' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Consignee *</label>
                      <select required name="consigneeId" value={addForm.consigneeId} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5">
                        <option value="">Select Consignee...</option>
                        {consignees.map(c => (
                          <option key={c.id} value={c.id}>{c.displayName} ({getConsigneeAcronym(c)})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Unique Item ID *</label>
                      <input required type="text" name="uniqueItemId" value={addForm.uniqueItemId || ''} onChange={handleAddChange} placeholder="e.g. CWI-1000" className="w-full border border-gray-300 p-1.5 font-mono font-bold uppercase" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Lot Number (optional)</label>
                      <input type="text" name="lotNumber" value={addForm.lotNumber} onChange={handleAddChange} placeholder="Auto" className="w-full border border-gray-300 p-1.5" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Assign to Auction (optional)</label>
                      <select name="auctionId" value={addForm.auctionId} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5">
                        <option value="">Pending / Not Scheduled</option>
                        {auctions.map(a => (
                          <option key={a.id} value={a.id}>{a.auctionName}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Commission Rate (%)</label>
                      <input type="number" name="commissionRate" value={addForm.commissionRate} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Date Received</label>
                      <input type="date" name="dateReceived" value={addForm.dateReceived || ''} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 text-xs bg-white" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Reserve Price ($)</label>
                      <input type="number" name="reservePrice" value={addForm.reservePrice || 0} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Reserve Requested</label>
                      <select name="reserveRequested" value={addForm.reserveRequested || 'No'} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5">
                        <option value="No">No</option>
                        <option value="Yes">Yes</option>
                      </select>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Short Catalog Description *</label>
                      <input required={addModalTab === 'general'} type="text" name="shortDescription" value={addForm.shortDescription} onChange={handleAddChange} placeholder="e.g. Exquisite hand-carved decanter in pristine shape" className="w-full border border-gray-300 p-1.5" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Full Details Description</label>
                        <textarea name="fullDescription" value={addForm.fullDescription} onChange={handleAddChange} rows={3} placeholder="Catalog description..." className="w-full border border-gray-300 p-2" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Internal Notes (Visible to Staff only)</label>
                        <textarea name="internalNotes" value={addForm.internalNotes} onChange={handleAddChange} rows={3} placeholder="Assigned shelf, packaging notes..." className="w-full border border-gray-300 p-2" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <ImageUploader
                      primaryPhotoURL={addForm.primaryPhotoURL || ''}
                      additionalPhotoURLs={addForm.additionalPhotoURLs || []}
                      onChange={(primary, additionals) => setAddForm(prev => ({
                        ...prev,
                        primaryPhotoURL: primary,
                        additionalPhotoURLs: additionals,
                        photoCount: (primary ? 1 : 0) + additionals.length
                      }))}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Unique Item ID</label>
                      {isEditing ? (
                        <input type="text" name="uniqueItemId" value={editForm.uniqueItemId || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 font-mono font-bold uppercase" placeholder="e.g. CWI-1000" />
                      ) : (
                        <p className="font-bold font-mono text-gray-900 bg-gray-100 px-2 py-0.5 inline-block">{getLotUniqueItemId(selectedLot, consignees)}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Lot Number</label>
                      {isEditing ? (
                        <input type="text" name="lotNumber" value={editForm.lotNumber || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 font-mono" />
                      ) : (
                        <p className="font-semibold text-gray-900 font-mono">{selectedLot.lotNumber}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Category *</label>
                      <select name="category" value={addForm.category} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        {activeConfig.categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Condition *</label>
                      <select name="condition" value={addForm.condition || 'Excellent'} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                        <option value="Poor">Poor</option>
                        <option value="As-Is">As-Is</option>
                      </select>
                    </div>
                  </div>

                  {/* Registered Custom / Descriptive Fields Rendering dynamically! */}
                  {activeConfig.customFields && activeConfig.customFields.length > 0 && (
                    <div className="pt-4 border-t border-gray-100 space-y-3">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Descriptive & Custom Metadata Fields (Customizable in Settings)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeConfig.customFields.map((field) => {
                          const val = (addForm as any)[field.key] || '';
                          const isNotes = field.key === 'conditionNotes';
                          return (
                            <div key={field.key} className={isNotes ? 'md:col-span-2' : ''}>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                {field.label} {field.required && <span className="text-red-500">*</span>}
                              </label>
                              {field.type === 'select' ? (
                                <select
                                  name={field.key}
                                  value={val}
                                  onChange={handleAddChange}
                                  required={field.required}
                                  className="w-full border border-gray-300 p-1.5 bg-white text-xs"
                                >
                                  <option value="">-- Select option --</option>
                                  {field.options?.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : isNotes ? (
                                <textarea
                                  name={field.key}
                                  value={val}
                                  onChange={handleAddChange}
                                  required={field.required}
                                  rows={2}
                                  placeholder={field.placeholder || ''}
                                  className="w-full border border-gray-300 p-2 text-xs bg-white"
                                />
                              ) : (
                                <input
                                  type={field.type}
                                  name={field.key}
                                  value={val}
                                  onChange={handleAddChange}
                                  required={field.required}
                                  placeholder={field.placeholder || ''}
                                  className="w-full border border-gray-300 p-1.5 text-xs bg-white"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#E5E5E0] bg-[#FCFCFB] flex justify-end gap-3">
              <button
                id="btn-cancel-add-lot"
                type="button"
                onClick={() => { setIsAdding(false); setAddModalTab('general'); }}
                className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-submit-add-lot"
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1A1A19] hover:bg-black cursor-pointer"
              >
                {saving ? 'Creating...' : 'Catalog Item'}
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
