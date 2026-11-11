import React, { useState, useEffect } from 'react';
import { 
  Save, Plus, Trash2, Edit2, Settings, HelpCircle, Calculator, Check, 
  RotateCcw, Sliders, AlertCircle, Sparkles, Layers, ListFilter,
  Globe, CreditCard, Shield, FileText, Phone, Mail, Award, CheckSquare, Coins
} from 'lucide-react';
import { PlatformConfig, DEFAULT_PLATFORM_CONFIG, savePlatformConfig, evaluateFormula, CustomField } from '../lib/platformConfig';

interface AdminSettingsProps {
  config: PlatformConfig;
  onRefresh: () => void;
}

type SettingsSection = 'branding' | 'financials' | 'taxonomy' | 'metadata' | 'formulas' | 'operations';

export default function AdminSettings({ config: initialConfig, onRefresh }: AdminSettingsProps) {
  const [config, setConfig] = useState<PlatformConfig>(initialConfig || DEFAULT_PLATFORM_CONFIG);
  const [activeSection, setActiveSection] = useState<SettingsSection>('branding');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Taxonomy states
  const [newCategory, setNewCategory] = useState('');
  const [newPlatform, setNewPlatform] = useState('');

  // Sandbox calculator states
  const [sandboxHammer, setSandboxHammer] = useState(1500);
  const [sandboxCommission, setSandboxCommission] = useState(15);
  const [sandboxBP, setSandboxBP] = useState(18);

  // Custom metadata field form states
  const [fieldKey, setFieldKey] = useState('');
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<'text' | 'number' | 'select'>('text');
  const [fieldPlaceholder, setFieldPlaceholder] = useState('');
  const [fieldOptionsText, setFieldOptionsText] = useState('');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);

  // New settlement payment methods
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  // Sync with prop when received
  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  const handleSave = async (updatedConfig = config) => {
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await savePlatformConfig(updatedConfig);
      setSaveSuccess(true);
      onRefresh();
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save configuration settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    if (window.confirm('Are you sure you want to reset all platform configurations, formulas, and branding to their default values? This cannot be undone.')) {
      setConfig(DEFAULT_PLATFORM_CONFIG);
      handleSave(DEFAULT_PLATFORM_CONFIG);
    }
  };

  // Add a category
  const addCategory = () => {
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    if (config.categories.includes(trimmed)) {
      alert('This category already exists.');
      return;
    }
    const updated = {
      ...config,
      categories: [...config.categories, trimmed]
    };
    setConfig(updated);
    setNewCategory('');
  };

  // Delete a category
  const deleteCategory = (category: string) => {
    const updated = {
      ...config,
      categories: config.categories.filter(c => c !== category)
    };
    setConfig(updated);
  };

  // Add a platform
  const addPlatform = () => {
    const trimmed = newPlatform.trim();
    if (!trimmed) return;
    if (config.platforms.includes(trimmed)) {
      alert('This platform already exists.');
      return;
    }
    const updated = {
      ...config,
      platforms: [...config.platforms, trimmed]
    };
    setConfig(updated);
    setNewPlatform('');
  };

  // Delete a platform
  const deletePlatform = (platform: string) => {
    const updated = {
      ...config,
      platforms: config.platforms.filter(p => p !== platform)
    };
    setConfig(updated);
  };

  // Add a Payment Method
  const addPaymentMethod = () => {
    const trimmed = newPaymentMethod.trim();
    if (!trimmed) return;
    const currentMethods = config.settlement?.paymentMethods || [];
    if (currentMethods.includes(trimmed)) {
      alert('This payment method already exists.');
      return;
    }
    const updated = {
      ...config,
      settlement: {
        ...config.settlement,
        paymentMethods: [...currentMethods, trimmed]
      }
    };
    setConfig(updated);
    setNewPaymentMethod('');
  };

  // Remove a Payment Method
  const deletePaymentMethod = (method: string) => {
    const currentMethods = config.settlement?.paymentMethods || [];
    const updated = {
      ...config,
      settlement: {
        ...config.settlement,
        paymentMethods: currentMethods.filter(m => m !== method)
      }
    };
    setConfig(updated);
  };

  // Add or Update a Custom Lot Metadata Field
  const addCustomField = () => {
    const key = fieldKey.trim().replace(/[^a-zA-Z0-9]/g, '');
    const label = fieldLabel.trim();
    if (!key || !label) {
      alert('Please provide a valid key (alphanumeric, no spaces) and field label.');
      return;
    }

    const options = fieldType === 'select' 
      ? fieldOptionsText.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;

    const newField: CustomField = {
      key,
      label,
      type: fieldType,
      placeholder: fieldPlaceholder.trim() || undefined,
      options,
      required: fieldRequired
    };

    let updatedCustomFields = [...config.customFields];

    if (editingFieldKey) {
      // Edit mode: replace existing field with key == editingFieldKey
      updatedCustomFields = updatedCustomFields.map(f => f.key === editingFieldKey ? newField : f);
    } else {
      // Add mode: check duplicates
      if (config.customFields.some(f => f.key === key)) {
        alert(`A custom field with key "${key}" already exists.`);
        return;
      }
      updatedCustomFields.push(newField);
    }

    const updated = {
      ...config,
      customFields: updatedCustomFields
    };
    setConfig(updated);

    // Reset forms & edit state
    setFieldKey('');
    setFieldLabel('');
    setFieldType('text');
    setFieldPlaceholder('');
    setFieldOptionsText('');
    setFieldRequired(false);
    setEditingFieldKey(null);
  };

  const startEditCustomField = (field: CustomField) => {
    setEditingFieldKey(field.key);
    setFieldKey(field.key);
    setFieldLabel(field.label);
    setFieldType(field.type);
    setFieldPlaceholder(field.placeholder || '');
    setFieldOptionsText(field.options ? field.options.join(', ') : '');
    setFieldRequired(field.required || false);
  };

  const cancelEditCustomField = () => {
    setFieldKey('');
    setFieldLabel('');
    setFieldType('text');
    setFieldPlaceholder('');
    setFieldOptionsText('');
    setFieldRequired(false);
    setEditingFieldKey(null);
  };

  // Delete a Custom Lot Metadata Field
  const deleteCustomField = (key: string) => {
    const updated = {
      ...config,
      customFields: config.customFields.filter(f => f.key !== key)
    };
    setConfig(updated);
    if (editingFieldKey === key) {
      cancelEditCustomField();
    }
  };

  // Calculate live outcomes for the formula sandbox
  const liveBuyerTotal = evaluateFormula(config.formulas.buyerTotal, {
    hammerPrice: sandboxHammer,
    commissionRate: sandboxCommission,
    bpRate: sandboxBP,
    gstRate: config.gstRate,
    qstRate: config.qstRate
  });

  const liveMaxsoldPayout = evaluateFormula(config.formulas.consigneePayoutMaxsold, {
    hammerPrice: sandboxHammer,
    commissionRate: sandboxCommission,
    bpRate: sandboxBP,
    gstRate: config.gstRate,
    qstRate: config.qstRate
  });

  const liveStandardPayout = evaluateFormula(config.formulas.consigneePayoutStandard, {
    hammerPrice: sandboxHammer,
    commissionRate: sandboxCommission,
    bpRate: sandboxBP,
    gstRate: config.gstRate,
    qstRate: config.qstRate
  });

  return (
    <div id="admin-settings-container" className="space-y-6">
      
      {/* Header Panel with minimal styling & layout */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-100 pb-5 gap-4">
        <div>
          <h2 className="text-xl font-medium text-gray-950 font-sans flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-800" />
            System Control Panel
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Global configurations for platform identity, dynamic commissions, category classification, tax rates, custom catalog fields, and dynamic formulas.
          </p>
        </div>
        
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            id="btn-settings-reset-defaults"
            onClick={handleResetDefaults}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-200 text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer rounded-none"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
            Reset Defaults
          </button>
          
          <button
            id="btn-settings-save"
            onClick={() => handleSave()}
            disabled={saving}
            className="inline-flex items-center justify-center px-5 py-2 text-xs font-semibold text-white bg-[#1A1A19] hover:bg-black transition-colors disabled:opacity-50 cursor-pointer rounded-none"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? 'Saving...' : 'Commit Changes'}
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="bg-green-50 border border-green-200 text-green-900 p-3.5 text-xs flex items-center gap-2.5 rounded-none font-sans">
          <div className="bg-green-600 text-white rounded-full p-0.5">
            <Check className="h-3.5 w-3.5" />
          </div>
          <div>
            <span className="font-semibold">Changes Sync Succeeded!</span> All platform features, public portals, and formula metrics are updated in real-time.
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-900 p-3.5 text-xs flex items-center gap-2.5 rounded-none font-sans">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Settings Body */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Navigation Sidebar */}
        <div className="space-y-1 lg:col-span-1">
          <button
            onClick={() => setActiveSection('branding')}
            className={`w-full flex items-center px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-150 rounded-none cursor-pointer text-left border-l-2 ${
              activeSection === 'branding' 
                ? 'bg-[#FCFCFB] text-gray-950 border-[#1A1A19]' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-transparent'
            }`}
          >
            <Globe className="h-4 w-4 mr-3 text-gray-400" />
            Branding & Identity
          </button>

          <button
            onClick={() => setActiveSection('financials')}
            className={`w-full flex items-center px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-150 rounded-none cursor-pointer text-left border-l-2 ${
              activeSection === 'financials' 
                ? 'bg-[#FCFCFB] text-gray-950 border-[#1A1A19]' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-transparent'
            }`}
          >
            <CreditCard className="h-4 w-4 mr-3 text-gray-400" />
            Financial & Tax Rules
          </button>

          <button
            onClick={() => setActiveSection('taxonomy')}
            className={`w-full flex items-center px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-150 rounded-none cursor-pointer text-left border-l-2 ${
              activeSection === 'taxonomy' 
                ? 'bg-[#FCFCFB] text-gray-950 border-[#1A1A19]' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-transparent'
            }`}
          >
            <ListFilter className="h-4 w-4 mr-3 text-gray-400" />
            Categories & Platforms
          </button>

          <button
            onClick={() => setActiveSection('metadata')}
            className={`w-full flex items-center px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-150 rounded-none cursor-pointer text-left border-l-2 ${
              activeSection === 'metadata' 
                ? 'bg-[#FCFCFB] text-gray-950 border-[#1A1A19]' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-transparent'
            }`}
          >
            <Sliders className="h-4 w-4 mr-3 text-gray-400" />
            Custom Lot Fields
          </button>

          <button
            onClick={() => setActiveSection('formulas')}
            className={`w-full flex items-center px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-150 rounded-none cursor-pointer text-left border-l-2 ${
              activeSection === 'formulas' 
                ? 'bg-[#FCFCFB] text-gray-950 border-[#1A1A19]' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-transparent'
            }`}
          >
            <Calculator className="h-4 w-4 mr-3 text-gray-400" />
            Formula Playground
          </button>

          <button
            onClick={() => setActiveSection('operations')}
            className={`w-full flex items-center px-4 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-150 rounded-none cursor-pointer text-left border-l-2 ${
              activeSection === 'operations' 
                ? 'bg-[#FCFCFB] text-gray-950 border-[#1A1A19]' 
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 border-transparent'
            }`}
          >
            <Settings className="h-4 w-4 mr-3 text-gray-400" />
            Operations & Defaults
          </button>

          <div className="mt-8 p-4 bg-gray-50 border border-gray-100 rounded-none text-[11px] text-gray-500 space-y-2">
            <span className="font-semibold text-gray-700 block uppercase tracking-wider text-[9px]">Administrative Mode</span>
            <p>You are editing live platform guidelines. Any committed changes immediately adjust active portals for consignors and managers.</p>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-3 bg-white border border-[#E5E5E0] p-6 space-y-6">
          
          {/* Section: Branding & Identity */}
          {activeSection === 'branding' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Globe className="h-4 w-4 text-gray-600" />
                  White-label Branding & Identity
                </h3>
                <p className="text-xs text-gray-500 mt-1">Configure company details, titles, contact records, and copyright signatures shown on portals.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Company / App Name *</label>
                  <input 
                    type="text" 
                    value={config.branding?.appName || ''} 
                    onChange={(e) => setConfig({
                      ...config,
                      branding: { ...(config.branding || DEFAULT_PLATFORM_CONFIG.branding), appName: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Portal Subtitle / Headline</label>
                  <input 
                    type="text" 
                    value={config.branding?.portalSubtitle || ''} 
                    onChange={(e) => setConfig({
                      ...config,
                      branding: { ...(config.branding || DEFAULT_PLATFORM_CONFIG.branding), portalSubtitle: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Support Contact Email *</label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input 
                      type="email" 
                      value={config.branding?.supportEmail || ''} 
                      onChange={(e) => setConfig({
                        ...config,
                        branding: { ...(config.branding || DEFAULT_PLATFORM_CONFIG.branding), supportEmail: e.target.value }
                      })}
                      className="w-full border border-gray-300 pl-9 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Support Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input 
                      type="text" 
                      value={config.branding?.supportPhone || ''} 
                      onChange={(e) => setConfig({
                        ...config,
                        branding: { ...(config.branding || DEFAULT_PLATFORM_CONFIG.branding), supportPhone: e.target.value }
                      })}
                      className="w-full border border-gray-300 pl-9 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Commission Field Label *</label>
                  <div className="relative">
                    <Award className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <input 
                      type="text" 
                      value={config.branding?.commissionLabel || ''} 
                      onChange={(e) => setConfig({
                        ...config,
                        branding: { ...(config.branding || DEFAULT_PLATFORM_CONFIG.branding), commissionLabel: e.target.value }
                      })}
                      className="w-full border border-gray-300 pl-9 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                    />
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1 block">Customize the label for your company's taken fee rate (e.g. "MCM Commission").</span>
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Terms & Guidelines URL</label>
                  <input 
                    type="text" 
                    value={config.branding?.termsUrl || ''} 
                    onChange={(e) => setConfig({
                      ...config,
                      branding: { ...(config.branding || DEFAULT_PLATFORM_CONFIG.branding), termsUrl: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-gray-600 font-semibold mb-1">Footer Copyright Signature Text</label>
                  <input 
                    type="text" 
                    value={config.branding?.footerText || ''} 
                    onChange={(e) => setConfig({
                      ...config,
                      branding: { ...(config.branding || DEFAULT_PLATFORM_CONFIG.branding), footerText: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>
              </div>
            </div>
          )}

          {/* Section: Financial & Tax Rules */}
          {activeSection === 'financials' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-gray-600" />
                  Financial Settlement & Tax Rules
                </h3>
                <p className="text-xs text-gray-500 mt-1">Define default percentages, regional sales tax rates, and payout delay windows.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Buyer's Premium (%)</label>
                  <input 
                    type="number" 
                    value={config.buyersPremiumRate} 
                    onChange={(e) => setConfig({ ...config, buyersPremiumRate: Number(e.target.value) })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Seller Commission (%)</label>
                  <input 
                    type="number" 
                    value={config.defaultCommissionRate} 
                    onChange={(e) => setConfig({ ...config, defaultCommissionRate: Number(e.target.value) })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Federal Tax Rate (GST %)</label>
                  <input 
                    type="number" 
                    step="0.001"
                    value={config.gstRate} 
                    onChange={(e) => setConfig({ ...config, gstRate: Number(e.target.value) })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Provincial Tax Rate (QST %)</label>
                  <input 
                    type="number" 
                    step="0.001"
                    value={config.qstRate} 
                    onChange={(e) => setConfig({ ...config, qstRate: Number(e.target.value) })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Global Currency Symbol</label>
                  <input 
                    type="text" 
                    value={config.currencySymbol} 
                    onChange={(e) => setConfig({ ...config, currencySymbol: e.target.value })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19] max-w-[80px] text-center" 
                  />
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Lot Status on Entry</label>
                  <select 
                    value={config.defaultLotStatus} 
                    onChange={(e) => setConfig({ ...config, defaultLotStatus: e.target.value as any })}
                    className="w-full border border-gray-300 p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]"
                  >
                    <option value="Pending">Pending Audit / Intake</option>
                    <option value="Active">Active / Immediately Tradable</option>
                  </select>
                </div>

                <div className="border-t border-gray-100 pt-5 md:col-span-2">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-3">Settlement Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-600 font-semibold mb-1">Default Payout Wait Window (Days)</label>
                      <input 
                        type="number" 
                        value={config.settlement?.defaultDaysToPayout || 30} 
                        onChange={(e) => setConfig({
                          ...config,
                          settlement: { ...(config.settlement || DEFAULT_PLATFORM_CONFIG.settlement), defaultDaysToPayout: Number(e.target.value) }
                        })}
                        className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                      />
                    </div>

                    <div>
                      <label className="block text-gray-600 font-semibold mb-1">Minimum Account Payout Threshold ($)</label>
                      <input 
                        type="number" 
                        value={config.settlement?.minimumPayoutThreshold || 0} 
                        onChange={(e) => setConfig({
                          ...config,
                          settlement: { ...(config.settlement || DEFAULT_PLATFORM_CONFIG.settlement), minimumPayoutThreshold: Number(e.target.value) }
                        })}
                        className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                      />
                    </div>
                  </div>
                </div>

                {/* Customizable Settlement Payout Methods */}
                <div className="border-t border-gray-100 pt-5 md:col-span-2 space-y-3">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Custom Settlement Payout Methods</h4>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. Bank Wire, Stripe"
                      value={newPaymentMethod}
                      onChange={(e) => setNewPaymentMethod(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addPaymentMethod()}
                      className="flex-1 border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]"
                    />
                    <button 
                      type="button"
                      onClick={addPaymentMethod}
                      className="bg-[#1A1A19] hover:bg-black text-white px-4 py-2 cursor-pointer flex items-center gap-1 font-semibold"
                    >
                      <Plus className="h-4 w-4" />
                      Add Method
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-gray-100 rounded bg-[#FCFCFB]">
                    {(config.settlement?.paymentMethods || []).map((method, i) => (
                      <div key={i} className="flex justify-between items-center p-2 bg-white border border-gray-100 shadow-sm">
                        <span className="text-gray-700 font-medium">{method}</span>
                        <button 
                          type="button"
                          onClick={() => deletePaymentMethod(method)}
                          className="text-gray-400 hover:text-red-600 p-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {(config.settlement?.paymentMethods || []).length === 0 && (
                      <div className="col-span-2 text-center text-gray-400 py-3 italic">
                        No payment methods registered.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Section: Categories & Platforms */}
          {activeSection === 'taxonomy' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <ListFilter className="h-4 w-4 text-gray-600" />
                  Classification Taxonomies (Categories & Platforms)
                </h3>
                <p className="text-xs text-gray-500 mt-1">Manage dynamically populated dropdown options used during lot intake and catalog creation.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                
                {/* Categories classification */}
                <div className="space-y-3 bg-[#FCFCFB] p-4 border border-[#E5E5E0]">
                  <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1">
                    <Layers className="h-4 w-4 text-gray-500" />
                    Custom Catalog Categories
                  </h4>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. Fine Jewelry"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCategory()}
                      className="flex-1 border border-gray-300 p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]"
                    />
                    <button 
                      onClick={addCategory}
                      className="bg-[#1A1A19] hover:bg-black text-white px-3 py-2 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto border border-gray-200 divide-y divide-gray-100 bg-white">
                    {config.categories.map((cat, i) => (
                      <div key={i} className="flex justify-between items-center p-2 hover:bg-gray-50">
                        <span className="text-gray-700 font-medium">{cat}</span>
                        <button 
                          onClick={() => deleteCategory(cat)}
                          className="text-gray-400 hover:text-red-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Platforms classification */}
                <div className="space-y-3 bg-[#FCFCFB] p-4 border border-[#E5E5E0]">
                  <h4 className="text-xs font-bold text-gray-800 flex items-center gap-1">
                    <Globe className="h-4 w-4 text-gray-500" />
                    Supported Platforms List
                  </h4>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      placeholder="e.g. In-House Marketplace"
                      value={newPlatform}
                      onChange={(e) => setNewPlatform(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addPlatform()}
                      className="flex-1 border border-gray-300 p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]"
                    />
                    <button 
                      onClick={addPlatform}
                      className="bg-[#1A1A19] hover:bg-black text-white px-3 py-2 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto border border-gray-200 divide-y divide-gray-100 bg-white">
                    {config.platforms.map((plat, i) => (
                      <div key={i} className="flex justify-between items-center p-2 hover:bg-gray-50">
                        <span className="text-gray-700 font-medium">{plat}</span>
                        <button 
                          onClick={() => deletePlatform(plat)}
                          className="text-gray-400 hover:text-red-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Section: Custom Lot Fields */}
          {activeSection === 'metadata' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Sliders className="h-4 w-4 text-gray-600" />
                  Dynamic Lot Catalog Fields Manager
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Create custom metadata schema fields. These fields will dynamically generate inputs inside both Admin Lot creator forms and Consignor portals.
                </p>
              </div>

              <div className="space-y-5 text-xs">
                
                {/* Form to Register New Field */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-[#FCFCFB] p-5 border border-[#E5E5E0]">
                  <div className="md:col-span-2 flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-800 uppercase tracking-wider text-[10px] block">
                      {editingFieldKey ? `Modify Field Guidelines: ${editingFieldKey}` : 'Create Custom Field Entry'}
                    </span>
                    {editingFieldKey && (
                      <button
                        type="button"
                        onClick={cancelEditCustomField}
                        className="text-[10px] text-red-600 hover:underline cursor-pointer"
                      >
                        Cancel Modification
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-gray-600 font-semibold mb-1">Unique Key (alphanumeric, no spaces) *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. stylePeriod, storageLocation"
                      value={fieldKey}
                      onChange={(e) => setFieldKey(e.target.value)}
                      disabled={!!editingFieldKey}
                      className={`w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19] ${editingFieldKey ? 'bg-gray-100 text-gray-500' : 'bg-white'}`} 
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 font-semibold mb-1">Visual Label / Title *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Style Period, Storage Drawer"
                      value={fieldLabel}
                      onChange={(e) => setFieldLabel(e.target.value)}
                      className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19] bg-white" 
                    />
                  </div>

                  <div>
                    <label className="block text-gray-600 font-semibold mb-1">Input Interface Type</label>
                    <select 
                      value={fieldType} 
                      onChange={(e) => setFieldType(e.target.value as any)}
                      className="w-full border border-gray-300 p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19] font-medium"
                    >
                      <option value="text">Single Line text field</option>
                      <option value="number">Numeric field</option>
                      <option value="select">Dropdown selection choice</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-600 font-semibold mb-1">Placeholder Help Text</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Enter style period style, e.g. Art Deco"
                      value={fieldPlaceholder}
                      onChange={(e) => setFieldPlaceholder(e.target.value)}
                      className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19] bg-white" 
                    />
                  </div>

                  {fieldType === 'select' && (
                    <div className="md:col-span-2">
                      <label className="block text-gray-600 font-semibold mb-1">Dropdown Options list (comma-separated values)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Art Deco, Mid-Century, Victorian, Contemporary"
                        value={fieldOptionsText}
                        onChange={(e) => setFieldOptionsText(e.target.value)}
                        className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19] bg-white" 
                      />
                    </div>
                  )}

                  <div className="md:col-span-2 flex items-center justify-between border-t border-gray-100 pt-3 mt-1">
                    <label className="flex items-center gap-2 text-gray-600 font-semibold cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={fieldRequired}
                        onChange={(e) => setFieldRequired(e.target.checked)}
                        className="rounded border-gray-300 text-gray-900 focus:ring-[#1A1A19]"
                      />
                      Enforce as required field
                    </label>

                    <button
                      type="button"
                      onClick={addCustomField}
                      className="inline-flex items-center justify-center px-4 py-2 text-xs font-semibold text-white bg-[#1A1A19] hover:bg-black transition-colors cursor-pointer"
                    >
                      {editingFieldKey ? (
                        <>
                          <Check className="h-3.5 w-3.5 mr-1" />
                          Save Field Guidelines
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Register Field
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Active Registered Fields List */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Registered Custom Schema ({config.customFields?.length || 0})</h4>
                  
                  <div className="border border-gray-200 divide-y divide-gray-200">
                    {config.customFields && config.customFields.length > 0 ? (
                      config.customFields.map((f, i) => (
                        <div key={i} className="p-3.5 flex justify-between items-center hover:bg-gray-50 transition-colors">
                          <div className="space-y-1">
                            <p className="font-semibold text-gray-950 flex items-center gap-1.5">
                              {f.label}
                              {f.required && <span className="text-[9px] font-bold uppercase text-red-600 bg-red-50 px-1.5 py-0.2 border border-red-200">Required</span>}
                            </p>
                            <p className="text-[10px] text-gray-500 font-mono">
                              Key: <span className="font-semibold text-gray-700">{f.key}</span> | Type: <span className="font-semibold text-gray-700">{f.type}</span> {f.placeholder ? `| Help: "${f.placeholder}"` : ''}
                            </p>
                            {f.options && f.options.length > 0 && (
                              <p className="text-[10px] text-gray-400">
                                Selection choices: <span className="font-mono text-gray-600 bg-gray-50 px-1 border border-gray-100">{f.options.join(', ')}</span>
                              </p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditCustomField(f)}
                              className="text-gray-400 hover:text-gray-900 p-1.5 cursor-pointer transition-colors"
                              title="Edit Field Guidelines"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCustomField(f.key)}
                              className="text-gray-400 hover:text-red-600 p-1.5 cursor-pointer transition-colors"
                              title="Remove Field"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-5 text-center text-gray-400 italic bg-[#FCFCFB]">
                        No dynamic catalog fields registered yet. Create one above.
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Section: Formula Engineering & Playground */}
          {activeSection === 'formulas' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Calculator className="h-4 w-4 text-gray-600" />
                  Consignment & Settlement Formula Engineering
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Dynamically adjust mathematical pricing formulas. Syntactical statements evaluate securely inside our financial engines.
                </p>
              </div>

              {/* Guidelines helper box */}
              <div className="text-xs bg-[#FCFCFB] border border-[#E5E5E0] p-4 space-y-2 rounded-none">
                <span className="font-semibold text-gray-800 flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5 text-amber-500" />
                  Formula Variable Definitions:
                </span>
                <p className="text-gray-500 text-[11px]">
                  Use the exact mathematical notations and variable strings. Basic math operators (<span className="font-mono text-gray-800 font-semibold">*</span>, <span className="font-mono text-gray-800 font-semibold">/</span>, <span className="font-mono text-gray-800 font-semibold">+</span>, <span className="font-mono text-gray-800 font-semibold">-</span>, <span className="font-mono text-gray-800 font-semibold">( )</span>) are fully supported.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1 text-[10px] font-mono text-gray-600">
                  <div className="bg-white p-1.5 border border-gray-100">
                    <span className="font-semibold text-gray-800 block">hammerPrice</span>
                    Winning Bid Price
                  </div>
                  <div className="bg-white p-1.5 border border-gray-100">
                    <span className="font-semibold text-gray-800 block">commissionRate</span>
                    Seller Fee (%)
                  </div>
                  <div className="bg-white p-1.5 border border-gray-100">
                    <span className="font-semibold text-gray-800 block">bpRate</span>
                    Buyer Premium (%)
                  </div>
                  <div className="bg-white p-1.5 border border-gray-100">
                    <span className="font-semibold text-gray-800 block">gstRate / qstRate</span>
                    Tax Percentages
                  </div>
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">
                    Buyer's Total Sale Price Formula
                  </label>
                  <input 
                    type="text" 
                    value={config.formulas.buyerTotal} 
                    onChange={(e) => setConfig({
                      ...config,
                      formulas: { ...config.formulas, buyerTotal: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2.5 font-mono text-gray-850 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">Default: <span className="font-mono">hammerPrice * (1 + bpRate / 100)</span></span>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">
                    Consignor Payout Formula (Maxsold Platform with flat fee)
                  </label>
                  <input 
                    type="text" 
                    value={config.formulas.consigneePayoutMaxsold} 
                    onChange={(e) => setConfig({
                      ...config,
                      formulas: { ...config.formulas, consigneePayoutMaxsold: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2.5 font-mono text-gray-850 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">Default: <span className="font-mono">hammerPrice * (1 - commissionRate / 100) - (hammerPrice * platformFeeRate / 100)</span></span>
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-1">
                    Consignor Payout Formula (Standard Platforms like HiBid, Catalog)
                  </label>
                  <input 
                    type="text" 
                    value={config.formulas.consigneePayoutStandard} 
                    onChange={(e) => setConfig({
                      ...config,
                      formulas: { ...config.formulas, consigneePayoutStandard: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2.5 font-mono text-gray-850 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">Default: <span className="font-mono">hammerPrice * (1 - commissionRate / 100)</span></span>
                </div>
              </div>

              {/* Reactive Sandbox Panel */}
              <div className="bg-[#FCFCFB] border border-[#E5E5E0] p-5 space-y-4 rounded-none">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 flex items-center gap-1.5 font-sans uppercase">
                      <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
                      Live Interactive Sandbox Sandbox
                    </h4>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      Vary values below to verify live formula processing with no code adjustments.
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 border border-emerald-200">
                    Active Processor
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="block text-gray-500 mb-1">Test Hammer Price ($)</label>
                    <input 
                      type="number" 
                      value={sandboxHammer} 
                      onChange={(e) => setSandboxHammer(Number(e.target.value))}
                      className="w-full border border-gray-300 p-2 font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                    />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">Commission Rate (%)</label>
                    <input 
                      type="number" 
                      value={sandboxCommission} 
                      onChange={(e) => setSandboxCommission(Number(e.target.value))}
                      className="w-full border border-gray-300 p-2 font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                    />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-1">Buyer Premium (%)</label>
                    <input 
                      type="number" 
                      value={sandboxBP} 
                      onChange={(e) => setSandboxBP(Number(e.target.value))}
                      className="w-full border border-gray-300 p-2 font-mono bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200 text-xs font-mono text-center">
                  <div className="bg-white p-3 border border-gray-200 shadow-sm">
                    <span className="text-[9px] text-gray-400 block uppercase font-sans font-bold tracking-wider">Computed Buyer Total</span>
                    <span className="text-base font-bold text-gray-950">${liveBuyerTotal.toFixed(2)}</span>
                  </div>
                  <div className="bg-white p-3 border border-gray-200 shadow-sm">
                    <span className="text-[9px] text-gray-400 block uppercase font-sans font-bold tracking-wider">Maxsold Net Payout</span>
                    <span className="text-base font-bold text-emerald-700">${liveMaxsoldPayout.toFixed(2)}</span>
                  </div>
                  <div className="bg-white p-3 border border-gray-200 shadow-sm">
                    <span className="text-[9px] text-gray-400 block uppercase font-sans font-bold tracking-wider">Standard Net Payout</span>
                    <span className="text-base font-bold text-emerald-700">${liveStandardPayout.toFixed(2)}</span>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Section: Operations & Defaults */}
          {activeSection === 'operations' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                  <Settings className="h-4 w-4 text-gray-600" />
                  Operational Presets & Field Defaults
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Configure default values used for new auctions, catalogs, and lots to streamline manual intake processes.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Pickup Location</label>
                  <input 
                    type="text" 
                    value={config.operations?.defaultPickupLocation || ''} 
                    onChange={(e) => setConfig({
                      ...config,
                      operations: { ...(config.operations || DEFAULT_PLATFORM_CONFIG.operations!), defaultPickupLocation: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">Pre-populates new auction pickup location fields.</span>
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Reference Code Prefix</label>
                  <input 
                    type="text" 
                    value={config.operations?.defaultInternalRefPrefix || ''} 
                    onChange={(e) => setConfig({
                      ...config,
                      operations: { ...(config.operations || DEFAULT_PLATFORM_CONFIG.operations!), defaultInternalRefPrefix: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">Default prefix for auto-generating reference IDs (e.g. "MCM").</span>
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Pickup Hours / Notes</label>
                  <input 
                    type="text" 
                    value={config.operations?.defaultPickupHoursNotes || ''} 
                    onChange={(e) => setConfig({
                      ...config,
                      operations: { ...(config.operations || DEFAULT_PLATFORM_CONFIG.operations!), defaultPickupHoursNotes: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                  <span className="text-[10px] text-gray-400 mt-1 block">e.g. "9 AM - 4 PM" or "By appointment only".</span>
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Lot Category Preset</label>
                  <select 
                    value={config.operations?.defaultLotCategory || ''} 
                    onChange={(e) => setConfig({
                      ...config,
                      operations: { ...(config.operations || DEFAULT_PLATFORM_CONFIG.operations!), defaultLotCategory: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 bg-white focus:outline-none focus:ring-1 focus:ring-[#1A1A19]"
                  >
                    {config.categories.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-gray-400 mt-1 block">Default category pre-selection for new lots.</span>
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Estimate Low ($)</label>
                  <input 
                    type="number" 
                    value={config.operations?.defaultLotEstimateLow ?? 50} 
                    onChange={(e) => setConfig({
                      ...config,
                      operations: { ...(config.operations || DEFAULT_PLATFORM_CONFIG.operations!), defaultLotEstimateLow: Number(e.target.value) }
                    })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-gray-600 font-semibold mb-1">Default Estimate High ($)</label>
                  <input 
                    type="number" 
                    value={config.operations?.defaultLotEstimateHigh ?? 150} 
                    onChange={(e) => setConfig({
                      ...config,
                      operations: { ...(config.operations || DEFAULT_PLATFORM_CONFIG.operations!), defaultLotEstimateHigh: Number(e.target.value) }
                    })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-[#4A4A49] font-semibold mb-1">Default Auction Start Time</label>
                  <input 
                    type="time" 
                    value={config.operations?.defaultStartTime || '10:00'} 
                    onChange={(e) => setConfig({
                      ...config,
                      operations: { ...(config.operations || DEFAULT_PLATFORM_CONFIG.operations!), defaultStartTime: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>

                <div>
                  <label className="block text-[#4A4A49] font-semibold mb-1">Default Auction End Time</label>
                  <input 
                    type="time" 
                    value={config.operations?.defaultEndTime || '18:00'} 
                    onChange={(e) => setConfig({
                      ...config,
                      operations: { ...(config.operations || DEFAULT_PLATFORM_CONFIG.operations!), defaultEndTime: e.target.value }
                    })}
                    className="w-full border border-gray-300 p-2 font-mono focus:outline-none focus:ring-1 focus:ring-[#1A1A19]" 
                  />
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
