import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { Consignee, Lot, Auction } from '../types';
import AdminConsignees from '../components/AdminConsignees';
import AdminLots from '../components/AdminLots';
import AdminAuctions from '../components/AdminAuctions';
import AdminFinancials from '../components/AdminFinancials';
import AdminSettings from '../components/AdminSettings';
import MaxsoldCSVImporter from '../components/MaxsoldCSVImporter';
import { listenPlatformConfig, PlatformConfig, DEFAULT_PLATFORM_CONFIG } from '../lib/platformConfig';
import { calculateLotFinancials } from '../lib/financials';
import StatCard from '../components/StatCard';
import { 
  Users, Layers, Calendar, DollarSign, LogOut, LayoutDashboard, 
  ChevronRight, TrendingUp, Landmark, ShieldAlert, CircleAlert, Menu,
  Search, Filter, X, ExternalLink, ArrowUpDown, ChevronUp, ChevronDown, Clock, MapPin, Eye, Info, Settings as SettingsIcon,
  Plus, CheckCircle2, AlertCircle, BarChart3, PieChart, Tag, Package, Sparkles, ArrowUpRight, Zap, Award, FileCheck, RefreshCw, Database, Receipt
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AdminDashboardProps {
  displayName: string;
  onLogout: () => void;
}

export default function AdminDashboard({ displayName, onLogout }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'consignees' | 'lots' | 'auctions' | 'financials' | 'settings'>('dashboard');
  const [platformConfig, setPlatformConfig] = useState<PlatformConfig>(DEFAULT_PLATFORM_CONFIG);
  
  const [consignees, setConsignees] = useState<Consignee[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [auctions, setAuctions] = useState<Auction[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshToggle, setRefreshToggle] = useState(0);
  const [isMaxsoldModalOpen, setIsMaxsoldModalOpen] = useState(false);

  // Search and Filter states for the Active & Upcoming Auctions panel
  const [auctionSearch, setAuctionSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active_upcoming' | 'all' | 'Live' | 'Scheduled' | 'Closed' | 'Settled'>('active_upcoming');
  const [platformFilter, setPlatformFilter] = useState<string>('All');
  
  // Sort states
  const [sortField, setSortField] = useState<'internalReferenceCode' | 'auctionName' | 'auctionPlatform' | 'auctionStatus' | 'endDate'>('endDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Selected Auction for drill-down/click into
  const [selectedDashboardAuction, setSelectedDashboardAuction] = useState<Auction | null>(null);

  // Set up real-time listener snapshots for all collections
  useEffect(() => {
    setLoading(true);

    const unsubConsignees = onSnapshot(collection(db, 'consignees'), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Consignee));
      setConsignees(data);
    });

    const unsubAuctions = onSnapshot(query(collection(db, 'auctions'), orderBy('startDate', 'desc')), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Auction));
      setAuctions(data);
    });

    const unsubLots = onSnapshot(query(collection(db, 'lots'), orderBy('lotNumber', 'asc')), (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lot));
      setLots(data);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    const unsubConfig = listenPlatformConfig((config) => {
      setPlatformConfig(config);
    });

    return () => {
      unsubConsignees();
      unsubAuctions();
      unsubLots();
      unsubConfig();
    };
  }, [refreshToggle]);

  const triggerRefresh = () => {
    setRefreshToggle(p => p + 1);
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onLogout();
    } catch (err) {
      console.error(err);
    }
  };

  // Compute Home KPIs and Operational Metrics
  const totalActiveLots = lots.filter(l => l.lotStatus === 'Active').length;
  const draftOrUnassignedLots = lots.filter(l => l.lotStatus === 'Draft' || !l.assignedAuctionId).length;
  const totalConsignees = consignees.length;
  const pendingConsignees = consignees.filter(c => c.accountStatus === 'Pending' || c.accountStatus === 'Inactive').length;
  
  // Calculate Sales & Revenue
  const soldLots = lots.filter(l => l.lotStatus === 'Sold');

  const soldLotsWithFinancials = React.useMemo(() => {
    return soldLots.map(l => {
      const auc = auctions.find(a => a.id === l.auctionId || (a.externalAuctionId && a.externalAuctionId === l.auctionId));
      const con = consignees.find(c => c.id === l.consigneeId || c.consigneeId === l.consigneeId);
      const computed = calculateLotFinancials(l, auc, con, platformConfig);
      return {
        ...l,
        computedCommission: computed.commissionAmount ?? l.commissionAmount ?? 0,
        computedBP: computed.buyersPremium ?? l.buyersPremium ?? 0,
        computedPayout: computed.consigneePayout ?? l.consigneePayout ?? 0,
      };
    });
  }, [soldLots, auctions, consignees, platformConfig]);

  const grossSalesMTD = soldLotsWithFinancials.reduce((sum, l) => sum + (l.hammerPrice || 0), 0);
  const totalBP = soldLotsWithFinancials.reduce((sum, l) => sum + (l.computedBP || 0), 0);
  const totalCompanyCommission = soldLotsWithFinancials.reduce((sum, l) => sum + (l.computedCommission || 0), 0);
  const totalNetCompanyEarnings = totalBP + totalCompanyCommission;
  
  // Outstanding payout settlements
  const unpaidSoldLots = soldLotsWithFinancials.filter(l => l.payoutStatus !== 'Paid');
  const pendingSettlements = unpaidSoldLots.reduce((sum, l) => sum + (l.computedPayout || 0), 0);

  // Effective Percentages for Yield Breakdown UI
  const effectiveCommissionRate = grossSalesMTD > 0 ? ((totalCompanyCommission / grossSalesMTD) * 100).toFixed(1) : '0.0';
  const effectiveBPRate = grossSalesMTD > 0 ? ((totalBP / grossSalesMTD) * 100).toFixed(1) : '0.0';
  const consigneeNetRate = grossSalesMTD > 0 ? (((grossSalesMTD - totalCompanyCommission) / grossSalesMTD) * 100).toFixed(1) : '0.0';
  const companyNetRate = grossSalesMTD > 0 ? ((totalNetCompanyEarnings / grossSalesMTD) * 100).toFixed(1) : '0.0';

  // Live and Scheduled Auctions
  const liveAuctions = auctions.filter(a => a.auctionStatus === 'Live');
  const scheduledAuctions = auctions.filter(a => a.auctionStatus === 'Scheduled');

  // Top Categories Distribution
  const categoryCounts = React.useMemo(() => {
    const map: Record<string, number> = {};
    lots.forEach(l => {
      const cat = l.category || 'Uncategorized';
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map)
      .map(([category, count]) => ({ category, count, percentage: lots.length > 0 ? Math.round((count / lots.length) * 100) : 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [lots]);

  // Sorting Handler
  const handleSort = (field: 'internalReferenceCode' | 'auctionName' | 'auctionPlatform' | 'auctionStatus' | 'endDate') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filtered and Sorted Auctions for the Dashboard active/upcoming panel
  const filteredAndSortedAuctions = React.useMemo(() => {
    return auctions
      .filter((a) => {
        // Search filter
        const matchesSearch = 
          a.auctionName.toLowerCase().includes(auctionSearch.toLowerCase()) ||
          (a.internalReferenceCode || '').toLowerCase().includes(auctionSearch.toLowerCase()) ||
          a.auctionPlatform.toLowerCase().includes(auctionSearch.toLowerCase());
        
        // Status filter
        let matchesStatus = true;
        if (statusFilter === 'active_upcoming') {
          matchesStatus = a.auctionStatus === 'Live' || a.auctionStatus === 'Scheduled';
        } else if (statusFilter !== 'all') {
          matchesStatus = a.auctionStatus === statusFilter;
        }

        // Platform filter
        const matchesPlatform = platformFilter === 'All' || a.auctionPlatform === platformFilter;

        return matchesSearch && matchesStatus && matchesPlatform;
      })
      .sort((a, b) => {
        const valA = a[sortField] || '';
        const valB = b[sortField] || '';

        let comparison = 0;
        if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
        } else {
          comparison = valA < valB ? -1 : (valA > valB ? 1 : 0);
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
  }, [auctions, auctionSearch, statusFilter, platformFilter, sortField, sortDirection]);

  // Dynamic unique platforms list
  const uniquePlatforms = React.useMemo(() => {
    const platforms = auctions.map(a => a.auctionPlatform);
    return ['All', ...Array.from(new Set(platforms)).filter(Boolean)];
  }, [auctions]);

  // Lots for selected dashboard auction detail modal
  const selectedAuctionLots = React.useMemo(() => {
    if (!selectedDashboardAuction) return [];
    return lots.filter(l => 
      l.auctionId === selectedDashboardAuction.id || 
      (selectedDashboardAuction.externalAuctionId && l.auctionId === selectedDashboardAuction.externalAuctionId)
    );
  }, [lots, selectedDashboardAuction]);

  // Financial performance metrics & consignee settlements for selected auction modal
  const selectedAuctionMetrics = React.useMemo(() => {
    if (!selectedDashboardAuction) {
      return {
        grossSales: 0,
        totalCommission: 0,
        houseNetSales: 0,
        buyersPremium: 0,
        totalRevenue: 0,
        isHiBid: false,
        totalLotsCount: 0,
        soldLotsCount: 0,
        str: 0,
        consigneeSettlements: [] as Array<{
          consigneeId: string;
          consigneeName: string;
          totalLots: number;
          soldLots: number;
          grossSales: number;
          commission: number;
          netPayout: number;
          payoutStatus: string;
          paymentMethod?: string;
        }>
      };
    }

    const aucLots = lots.filter(l => 
      l.auctionId === selectedDashboardAuction.id || 
      (selectedDashboardAuction.externalAuctionId && l.auctionId === selectedDashboardAuction.externalAuctionId)
    );

    const soldLots = aucLots.filter(l => l.lotStatus === 'Sold');

    let computedGrossSales = 0;
    let totalCommission = 0;
    let houseNetSales = 0;
    let buyersPremium = 0;

    const isHiBid = (selectedDashboardAuction.auctionPlatform || '').toLowerCase().includes('hibid') || 
                    (selectedDashboardAuction.buyersPremiumRate ? selectedDashboardAuction.buyersPremiumRate > 0 : false);

    const settlementsMap: Record<string, {
      consigneeId: string;
      consigneeName: string;
      totalLots: number;
      soldLots: number;
      grossSales: number;
      commission: number;
      netPayout: number;
      payoutStatus: string;
      paymentMethod?: string;
    }> = {};

    soldLots.forEach(lot => {
      const hammer = lot.hammerPrice || 0;
      computedGrossSales += hammer;

      const matchedConsignee = consignees.find(c => c.id === lot.consigneeId || c.consigneeId === lot.consigneeId);
      
      const consigneeName = matchedConsignee?.displayName || lot.consigneeId || 'Unassigned';
      const consigneeIdStr = (matchedConsignee?.consigneeId || lot.consigneeId || '').toUpperCase();
      const cNameUpper = consigneeName.toUpperCase();
      const isHouse = consigneeIdStr.includes('ANTYQUES') || 
                      cNameUpper.includes('ANTYQUES') || 
                      cNameUpper.includes('HOUSE') ||
                      consigneeIdStr.includes('HOUSE');

      const computed = calculateLotFinancials(
        lot,
        selectedDashboardAuction,
        matchedConsignee
      );

      const lotComm = computed.commissionAmount ?? 0;
      const lotNetPayout = computed.consigneePayout ?? (hammer - lotComm);
      const lotBp = computed.buyersPremium ?? 0;

      if (isHouse) {
        houseNetSales += lotNetPayout;
      } else {
        totalCommission += lotComm;
      }

      if (isHiBid) {
        buyersPremium += lotBp;
      }

      const cKey = matchedConsignee?.id || lot.consigneeId || 'house';
      if (!settlementsMap[cKey]) {
        settlementsMap[cKey] = {
          consigneeId: matchedConsignee?.consigneeId || lot.consigneeId || 'HOUSE',
          consigneeName: consigneeName,
          totalLots: 0,
          soldLots: 0,
          grossSales: 0,
          commission: 0,
          netPayout: 0,
          payoutStatus: 'Pending',
          paymentMethod: matchedConsignee?.paymentMethod || 'Interac e-Transfer'
        };
      }

      settlementsMap[cKey].soldLots += 1;
      settlementsMap[cKey].grossSales += hammer;
      settlementsMap[cKey].commission += lotComm;
      settlementsMap[cKey].netPayout += lotNetPayout;
    });

    aucLots.forEach(lot => {
      const cKey = lot.consigneeId || 'house';
      if (!settlementsMap[cKey]) {
        const matchedConsignee = consignees.find(c => c.id === lot.consigneeId || c.consigneeId === lot.consigneeId);
        settlementsMap[cKey] = {
          consigneeId: matchedConsignee?.consigneeId || lot.consigneeId || 'HOUSE',
          consigneeName: matchedConsignee?.displayName || lot.consigneeId || 'Unassigned',
          totalLots: 0,
          soldLots: 0,
          grossSales: 0,
          commission: 0,
          netPayout: 0,
          payoutStatus: 'N/A',
          paymentMethod: matchedConsignee?.paymentMethod || 'Interac e-Transfer'
        };
      }
      settlementsMap[cKey].totalLots += 1;
    });

    const grossSales = Math.max(computedGrossSales, selectedDashboardAuction.grossSales || 0);
    
    // Total Revenue formula: Total Commission + Net Sales (House Seller ANTYQUES) + Buyers Premium (if HiBid)
    const totalRevenue = totalCommission + houseNetSales + (isHiBid ? buyersPremium : 0);

    const totalLotsCount = aucLots.length;
    const soldLotsCount = soldLots.length;
    const str = totalLotsCount > 0 ? Math.round((soldLotsCount / totalLotsCount) * 100) : 0;

    return {
      grossSales,
      totalCommission,
      houseNetSales,
      buyersPremium,
      totalRevenue,
      isHiBid,
      totalLotsCount,
      soldLotsCount,
      str,
      consigneeSettlements: Object.values(settlementsMap)
    };
  }, [selectedDashboardAuction, lots, consignees]);

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  return (
    <div id="admin-dashboard-layout" className="min-h-screen bg-[#FBFBFA] flex flex-col md:flex-row font-sans">
      
      {/* MOBILE TOP BAR HEADER */}
      <div className="md:hidden bg-[#121211] text-white p-4 border-b border-[#242422] flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 font-bold">✦</span>
          <span className="font-semibold text-sm tracking-tight">{platformConfig.branding?.appName || 'MCM Estate Services'}</span>
        </div>
        <button
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          className="p-1.5 text-gray-300 hover:text-white hover:bg-[#252523] rounded transition-colors"
          aria-label="Toggle navigation"
        >
          {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* PERSISTENT / COLLAPSIBLE SIDEBAR */}
      <aside className={`w-full md:w-64 bg-[#121211] text-white flex flex-col border-r border-[#242422] md:min-h-screen ${
        isMobileNavOpen ? 'block' : 'hidden md:flex'
      }`}>
        <div className="p-6 border-b border-[#242422] bg-[#0A0A09]">
          <h2 className="text-xl font-sans font-medium tracking-tight">
            {(() => {
              const parts = (platformConfig.branding?.appName || 'MCM Estate Services').split(' ');
              const first = parts[0] || '';
              const rest = parts.slice(1).join(' ') || '';
              return (
                <span className="flex items-center gap-1.5">
                  <span className="text-amber-500">✦</span>
                  <span>{first} <span className="font-light text-neutral-400">{rest}</span></span>
                </span>
              );
            })()}
          </h2>
          <p className="text-[9px] text-amber-500/80 uppercase tracking-widest font-mono mt-1.5 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
            Admin Operations
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 bg-[#121211]">
          <button
            id="tab-dashboard"
            onClick={() => { setActiveTab('dashboard'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 text-xs uppercase tracking-wider font-semibold transition-all duration-150 rounded-none cursor-pointer border-l-2 ${
              activeTab === 'dashboard' 
                ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-l-amber-500 text-white font-bold' 
                : 'border-l-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1D]/50'
            }`}
          >
            <span className="flex items-center">
              <LayoutDashboard className="h-4 w-4 mr-3 text-amber-500/80" />
              Control Center
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Live</span>
          </button>
          
          <button
            id="tab-consignees"
            onClick={() => { setActiveTab('consignees'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 text-xs uppercase tracking-wider font-semibold transition-all duration-150 rounded-none cursor-pointer border-l-2 ${
              activeTab === 'consignees' 
                ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-l-amber-500 text-white font-bold' 
                : 'border-l-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1D]/50'
            }`}
          >
            <span className="flex items-center">
              <Users className="h-4 w-4 mr-3 text-amber-500/80" />
              Consignees
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-[#252523] text-gray-300 font-medium">{consignees.length}</span>
          </button>
          
          <button
            id="tab-lots"
            onClick={() => { setActiveTab('lots'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 text-xs uppercase tracking-wider font-semibold transition-all duration-150 rounded-none cursor-pointer border-l-2 ${
              activeTab === 'lots' 
                ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-l-amber-500 text-white font-bold' 
                : 'border-l-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1D]/50'
            }`}
          >
            <span className="flex items-center">
              <Layers className="h-4 w-4 mr-3 text-amber-500/80" />
              Lots / Catalog
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-[#252523] text-gray-300 font-medium">{lots.length}</span>
          </button>
          
          <button
            id="tab-auctions"
            onClick={() => { setActiveTab('auctions'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 text-xs uppercase tracking-wider font-semibold transition-all duration-150 rounded-none cursor-pointer border-l-2 ${
              activeTab === 'auctions' 
                ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-l-amber-500 text-white font-bold' 
                : 'border-l-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1D]/50'
            }`}
          >
            <span className="flex items-center">
              <Calendar className="h-4 w-4 mr-3 text-amber-500/80" />
              Auctions
            </span>
            {liveAuctions.length > 0 ? (
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 animate-pulse">
                LIVE ({liveAuctions.length})
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 bg-[#252523] text-gray-300 font-medium">{auctions.length}</span>
            )}
          </button>
          
          <button
            id="tab-financials"
            onClick={() => { setActiveTab('financials'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 text-xs uppercase tracking-wider font-semibold transition-all duration-150 rounded-none cursor-pointer border-l-2 ${
              activeTab === 'financials' 
                ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-l-amber-500 text-white font-bold' 
                : 'border-l-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1D]/50'
            }`}
          >
            <span className="flex items-center">
              <Landmark className="h-4 w-4 mr-3 text-amber-500/80" />
              Settlements
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 bg-[#252523] text-emerald-400 font-semibold">
              ${pendingSettlements > 0 ? pendingSettlements.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </span>
          </button>

          <button
            id="tab-settings"
            onClick={() => { setActiveTab('settings'); setIsMobileNavOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-3 text-xs uppercase tracking-wider font-semibold transition-all duration-150 rounded-none cursor-pointer border-l-2 ${
              activeTab === 'settings' 
                ? 'bg-gradient-to-r from-amber-500/10 to-transparent border-l-amber-500 text-white font-bold' 
                : 'border-l-transparent text-gray-400 hover:text-white hover:bg-[#1E1E1D]/50'
            }`}
          >
            <span className="flex items-center">
              <SettingsIcon className="h-4 w-4 mr-3 text-amber-500/80" />
              System Settings
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 text-gray-500">v1.2</span>
          </button>
        </nav>

        {/* Profile indicator */}
        <div className="p-4 border-t border-[#242422] bg-[#0A0A09] flex items-center justify-between">
          <div className="truncate">
            <div className="text-[10px] uppercase font-mono tracking-wider text-gray-500 font-semibold">Security Role: Staff</div>
            <div className="text-xs font-semibold text-gray-200 truncate mt-0.5" title={displayName}>{displayName}</div>
          </div>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        
        {/* TOP BAR */}
        <header className="h-16 bg-white border-b border-[#E5E5E0] flex items-center justify-between px-4 sm:px-8 shadow-xs">
          <div className="flex items-center gap-2 sm:gap-3">
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              id="btn-logout"
              onClick={handleLogout}
              className="inline-flex items-center px-2.5 sm:px-4 py-2 border border-[#E5E5E0] bg-white text-xs font-semibold text-gray-700 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors duration-150 cursor-pointer shadow-2xs"
            >
              <LogOut className="h-3.5 w-3.5 mr-1 sm:mr-1.5 text-gray-400 group-hover:text-red-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {loading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="text-center space-y-4">
                <svg className="animate-spin h-8 w-8 text-[#1A1A19] mx-auto" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-xs text-gray-500 uppercase tracking-widest font-mono">Syncing real-time Firestore stream...</p>
              </div>
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
                  className="space-y-6 sm:space-y-8"
                >
                  {/* Executive Quick Actions Bar */}
                  <div className="bg-gradient-to-r from-[#121211] via-[#1A1A19] to-[#252523] text-white p-4 sm:p-6 border-l-4 border-l-amber-500 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="text-xl md:text-2xl font-bold font-sans tracking-tight">Overview</h1>
                    </div>
                    
                    {/* Quick Action Shortcuts */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        id="btn-quick-add-lot"
                        onClick={() => setActiveTab('lots')}
                        className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Catalog Lot</span>
                      </button>
                      <button
                        id="btn-quick-add-consignee"
                        onClick={() => setActiveTab('consignees')}
                        className="px-3 py-2 bg-[#2C2C2A] hover:bg-[#383835] text-white font-semibold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border border-[#3E3E3B]"
                      >
                        <Users className="h-3.5 w-3.5 text-amber-400" />
                        <span>Consignee</span>
                      </button>
                      <button
                        id="btn-quick-add-auction"
                        onClick={() => setActiveTab('auctions')}
                        className="px-3 py-2 bg-[#2C2C2A] hover:bg-[#383835] text-white font-semibold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border border-[#3E3E3B]"
                      >
                        <Calendar className="h-3.5 w-3.5 text-blue-400" />
                        <span>Auction</span>
                      </button>
                      <button
                        id="btn-quick-settlements"
                        onClick={() => setActiveTab('financials')}
                        className="px-3 py-2 bg-[#2C2C2A] hover:bg-[#383835] text-white font-semibold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer border border-[#3E3E3B]"
                      >
                        <Landmark className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Settlements</span>
                      </button>
                      <button
                        id="btn-quick-maxsold-import"
                        onClick={() => setIsMaxsoldModalOpen(true)}
                        className="px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-xs border border-blue-500/50"
                      >
                        <Database className="h-3.5 w-3.5 text-blue-200" />
                        <span>Maxsold Import</span>
                      </button>
                    </div>
                  </div>

                  {/* Top KPIs Banner (Responsive 5 Cards Grid) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                    <StatCard id="stat-active-lots" title="Active Catalog Lots" value={totalActiveLots} subtitle={`Out of ${lots.length} total lots`} icon={<Layers className="h-4 w-4" />} color="blue" />
                    <StatCard id="stat-total-consignees" title="Consignees" value={totalConsignees} subtitle={`${pendingConsignees} pending review`} icon={<Users className="h-4 w-4" />} color="purple" />
                    <StatCard id="stat-gross-sales" title="Gross Hammer Vol." value={`$${grossSalesMTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtitle="Aggregated hammer sales" icon={<TrendingUp className="h-4 w-4" />} color="dark" />
                    <StatCard id="stat-pending-settlements" title="Pending Settlements" value={`$${pendingSettlements.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtitle={`${unpaidSoldLots.length} sold lots awaiting payout`} icon={<DollarSign className="h-4 w-4" />} color="emerald" />
                    <StatCard id="stat-company-earnings" title="Est. Net Revenue" value={`$${totalNetCompanyEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtitle="Commissions + Buyer's BP" icon={<Award className="h-4 w-4" />} color="amber" />
                  </div>

                  {/* Live Auction Banner Spotlight (if any live auctions exist) */}
                  {liveAuctions.length > 0 && (
                    <div id="live-auction-spotlight" className="bg-emerald-950/10 border-l-4 border-l-emerald-500 border border-emerald-200/60 p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="relative flex h-3 w-3 mt-1">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider font-mono text-emerald-800 bg-emerald-100 px-2 py-0.5 border border-emerald-200">
                              LIVE AUCTION RUNNING NOW ({liveAuctions.length})
                            </span>
                            <span className="text-xs text-gray-500 font-mono">Ref: {liveAuctions[0].internalReferenceCode}</span>
                          </div>
                          <h3 className="text-base font-bold text-gray-900 mt-1">{liveAuctions[0].auctionName}</h3>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Platform: <strong className="font-semibold text-gray-800">{liveAuctions[0].auctionPlatform}</strong> • Ends: {liveAuctions[0].endDate} {liveAuctions[0].endTime}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {liveAuctions[0].auctionURL && (
                          <a
                            href={liveAuctions[0].auctionURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          >
                            <span>Open Live Catalog</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => setSelectedDashboardAuction(liveAuctions[0])}
                          className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-emerald-300 text-emerald-900 font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Drill Down</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Operational Attention Grid (3 Cards) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Card 1: Unassigned Lots */}
                    <div className="bg-white border border-[#E5E5E0] p-5 flex flex-col justify-between hover:border-amber-400 transition-colors shadow-2xs">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 border border-amber-100">
                            Inventory Pipeline
                          </span>
                          <Package className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="mt-3">
                          <div className="text-2xl font-bold font-mono text-gray-900">{draftOrUnassignedLots}</div>
                          <div className="text-xs font-semibold text-gray-800 mt-0.5">Draft or Unassigned Lots</div>
                          <p className="text-xs text-gray-500 mt-1">Items waiting in intake queue to be assigned to an active or upcoming auction catalog.</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('lots')}
                        className="mt-4 text-xs font-semibold text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Manage & Assign Lots</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Card 2: Consignee Accounts */}
                    <div className="bg-white border border-[#E5E5E0] p-5 flex flex-col justify-between hover:border-purple-400 transition-colors shadow-2xs">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 border border-purple-100">
                            Client Onboarding
                          </span>
                          <Users className="h-4 w-4 text-purple-600" />
                        </div>
                        <div className="mt-3">
                          <div className="text-2xl font-bold font-mono text-gray-900">{pendingConsignees}</div>
                          <div className="text-xs font-semibold text-gray-800 mt-0.5">Pending Consignee Reviews</div>
                          <p className="text-xs text-gray-500 mt-1">Consignee accounts awaiting contract confirmation, tax form review, or approval.</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('consignees')}
                        className="mt-4 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Review Consignee Accounts</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Card 3: Settlements Queue */}
                    <div className="bg-white border border-[#E5E5E0] p-5 flex flex-col justify-between hover:border-emerald-400 transition-colors shadow-2xs">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-100">
                            Payout Settlements
                          </span>
                          <Landmark className="h-4 w-4 text-emerald-600" />
                        </div>
                        <div className="mt-3">
                          <div className="text-2xl font-bold font-mono text-gray-900">${pendingSettlements.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          <div className="text-xs font-semibold text-gray-800 mt-0.5">{unpaidSoldLots.length} Sold Lots Awaiting Payout</div>
                          <p className="text-xs text-gray-500 mt-1">Accumulated consignee proceeds after hammer fees and commission subtractions.</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setActiveTab('financials')}
                        className="mt-4 text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Process Settlements</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Analytics Breakdown Row: Categories & Revenue Split */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Category Distribution */}
                    <div className="bg-white border border-[#E5E5E0] p-6 space-y-4 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 font-sans flex items-center gap-2">
                            <Tag className="h-4 w-4 text-amber-600" />
                            <span>Top Estate Inventory Categories</span>
                          </h3>
                          <p className="text-xs text-gray-400">Distribution of item catalog by category tags.</p>
                        </div>
                        <span className="text-xs font-mono font-semibold text-gray-500">{lots.length} total lots</span>
                      </div>

                      <div className="space-y-3">
                        {categoryCounts.map((cat, idx) => (
                          <div key={cat.category} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-gray-800">{cat.category}</span>
                              <span className="font-mono text-gray-500">{cat.count} lots ({cat.percentage}%)</span>
                            </div>
                            <div className="w-full bg-gray-100 h-2 overflow-hidden rounded-none">
                              <div 
                                className={`h-full ${
                                  idx === 0 ? 'bg-amber-500' :
                                  idx === 1 ? 'bg-blue-500' :
                                  idx === 2 ? 'bg-purple-500' :
                                  idx === 3 ? 'bg-emerald-500' : 'bg-gray-400'
                                }`}
                                style={{ width: `${Math.max(cat.percentage, 4)}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                        {categoryCounts.length === 0 && (
                          <div className="text-xs text-gray-400 italic py-4 text-center">No categories registered yet.</div>
                        )}
                      </div>
                    </div>

                    {/* Revenue Snapshot */}
                    <div className="bg-white border border-[#E5E5E0] p-6 space-y-4 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 font-sans flex items-center gap-2">
                            <PieChart className="h-4 w-4 text-emerald-600" />
                            <span>Financial Yield Breakdown</span>
                          </h3>
                          <p className="text-xs text-gray-400">Hammer sales split between consignee net and company earnings.</p>
                        </div>
                        <span className="text-xs font-mono font-semibold text-green-700">{soldLots.length} sold lots</span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-center py-2 bg-gray-50 border border-gray-100 p-3">
                        <div>
                          <span className="block text-[10px] text-gray-400 uppercase font-mono tracking-wider">Gross Hammer</span>
                          <span className="text-sm font-bold font-mono text-gray-900 mt-0.5 block">
                            ${grossSalesMTD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-gray-400 uppercase font-mono tracking-wider">Consignee Net</span>
                          <span className="text-sm font-bold font-mono text-blue-700 mt-0.5 block">
                            ${(grossSalesMTD - totalCompanyCommission).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-blue-600 font-mono font-medium block">({consigneeNetRate}%)</span>
                        </div>
                        <div>
                          <span className="block text-[10px] text-amber-700 font-bold uppercase font-mono tracking-wider">Company Net</span>
                          <span className="text-sm font-bold font-mono text-amber-600 mt-0.5 block">
                            ${totalNetCompanyEarnings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-amber-600 font-mono font-medium block">({companyNetRate}%)</span>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center py-1 border-b border-gray-50">
                          <span className="text-gray-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            Total Buyer's Premium (BP)
                          </span>
                          <div className="text-right font-mono">
                            <span className="font-semibold text-gray-900">${totalBP.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-gray-400 ml-1.5 text-[10px]">({effectiveBPRate}%)</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-gray-50">
                          <span className="text-gray-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            Total Company Commission
                          </span>
                          <div className="text-right font-mono">
                            <span className="font-semibold text-gray-900">${totalCompanyCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-blue-600 font-semibold ml-1.5 text-[10px]">({effectiveCommissionRate}%)</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-gray-600 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Outstanding Payout Balance
                          </span>
                          <span className="font-mono font-semibold text-emerald-700">${pendingSettlements.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Active & Upcoming Auctions Catalog */}
                  <div className="bg-white border border-[#E5E5E0] p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 font-sans">Active & Upcoming Auctions</h3>
                        <p className="text-xs text-gray-400">Control center list of HiBid synchronized catalogs.</p>
                      </div>
                      <button id="btn-quick-view-auctions" onClick={() => setActiveTab('auctions')} className="text-xs font-semibold text-gray-900 hover:underline">View All Events →</button>
                    </div>

                    {/* Controls Bar: Search & Filters */}
                    <div id="dashboard-auctions-filters" className="flex flex-col lg:flex-row gap-4 justify-between bg-gray-50/50 p-4 border border-[#E5E5E0] rounded-none">
                      
                      {/* Search input */}
                      <div className="relative flex-1 max-w-md">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Search className="h-4 w-4 text-gray-400" />
                        </div>
                        <input
                          id="dashboard-auction-search"
                          type="text"
                          placeholder="Search auctions by code, name, platform..."
                          value={auctionSearch}
                          onChange={(e) => setAuctionSearch(e.target.value)}
                          className="block w-full pl-10 pr-10 py-1.5 border border-[#E5E5E0] bg-white text-xs font-sans focus:outline-none focus:ring-1 focus:ring-[#1A1A19] focus:border-[#1A1A19]"
                        />
                        {auctionSearch && (
                          <button
                            id="btn-clear-dashboard-search"
                            onClick={() => setAuctionSearch('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Status Tabs and Platform Select */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex border border-[#E5E5E0] bg-white p-0.5 text-[11px] font-medium font-sans">
                          {(['active_upcoming', 'Live', 'Scheduled', 'Closed', 'Settled', 'all'] as const).map((status) => {
                            const label = 
                              status === 'active_upcoming' ? 'Active & Upcoming' :
                              status === 'all' ? 'All' : status;
                            const isActive = statusFilter === status;
                            return (
                              <button
                                id={`btn-filter-status-${status}`}
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-2.5 py-1 transition-all cursor-pointer ${
                                  isActive 
                                    ? 'bg-[#1A1A19] text-white font-semibold' 
                                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label htmlFor="dashboard-platform-filter" className="text-xs text-gray-500 font-sans font-medium whitespace-nowrap">Platform:</label>
                          <select
                            id="dashboard-platform-filter"
                            value={platformFilter}
                            onChange={(e) => setPlatformFilter(e.target.value)}
                            className="border border-[#E5E5E0] bg-white text-xs py-1 px-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]"
                          >
                            {uniquePlatforms.map((plat) => (
                              <option key={plat} value={plat}>{plat}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                    </div>

                    <div className="overflow-x-auto border border-[#E5E5E0]">
                      <table id="dashboard-auctions-table" className="w-full min-w-[800px] divide-y divide-[#E5E5E0] text-sm">
                        <thead className="bg-[#FCFCFB]">
                          <tr>
                            <th 
                              id="header-sort-code"
                              onClick={() => handleSort('internalReferenceCode')} 
                              className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase font-sans cursor-pointer hover:bg-gray-100 hover:text-gray-900 select-none group"
                            >
                              <div className="flex items-center gap-1">
                                Event Code
                                {sortField === 'internalReferenceCode' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3 text-gray-900" /> : <ChevronDown className="h-3 w-3 text-gray-900" />
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 text-gray-300 group-hover:text-gray-400" />
                                )}
                              </div>
                            </th>
                            <th 
                              id="header-sort-name"
                              onClick={() => handleSort('auctionName')} 
                              className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase font-sans cursor-pointer hover:bg-gray-100 hover:text-gray-900 select-none group"
                            >
                              <div className="flex items-center gap-1">
                                Auction Name
                                {sortField === 'auctionName' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3 text-gray-900" /> : <ChevronDown className="h-3 w-3 text-gray-900" />
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 text-gray-300 group-hover:text-gray-400" />
                                )}
                              </div>
                            </th>
                            <th 
                              id="header-sort-platform"
                              onClick={() => handleSort('auctionPlatform')} 
                              className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase font-sans cursor-pointer hover:bg-gray-100 hover:text-gray-900 select-none group"
                            >
                              <div className="flex items-center gap-1">
                                Platform
                                {sortField === 'auctionPlatform' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3 text-gray-900" /> : <ChevronDown className="h-3 w-3 text-gray-900" />
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 text-gray-300 group-hover:text-gray-400" />
                                )}
                              </div>
                            </th>
                            <th 
                              id="header-sort-status"
                              onClick={() => handleSort('auctionStatus')} 
                              className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase font-sans cursor-pointer hover:bg-gray-100 hover:text-gray-900 select-none group"
                            >
                              <div className="flex items-center gap-1">
                                Status
                                {sortField === 'auctionStatus' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3 text-gray-900" /> : <ChevronDown className="h-3 w-3 text-gray-900" />
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 text-gray-300 group-hover:text-gray-400" />
                                )}
                              </div>
                            </th>
                            <th 
                              id="header-sort-endDate"
                              onClick={() => handleSort('endDate')} 
                              className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase font-sans cursor-pointer hover:bg-gray-100 hover:text-gray-900 select-none group"
                            >
                              <div className="flex items-center gap-1">
                                End Date
                                {sortField === 'endDate' ? (
                                  sortDirection === 'asc' ? <ChevronUp className="h-3 w-3 text-gray-900" /> : <ChevronDown className="h-3 w-3 text-gray-900" />
                                ) : (
                                  <ArrowUpDown className="h-3 w-3 text-gray-300 group-hover:text-gray-400" />
                                )}
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E5E0]">
                          {filteredAndSortedAuctions.map((a) => (
                            <tr 
                              id={`dashboard-auction-row-${a.id}`} 
                              key={a.id} 
                              onClick={() => setSelectedDashboardAuction(a)}
                              className="hover:bg-gray-50/85 cursor-pointer transition-colors duration-150 group"
                              title="Click to view details"
                            >
                              <td className="px-6 py-3 font-mono text-xs font-semibold text-gray-600">{a.internalReferenceCode}</td>
                              <td className="px-6 py-3 font-medium text-gray-900">
                                <div className="flex items-center justify-between gap-2">
                                  <span>{a.auctionName}</span>
                                  <span className="inline-flex items-center text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity gap-1 font-sans">
                                    <Eye className="h-3.5 w-3.5" />
                                    View details
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-3 text-gray-600 font-mono text-xs">{a.auctionPlatform}</td>
                              <td className="px-6 py-3">
                                <span className={`inline-flex px-1.5 py-0.5 text-xs font-semibold ${
                                  a.auctionStatus === 'Live' ? 'bg-green-100 text-green-800' :
                                  a.auctionStatus === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                                  a.auctionStatus === 'Closed' ? 'bg-amber-100 text-amber-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {a.auctionStatus}
                                </span>
                              </td>
                              <td className="px-6 py-3 font-mono text-xs text-gray-600">{a.endDate}</td>
                            </tr>
                          ))}
                          {filteredAndSortedAuctions.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-10 text-center text-gray-400 italic">
                                No auctions match the current filters.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Detailed Auction Click-Into Modal */}
                  {selectedDashboardAuction && (
                    <div id="dashboard-auction-detail-modal" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                      <div 
                        className="bg-white border border-[#E5E5E0] shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col rounded-none animate-in fade-in duration-200"
                      >
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-gray-50/80">
                          <div>
                            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-gray-400">Control Center Drill-down</span>
                            <h3 className="text-lg font-semibold text-gray-900 font-sans mt-0.5">{selectedDashboardAuction.auctionName}</h3>
                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                              Ref Code: {selectedDashboardAuction.internalReferenceCode} • Platform: {selectedDashboardAuction.auctionPlatform}
                            </p>
                          </div>
                          <button
                            id="btn-close-dashboard-modal"
                            onClick={() => setSelectedDashboardAuction(null)}
                            className="p-1.5 hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
                          
                          {/* Status and core metadata banner */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-4 border border-[#E5E5E0]">
                            <div>
                              <span className="block text-[10px] text-gray-400 uppercase tracking-wider font-mono">Status</span>
                              <span className={`inline-flex mt-1 px-2 py-0.5 text-xs font-semibold ${
                                selectedDashboardAuction.auctionStatus === 'Live' ? 'bg-green-100 text-green-800' :
                                selectedDashboardAuction.auctionStatus === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {selectedDashboardAuction.auctionStatus}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-gray-400 uppercase tracking-wider font-mono">Platform</span>
                              <span className="block mt-1 font-semibold text-gray-800">{selectedDashboardAuction.auctionPlatform}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-gray-400 uppercase tracking-wider font-mono">Type</span>
                              <span className="block mt-1 font-medium text-gray-700">{selectedDashboardAuction.auctionType}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-gray-400 uppercase tracking-wider font-mono">Catalog Link</span>
                              {selectedDashboardAuction.auctionURL ? (
                                <a 
                                  href={selectedDashboardAuction.auctionURL} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="inline-flex items-center mt-1 text-xs text-blue-600 hover:underline font-semibold"
                                >
                                  View Live Catalog
                                  <ExternalLink className="h-3 w-3 ml-1" />
                                </a>
                              ) : (
                                <span className="block mt-1 text-xs text-gray-400 italic">No URL configured</span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Event Logistics & Times */}
                            <div className="space-y-4">
                              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-1 flex items-center gap-1.5 font-sans">
                                <Clock className="h-3.5 w-3.5 text-gray-400" />
                                Dates & Timing
                              </h4>
                              <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                                <div>
                                  <span className="text-gray-400 block">Start Date/Time</span>
                                  <span className="text-gray-800 font-semibold">{selectedDashboardAuction.startDate} {selectedDashboardAuction.startTime}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block">End Date/Time</span>
                                  <span className="text-gray-800 font-semibold">{selectedDashboardAuction.endDate} {selectedDashboardAuction.endTime}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400 block">Pickup Date</span>
                                  <span className="text-gray-800 font-semibold">{selectedDashboardAuction.pickupDate || '-'}</span>
                                </div>
                              </div>
                              <div className="text-xs space-y-2">
                                <div>
                                  <span className="text-gray-400 block">Pickup Instructions</span>
                                  <span className="text-gray-700 italic">{selectedDashboardAuction.pickupHoursNotes || '-'} at {selectedDashboardAuction.pickupLocation || '-'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Financial Performance */}
                            <div className="space-y-4">
                              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-1 flex items-center gap-1.5 font-sans">
                                <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                                Catalog Performance Metrics
                              </h4>
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                <div className="bg-gray-50 p-2 border border-gray-200">
                                  <span className="text-gray-500 text-[10px] uppercase block font-sans font-semibold">Gross Sales</span>
                                  <span className="text-gray-900 font-bold text-sm block mt-0.5">
                                    ${selectedAuctionMetrics.grossSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div className="bg-emerald-50/80 p-2 border border-emerald-200">
                                  <span className="text-emerald-700 text-[10px] uppercase block font-sans font-semibold">Total Revenue</span>
                                  <span className="text-emerald-950 font-bold text-sm block mt-0.5">
                                    ${selectedAuctionMetrics.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                                <div className="bg-amber-50/80 p-2 border border-amber-200">
                                  <span className="text-amber-800 text-[10px] uppercase block font-sans font-semibold">Total Commission</span>
                                  <span className="text-amber-950 font-bold text-xs block mt-0.5">
                                    ${selectedAuctionMetrics.totalCommission.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[9px] text-amber-600 block font-sans leading-tight">Commission earned by us</span>
                                </div>
                                <div className="bg-blue-50/80 p-2 border border-blue-200">
                                  <span className="text-blue-800 text-[10px] uppercase block font-sans font-semibold">Net Sales</span>
                                  <span className="text-blue-950 font-bold text-xs block mt-0.5">
                                    ${selectedAuctionMetrics.houseNetSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-[9px] text-blue-600 block font-sans leading-tight">House Seller (ANTYQUES)</span>
                                </div>
                                {selectedAuctionMetrics.isHiBid && (
                                  <div className="col-span-2 bg-purple-50/80 p-2 border border-purple-200">
                                    <div className="flex justify-between items-center">
                                      <div>
                                        <span className="text-purple-800 text-[10px] uppercase block font-sans font-semibold">Buyers Premium</span>
                                        <span className="text-[9px] text-purple-600 block font-sans">Only displayed for HiBid Auctions</span>
                                      </div>
                                      <span className="text-purple-950 font-bold text-xs font-mono">
                                        ${selectedAuctionMetrics.buyersPremium.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="text-xs space-y-1.5 bg-gray-50/50 p-3 border border-gray-100">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Catalog Lots:</span>
                                  <span className="font-semibold text-gray-800">{selectedAuctionMetrics.totalLotsCount} assigned ({selectedAuctionMetrics.soldLotsCount} sold - {selectedAuctionMetrics.str}% STR)</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Lead Staff:</span>
                                  <span className="font-semibold text-gray-800">{selectedDashboardAuction.auctioneerLeadStaff}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Default BP Rate:</span>
                                  <span className="font-semibold text-gray-800">{selectedDashboardAuction.buyersPremiumRate}%</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Default Comm. Rate:</span>
                                  <span className="font-semibold text-gray-800">{selectedDashboardAuction.defaultCommissionRate}%</span>
                                </div>
                              </div>
                            </div>

                          </div>

                          {/* Consignee Event Settlements Table */}
                          <div className="space-y-3 pt-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                <Receipt className="h-3.5 w-3.5 text-gray-400" />
                                Consignee Event Settlements ({selectedAuctionMetrics.consigneeSettlements.length})
                              </h4>
                              <button 
                                id="btn-goto-financials-tab"
                                onClick={() => {
                                  setSelectedDashboardAuction(null);
                                  setActiveTab('financials');
                                }}
                                className="text-xs text-gray-900 hover:underline font-semibold cursor-pointer"
                              >
                                Full Financial Reports →
                              </button>
                            </div>

                            <div className="border border-[#E5E5E0] max-h-48 overflow-y-auto">
                              <table id="dashboard-modal-settlements-table" className="min-w-full divide-y divide-gray-200 text-xs font-sans">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Consignee</th>
                                    <th className="px-4 py-2 text-center text-[10px] font-semibold uppercase text-gray-500">Sold Lots</th>
                                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Gross Sales</th>
                                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Net Payment Amount</th>
                                    <th className="px-4 py-2 text-center text-[10px] font-semibold uppercase text-gray-500">Status</th>
                                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Method</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                  {selectedAuctionMetrics.consigneeSettlements.map((s) => (
                                    <tr id={`modal-settlement-row-${s.consigneeId}`} key={s.consigneeId} className="hover:bg-gray-50">
                                      <td className="px-4 py-2">
                                        <div className="font-semibold text-gray-800">{s.consigneeName}</div>
                                        <div className="text-[10px] font-mono text-gray-400">{s.consigneeId}</div>
                                      </td>
                                      <td className="px-4 py-2 text-center font-mono text-gray-600">{s.soldLots} / {s.totalLots}</td>
                                      <td className="px-4 py-2 text-right font-mono text-gray-900">${s.grossSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      <td className="px-4 py-2 text-right font-mono font-bold text-green-700">${s.netPayout.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      <td className="px-4 py-2 text-center">
                                        <span className={`inline-flex px-2 py-0.5 text-[10px] font-semibold ${
                                          s.payoutStatus === 'Paid' ? 'bg-green-100 text-green-800 border border-green-200' :
                                          s.payoutStatus === 'Pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                          'bg-gray-100 text-gray-700 border border-gray-200'
                                        }`}>
                                          {s.payoutStatus}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 text-gray-500 text-[11px]">{s.paymentMethod || 'Interac e-Transfer'}</td>
                                    </tr>
                                  ))}
                                  {selectedAuctionMetrics.consigneeSettlements.length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="px-4 py-6 text-center text-gray-400 italic">
                                        No consignee settlements recorded for this auction event.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Lot Listing Inside Details Modal */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                <Layers className="h-3.5 w-3.5 text-gray-400" />
                                Assigned Catalog Lots ({selectedAuctionLots.length})
                              </h4>
                              <button 
                                id="btn-goto-auctions-tab"
                                onClick={() => {
                                  setSelectedDashboardAuction(null);
                                  setActiveTab('auctions');
                                }}
                                className="text-xs text-gray-900 hover:underline font-semibold cursor-pointer"
                              >
                                Manage in Events catalog →
                              </button>
                            </div>
                            
                            <div className="border border-[#E5E5E0] max-h-60 overflow-y-auto">
                              <table id="dashboard-modal-lots-table" className="min-w-full divide-y divide-gray-200 text-xs">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Lot #</th>
                                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Title</th>
                                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Category</th>
                                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase text-gray-500">Status</th>
                                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase text-gray-500">Hammer Price</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                  {selectedAuctionLots.map(l => (
                                    <tr id={`modal-lot-row-${l.id}`} key={l.id} className="hover:bg-gray-50">
                                      <td className="px-4 py-2 font-mono font-semibold text-gray-600">{l.lotNumber}</td>
                                      <td className="px-4 py-2 font-medium text-gray-800 truncate max-w-[200px]">{l.lotTitle}</td>
                                      <td className="px-4 py-2 text-gray-500">{l.category}</td>
                                      <td className="px-4 py-2">
                                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold ${
                                          l.lotStatus === 'Sold' ? 'bg-green-100 text-green-800' :
                                          l.lotStatus === 'Active' ? 'bg-blue-100 text-blue-800' :
                                          'bg-gray-100 text-gray-800'
                                        }`}>
                                          {l.lotStatus}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2 text-right font-mono text-gray-900 font-semibold">
                                        {l.hammerPrice !== null ? `$${l.hammerPrice.toFixed(2)}` : '-'}
                                      </td>
                                    </tr>
                                  ))}
                                  {selectedAuctionLots.length === 0 && (
                                    <tr>
                                      <td colSpan={5} className="px-4 py-6 text-center text-gray-400 italic">
                                        No lots are assigned to this auction.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-[#E5E5E0] bg-gray-50/50 flex justify-end">
                          <button
                            id="btn-close-dashboard-modal-footer"
                            onClick={() => setSelectedDashboardAuction(null)}
                            className="px-4 py-2 bg-[#1A1A19] text-white text-xs font-semibold hover:bg-black transition-colors cursor-pointer"
                          >
                            Close View
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'consignees' && (
                <motion.div key="consignees" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <AdminConsignees consignees={consignees} lots={lots} auctions={auctions} onRefresh={triggerRefresh} />
                </motion.div>
              )}

              {activeTab === 'lots' && (
                <motion.div key="lots" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <AdminLots lots={lots} consignees={consignees} auctions={auctions} onRefresh={triggerRefresh} config={platformConfig} />
                </motion.div>
              )}

              {activeTab === 'auctions' && (
                <motion.div key="auctions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <AdminAuctions auctions={auctions} lots={lots} consignees={consignees} onRefresh={triggerRefresh} config={platformConfig} />
                </motion.div>
              )}

              {activeTab === 'financials' && (
                <motion.div key="financials" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <AdminFinancials lots={lots} consignees={consignees} auctions={auctions} config={platformConfig} />
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <AdminSettings config={platformConfig} onRefresh={triggerRefresh} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      <MaxsoldCSVImporter
        isOpen={isMaxsoldModalOpen}
        onClose={() => setIsMaxsoldModalOpen(false)}
        auctions={auctions}
        lots={lots}
        consignees={consignees}
        onSuccess={triggerRefresh}
        config={platformConfig}
      />
    </div>
  );
}
