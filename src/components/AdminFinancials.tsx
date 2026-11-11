import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Lot, Consignee, Auction, SellerSettlement } from '../types';
import { DollarSign, Filter, Receipt, ArrowRightLeft, Search, CheckCircle2, Clock, Edit2, X, ExternalLink, Printer, Copy, Check, FileText } from 'lucide-react';
import { calculateLotFinancials } from '../lib/financials';
import { PlatformConfig, DEFAULT_PLATFORM_CONFIG } from '../lib/platformConfig';

interface AdminFinancialsProps {
  lots: Lot[];
  consignees: Consignee[];
  auctions: Auction[];
  config?: PlatformConfig;
}

export default function AdminFinancials({ lots, consignees, auctions, config }: AdminFinancialsProps) {
  const activeConfig = config || DEFAULT_PLATFORM_CONFIG;
  const [search, setSearch] = useState('');
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedConsigneeId, setSelectedConsigneeId] = useState<string>('all');

  // Firestore persisted settlements map: key = `${auctionId}_${consigneeId}`
  const [savedSettlements, setSavedSettlements] = useState<Record<string, SellerSettlement>>({});
  const [selectedSettlement, setSelectedSettlement] = useState<SellerSettlement | null>(null);

  // Settlement editing modal state
  const [editStatus, setEditStatus] = useState<'Pending' | 'Processing' | 'Approved' | 'Paid' | 'Void'>('Pending');
  const [editPayoutDate, setEditPayoutDate] = useState<string>('');
  const [editPaymentRef, setEditPaymentRef] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [savingSettlement, setSavingSettlement] = useState(false);
  const [copiedNotification, setCopiedNotification] = useState(false);

  // 1. Subscribe to real-time 'settlements' Firestore collection
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'settlements'), (snap) => {
      const map: Record<string, SellerSettlement> = {};
      snap.docs.forEach(d => {
        const data = d.data() as SellerSettlement;
        const key = d.id;
        map[key] = { id: d.id, ...data };
      });
      setSavedSettlements(map);
    }, (err) => {
      console.error("Error listening to settlements: ", err);
    });

    return () => unsub();
  }, []);

  // 2. Compute sold lots with financials
  const soldLots = useMemo(() => {
    return lots
      .filter(l => l.lotStatus === 'Sold')
      .map(l => {
        const auc = auctions.find(a => a.id === l.auctionId);
        const con = consignees.find(c => c.id === l.consigneeId || c.consigneeId === l.consigneeId);
        const computed = calculateLotFinancials(l, auc, con, activeConfig);
        return {
          ...l,
          ...computed
        };
      });
  }, [lots, auctions, consignees, activeConfig]);

  // 3. Group sold lots by Seller (Consignee) AND Auction -> Creates One Seller Settlement per Auction
  const sellerSettlements = useMemo(() => {
    const groups: Record<string, {
      key: string;
      auctionId: string;
      auctionName: string;
      externalAuctionId: string;
      consigneeDocId: string;
      consigneeIdStr: string;
      consigneeName: string;
      consigneeEmail: string;
      paymentMethod: string;
      grossHammerPrice: number;
      totalPlatformFees: number;
      ourCommissionAmount: number;
      netPayout: number;
      items: Lot[];
    }> = {};

    soldLots.forEach(lot => {
      const aid = lot.auctionId || 'unscheduled';
      const cid = lot.consigneeId || 'unknown';
      const key = `${aid}_${cid}`;

      const auc = auctions.find(a => a.id === aid);
      const con = consignees.find(c => c.id === cid || c.consigneeId === cid);

      if (!groups[key]) {
        groups[key] = {
          key,
          auctionId: aid,
          auctionName: auc ? auc.auctionName : (aid === 'unscheduled' ? 'Unscheduled / Direct Sales' : aid),
          externalAuctionId: auc?.externalAuctionId || '',
          consigneeDocId: con?.id || cid,
          consigneeIdStr: con?.consigneeId || cid,
          consigneeName: con?.displayName || cid,
          consigneeEmail: con?.email || '',
          paymentMethod: con?.paymentMethod || 'Interac e-Transfer',
          grossHammerPrice: 0,
          totalPlatformFees: 0,
          ourCommissionAmount: 0,
          netPayout: 0,
          items: []
        };
      }

      const g = groups[key];
      g.items.push(lot);
      g.grossHammerPrice += lot.hammerPrice || 0;
      g.totalPlatformFees += lot.platformFeeAmount || 0;
      g.ourCommissionAmount += lot.commissionAmount || 0;
      g.netPayout += lot.consigneePayout || 0;
    });

    // Merge computed metrics with Firestore saved settlement documents if available
    return Object.values(groups).map(g => {
      const savedDoc = savedSettlements[g.key];
      const status = savedDoc?.status || 'Pending';
      const payoutDate = savedDoc?.payoutDate || (status === 'Paid' ? new Date().toISOString().split('T')[0] : '');
      const paymentReference = savedDoc?.paymentReference || '';
      const internalNotes = savedDoc?.internalNotes || '';

      return {
        id: g.key,
        settlementId: `SET-${g.key.substring(0, 8).toUpperCase()}`,
        auctionId: g.auctionId,
        auctionName: g.auctionName,
        externalAuctionId: g.externalAuctionId,
        consigneeId: g.consigneeIdStr,
        consigneeName: g.consigneeName,
        consigneeEmail: g.consigneeEmail,
        paymentMethod: g.paymentMethod,
        status: status as SellerSettlement['status'],
        grossHammerPrice: g.grossHammerPrice,
        totalPlatformFees: g.totalPlatformFees,
        ourCommissionAmount: g.ourCommissionAmount,
        netPayout: g.netPayout,
        totalItems: g.items.length,
        payoutDate,
        paymentReference,
        internalNotes,
        associatedLots: g.items
      };
    });
  }, [soldLots, auctions, consignees, savedSettlements]);

  // 4. Apply search & filters
  const filteredSettlements = useMemo(() => {
    return sellerSettlements.filter(s => {
      const term = search.toLowerCase();
      const matchesSearch = 
        s.auctionName.toLowerCase().includes(term) ||
        s.auctionId.toLowerCase().includes(term) ||
        s.consigneeName.toLowerCase().includes(term) ||
        s.consigneeId.toLowerCase().includes(term) ||
        (s.paymentReference && s.paymentReference.toLowerCase().includes(term));

      const matchesAuction = selectedAuctionId === 'all' || s.auctionId === selectedAuctionId;
      const matchesStatus = selectedStatus === 'all' || s.status === selectedStatus;
      const matchesConsignee = selectedConsigneeId === 'all' || s.consigneeId === selectedConsigneeId || s.id.includes(selectedConsigneeId);

      return matchesSearch && matchesAuction && matchesStatus && matchesConsignee;
    });
  }, [sellerSettlements, search, selectedAuctionId, selectedStatus, selectedConsigneeId]);

  // Aggregated Overall Financial Metrics
  const totalGross = filteredSettlements.reduce((sum, item) => sum + item.grossHammerPrice, 0);
  const totalPlatformFees = filteredSettlements.reduce((sum, item) => sum + item.totalPlatformFees, 0);
  const totalCommission = filteredSettlements.reduce((sum, item) => sum + item.ourCommissionAmount, 0);
  const totalPayout = filteredSettlements.reduce((sum, item) => sum + item.netPayout, 0);

  // Open Settlement Modal
  const handleOpenSettlement = (s: SellerSettlement & { associatedLots?: Lot[] }) => {
    setSelectedSettlement(s);
    setEditStatus(s.status || 'Pending');
    setEditPayoutDate(s.payoutDate || (s.status === 'Paid' ? new Date().toISOString().split('T')[0] : ''));
    setEditPaymentRef(s.paymentReference || '');
    setEditNotes(s.internalNotes || '');
  };

  // Save Settlement Status to Firestore
  const handleSaveSettlementStatus = async () => {
    if (!selectedSettlement?.id) return;
    setSavingSettlement(true);
    try {
      const docRef = doc(db, 'settlements', selectedSettlement.id);
      
      const payload: SellerSettlement = {
        id: selectedSettlement.id,
        settlementId: selectedSettlement.settlementId,
        auctionId: selectedSettlement.auctionId,
        auctionName: selectedSettlement.auctionName,
        externalAuctionId: selectedSettlement.externalAuctionId,
        consigneeId: selectedSettlement.consigneeId,
        consigneeName: selectedSettlement.consigneeName,
        consigneeEmail: selectedSettlement.consigneeEmail,
        paymentMethod: selectedSettlement.paymentMethod,
        status: editStatus,
        grossHammerPrice: selectedSettlement.grossHammerPrice,
        totalPlatformFees: selectedSettlement.totalPlatformFees,
        ourCommissionAmount: selectedSettlement.ourCommissionAmount,
        netPayout: selectedSettlement.netPayout,
        totalItems: selectedSettlement.totalItems,
        payoutDate: editPayoutDate || (editStatus === 'Paid' ? new Date().toISOString().split('T')[0] : ''),
        paymentReference: editPaymentRef,
        internalNotes: editNotes,
        updatedAt: new Date().toISOString()
      };

      await setDoc(docRef, payload, { merge: true });

      // Update local view
      setSelectedSettlement(prev => prev ? { ...prev, ...payload } : null);
      alert("Settlement status updated successfully!");
    } catch (err: any) {
      console.error("Error saving settlement status: ", err);
      alert("Error saving settlement status: " + (err.message || 'Unknown error'));
    } finally {
      setSavingSettlement(false);
    }
  };

  // Copy statement formatted text
  const handleCopyStatement = () => {
    if (!selectedSettlement) return;
    const items = (selectedSettlement as any).associatedLots || [];
    let text = `====================================================\n`;
    text += `${activeConfig.branding?.appName || 'MCM Estate Services'} - SELLER SETTLEMENT STATEMENT\n`;
    text += `====================================================\n`;
    text += `Auction ID: ${selectedSettlement.auctionId}\n`;
    text += `Auction Name: ${selectedSettlement.auctionName}\n`;
    text += `Consignee: ${selectedSettlement.consigneeName} (${selectedSettlement.consigneeId})\n`;
    text += `Payment Method: ${selectedSettlement.paymentMethod}\n`;
    text += `Status: ${selectedSettlement.status}\n`;
    text += `Payout Date: ${selectedSettlement.payoutDate || 'Pending'}\n`;
    text += `Payment Reference: ${selectedSettlement.paymentReference || 'None'}\n`;
    text += `----------------------------------------------------\n`;
    text += `FINANCIAL SUMMARY:\n`;
    text += `  Gross Hammer Price:    $${selectedSettlement.grossHammerPrice.toFixed(2)}\n`;
    text += `  Platform Fees:         -$${selectedSettlement.totalPlatformFees.toFixed(2)}\n`;
    text += `  Our Commission:        -$${selectedSettlement.ourCommissionAmount.toFixed(2)}\n`;
    text += `  NET PAYOUT TO SELLER:   $${selectedSettlement.netPayout.toFixed(2)}\n`;
    text += `----------------------------------------------------\n`;
    text += `CATALOG OF ASSOCIATED ITEMS (${items.length}):\n`;
    items.forEach((item: Lot) => {
      text += `  Lot #${item.lotNumber}: ${item.lotTitle} - Hammer: $${(item.hammerPrice || 0).toFixed(2)} | Net: $${(item.consigneePayout || 0).toFixed(2)}\n`;
    });
    text += `====================================================\n`;

    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  return (
    <div id="admin-financials" className="space-y-6">
      
      {/* Header, Search & Filters Bar */}
      <div className="bg-white border border-[#E5E5E0] p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 font-sans flex items-center gap-2">
              <Receipt className="h-5 w-5 text-amber-600" />
              <span>Seller Settlements Management</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Consignees receive one Seller Settlement per auction. Quickly pull up statements, inspect item catalogs, and manage payout statuses.
            </p>
          </div>

          <div className="relative flex-1 max-w-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              id="settlement-search"
              type="text"
              placeholder="Search by Auction Name, ID, or Consignee..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-[#E5E5E0] bg-[#FCFCFB] text-xs focus:outline-none focus:ring-1 focus:ring-[#1A1A19]"
            />
          </div>
        </div>

        {/* Filters Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2 border-t border-gray-100">
          <div>
            <label className="block text-gray-400 font-semibold mb-1 uppercase tracking-wider">Filter Auction</label>
            <select
              id="settlement-auction-filter"
              value={selectedAuctionId}
              onChange={(e) => setSelectedAuctionId(e.target.value)}
              className="w-full border border-[#E5E5E0] p-2 bg-white focus:outline-none"
            >
              <option value="all">All Auction Events</option>
              {auctions.map(a => (
                <option key={a.id} value={a.id}>{a.auctionName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-gray-400 font-semibold mb-1 uppercase tracking-wider">Settlement Status</label>
            <select
              id="settlement-status-filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full border border-[#E5E5E0] p-2 bg-white focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Approved">Approved</option>
              <option value="Paid">Paid</option>
              <option value="Void">Void</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-400 font-semibold mb-1 uppercase tracking-wider">Filter Consignee</label>
            <select
              id="settlement-consignee-filter"
              value={selectedConsigneeId}
              onChange={(e) => setSelectedConsigneeId(e.target.value)}
              className="w-full border border-[#E5E5E0] p-2 bg-white focus:outline-none"
            >
              <option value="all">All Consignees</option>
              {consignees.map(c => (
                <option key={c.id} value={c.consigneeId || c.id}>{c.displayName} ({c.consigneeId})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Financial KPI Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-[#FCFCFB] border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gray-100 text-gray-700">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wider">Gross Hammer Price</p>
              <h5 className="text-lg font-bold font-mono text-gray-950">${totalGross.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h5>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 text-red-700 border border-red-100">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-red-500 font-semibold tracking-wider">Total Platform Fees</p>
              <h5 className="text-lg font-bold font-mono text-red-950">-${totalPlatformFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h5>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 border border-amber-100">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-amber-500 font-semibold tracking-wider">Our Commission Earned</p>
              <h5 className="text-lg font-bold font-mono text-amber-950">${totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h5>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-green-50 text-green-700 border border-green-100">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] uppercase text-green-600 font-semibold tracking-wider">Total Net Seller Payouts</p>
              <h5 className="text-lg font-bold font-mono text-green-950">${totalPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h5>
            </div>
          </div>
        </div>
      </div>

      {/* Seller Settlements List Table */}
      <div className="bg-white border border-[#E5E5E0] overflow-hidden shadow-2xs">
        <div className="px-6 py-3.5 border-b border-[#E5E5E0] bg-[#FCFCFB] flex items-center justify-between">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Seller Settlements List ({filteredSettlements.length})
          </span>
          <span className="text-[10px] font-mono text-gray-400">One settlement record per consignee per auction</span>
        </div>

        <div className="overflow-x-auto">
          <table id="seller-settlements-table" className="w-full min-w-[850px] divide-y divide-[#E5E5E0] text-xs">
            <thead className="bg-[#FCFCFB] text-gray-500 uppercase tracking-wider font-mono">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">Auction ID & Name</th>
                <th className="px-6 py-3 text-left font-semibold">Consignee / Seller</th>
                <th className="px-6 py-3 text-center font-semibold">Catalog Items</th>
                <th className="px-6 py-3 text-right font-semibold">Gross Hammer</th>
                <th className="px-6 py-3 text-right font-semibold">Platform Fees</th>
                <th className="px-6 py-3 text-right font-semibold">Our Commission</th>
                <th className="px-6 py-3 text-right font-semibold">Net Payout</th>
                <th className="px-6 py-3 text-center font-semibold">Status</th>
                <th className="px-6 py-3 text-center font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E5E0] font-sans">
              {filteredSettlements.map((s) => (
                <tr
                  id={`row-settlement-${s.id}`}
                  key={s.id}
                  onClick={() => handleOpenSettlement(s)}
                  className="hover:bg-[#FAF9F6] transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-semibold text-gray-900 truncate max-w-[220px]">{s.auctionName}</div>
                    <div className="text-[10px] font-mono text-gray-400">Auction ID: {s.auctionId}</div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-gray-900">{s.consigneeName}</div>
                    <div className="text-[10px] font-mono text-gray-400">{s.consigneeId} • {s.paymentMethod}</div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-center font-mono font-semibold text-gray-700">
                    {s.totalItems} {s.totalItems === 1 ? 'item' : 'items'}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-semibold text-gray-900">
                    ${s.grossHammerPrice.toFixed(2)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-red-600">
                    {s.totalPlatformFees > 0 ? `-$${s.totalPlatformFees.toFixed(2)}` : '$0.00'}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-amber-800">
                    ${s.ourCommissionAmount.toFixed(2)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-green-700">
                    ${s.netPayout.toFixed(2)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`inline-flex px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${
                      s.status === 'Paid' ? 'bg-green-100 text-green-800 border border-green-200' :
                      s.status === 'Approved' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                      s.status === 'Processing' ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                      s.status === 'Void' ? 'bg-red-100 text-red-800 border border-red-200' :
                      'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}>
                      {s.status}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      id={`btn-pull-settlement-${s.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenSettlement(s);
                      }}
                      className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-semibold text-[11px] transition-colors cursor-pointer"
                    >
                      Pull Up Statement
                    </button>
                  </td>
                </tr>
              ))}

              {filteredSettlements.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-500">
                    No seller settlements match the selected filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAILED SELLER SETTLEMENT MODAL */}
      {selectedSettlement && (
        <div id="settlement-detail-modal" className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E5E5E0] shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#E5E5E0] bg-[#1A1A19] text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono uppercase bg-amber-500 text-black px-2 py-0.5 font-bold">
                    Seller Settlement Statement
                  </span>
                  <span className="text-xs text-gray-400 font-mono">{selectedSettlement.settlementId}</span>
                </div>
                <h3 className="text-lg font-bold font-sans mt-1">{selectedSettlement.auctionName}</h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="btn-copy-statement"
                  onClick={handleCopyStatement}
                  className="px-3 py-1.5 bg-[#2C2C2A] hover:bg-[#3A3A38] text-xs text-gray-200 font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-[#3E3E3B]"
                  title="Copy formatted text statement"
                >
                  {copiedNotification ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-amber-400" />}
                  <span>{copiedNotification ? 'Copied!' : 'Copy Summary'}</span>
                </button>

                <button
                  id="btn-close-settlement-modal"
                  onClick={() => setSelectedSettlement(null)}
                  className="p-1 hover:bg-[#2C2C2A] text-gray-400 hover:text-white cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              
              {/* Auction & Consignee Identity Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#FCFCFB] border border-gray-200 p-4">
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Auction Event Details</h4>
                  <div className="text-sm font-semibold text-gray-900">{selectedSettlement.auctionName}</div>
                  <div className="font-mono text-gray-600">Auction ID: <strong className="text-gray-900">{selectedSettlement.auctionId}</strong></div>
                  {selectedSettlement.externalAuctionId && (
                    <div className="font-mono text-gray-600">External ID: {selectedSettlement.externalAuctionId}</div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Consignee / Seller Details</h4>
                  <div className="text-sm font-semibold text-gray-900">{selectedSettlement.consigneeName}</div>
                  <div className="font-mono text-gray-600">Consignee ID: <strong className="text-gray-900">{selectedSettlement.consigneeId}</strong></div>
                  <div className="text-gray-600">Preferred Payment Method: <strong className="text-gray-900">{selectedSettlement.paymentMethod}</strong></div>
                  {selectedSettlement.consigneeEmail && (
                    <div className="text-gray-500 font-mono">{selectedSettlement.consigneeEmail}</div>
                  )}
                </div>
              </div>

              {/* Financial Metrics Box */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-gray-50 border border-gray-200 p-4 text-center">
                <div className="p-2 bg-white border border-gray-200">
                  <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">Gross Hammer Price</span>
                  <span className="text-base font-bold font-mono text-gray-900 mt-1 block">
                    ${selectedSettlement.grossHammerPrice.toFixed(2)}
                  </span>
                </div>

                <div className="p-2 bg-white border border-gray-200">
                  <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider block">Total Platform Fees</span>
                  <span className="text-base font-bold font-mono text-red-700 mt-1 block">
                    -${selectedSettlement.totalPlatformFees.toFixed(2)}
                  </span>
                </div>

                <div className="p-2 bg-white border border-gray-200">
                  <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wider block">Our Commission Amount</span>
                  <span className="text-base font-bold font-mono text-amber-800 mt-1 block">
                    -${selectedSettlement.ourCommissionAmount.toFixed(2)}
                  </span>
                </div>

                <div className="p-2 bg-green-50 border border-green-200">
                  <span className="text-[10px] uppercase font-bold text-green-700 tracking-wider block">Net Seller Payout</span>
                  <span className="text-base font-bold font-mono text-green-800 mt-1 block">
                    ${selectedSettlement.netPayout.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Editable Settlement Status Control Bar */}
              <div className="bg-amber-50/60 border border-amber-200 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                  <h4 className="font-bold text-amber-900 font-sans flex items-center gap-1.5 text-xs">
                    <Edit2 className="h-4 w-4 text-amber-700" />
                    <span>Edit Settlement Status & Disbursement Details</span>
                  </h4>
                  <span className="text-[10px] font-mono text-amber-800">
                    Real-time status synced with Consignee Portal
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Settlement Status *</label>
                    <select
                      id="input-edit-settlement-status"
                      value={editStatus}
                      onChange={(e: any) => setEditStatus(e.target.value)}
                      className="w-full border border-amber-300 p-2 bg-white font-semibold text-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="Pending">Pending (Awaiting Approval)</option>
                      <option value="Processing">Processing (Queued for Payment)</option>
                      <option value="Approved">Approved (Ready for Disbursement)</option>
                      <option value="Paid">Paid (Disbursed)</option>
                      <option value="Void">Void (Cancelled)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Payout Date</label>
                    <input
                      id="input-edit-payout-date"
                      type="date"
                      value={editPayoutDate}
                      onChange={(e) => setEditPayoutDate(e.target.value)}
                      className="w-full border border-amber-300 p-2 bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-700 font-semibold mb-1">Payment / Reference #</label>
                    <input
                      id="input-edit-payment-ref"
                      type="text"
                      placeholder="e.g. e-Transfer Ref #98124, Check #1042"
                      value={editPaymentRef}
                      onChange={(e) => setEditPaymentRef(e.target.value)}
                      className="w-full border border-amber-300 p-2 bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Internal Settlement Notes</label>
                  <input
                    id="input-edit-settlement-notes"
                    type="text"
                    placeholder="e.g. Approved by Sarah on July 24. Sent via Interac e-Transfer."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full border border-amber-300 p-2 bg-white"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    id="btn-save-settlement-status"
                    type="button"
                    onClick={handleSaveSettlementStatus}
                    disabled={savingSettlement}
                    className="px-5 py-2 bg-[#1A1A19] hover:bg-black text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer transition-colors"
                  >
                    {savingSettlement ? 'Saving to Firestore...' : 'Update & Save Settlement Status'}
                  </button>
                </div>
              </div>

              {/* The Catalog of Associated Items */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                  <h4 className="font-bold text-gray-900 uppercase tracking-wider font-mono text-xs">
                    Catalog of Associated Items ({((selectedSettlement as any).associatedLots || []).length})
                  </h4>
                  <span className="text-[10px] text-gray-400 font-mono">Individual items sold by {selectedSettlement.consigneeName}</span>
                </div>

                <div className="border border-gray-200 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                    <thead className="bg-[#FCFCFB] text-gray-500 font-mono">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Lot #</th>
                        <th className="px-4 py-2.5 font-semibold">Item Title</th>
                        <th className="px-4 py-2.5 font-semibold">Category</th>
                        <th className="px-4 py-2.5 font-semibold">Condition</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Hammer Price</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Platform Fee</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Our Commission ({((selectedSettlement as any).associatedLots?.[0]?.commissionRate) || 15}%)</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Net Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 font-sans">
                      {((selectedSettlement as any).associatedLots || []).map((item: Lot) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono font-bold text-gray-800">{item.lotNumber}</td>
                          <td className="px-4 py-3 font-semibold text-gray-900 max-w-[220px] truncate">{item.lotTitle}</td>
                          <td className="px-4 py-3 text-gray-600">{item.category}</td>
                          <td className="px-4 py-3 text-gray-600">{item.condition}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">${(item.hammerPrice || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-mono text-red-600">
                            {item.platformFeeAmount ? `-$${item.platformFeeAmount.toFixed(2)}` : '$0.00'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-amber-800">
                            {item.commissionAmount ? `-$${item.commissionAmount.toFixed(2)}` : '$0.00'}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-green-700">
                            ${(item.consigneePayout || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                      {((selectedSettlement as any).associatedLots || []).length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-gray-400 italic">
                            No catalog items recorded for this settlement.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
