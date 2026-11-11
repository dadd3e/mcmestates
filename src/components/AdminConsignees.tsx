import React, { useState, useMemo } from 'react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Consignee, Lot, Auction } from '../types';
import { calculateLotFinancials } from '../lib/financials';
import { generateConsigneeAcronym } from '../lib/idGenerator';
import { 
  Search, UserPlus, X, Edit2, Check, FileText, Landmark, User, Mail, 
  Phone, Calendar, Info, HeartHandshake, DollarSign, Award, TrendingUp, 
  Layers, Activity, ChevronDown, ChevronUp, CheckCircle, AlertCircle, ExternalLink 
} from 'lucide-react';

interface AdminConsigneesProps {
  consignees: Consignee[];
  lots: Lot[];
  auctions: Auction[];
  onRefresh: () => void;
}

export default function AdminConsignees({ consignees, lots, auctions, onRefresh }: AdminConsigneesProps) {
  const [search, setSearch] = useState('');
  const [selectedConsignee, setSelectedConsignee] = useState<Consignee | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Consignee>>({});
  
  // Modal tabs & expansion state
  const [modalTab, setModalTab] = useState<'summary' | 'profile' | 'financials' | 'auctions' | 'settlements'>('summary');
  const [expandedSettlementAuctions, setExpandedSettlementAuctions] = useState<Record<string, boolean>>({});

  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState<Partial<Consignee>>({
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    phonePrimary: '',
    phoneSecondary: '',
    preferredContactMethod: 'Email',
    streetAddress1: '',
    streetAddress2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'Canada',
    serviceType: 'Full Service',
    consigneeId: '',
    accountStatus: 'Active',
    accountCreatedDate: new Date().toISOString().split('T')[0],
    lastActivityDate: new Date().toISOString().split('T')[0],
    referredBy: '',
    referralSource: '',
    internalNotes: '',
    paymentMethod: 'Interac e-Transfer',
    emailForETransfer: '',
    commissionRate: 15,
    lifetimeGrossSales: 0,
    lifetimePayouts: 0,
    outstandingBalance: 0,
    acceptsUnsoldReturns: true,
    unsoldDisposalPreference: 'Return',
    photoAuthorization: true,
    signedAgreement: false,
    agreementDateSigned: '',
    agreementVersion: '',
    pickupAddress: '',
    pickupAvailabilityNotes: '',
    deliveryPreference: 'Drop-off',
    storageLocation: '',
    portalAccessEnabled: true,
    portalLoginEmail: ''
  });

  const [saving, setSaving] = useState(false);

  // Search filter
  const filteredConsignees = consignees.filter(c => {
    const term = search.toLowerCase();
    const displayNameStr = (c.displayName || '').toLowerCase();
    const emailStr = (c.email || '').toLowerCase();
    const idStr = (c.consigneeId || '').toLowerCase();
    const cityStr = (c.city || '').toLowerCase();
    const stateStr = (c.state || '').toLowerCase();
    return (
      displayNameStr.includes(term) ||
      emailStr.includes(term) ||
      idStr.includes(term) ||
      cityStr.includes(term) ||
      stateStr.includes(term)
    );
  });

  const handleRowClick = (consignee: Consignee) => {
    setSelectedConsignee(consignee);
    setEditForm(consignee);
    setModalTab('summary');
    setExpandedSettlementAuctions({});
    setIsEditing(false);
  };

  // 1. Filter lots associated with the selected consignee
  const consigneeLots = useMemo(() => {
    if (!selectedConsignee) return [];
    return lots.filter(l => l.consigneeId === selectedConsignee.id);
  }, [selectedConsignee, lots]);

  // 2. Hydrate each lot with its active calculated financials
  const hydratedLots = useMemo(() => {
    return consigneeLots.map(l => {
      const matchedAuction = auctions.find(a => a.id === l.auctionId);
      const financials = calculateLotFinancials(l, matchedAuction, selectedConsignee || undefined);
      return {
        ...l,
        ...financials,
        auctionName: matchedAuction ? matchedAuction.auctionName : 'Not Assigned',
        auctionStatus: matchedAuction ? matchedAuction.auctionStatus : 'Pending',
        auctionPlatform: matchedAuction ? matchedAuction.auctionPlatform : 'HiBid',
        endDate: matchedAuction ? matchedAuction.endDate : '-'
      };
    });
  }, [consigneeLots, auctions, selectedConsignee]);

  // 3. Compute Financial Data
  const financialStats = useMemo(() => {
    const soldLots = hydratedLots.filter(l => l.lotStatus === 'Sold');
    const unsoldLots = hydratedLots.filter(l => l.lotStatus === 'Unsold');
    const activeLots = hydratedLots.filter(l => l.lotStatus === 'Active');
    const pendingLots = hydratedLots.filter(l => l.lotStatus === 'Pending');
    const withdrawnLots = hydratedLots.filter(l => l.lotStatus === 'Withdrawn');

    const totalHammerPrices = soldLots.reduce((sum, l) => sum + (l.hammerPrice || 0), 0);
    const totalCommissionEarned = soldLots.reduce((sum, l) => sum + (l.commissionAmount || 0), 0);
    const totalPayouts = soldLots.reduce((sum, l) => sum + (l.consigneePayout || 0), 0);
    const totalTaxes = soldLots.reduce((sum, l) => sum + (l.commissionTaxAmount || 0), 0);
    const totalPlatformFees = soldLots.reduce((sum, l) => sum + (l.platformFeeAmount || 0), 0);

    return {
      soldCount: soldLots.length,
      unsoldCount: unsoldLots.length,
      activeCount: activeLots.length,
      pendingCount: pendingLots.length,
      withdrawnCount: withdrawnLots.length,
      totalCount: hydratedLots.length,
      totalHammerPrices,
      totalCommissionEarned,
      totalPayouts,
      totalTaxes,
      totalPlatformFees
    };
  }, [hydratedLots]);

  // 4. Associated Auctions (Active & Past)
  const associatedAuctions = useMemo(() => {
    const auctionIds = Array.from(new Set(hydratedLots.map(l => l.auctionId).filter(Boolean)));
    const matched = auctions.filter(a => auctionIds.includes(a.id));
    
    // Divide into active/upcoming and past
    const activeAndUpcoming = matched.filter(a => a.auctionStatus === 'Live' || a.auctionStatus === 'Scheduled');
    const past = matched.filter(a => a.auctionStatus === 'Closed' || a.auctionStatus === 'Settled');

    return {
      activeAndUpcoming,
      past
    };
  }, [hydratedLots, auctions]);

  // 5. Settlement History (Chronological by Auction Event)
  const settlementHistory = useMemo(() => {
    const groups: Record<string, {
      auctionId: string | null;
      auctionName: string;
      auctionPlatform: string;
      endDate: string;
      auctionStatus: string;
      totalHammer: number;
      totalPlatformFee: number;
      totalCommission: number;
      totalTax: number;
      totalPayout: number;
      payoutStatus: string;
      payoutDate: string;
      lots: typeof hydratedLots;
    }> = {};

    const soldLots = hydratedLots.filter(l => l.lotStatus === 'Sold');

    soldLots.forEach(l => {
      const aid = l.auctionId || 'unscheduled';
      if (!groups[aid]) {
        const auc = auctions.find(a => a.id === l.auctionId);
        groups[aid] = {
          auctionId: l.auctionId,
          auctionName: auc ? auc.auctionName : 'Unscheduled Lot Sale',
          auctionPlatform: auc?.auctionPlatform || 'HiBid',
          endDate: l.dateSold || auc?.endDate || '-',
          auctionStatus: auc?.auctionStatus || 'Pending',
          totalHammer: 0,
          totalPlatformFee: 0,
          totalCommission: 0,
          totalTax: 0,
          totalPayout: 0,
          payoutStatus: 'Paid',
          payoutDate: '',
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

      if (l.payoutStatus !== 'Paid') {
        g.payoutStatus = 'Unpaid';
      }
      if (l.payoutDate) {
        if (!g.payoutDate || l.payoutDate > g.payoutDate) {
          g.payoutDate = l.payoutDate;
        }
      }
    });

    Object.values(groups).forEach(g => {
      const hasPaid = g.lots.some(l => l.payoutStatus === 'Paid');
      const hasUnpaid = g.lots.some(l => l.payoutStatus !== 'Paid');
      if (hasPaid && hasUnpaid) {
        g.payoutStatus = 'Mixed';
      } else if (hasPaid) {
        g.payoutStatus = 'Paid';
      } else {
        g.payoutStatus = 'Unpaid';
      }
    });

    return Object.values(groups).sort((a, b) => b.endDate.localeCompare(a.endDate));
  }, [hydratedLots, auctions]);

  const toggleSettlementExpanded = (auctionId: string | null) => {
    const key = auctionId || 'unscheduled';
    setExpandedSettlementAuctions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (name === 'commissionRate' || name === 'lifetimeGrossSales' || name === 'lifetimePayouts' || name === 'outstandingBalance') {
      finalValue = Number(value);
    }
    setEditForm(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleAddChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (name === 'commissionRate') {
      finalValue = Number(value);
    }

    setAddForm(prev => {
      const updated = { ...prev, [name]: finalValue };
      if (name === 'firstName' || name === 'lastName') {
        const autoAcronym = generateConsigneeAcronym(
          name === 'firstName' ? finalValue : prev.firstName || '',
          name === 'lastName' ? finalValue : prev.lastName || ''
        );
        if (!prev.consigneeId || prev.consigneeId === generateConsigneeAcronym(prev.firstName || '', prev.lastName || '')) {
          updated.consigneeId = autoAcronym;
        }
      } else if (name === 'consigneeId') {
        updated.consigneeId = value.toUpperCase();
      }
      return updated;
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedConsignee?.id) return;
    setSaving(true);
    try {
      // Auto-calculate outstanding balance: Gross Sales - Payouts (if not overridden)
      const gross = editForm.lifetimeGrossSales !== undefined ? Number(editForm.lifetimeGrossSales) : (selectedConsignee.lifetimeGrossSales || 0);
      const payouts = editForm.lifetimePayouts !== undefined ? Number(editForm.lifetimePayouts) : (selectedConsignee.lifetimePayouts || 0);
      const calculatedBalance = Math.max(0, gross - payouts);

      const finalEditForm = {
        ...editForm,
        outstandingBalance: calculatedBalance,
        lastActivityDate: new Date().toISOString().split('T')[0],
        portalLoginEmail: editForm.email || selectedConsignee.email
      };

      const docRef = doc(db, 'consignees', selectedConsignee.id);
      await updateDoc(docRef, finalEditForm);
      setSelectedConsignee({ ...selectedConsignee, ...finalEditForm } as Consignee);
      setIsEditing(false);
      onRefresh();
    } catch (err) {
      console.error("Error updating consignee: ", err);
      alert("Error saving updates to Firestore.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let baseId = (addForm.consigneeId || '').trim().toUpperCase();
      if (!baseId) {
        baseId = generateConsigneeAcronym(addForm.firstName || '', addForm.lastName || '');
      }

      // Check existing consigneeIds to prevent duplicates
      let finalId = baseId;
      let counter = 1;
      const existingIds = consignees.map(c => c.consigneeId);
      while (existingIds.includes(finalId)) {
        finalId = `${baseId}${counter}`;
        counter++;
      }

      const finalAddForm = {
        ...addForm,
        displayName: addForm.displayName || `${addForm.firstName} ${addForm.lastName}`,
        consigneeId: finalId,
        portalLoginEmail: addForm.portalLoginEmail || addForm.email,
        outstandingBalance: Math.max(0, (addForm.lifetimeGrossSales || 0) - (addForm.lifetimePayouts || 0))
      };

      const collRef = collection(db, 'consignees');
      await addDoc(collRef, finalAddForm);
      setIsAdding(false);
      onRefresh();
    } catch (err) {
      console.error("Error creating consignee: ", err);
      alert("Error saving new consignee to Firestore.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="admin-consignees" className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            id="consignee-search"
            type="text"
            placeholder="Search by name, ID, city, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-[#E5E5E0] focus:outline-none focus:ring-1 focus:ring-[#1A1A19] focus:border-[#1A1A19] sm:text-sm bg-white"
          />
        </div>
        <button
          id="btn-add-consignee"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium text-white bg-[#1A1A19] hover:bg-black cursor-pointer"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Add Consignee
        </button>
      </div>

      {/* Table list */}
      <div className="bg-white border border-[#E5E5E0] overflow-hidden">
        <div className="overflow-x-auto">
          <table id="consignees-table" className="w-full min-w-[850px] divide-y divide-[#E5E5E0]">
            <thead className="bg-[#FCFCFB]">
              <tr>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">ID</th>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Name</th>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Service Type</th>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Rate</th>
                <th className="px-6 py-3.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Gross Sales</th>
                <th className="px-6 py-3.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Balance</th>
                <th className="px-6 py-3.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider font-sans">Portal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0]">
              {filteredConsignees.map((c) => (
                <tr
                  id={`row-consignee-${c.id}`}
                  key={c.id}
                  onClick={() => handleRowClick(c)}
                  className="hover:bg-[#FCFCFB] cursor-pointer transition-colors duration-100"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500 font-bold">{c.consigneeId}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{c.displayName}</div>
                    <div className="text-xs text-gray-400">{c.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{c.serviceType || 'Full Service'}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-0.5 text-xs font-medium ${
                      c.accountStatus === 'Active' ? 'bg-green-50 text-green-700 border border-green-200' :
                      c.accountStatus === 'Pending Review' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {c.accountStatus || 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{c.commissionRate}%</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-gray-900">${(c.lifetimeGrossSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-red-600">${(c.outstandingBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`text-xs ${c.portalAccessEnabled ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                      {c.portalAccessEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredConsignees.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                    No consignees found matching query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details / Edit Modal */}
      {selectedConsignee && (
        <div id="consignee-detail-modal" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E0] shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FCFCFB]">
              <div>
                <h3 className="text-lg font-medium text-gray-900 font-sans">
                  {isEditing ? 'Edit Profile' : 'Consignee Profile'}
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">ID: {selectedConsignee.consigneeId}</p>
              </div>
              <div className="flex items-center gap-3">
                {isEditing ? (
                  <button
                    id="btn-save-consignee"
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="inline-flex items-center px-4 py-2 bg-green-600 text-white hover:bg-green-700 text-xs font-medium cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Save Changes
                  </button>
                ) : (
                  <button
                    id="btn-edit-consignee"
                    onClick={() => setIsEditing(true)}
                    className="inline-flex items-center px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200 text-xs font-medium cursor-pointer"
                  >
                    <Edit2 className="h-3.5 w-3.5 mr-1" />
                    Edit Profile
                  </button>
                )}
                <button
                  id="btn-close-consignee"
                  onClick={() => { setSelectedConsignee(null); setIsEditing(false); }}
                  className="p-1.5 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Tab Navigation (only visible when not editing) */}
            {!isEditing && (
              <div className="flex border-b border-[#E5E5E0] bg-[#FCFCFB] px-6 gap-6 text-xs overflow-x-auto">
                <button
                  id="tab-consignee-summary"
                  onClick={() => setModalTab('summary')}
                  className={`py-3 font-medium border-b-2 cursor-pointer whitespace-nowrap transition-all ${
                    modalTab === 'summary' ? 'border-[#1A1A19] text-gray-900 font-bold' : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Quick Summary
                </button>
                <button
                  id="tab-consignee-profile"
                  onClick={() => setModalTab('profile')}
                  className={`py-3 font-medium border-b-2 cursor-pointer whitespace-nowrap transition-all ${
                    modalTab === 'profile' ? 'border-[#1A1A19] text-gray-900 font-bold' : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Full Profile Details
                </button>
                <button
                  id="tab-consignee-financials"
                  onClick={() => setModalTab('financials')}
                  className={`py-3 font-medium border-b-2 cursor-pointer whitespace-nowrap transition-all ${
                    modalTab === 'financials' ? 'border-[#1A1A19] text-gray-900 font-bold' : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Financial Performance
                </button>
                <button
                  id="tab-consignee-auctions"
                  onClick={() => setModalTab('auctions')}
                  className={`py-3 font-medium border-b-2 cursor-pointer whitespace-nowrap transition-all ${
                    modalTab === 'auctions' ? 'border-[#1A1A19] text-gray-900 font-bold' : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Item & Auction Activity
                </button>
                <button
                  id="tab-consignee-settlements"
                  onClick={() => setModalTab('settlements')}
                  className={`py-3 font-medium border-b-2 cursor-pointer whitespace-nowrap transition-all ${
                    modalTab === 'settlements' ? 'border-[#1A1A19] text-gray-900 font-bold' : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Settlement History
                </button>
              </div>
            )}

            {/* Scrollable details view */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {(isEditing || modalTab === 'profile') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Panel 1: Identity & Contact */}
                <div className="bg-gray-50/50 p-4 border border-[#E5E5E0] space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                    <User className="h-4 w-4 text-gray-600" />
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider font-sans">1. Identity & Contact</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">First Name</label>
                      {isEditing ? (
                        <input type="text" name="firstName" value={editForm.firstName || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" />
                      ) : (
                        <p className="font-semibold text-gray-900">{selectedConsignee.firstName}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Last Name</label>
                      {isEditing ? (
                        <input type="text" name="lastName" value={editForm.lastName || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" />
                      ) : (
                        <p className="font-semibold text-gray-900">{selectedConsignee.lastName}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Consignee Acronym (3-Letter Code)</label>
                      {isEditing ? (
                        <input type="text" name="consigneeId" value={editForm.consigneeId || ''} onChange={(e) => setEditForm(prev => ({ ...prev, consigneeId: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 p-1.5 font-mono uppercase font-bold focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" placeholder="e.g. CWI" />
                      ) : (
                        <p className="font-bold font-mono text-gray-900 bg-gray-100 px-2 py-0.5 inline-block">{selectedConsignee.consigneeId}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Display Name / Business Name</label>
                      {isEditing ? (
                        <input type="text" name="displayName" value={editForm.displayName || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" />
                      ) : (
                        <p className="font-semibold text-gray-900">{selectedConsignee.displayName}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                      {isEditing ? (
                        <input type="email" name="email" value={editForm.email || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" />
                      ) : (
                        <p className="text-gray-900 font-medium">{selectedConsignee.email}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Phone (Primary)</label>
                      {isEditing ? (
                        <input type="text" name="phonePrimary" value={editForm.phonePrimary || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" />
                      ) : (
                        <p className="text-gray-900">{selectedConsignee.phonePrimary || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Phone (Secondary / Mobile)</label>
                      {isEditing ? (
                        <input type="text" name="phoneSecondary" value={editForm.phoneSecondary || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" />
                      ) : (
                        <p className="text-gray-900">{selectedConsignee.phoneSecondary || '-'}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Preferred Contact Method</label>
                      {isEditing ? (
                        <select name="preferredContactMethod" value={editForm.preferredContactMethod} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none focus:ring-1 focus:ring-[#1A1A19] bg-white">
                          <option value="Email">Email</option>
                          <option value="Phone">Phone</option>
                          <option value="Text">Text</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 font-medium">{selectedConsignee.preferredContactMethod}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Panel 2: Address */}
                <div className="bg-gray-50/50 p-4 border border-[#E5E5E0] space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                    <Landmark className="h-4 w-4 text-gray-600" />
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider font-sans">2. Address Details</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Street Address Line 1</label>
                      {isEditing ? (
                        <input type="text" name="streetAddress1" value={editForm.streetAddress1 || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 font-medium">{selectedConsignee.streetAddress1 || '-'}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Street Address Line 2</label>
                      {isEditing ? (
                        <input type="text" name="streetAddress2" value={editForm.streetAddress2 || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900">{selectedConsignee.streetAddress2 || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                      {isEditing ? (
                        <input type="text" name="city" value={editForm.city || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900">{selectedConsignee.city || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">State / Province</label>
                      {isEditing ? (
                        <input type="text" name="state" value={editForm.state || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900">{selectedConsignee.state || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Postal Code</label>
                      {isEditing ? (
                        <input type="text" name="postalCode" value={editForm.postalCode || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedConsignee.postalCode || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                      {isEditing ? (
                        <input type="text" name="country" value={editForm.country || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900">{selectedConsignee.country || '-'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Panel 3: Account & Status */}
                <div className="bg-gray-50/50 p-4 border border-[#E5E5E0] space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                    <Info className="h-4 w-4 text-gray-600" />
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider font-sans">3. Account & Status</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Service Type</label>
                      {isEditing ? (
                        <select name="serviceType" value={editForm.serviceType} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 bg-white focus:outline-none">
                          <option value="Full Service">Full Service</option>
                          <option value="Self Service">Self Service</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 font-semibold">{selectedConsignee.serviceType || 'Full Service'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Account Status</label>
                      {isEditing ? (
                        <select name="accountStatus" value={editForm.accountStatus} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 bg-white focus:outline-none">
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
                          <option value="Suspended">Suspended</option>
                          <option value="Pending Review">Pending Review</option>
                        </select>
                      ) : (
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold ${
                          selectedConsignee.accountStatus === 'Active' ? 'bg-green-50 text-green-700' :
                          selectedConsignee.accountStatus === 'Pending Review' ? 'bg-amber-50 text-amber-700' :
                          'bg-red-50 text-red-700'
                        }`}>{selectedConsignee.accountStatus || 'Active'}</span>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Account Created Date</label>
                      <p className="text-gray-900 font-mono">{selectedConsignee.accountCreatedDate ? new Date(selectedConsignee.accountCreatedDate).toLocaleDateString() : '-'}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Last Activity Date</label>
                      <p className="text-gray-900 font-mono">{selectedConsignee.lastActivityDate ? new Date(selectedConsignee.lastActivityDate).toLocaleDateString() : '-'}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Referred By</label>
                      {isEditing ? (
                        <input type="text" name="referredBy" value={editForm.referredBy || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900">{selectedConsignee.referredBy || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Referral Source</label>
                      {isEditing ? (
                        <select name="referralSource" value={editForm.referralSource || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 bg-white focus:outline-none">
                          <option value="">-- None --</option>
                          <option value="Google">Google</option>
                          <option value="Word of Mouth">Word of Mouth</option>
                          <option value="Social Media">Social Media</option>
                          <option value="Professional Referral">Professional Referral</option>
                          <option value="Other">Other</option>
                        </select>
                      ) : (
                        <p className="text-gray-900">{selectedConsignee.referralSource || '-'}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Internal Notes (Staff Only)</label>
                      {isEditing ? (
                        <textarea name="internalNotes" value={editForm.internalNotes || ''} onChange={handleEditChange} rows={3} className="w-full border border-gray-300 p-2 text-xs focus:outline-none" />
                      ) : (
                        <p className="text-gray-700 bg-gray-100 p-2 border border-gray-200 text-xs italic whitespace-pre-wrap">{selectedConsignee.internalNotes || 'No internal notes on file.'}</p>
                      )}
                    </div>
                    <div className="col-span-2 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Portal Access Enabled</label>
                        {isEditing ? (
                          <input type="checkbox" name="portalAccessEnabled" checked={!!editForm.portalAccessEnabled} onChange={handleEditChange} className="h-4 w-4 text-black focus:ring-0 cursor-pointer" />
                        ) : (
                          <span className={`text-xs font-medium ${selectedConsignee.portalAccessEnabled ? 'text-green-600' : 'text-gray-400'}`}>{selectedConsignee.portalAccessEnabled ? 'Enabled' : 'Disabled'}</span>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Portal Login Email</label>
                        {isEditing ? (
                          <input type="email" name="portalLoginEmail" value={editForm.portalLoginEmail || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                        ) : (
                          <p className="text-gray-900 font-mono">{selectedConsignee.portalLoginEmail || selectedConsignee.email}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Panel 4: Financial & Payment */}
                <div className="bg-gray-50/50 p-4 border border-[#E5E5E0] space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                    <FileText className="h-4 w-4 text-gray-600" />
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider font-sans">4. Financial & Payment Info</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                      {isEditing ? (
                        <select name="paymentMethod" value={editForm.paymentMethod} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 bg-white focus:outline-none">
                          <option value="Interac e-Transfer">Interac e-Transfer</option>
                          <option value="Cash">Cash</option>
                          <option value="PayPal">PayPal</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 font-semibold">{selectedConsignee.paymentMethod}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Email for e-Transfer / Paypal</label>
                      {isEditing ? (
                        <input type="text" name="emailForETransfer" value={editForm.emailForETransfer || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedConsignee.emailForETransfer || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Commission Rate (%)</label>
                      {isEditing ? (
                        <input type="number" name="commissionRate" value={editForm.commissionRate || 15} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 font-medium">{selectedConsignee.commissionRate}%</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Outstanding Balance</label>
                      {isEditing ? (
                        <input type="number" name="outstandingBalance" value={editForm.outstandingBalance || 0} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-red-600 font-bold font-mono">${(selectedConsignee.outstandingBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Lifetime Gross Sales</label>
                      {isEditing ? (
                        <input type="number" name="lifetimeGrossSales" value={editForm.lifetimeGrossSales || 0} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 font-mono">${(selectedConsignee.lifetimeGrossSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Lifetime Payouts</label>
                      {isEditing ? (
                        <input type="number" name="lifetimePayouts" value={editForm.lifetimePayouts || 0} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 font-mono">${(selectedConsignee.lifetimePayouts || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Panel 5: Consignment Terms */}
                <div className="bg-gray-50/50 p-4 border border-[#E5E5E0] space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                    <HeartHandshake className="h-4 w-4 text-gray-600" />
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider font-sans">5. Consignment Terms</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1 font-semibold">Photo Auth. (Mandatory)</label>
                      {isEditing ? (
                        <input type="checkbox" name="photoAuthorization" checked={!!editForm.photoAuthorization} onChange={handleEditChange} className="h-4 w-4 text-black focus:ring-0 cursor-pointer" />
                      ) : (
                        <span className={`text-xs font-semibold ${selectedConsignee.photoAuthorization ? 'text-green-600' : 'text-red-500'}`}>{selectedConsignee.photoAuthorization ? 'Authorized' : 'Missing'}</span>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Accepts Unsold Returns</label>
                      {isEditing ? (
                        <input type="checkbox" name="acceptsUnsoldReturns" checked={!!editForm.acceptsUnsoldReturns} onChange={handleEditChange} className="h-4 w-4 text-black focus:ring-0 cursor-pointer" />
                      ) : (
                        <span className="text-xs font-medium">{selectedConsignee.acceptsUnsoldReturns ? 'Yes' : 'No'}</span>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Unsold Item Disposal Preference</label>
                      {isEditing ? (
                        <select name="unsoldDisposalPreference" value={editForm.unsoldDisposalPreference} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 bg-white focus:outline-none">
                          <option value="Return">Return</option>
                          <option value="Donate">Donate</option>
                          <option value="Discard">Discard</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 font-semibold">{selectedConsignee.unsoldDisposalPreference || 'Return'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Signed Agreement</label>
                      {isEditing ? (
                        <input type="checkbox" name="signedAgreement" checked={!!editForm.signedAgreement} onChange={handleEditChange} className="h-4 w-4 text-black focus:ring-0 cursor-pointer" />
                      ) : (
                        <span className={`text-xs font-semibold ${selectedConsignee.signedAgreement ? 'text-green-600' : 'text-gray-400'}`}>{selectedConsignee.signedAgreement ? 'Signed' : 'Unsigned'}</span>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Agreement Signed Date</label>
                      {isEditing ? (
                        <input type="date" name="agreementDateSigned" value={editForm.agreementDateSigned || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1 focus:outline-none font-mono" />
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedConsignee.agreementDateSigned || '-'}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Agreement Version</label>
                      {isEditing ? (
                        <input type="text" name="agreementVersion" value={editForm.agreementVersion || ''} onChange={handleEditChange} placeholder="e.g. v1.2" className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 font-mono">{selectedConsignee.agreementVersion || '-'}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Panel 6: Logistics & Access */}
                <div className="bg-gray-50/50 p-4 border border-[#E5E5E0] space-y-4">
                  <div className="flex items-center space-x-2 pb-2 border-b border-gray-200">
                    <Calendar className="h-4 w-4 text-gray-600" />
                    <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider font-sans">6. Logistics & Access</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Pickup Address (If different)</label>
                      {isEditing ? (
                        <textarea name="pickupAddress" value={editForm.pickupAddress || ''} onChange={handleEditChange} rows={2} className="w-full border border-gray-300 p-1.5 text-xs focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 text-xs">{selectedConsignee.pickupAddress || 'Same as primary'}</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Pickup Availability / Notes</label>
                      {isEditing ? (
                        <textarea name="pickupAvailabilityNotes" value={editForm.pickupAvailabilityNotes || ''} onChange={handleEditChange} rows={2} className="w-full border border-gray-300 p-1.5 text-xs focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 text-xs">{selectedConsignee.pickupAvailabilityNotes || '-'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Delivery / Drop-off Preference</label>
                      {isEditing ? (
                        <select name="deliveryPreference" value={editForm.deliveryPreference} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 bg-white focus:outline-none">
                          <option value="Drop-off">Drop-off</option>
                          <option value="Pickup">Pickup</option>
                          <option value="Either">Either</option>
                        </select>
                      ) : (
                        <p className="text-gray-900 font-semibold">{selectedConsignee.deliveryPreference || 'Drop-off'}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Storage Location</label>
                      {isEditing ? (
                        <input type="text" name="storageLocation" value={editForm.storageLocation || ''} onChange={handleEditChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      ) : (
                        <p className="text-gray-900 font-semibold">{selectedConsignee.storageLocation || '-'}</p>
                      )}
                    </div>
                  </div>
                </div>

              </div>
              )}

              {!isEditing && (
                <>
                  {modalTab === 'summary' && (
                    <div className="space-y-6">
                      {/* Quick Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-red-50/50 p-4 border border-red-100 flex flex-col justify-between">
                          <div>
                            <span className="text-xs font-semibold text-red-700 uppercase tracking-wider block mb-1">Outstanding Balance</span>
                            <span className="text-2xl font-bold text-red-600 font-mono">
                              ${(selectedConsignee.outstandingBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <span className="text-[10px] text-red-500 mt-2 block">Unpaid hammer minus commissions</span>
                        </div>
                        <div className="bg-gray-50/50 p-4 border border-gray-200 flex flex-col justify-between">
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Lifetime Gross Sales</span>
                            <span className="text-2xl font-bold text-gray-950 font-mono">
                              ${(selectedConsignee.lifetimeGrossSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 mt-2 block">All-time sales hammer total</span>
                        </div>
                        <div className="bg-gray-50/50 p-4 border border-gray-200 flex flex-col justify-between">
                          <div>
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Lifetime Payouts</span>
                            <span className="text-2xl font-bold text-gray-900 font-mono">
                              ${(selectedConsignee.lifetimePayouts || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 mt-2 block">All-time disbursed settlements</span>
                        </div>
                      </div>

                      {/* Info Sections */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left: Registration Details */}
                        <div className="border border-[#E5E5E0] bg-white p-5 space-y-4">
                          <h4 className="text-sm font-semibold text-gray-900 border-b pb-2 flex items-center">
                            <User className="h-4 w-4 mr-2 text-gray-500" />
                            Primary Contact Details
                          </h4>
                          <div className="grid grid-cols-2 gap-y-3 text-sm">
                            <span className="text-gray-500">Contact Person</span>
                            <span className="text-gray-900 font-medium">{selectedConsignee.firstName} {selectedConsignee.lastName}</span>

                            <span className="text-gray-500">Email Address</span>
                            <span className="text-gray-900 font-mono">{selectedConsignee.email}</span>

                            <span className="text-gray-500">Phone (Primary)</span>
                            <span className="text-gray-900 font-mono">{selectedConsignee.phonePrimary || '-'}</span>

                            <span className="text-gray-500">Preferred Channel</span>
                            <span className="text-gray-900">{selectedConsignee.preferredContactMethod || 'Email'}</span>

                            <span className="text-gray-500">Address</span>
                            <span className="text-gray-900 leading-tight">
                              {selectedConsignee.streetAddress1 ? (
                                <>
                                  {selectedConsignee.streetAddress1}
                                  {selectedConsignee.streetAddress2 && `, ${selectedConsignee.streetAddress2}`}
                                  <br />
                                  {selectedConsignee.city}, {selectedConsignee.state} {selectedConsignee.postalCode}
                                </>
                              ) : '-'}
                            </span>
                          </div>
                        </div>

                        {/* Right: Contract & Logistics */}
                        <div className="border border-[#E5E5E0] bg-white p-5 space-y-4">
                          <h4 className="text-sm font-semibold text-gray-900 border-b pb-2 flex items-center">
                            <Landmark className="h-4 w-4 mr-2 text-gray-500" />
                            Consignment Agreement & Settings
                          </h4>
                          <div className="grid grid-cols-2 gap-y-3 text-sm">
                            <span className="text-gray-500">Service Level</span>
                            <span className="text-gray-900 font-semibold">{selectedConsignee.serviceType || 'Full Service'}</span>

                            <span className="text-gray-500">Commission Rate</span>
                            <span className="text-gray-900 font-medium">{selectedConsignee.commissionRate}%</span>

                            <span className="text-gray-500">Payment Channel</span>
                            <span className="text-gray-900 font-medium">{selectedConsignee.paymentMethod || 'Interac e-Transfer'}</span>

                            <span className="text-gray-500">Agreement Status</span>
                            <span>
                              {selectedConsignee.signedAgreement ? (
                                <span className="inline-flex items-center text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 border border-green-200">
                                  Signed ({selectedConsignee.agreementDateSigned || '-'})
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 border border-red-200">
                                  Unsigned
                                </span>
                              )}
                            </span>

                            <span className="text-gray-500">Photo Authorization</span>
                            <span>
                              {selectedConsignee.photoAuthorization ? (
                                <span className="inline-flex items-center text-xs font-semibold text-green-700 bg-green-50 px-2.5 py-0.5">
                                  Authorized
                                </span>
                              ) : (
                                <span className="inline-flex items-center text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-0.5">
                                  Missing
                                </span>
                              )}
                            </span>

                            <span className="text-gray-500">Disposal Preference</span>
                            <span className="text-gray-900">{selectedConsignee.unsoldDisposalPreference || 'Return'}</span>
                          </div>
                        </div>
                      </div>

                      {/* CTA Panel */}
                      <div className="bg-[#FCFCFB] border border-[#E5E5E0] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center space-x-3">
                          <Info className="h-5 w-5 text-gray-500 shrink-0" />
                          <p className="text-xs text-gray-600">
                            You are looking at the Quick Summary. Use the tabs above to access full profile details, financial reports, item histories, and active payouts.
                          </p>
                        </div>
                        <button
                          id="btn-trigger-profile-tab"
                          onClick={() => setModalTab('profile')}
                          className="px-4 py-2 bg-[#1A1A19] text-white hover:bg-black text-xs font-semibold cursor-pointer shrink-0 transition-colors"
                        >
                          Open Full Profile Details ↗
                        </button>
                      </div>
                    </div>
                  )}

                  {modalTab === 'financials' && (
                    <div className="space-y-6">
                      {/* Financial KPI Cards */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="bg-[#FCFCFB] p-3 border border-[#E5E5E0]">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">Total Hammer Price</span>
                          <span className="text-lg font-bold text-gray-900 font-mono">
                            ${financialStats.totalHammerPrices.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="bg-emerald-50/60 p-3 border border-emerald-100">
                          <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider block mb-1">Commission Earned</span>
                          <span className="text-lg font-bold text-emerald-700 font-mono">
                            ${financialStats.totalCommissionEarned.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="bg-blue-50/50 p-3 border border-blue-100">
                          <span className="text-[10px] font-semibold text-blue-800 uppercase tracking-wider block mb-1">Consignee Payout</span>
                          <span className="text-lg font-bold text-blue-700 font-mono">
                            ${financialStats.totalPayouts.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="bg-[#FCFCFB] p-3 border border-[#E5E5E0]">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">Commission Taxes</span>
                          <span className="text-lg font-bold text-gray-900 font-mono">
                            ${financialStats.totalTaxes.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="bg-[#FCFCFB] p-3 border border-[#E5E5E0]">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">Platform Fees</span>
                          <span className="text-lg font-bold text-gray-900 font-mono">
                            ${financialStats.totalPlatformFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Lot Breakdown */}
                      <div className="bg-white border border-[#E5E5E0] p-4">
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">Lot Status Breakdown</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                          <div className="border border-gray-100 p-2.5 text-center">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Sold</span>
                            <span className="text-xl font-bold text-green-600 font-mono">{financialStats.soldCount}</span>
                          </div>
                          <div className="border border-gray-100 p-2.5 text-center">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Unsold</span>
                            <span className="text-xl font-bold text-red-500 font-mono">{financialStats.unsoldCount}</span>
                          </div>
                          <div className="border border-gray-100 p-2.5 text-center">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Active</span>
                            <span className="text-xl font-bold text-blue-600 font-mono">{financialStats.activeCount}</span>
                          </div>
                          <div className="border border-gray-100 p-2.5 text-center">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Pending</span>
                            <span className="text-xl font-bold text-amber-500 font-mono">{financialStats.pendingCount}</span>
                          </div>
                          <div className="border border-gray-100 p-2.5 text-center">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Withdrawn</span>
                            <span className="text-xl font-bold text-gray-400 font-mono">{financialStats.withdrawnCount}</span>
                          </div>
                        </div>
                      </div>

                      {/* Lot Inventory Table */}
                      <div className="bg-white border border-[#E5E5E0] overflow-hidden">
                        <div className="px-4 py-3 border-b border-[#E5E5E0] bg-[#FCFCFB] flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wider">Item Lot Inventory ({hydratedLots.length})</h4>
                        </div>
                        <div className="overflow-x-auto max-h-72">
                          <table className="min-w-full divide-y divide-[#E5E5E0] text-xs">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                              <tr>
                                <th className="px-4 py-2.5 text-left font-medium text-gray-500 uppercase tracking-wider">Lot #</th>
                                <th className="px-4 py-2.5 text-left font-medium text-gray-500 uppercase tracking-wider">Title</th>
                                <th className="px-4 py-2.5 text-left font-medium text-gray-500 uppercase tracking-wider">Auction</th>
                                <th className="px-4 py-2.5 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-2.5 text-right font-medium text-gray-500 uppercase tracking-wider">Hammer Price</th>
                                <th className="px-4 py-2.5 text-right font-medium text-gray-500 uppercase tracking-wider">Commission</th>
                                <th className="px-4 py-2.5 text-right font-medium text-gray-500 uppercase tracking-wider">Net Payout</th>
                                <th className="px-4 py-2.5 text-center font-medium text-gray-500 uppercase tracking-wider">Payout Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E5E5E0] bg-white">
                              {hydratedLots.map(l => (
                                <tr key={l.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2.5 whitespace-nowrap font-mono font-bold text-gray-700">{l.lotNumber || '-'}</td>
                                  <td className="px-4 py-2.5 font-medium text-gray-900 truncate max-w-[180px]" title={l.title}>{l.title}</td>
                                  <td className="px-4 py-2.5 text-gray-500 truncate max-w-[120px]" title={l.auctionName}>{l.auctionName}</td>
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold border ${
                                      l.lotStatus === 'Sold' ? 'bg-green-50 text-green-700 border-green-200' :
                                      l.lotStatus === 'Unsold' ? 'bg-red-50 text-red-700 border-red-200' :
                                      l.lotStatus === 'Active' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                      l.lotStatus === 'Pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                      'bg-gray-50 text-gray-500 border-gray-200'
                                    }`}>
                                      {l.lotStatus}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-900">
                                    {l.lotStatus === 'Sold' && l.hammerPrice !== null ? `$${l.hammerPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-gray-500">
                                    {l.lotStatus === 'Sold' && l.commissionAmount !== null ? `$${l.commissionAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-700">
                                    {l.lotStatus === 'Sold' && l.consigneePayout !== null ? `$${l.consigneePayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-center">
                                    {l.lotStatus === 'Sold' ? (
                                      <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                                        l.payoutStatus === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                      }`}>
                                        {l.payoutStatus || 'Unpaid'}
                                      </span>
                                    ) : '-'}
                                  </td>
                                </tr>
                              ))}
                              {hydratedLots.length === 0 && (
                                <tr>
                                  <td colSpan={8} className="px-4 py-6 text-center text-gray-400">No lots found for this consignee.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {modalTab === 'auctions' && (
                    <div className="space-y-6">
                      {/* Active / Scheduled Auctions Card */}
                      <div className="border border-[#E5E5E0] bg-white">
                        <div className="px-5 py-3 border-b border-[#E5E5E0] bg-blue-50/40 flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wider flex items-center">
                            <Activity className="h-4 w-4 mr-2 text-blue-600" />
                            Active & Scheduled Auctions ({associatedAuctions.activeAndUpcoming.length})
                          </h4>
                          <span className="text-[10px] text-gray-500 font-mono">Consignee items are active here</span>
                        </div>
                        <div className="p-4 space-y-4">
                          {associatedAuctions.activeAndUpcoming.map(a => {
                            const itemsInAuc = hydratedLots.filter(l => l.auctionId === a.id);
                            return (
                              <div key={a.id} className="border border-gray-100 p-4 hover:bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                  <h5 className="text-sm font-semibold text-gray-900">{a.auctionName}</h5>
                                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 font-mono">
                                    <span>Platform: <strong>{a.auctionPlatform}</strong></span>
                                    <span>Ends: {a.endDate ? new Date(a.endDate).toLocaleDateString() : '-'}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <span className="text-xs text-gray-400 block">Your Items</span>
                                    <span className="text-sm font-bold text-[#1A1A19] font-mono">{itemsInAuc.length} Lots</span>
                                  </div>
                                  <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                    {a.auctionStatus}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {associatedAuctions.activeAndUpcoming.length === 0 && (
                            <p className="text-sm text-gray-400 py-4 text-center">No active or scheduled auctions for this consignee's items.</p>
                          )}
                        </div>
                      </div>

                      {/* Past / Closed Auctions Card */}
                      <div className="border border-[#E5E5E0] bg-white">
                        <div className="px-5 py-3 border-b border-[#E5E5E0] bg-gray-50 flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-gray-800 uppercase tracking-wider flex items-center">
                            <CheckCircle className="h-4 w-4 mr-2 text-gray-500" />
                            Past & Settled Auctions ({associatedAuctions.past.length})
                          </h4>
                          <span className="text-[10px] text-gray-500 font-mono">Historical performance</span>
                        </div>
                        <div className="p-4 space-y-4">
                          {associatedAuctions.past.map(a => {
                            const itemsInAuc = hydratedLots.filter(l => l.auctionId === a.id);
                            const soldInAuc = itemsInAuc.filter(l => l.lotStatus === 'Sold');
                            const hammerInAuc = soldInAuc.reduce((sum, l) => sum + (l.hammerPrice || 0), 0);
                            const payoutInAuc = soldInAuc.reduce((sum, l) => sum + (l.consigneePayout || 0), 0);

                            return (
                              <div key={a.id} className="border border-gray-100 p-4 hover:bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div>
                                  <h5 className="text-sm font-semibold text-gray-900">{a.auctionName}</h5>
                                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-1 font-mono">
                                    <span>Platform: <strong>{a.auctionPlatform}</strong></span>
                                    <span>Closed: {a.endDate ? new Date(a.endDate).toLocaleDateString() : '-'}</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-6 text-right">
                                  <div>
                                    <span className="text-[10px] text-gray-400 block">Sold / Total</span>
                                    <span className="text-xs font-bold text-gray-700 font-mono">
                                      {soldInAuc.length} / {itemsInAuc.length}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-gray-400 block">Hammer Sales</span>
                                    <span className="text-xs font-bold text-gray-900 font-mono">
                                      ${hammerInAuc.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-[10px] text-gray-400 block">Net Payout</span>
                                    <span className="text-xs font-bold text-emerald-700 font-mono">
                                      ${payoutInAuc.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {associatedAuctions.past.length === 0 && (
                            <p className="text-sm text-gray-400 py-4 text-center">No past auctions on file for this consignee.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {modalTab === 'settlements' && (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between border-b border-[#E5E5E0] pb-2">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">Settlement Ledger & Disbursements</h4>
                          <p className="text-xs text-gray-500">Historical payout packets grouped by auction event.</p>
                        </div>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2.5 py-1 font-mono font-semibold">
                          Total Payments: ${financialStats.totalPayouts.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="space-y-4">
                        {settlementHistory.map(group => {
                          const key = group.auctionId || 'unscheduled';
                          const isExpanded = !!expandedSettlementAuctions[key];

                          return (
                            <div key={key} className="border border-[#E5E5E0] bg-white overflow-hidden transition-all duration-150">
                              {/* Header row */}
                              <div 
                                onClick={() => toggleSettlementExpanded(group.auctionId)}
                                className="px-5 py-4 bg-gray-50/50 hover:bg-gray-100/50 cursor-pointer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                              >
                                <div className="flex items-start space-x-3">
                                  <div className="mt-1">
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4 text-gray-500" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4 text-gray-500" />
                                    )}
                                  </div>
                                  <div>
                                    <h5 className="text-sm font-semibold text-gray-900 flex items-center">
                                      {group.auctionName}
                                    </h5>
                                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 font-mono">
                                      <span>Platform: {group.auctionPlatform}</span>
                                      <span>Date Sold: {group.endDate ? new Date(group.endDate).toLocaleDateString() : '-'}</span>
                                      <span>Items: {group.lots.length}</span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-6 self-end sm:self-center">
                                  <div className="text-right">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Gross Hammer</span>
                                    <span className="text-xs font-semibold text-gray-900 font-mono">
                                      ${group.totalHammer.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-[10px] text-emerald-600 uppercase tracking-wider block font-semibold">Net Payout</span>
                                    <span className="text-sm font-bold text-emerald-700 font-mono">
                                      ${group.totalPayout.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div>
                                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold border ${
                                      group.payoutStatus === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' :
                                      group.payoutStatus === 'Mixed' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                      'bg-red-50 text-red-700 border-red-200'
                                    }`}>
                                      {group.payoutStatus}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Expandable itemized lots */}
                              {isExpanded && (
                                <div className="border-t border-[#E5E5E0] bg-gray-50/30">
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 text-xs">
                                      <thead className="bg-gray-100/80">
                                        <tr>
                                          <th className="px-6 py-2 text-left text-gray-500 font-medium">Lot #</th>
                                          <th className="px-6 py-2 text-left text-gray-500 font-medium">Item Title</th>
                                          <th className="px-6 py-2 text-right text-gray-500 font-medium">Hammer Price</th>
                                          {group.auctionPlatform === 'Maxsold' && (
                                            <th className="px-6 py-2 text-right text-gray-500 font-medium">Platform Fee</th>
                                          )}
                                          <th className="px-6 py-2 text-right text-gray-500 font-medium">Commission ({selectedConsignee.commissionRate}%)</th>
                                          <th className="px-6 py-2 text-right text-gray-500 font-medium">Tax on Comm.</th>
                                          <th className="px-6 py-2 text-right text-gray-500 font-medium">Net Payout</th>
                                          <th className="px-6 py-2 text-center text-gray-500 font-medium">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200 bg-white">
                                        {group.lots.map(l => (
                                          <tr key={l.id} className="hover:bg-gray-50/50">
                                            <td className="px-6 py-2.5 font-mono font-bold text-gray-700">{l.lotNumber || '-'}</td>
                                            <td className="px-6 py-2.5 font-medium text-gray-900">{l.title}</td>
                                            <td className="px-6 py-2.5 text-right font-mono text-gray-900">${(l.hammerPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            {group.auctionPlatform === 'Maxsold' && (
                                              <td className="px-6 py-2.5 text-right font-mono text-red-500">-${(l.platformFeeAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            )}
                                            <td className="px-6 py-2.5 text-right font-mono text-red-500">-${(l.commissionAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-6 py-2.5 text-right font-mono text-red-400">-${(l.commissionTaxAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-6 py-2.5 text-right font-mono font-bold text-emerald-700">${(l.consigneePayout || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-6 py-2.5 whitespace-nowrap text-center">
                                              <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                                                l.payoutStatus === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                              }`}>
                                                {l.payoutStatus || 'Unpaid'}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Settlement Footer metadata */}
                                  <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400 font-mono flex flex-wrap gap-x-6 gap-y-1">
                                    {group.payoutDate && <span>PAYOUT DATE: {new Date(group.payoutDate).toLocaleDateString()}</span>}
                                    <span>METHOD: {selectedConsignee.paymentMethod || 'Interac e-Transfer'}</span>
                                    {selectedConsignee.emailForETransfer && <span>PAYOUT TO: {selectedConsignee.emailForETransfer}</span>}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {settlementHistory.length === 0 && (
                          <p className="text-sm text-gray-400 py-6 text-center">No settlement history found for this consignee.</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Consignee Form Modal */}
      {isAdding && (
        <div id="add-consignee-modal" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleAddSubmit} className="bg-white border border-[#E5E5E0] shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FCFCFB]">
              <h3 className="text-lg font-medium text-gray-900 font-sans flex items-center">
                <UserPlus className="h-5 w-5 mr-2 text-gray-700" />
                Register New Consignee Document
              </h3>
              <button
                id="btn-close-add-consignee"
                type="button"
                onClick={() => setIsAdding(false)}
                className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Add form layout grouped by panels */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                
                {/* Section 1: Contact & Identity */}
                <div className="border border-gray-200 p-4 space-y-4">
                  <div className="font-semibold text-gray-700 border-b pb-1.5 uppercase tracking-wider">1. Identity & Contact</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">First Name *</label>
                      <input required type="text" name="firstName" value={addForm.firstName} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Last Name *</label>
                      <input required type="text" name="lastName" value={addForm.lastName} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Consignee Acronym (3-Letter Code) *</label>
                      <input required type="text" name="consigneeId" value={addForm.consigneeId || ''} onChange={handleAddChange} placeholder="e.g. CWI" className="w-full border border-gray-300 p-1.5 font-mono font-bold uppercase focus:outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-500 font-medium mb-1">Display Name / Business Name (Optional)</label>
                      <input type="text" name="displayName" value={addForm.displayName} onChange={handleAddChange} placeholder="Leave blank to use First + Last Name" className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-500 font-medium mb-1">Email Address *</label>
                      <input required type="email" name="email" value={addForm.email} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Phone (Primary) *</label>
                      <input required type="text" name="phonePrimary" value={addForm.phonePrimary} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Phone (Secondary / Mobile)</label>
                      <input type="text" name="phoneSecondary" value={addForm.phoneSecondary} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-500 font-medium mb-1">Preferred Contact Method</label>
                      <select name="preferredContactMethod" value={addForm.preferredContactMethod} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        <option value="Email">Email</option>
                        <option value="Phone">Phone</option>
                        <option value="Text">Text</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section 2: Address */}
                <div className="border border-gray-200 p-4 space-y-4">
                  <div className="font-semibold text-gray-700 border-b pb-1.5 uppercase tracking-wider">2. Address</div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Street Address Line 1</label>
                      <input type="text" name="streetAddress1" value={addForm.streetAddress1} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Street Address Line 2</label>
                      <input type="text" name="streetAddress2" value={addForm.streetAddress2} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-500 font-medium mb-1">City</label>
                        <input type="text" name="city" value={addForm.city} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-gray-500 font-medium mb-1">State / Province</label>
                        <input type="text" name="state" value={addForm.state} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-gray-500 font-medium mb-1">Postal Code</label>
                        <input type="text" name="postalCode" value={addForm.postalCode} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-gray-500 font-medium mb-1">Country</label>
                        <input type="text" name="country" value={addForm.country} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: Account & Status */}
                <div className="border border-gray-200 p-4 space-y-4">
                  <div className="font-semibold text-gray-700 border-b pb-1.5 uppercase tracking-wider">3. Account & Status</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Service Type</label>
                      <select name="serviceType" value={addForm.serviceType} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        <option value="Full Service">Full Service</option>
                        <option value="Self Service">Self Service</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Account Status</label>
                      <select name="accountStatus" value={addForm.accountStatus} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Suspended">Suspended</option>
                        <option value="Pending Review">Pending Review</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Referred By</label>
                      <input type="text" name="referredBy" value={addForm.referredBy} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Referral Source</label>
                      <select name="referralSource" value={addForm.referralSource} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        <option value="">-- None --</option>
                        <option value="Google">Google</option>
                        <option value="Word of Mouth">Word of Mouth</option>
                        <option value="Social Media">Social Media</option>
                        <option value="Professional Referral">Professional Referral</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-500 font-medium mb-1">Internal Notes (Staff Only)</label>
                      <textarea name="internalNotes" value={addForm.internalNotes} onChange={handleAddChange} rows={2} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div className="col-span-2 grid grid-cols-2 gap-3 pt-1">
                      <div className="flex items-center">
                        <input type="checkbox" name="portalAccessEnabled" checked={!!addForm.portalAccessEnabled} onChange={handleAddChange} className="h-4 w-4 mr-2 cursor-pointer text-black" />
                        <span className="text-gray-600 font-medium">Enable Portal Access</span>
                      </div>
                      <div>
                        <label className="block text-gray-500 font-medium mb-1">Portal Login Email</label>
                        <input type="email" name="portalLoginEmail" value={addForm.portalLoginEmail} onChange={handleAddChange} placeholder="Defaults to Primary Email" className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 4: Financial & Payment */}
                <div className="border border-gray-200 p-4 space-y-4">
                  <div className="font-semibold text-gray-700 border-b pb-1.5 uppercase tracking-wider">4. Financial & Payment Info</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Payment Method</label>
                      <select name="paymentMethod" value={addForm.paymentMethod} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        <option value="Interac e-Transfer">Interac e-Transfer</option>
                        <option value="Cash">Cash</option>
                        <option value="PayPal">PayPal</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Email for e-Transfer / Paypal</label>
                      <input type="text" name="emailForETransfer" value={addForm.emailForETransfer} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Commission Rate (%) *</label>
                      <input required type="number" name="commissionRate" value={addForm.commissionRate} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Initial Lifetime Gross Sales ($)</label>
                      <input type="number" name="lifetimeGrossSales" value={addForm.lifetimeGrossSales} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Initial Lifetime Payouts ($)</label>
                      <input type="number" name="lifetimePayouts" value={addForm.lifetimePayouts} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                  </div>
                </div>

                {/* Section 5: Consignment Terms */}
                <div className="border border-gray-200 p-4 space-y-4">
                  <div className="font-semibold text-gray-700 border-b pb-1.5 uppercase tracking-wider">5. Consignment Terms</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 flex items-center space-x-6">
                      <div className="flex items-center">
                        <input type="checkbox" name="photoAuthorization" checked={!!addForm.photoAuthorization} onChange={handleAddChange} className="h-4 w-4 mr-2 cursor-pointer text-black" />
                        <span className="text-gray-600 font-semibold">Photo Auth. (Mandatory)</span>
                      </div>
                      <div className="flex items-center">
                        <input type="checkbox" name="acceptsUnsoldReturns" checked={!!addForm.acceptsUnsoldReturns} onChange={handleAddChange} className="h-4 w-4 mr-2 cursor-pointer text-black" />
                        <span className="text-gray-600 font-medium">Accepts Unsold Returns</span>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-500 font-medium mb-1">Unsold Item Disposal Preference</label>
                      <select name="unsoldDisposalPreference" value={addForm.unsoldDisposalPreference} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        <option value="Return">Return</option>
                        <option value="Donate">Donate</option>
                        <option value="Discard">Discard</option>
                      </select>
                    </div>
                    <div className="flex items-center pt-5">
                      <input type="checkbox" name="signedAgreement" checked={!!addForm.signedAgreement} onChange={handleAddChange} className="h-4 w-4 mr-2 cursor-pointer text-black" />
                      <span className="text-gray-600 font-medium">Signed Agreement</span>
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Agreement Signed Date</label>
                      <input type="date" name="agreementDateSigned" value={addForm.agreementDateSigned} onChange={handleAddChange} className="w-full border border-gray-300 p-1 focus:outline-none font-mono" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-500 font-medium mb-1">Agreement Version</label>
                      <input type="text" name="agreementVersion" value={addForm.agreementVersion} onChange={handleAddChange} placeholder="e.g. v1.2" className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                  </div>
                </div>

                {/* Section 6: Logistics & Access */}
                <div className="border border-gray-200 p-4 space-y-4">
                  <div className="font-semibold text-gray-700 border-b pb-1.5 uppercase tracking-wider">6. Logistics & Access</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="block text-gray-500 font-medium mb-1">Pickup Address (If different)</label>
                      <textarea name="pickupAddress" value={addForm.pickupAddress} onChange={handleAddChange} rows={2} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-gray-500 font-medium mb-1">Pickup Availability / Notes</label>
                      <textarea name="pickupAvailabilityNotes" value={addForm.pickupAvailabilityNotes} onChange={handleAddChange} rows={2} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Delivery / Drop-off Preference</label>
                      <select name="deliveryPreference" value={addForm.deliveryPreference} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 bg-white">
                        <option value="Drop-off">Drop-off</option>
                        <option value="Pickup">Pickup</option>
                        <option value="Either">Either</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-gray-500 font-medium mb-1">Storage Location</label>
                      <input type="text" name="storageLocation" value={addForm.storageLocation} onChange={handleAddChange} className="w-full border border-gray-300 p-1.5 focus:outline-none" />
                    </div>
                  </div>
                </div>

              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#E5E5E0] bg-[#FCFCFB] flex justify-end gap-3">
              <button
                id="btn-cancel-add-consignee"
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="btn-submit-add-consignee"
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1A1A19] hover:bg-black cursor-pointer"
              >
                {saving ? 'Creating...' : 'Create Record'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
