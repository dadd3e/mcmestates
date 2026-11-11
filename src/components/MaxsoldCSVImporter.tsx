import React, { useState } from 'react';
import { Upload, CheckCircle2, AlertTriangle, X, RefreshCw, Database, ArrowRight } from 'lucide-react';
import { Auction, Lot, Consignee } from '../types';
import { PlatformConfig } from '../lib/platformConfig';
import { 
  parseMaxsoldCSV, 
  executeMaxsoldBulkImport, 
  MaxsoldCSVRow, 
  MaxsoldImportSummary 
} from '../lib/maxsoldImporter';

interface MaxsoldCSVImporterProps {
  isOpen: boolean;
  onClose: () => void;
  auctions: Auction[];
  lots: Lot[];
  consignees: Consignee[];
  onSuccess: () => void;
  config?: PlatformConfig;
}

const SAMPLE_MAXSOLD_CSV = `Item Name,Auction ID,End Date,Lot Number,Sold For Price,Consignee,Photos,Maxsold Fee,MCM Fee,Net Payout,Commission,Maxsold Rate
"Pair of White Glass Mushroom Table Lamps, Mid-Century Style",107830,4/30/2026,1,$80.00,ANTYQUES,https://cdn-d3ny4nc46fmd1s.maxsold.com/public/thumbnails/107830/4061034/37721928-5339.jpg,$16.80,$0.00,$63.20,0%,21%
"Hand-Carved Wooden Wall Mask, Balinese/African Folk Style",107830,4/30/2026,303,$1.00,ANTYQUES,https://cdn-d3ny4nc46fmd1s.maxsold.com/public/thumbnails/107830/4120013/33234065-3934.jpg,$0.21,$0.00,$0.79,0%,21%
"Small Gray Ceramic Planter Pot",107830,4/30/2026,290,$1.00,ANTYQUES,https://cdn-d3ny4nc46fmd1s.maxsold.com/public/thumbnails/107830/4117216/5472959-8426.jpg,$0.21,$0.00,$0.79,0%,21%
"Decorative Glass Pitcher & Tumbler Set",107830,4/30/2026,152,$0.00,Carol Williamson,https://cdn-d3ny4nc46fmd1s.maxsold.com/public/thumbnails/107830/4089901/1234567-8901.jpg,$0.00,$0.00,$0.00,10%,21%
"Vintage Brass Candleholders Pair",107830,4/30/2026,45,$45.00,Paula Duthie,https://cdn-d3ny4nc46fmd1s.maxsold.com/public/thumbnails/107830/4099901/9876543-2109.jpg,$9.45,$6.75,$28.80,15%,21%`;

export default function MaxsoldCSVImporter({
  isOpen,
  onClose,
  auctions,
  lots,
  consignees,
  onSuccess,
  config
}: MaxsoldCSVImporterProps) {
  const [csvInputText, setCsvInputText] = useState('');
  const [parsedRows, setParsedRows] = useState<MaxsoldCSVRow[]>([]);
  const [activeStep, setActiveStep] = useState<'upload' | 'preview' | 'processing' | 'done'>('upload');
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [importSummary, setImportSummary] = useState<MaxsoldImportSummary | null>(null);
  const [dragActive, setDragActive] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (text) {
        setCsvInputText(text);
        const rows = parseMaxsoldCSV(text);
        setParsedRows(rows);
        setActiveStep('preview');
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleTextChange = (text: string) => {
    setCsvInputText(text);
    const rows = parseMaxsoldCSV(text);
    setParsedRows(rows);
    if (rows.length > 0) {
      setActiveStep('preview');
    }
  };

  const handleLoadSample = () => {
    handleTextChange(SAMPLE_MAXSOLD_CSV);
  };

  const handleStartImport = async () => {
    if (parsedRows.length === 0) return;
    setActiveStep('processing');
    setProgressMsg('Starting Maxsold bulk import...');
    setProgressPercent(0);

    try {
      const summary = await executeMaxsoldBulkImport(
        parsedRows,
        auctions,
        lots,
        consignees,
        config,
        (msg, pct) => {
          setProgressMsg(msg);
          setProgressPercent(pct);
        }
      );

      setImportSummary(summary);
      setActiveStep('done');
      onSuccess();
    } catch (err: any) {
      console.error('Fatal import error:', err);
      alert(`Import failed: ${err.message || String(err)}`);
      setActiveStep('preview');
    }
  };

  const handleReset = () => {
    setCsvInputText('');
    setParsedRows([]);
    setActiveStep('upload');
    setImportSummary(null);
    setProgressPercent(0);
    setProgressMsg('');
  };

  return (
    <div id="maxsold-import-modal" className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-[#E5E5E0] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E5E5E0] flex items-center justify-between bg-[#FCFCFB]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#1A1A19] text-white">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900 font-sans">
                Maxsold Bulk Data Importer
              </h3>
              <p className="text-xs text-gray-500 font-sans">
                Auto-creates/updates Auctions, Consignees, and Lot records from Maxsold spreadsheets
              </p>
            </div>
          </div>
          <button
            id="btn-close-maxsold-import"
            onClick={onClose}
            className="p-1 hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* STEP 1: UPLOAD / PASTE */}
          {activeStep === 'upload' && (
            <div className="space-y-6">
              {/* Drag and drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed p-8 text-center transition-all ${
                  dragActive ? 'border-black bg-gray-50' : 'border-gray-300 bg-gray-50/50 hover:border-gray-400'
                }`}
              >
                <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                <h4 className="text-sm font-semibold text-gray-900 font-sans mb-1">
                  Drag & Drop Maxsold CSV File Here
                </h4>
                <p className="text-xs text-gray-500 mb-4 font-sans">
                  Or select a CSV spreadsheet file from your device
                </p>
                <label className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-xs font-medium text-white bg-[#1A1A19] hover:bg-black cursor-pointer font-sans">
                  Browse CSV File
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Paste or sample options */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400 font-sans">
                  Or Paste Raw CSV Data
                </span>
                <button
                  type="button"
                  id="btn-load-sample-csv"
                  onClick={handleLoadSample}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline font-sans flex items-center gap-1 cursor-pointer"
                >
                  <ArrowRight className="h-3 w-3" />
                  Load Sample Maxsold CSV Data
                </button>
              </div>

              <textarea
                value={csvInputText}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder='Paste Maxsold CSV content here (e.g. "Item Name,Auction ID,End Date,Lot Number,Sold For Price,Consignee,Photos...")'
                rows={6}
                className="w-full border border-[#E5E5E0] p-3 text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]"
              />

              {/* Guide Box */}
              <div className="bg-[#FCFCFB] border border-[#E5E5E0] p-4 text-xs font-sans space-y-2 text-gray-600">
                <h5 className="font-bold text-gray-900">Supported Mapping Format:</h5>
                <ul className="list-disc list-inside space-y-1 font-mono text-[11px] text-gray-700">
                  <li><strong>Auction ID:</strong> Creates "Maxsold Auction - [ID]" automatically if missing</li>
                  <li><strong>Consignee:</strong> Matches profile or auto-creates using MCM placeholder contact info</li>
                  <li><strong>Sold For Price:</strong> $0.00 automatically sets status to "Unsold"</li>
                  <li><strong>Commission / Maxsold Rate:</strong> Auto-calculates platform fees and net payouts</li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {activeStep === 'preview' && (
            <div className="space-y-4 font-sans">
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  <span>Parsed <strong>{parsedRows.length} lots</strong> ready for bulk import into Firestore.</span>
                </div>
                <button
                  onClick={handleReset}
                  className="text-blue-700 font-semibold underline hover:text-blue-900 cursor-pointer"
                >
                  Change File
                </button>
              </div>

              <div className="border border-[#E5E5E0] overflow-hidden max-h-[350px] overflow-y-auto">
                <table className="min-w-full divide-y divide-[#E5E5E0] text-xs">
                  <thead className="bg-[#FCFCFB] sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Lot #</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Item Title</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Auction Event</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Consignee</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Sold For</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-500">Status</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Commission %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E0]">
                    {parsedRows.map((row, idx) => {
                      const isUnsold = row.soldForPrice <= 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono font-bold text-gray-900">{row.lotNumber}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate">{row.itemName}</td>
                          <td className="px-3 py-2 text-gray-600 font-mono">Maxsold Auction - {row.auctionId}</td>
                          <td className="px-3 py-2 text-gray-800 font-medium">{row.consigneeName}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-gray-900">
                            {isUnsold ? '$0.00' : `$${row.soldForPrice.toFixed(2)}`}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-2 py-0.5 text-[10px] font-bold ${
                              isUnsold ? 'bg-gray-100 text-gray-700 border border-gray-300' : 'bg-green-50 text-green-700 border border-green-200'
                            }`}>
                              {isUnsold ? 'Unsold' : 'Sold'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-gray-600">{row.commissionRate}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: PROCESSING */}
          {activeStep === 'processing' && (
            <div className="py-12 text-center space-y-6 font-sans">
              <RefreshCw className="h-10 w-10 text-gray-900 animate-spin mx-auto" />
              <div>
                <h4 className="text-base font-semibold text-gray-900">Processing Bulk Import...</h4>
                <p className="text-xs text-gray-500 mt-1">{progressMsg}</p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-md mx-auto bg-gray-200 h-2.5 overflow-hidden rounded-full">
                <div
                  className="bg-[#1A1A19] h-full transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              <span className="text-xs font-mono text-gray-600">{progressPercent}% complete</span>
            </div>
          )}

          {/* STEP 4: DONE / SUMMARY */}
          {activeStep === 'done' && importSummary && (
            <div className="space-y-6 font-sans">
              <div className="bg-green-50 border border-green-200 p-4 flex items-start gap-3">
                <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-green-900">
                    Maxsold Bulk Import Completed Successfully!
                  </h4>
                  <p className="text-xs text-green-800 mt-0.5">
                    All auction, lot, and consignee records have been synchronized with Firestore.
                  </p>
                </div>
              </div>

              {/* Summary stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[#FCFCFB] border border-[#E5E5E0] p-4 text-center">
                  <span className="text-xs text-gray-500 block uppercase font-bold tracking-wider">Auctions</span>
                  <span className="text-xl font-bold font-mono text-gray-900">
                    {importSummary.auctionsCreated + importSummary.auctionsUpdated}
                  </span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    ({importSummary.auctionsCreated} created, {importSummary.auctionsUpdated} updated)
                  </span>
                </div>

                <div className="bg-[#FCFCFB] border border-[#E5E5E0] p-4 text-center">
                  <span className="text-xs text-gray-500 block uppercase font-bold tracking-wider">Consignees</span>
                  <span className="text-xl font-bold font-mono text-gray-900">
                    {importSummary.consigneesCreated + importSummary.consigneesMatched}
                  </span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    ({importSummary.consigneesCreated} created, {importSummary.consigneesMatched} matched)
                  </span>
                </div>

                <div className="bg-[#FCFCFB] border border-[#E5E5E0] p-4 text-center">
                  <span className="text-xs text-gray-500 block uppercase font-bold tracking-wider">Lots Imported</span>
                  <span className="text-xl font-bold font-mono text-gray-900">
                    {importSummary.lotsCreated + importSummary.lotsUpdated}
                  </span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    ({importSummary.lotsCreated} created, {importSummary.lotsUpdated} updated)
                  </span>
                </div>

                <div className="bg-[#FCFCFB] border border-[#E5E5E0] p-4 text-center">
                  <span className="text-xs text-gray-500 block uppercase font-bold tracking-wider">Processed</span>
                  <span className="text-xl font-bold font-mono text-green-700">
                    {importSummary.totalRowsProcessed}
                  </span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">
                    total records
                  </span>
                </div>
              </div>

              {importSummary.errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-4 space-y-2">
                  <h5 className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Warnings ({importSummary.errors.length})
                  </h5>
                  <ul className="text-xs font-mono text-amber-800 space-y-1 list-disc list-inside">
                    {importSummary.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#E5E5E0] bg-[#FCFCFB] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            {activeStep === 'done' ? 'Close Window' : 'Cancel'}
          </button>

          {activeStep === 'preview' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                id="btn-confirm-maxsold-import"
                onClick={handleStartImport}
                className="px-5 py-2 bg-[#1A1A19] hover:bg-black text-white text-xs font-bold uppercase tracking-wider cursor-pointer font-sans"
              >
                Execute Bulk Import ({parsedRows.length} items)
              </button>
            </div>
          )}

          {activeStep === 'done' && (
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 bg-[#1A1A19] hover:bg-black text-white text-xs font-medium cursor-pointer"
            >
              Import Another File
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
