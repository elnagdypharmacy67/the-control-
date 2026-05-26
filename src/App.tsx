import { useEffect, useState, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileSpreadsheet,
  Layers,
  RefreshCw,
  Search,
  ExternalLink,
  Save,
  Undo2,
  AlertCircle,
  Database,
  Grid3X3,
  CheckCircle,
} from 'lucide-react';

import { initAuth, googleSignIn, logout } from './auth';
import { extractSpreadsheetId, fetchSpreadsheetMetadata, fetchSheetValues, updateSheetValues } from './sheetsService';
import { SpreadsheetMetadata } from './types';
import AuthCard from './components/AuthCard';
import MetricCards from './components/MetricCards';
import ProductCardGrid from './components/ProductCardGrid';

export default function App() {
  // Auth state variables
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Sheets configuration variables
  const [catalogSheetUrl, setCatalogSheetUrl] = useState<string>(
    'https://docs.google.com/spreadsheets/d/1KTgm5-6NS3VEqrLAFYggPmGqfeQ_utxG7xNRBTHGpdo/edit?usp=drivesdk'
  );
  const [catalogSpreadsheetId, setCatalogSpreadsheetId] = useState<string | null>(
    '1KTgm5-6NS3VEqrLAFYggPmGqfeQ_utxG7xNRBTHGpdo'
  );

  const [valuesSheetUrl, setValuesSheetUrl] = useState<string>(
    'https://docs.google.com/spreadsheets/d/1YUI0K9kBSoC9zfRcsykO0w0I4hcvnQi3xL7LDJpoJAQ/edit?usp=drivesdk'
  );
  const [valuesSpreadsheetId, setValuesSpreadsheetId] = useState<string | null>(
    '1YUI0K9kBSoC9zfRcsykO0w0I4hcvnQi3xL7LDJpoJAQ'
  );

  // Catalog sheet state variables
  const [catalogMetadata, setCatalogMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [selectedCatalogTab, setSelectedCatalogTab] = useState<string | null>(null);
  const [catalogOriginalRows, setCatalogOriginalRows] = useState<string[][]>([]);
  const [catalogLocalRows, setCatalogLocalRows] = useState<string[][]>([]);

  // Values sheet state variables
  const [valuesMetadata, setValuesMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [selectedValuesTab, setSelectedValuesTab] = useState<string | null>(null);
  const [valuesOriginalRows, setValuesOriginalRows] = useState<string[][]>([]);
  const [valuesLocalRows, setValuesLocalRows] = useState<string[][]>([]);

  // Editor states
  const [hasHeadersRow, setHasHeadersRow] = useState<boolean>(true);
  
  // Async feedback status indicators
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(false);
  const [isValuesLoading, setIsValuesLoading] = useState<boolean>(false);

  const [isCatalogSaving, setIsCatalogSaving] = useState<boolean>(false);
  const [isValuesSaving, setIsValuesSaving] = useState<boolean>(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Ref to avoid duplicate fetches on startup
  const lastLoadedCatalogRef = useRef<string | null>(null);

  // Initialize Auth listeners on mount
  useEffect(() => {
    const unsub = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  // Handle manual Login triggers
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      const authResult = await googleSignIn();
      if (authResult) {
        setUser(authResult.user);
        setAccessToken(authResult.accessToken);
        setNeedsAuth(false);
        showToast('success', 'Google Sign-In completed successfully!');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'OAuth Connection failed. Ensure you granted permissions.');
      showToast('error', 'Google Authentication discontinued');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle sign-outs
  const handleLogout = async () => {
    try {
      const confirmation = window.confirm('Are you sure you want to log out?');
      if (!confirmation) return;
      await logout();
      setUser(null);
      setAccessToken(null);
      setNeedsAuth(true);
      setCatalogMetadata(null);
      setSelectedCatalogTab(null);
      setCatalogOriginalRows([]);
      setCatalogLocalRows([]);
      setValuesMetadata(null);
      setSelectedValuesTab(null);
      setValuesOriginalRows([]);
      setValuesLocalRows([]);
      showToast('success', 'Logged out secure session');
    } catch (err: any) {
      console.error(err);
    }
  };

  // Toast Notification manager helper
  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => {
      setToastMsg(null);
    }, 5000);
  };

  // URL inputs synchronization
  const handleCatalogUrlChange = (urlValue: string) => {
    setCatalogSheetUrl(urlValue);
    const extracted = extractSpreadsheetId(urlValue);
    setCatalogSpreadsheetId(extracted);
  };

  const handleValuesUrlChange = (urlValue: string) => {
    setValuesSheetUrl(urlValue);
    const extracted = extractSpreadsheetId(urlValue);
    setValuesSpreadsheetId(extracted);
  };

  // Main background catalog sheet loader
  const fetchCatalogSheet = async (targetId: string, token: string, activeTab?: string) => {
    setIsCatalogLoading(true);
    try {
      const meta = await fetchSpreadsheetMetadata(targetId, token);
      setCatalogMetadata(meta);
      
      if (meta.sheets.length > 0) {
        let tabToLoad = activeTab || selectedCatalogTab;
        const exists = meta.sheets.some((s) => s.title === tabToLoad);
        if (!exists || !tabToLoad) {
          tabToLoad = meta.sheets[0].title;
        }
        setSelectedCatalogTab(tabToLoad);

        const data = await fetchSheetValues(targetId, tabToLoad, token);
        lastLoadedCatalogRef.current = `${targetId}-${tabToLoad}`;
        setCatalogOriginalRows(JSON.parse(JSON.stringify(data)));
        setCatalogLocalRows(JSON.parse(JSON.stringify(data)));
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to load Catalog spreadsheet values: ${err.message}`);
    } finally {
      setIsCatalogLoading(false);
    }
  };

  // Main background values sheet loader
  const fetchValuesSheet = async (targetId: string, token: string) => {
    setIsValuesLoading(true);
    try {
      const meta = await fetchSpreadsheetMetadata(targetId, token);
      setValuesMetadata(meta);

      if (meta.sheets.length > 0) {
        const tabToLoad = meta.sheets[0].title;
        setSelectedValuesTab(tabToLoad);

        const data = await fetchSheetValues(targetId, tabToLoad, token);
        setValuesOriginalRows(JSON.parse(JSON.stringify(data)));
        setValuesLocalRows(JSON.parse(JSON.stringify(data)));
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to load Quick Values spreadsheet: ${err.message}`);
    } finally {
      setIsValuesLoading(false);
    }
  };

  // Parallel refresh helper for both sheets
  const handleRefreshBothSheets = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await Promise.all([
        catalogSpreadsheetId ? fetchCatalogSheet(catalogSpreadsheetId, accessToken) : Promise.resolve(),
        valuesSpreadsheetId ? fetchValuesSheet(valuesSpreadsheetId, accessToken) : Promise.resolve(),
      ]);
      showToast('success', 'Both spreadsheets refreshed successfully!');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Real-time refresh completed with warnings: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Trigger loading on Auth or Sheet IDs adjustment
  useEffect(() => {
    if (accessToken) {
      handleRefreshBothSheets();
    }
  }, [accessToken, catalogSpreadsheetId, valuesSpreadsheetId]);

  // Load catalog sheet values if specified tab name shifts
  useEffect(() => {
    if (catalogSpreadsheetId && selectedCatalogTab && accessToken) {
      const currentTabOnMetadata = catalogMetadata?.sheets?.some(s => s.title === selectedCatalogTab);
      const cacheKey = `${catalogSpreadsheetId}-${selectedCatalogTab}`;
      if (currentTabOnMetadata && lastLoadedCatalogRef.current !== cacheKey) {
        setIsCatalogLoading(true);
        fetchSheetValues(catalogSpreadsheetId, selectedCatalogTab, accessToken)
          .then((data) => {
            lastLoadedCatalogRef.current = cacheKey;
            setCatalogOriginalRows(JSON.parse(JSON.stringify(data)));
            setCatalogLocalRows(JSON.parse(JSON.stringify(data)));
          })
          .catch((err) => {
            console.error(err);
            setErrorMsg(`Could not fetch dynamic catalog tab values: ${err.message}`);
          })
          .finally(() => {
            setIsCatalogLoading(false);
          });
      }
    }
  }, [selectedCatalogTab, catalogSpreadsheetId]);

  // Save changes direct back to Google Catalog Spreadsheet
  const handleSaveCatalogToGoogleSheets = async () => {
    if (!accessToken || !catalogSpreadsheetId || !selectedCatalogTab) {
      showToast('error', 'Google Auth token missing. Please sign in again.');
      return;
    }

    const blockConfirmation = window.confirm(
      `Sync catalog changes layout back to Google Sheets? This will overwrite elements on tab '${selectedCatalogTab}' in Google Drive.`
    );
    if (!blockConfirmation) return;

    setIsCatalogSaving(true);
    setErrorMsg(null);
    try {
      await updateSheetValues(catalogSpreadsheetId, selectedCatalogTab, catalogLocalRows, accessToken);
      setCatalogOriginalRows(JSON.parse(JSON.stringify(catalogLocalRows)));
      showToast('success', 'Saved product catalog changes back directly!');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Catalog save writing failed: ${err.message}`);
      showToast('error', 'Failed to update Google Catalog spreadsheet');
    } finally {
      setIsCatalogSaving(false);
    }
  };

  // Save changes direct back to Quick Values Spreadsheet (B1 / B2 cells)
  const handleSaveValuesToGoogleSheets = async () => {
    if (!accessToken || !valuesSpreadsheetId || !selectedValuesTab) {
      showToast('error', 'Google Auth token missing. Please sign in again.');
      return;
    }

    const blockConfirmation = window.confirm(
      `Sync B1 and B2 coordinate adjustments to Google Sheets? This will update the Cell values in worksheet '${selectedValuesTab}' directly.`
    );
    if (!blockConfirmation) return;

    setIsValuesSaving(true);
    setErrorMsg(null);
    try {
      await updateSheetValues(valuesSpreadsheetId, selectedValuesTab, valuesLocalRows, accessToken);
      setValuesOriginalRows(JSON.parse(JSON.stringify(valuesLocalRows)));
      showToast('success', 'Synchronized B1 and B2 values successfully!');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Coordinate values saving failed: ${err.message}`);
      showToast('error', 'Failed to update Google Quick Values spreadsheet');
    } finally {
      setIsValuesSaving(false);
    }
  };

  // Map helper variables for columns
  const getColLetter = (index: number): string => {
    let letter = '';
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  const maxCols = useMemo(() => {
    let count = 0;
    catalogLocalRows.forEach((row) => {
      count = Math.max(count, row.length);
    });
    return count;
  }, [catalogLocalRows]);

  const headers = useMemo(() => {
    if (hasHeadersRow && catalogLocalRows.length > 0) {
      return Array.from({ length: maxCols }).map((_, idx) => catalogLocalRows[0][idx] || `Column ${getColLetter(idx)}`);
    }
    return Array.from({ length: maxCols }).map((_, idx) => getColLetter(idx));
  }, [catalogLocalRows, hasHeadersRow, maxCols]);

  // Catalog undo logic
  const handleUndoCatalogChanges = () => {
    const confirmation = window.confirm(
      'Are you sure you want to discard all local product edits made in this catalog session?'
    );
    if (!confirmation) return;
    setCatalogLocalRows(JSON.parse(JSON.stringify(catalogOriginalRows)));
    showToast('success', 'Discarded pending product modifications');
  };

  // Calculating changes count
  const unsavedCatalogChangesCount = useMemo(() => {
    let editCount = 0;
    catalogLocalRows.forEach((row, ri) => {
      for (let ci = 0; ci < maxCols; ci++) {
        const origVal = catalogOriginalRows[ri]?.[ci] ?? '';
        const localVal = row[ci] ?? '';
        if (origVal !== localVal) {
          editCount++;
        }
      }
    });
    return editCount;
  }, [catalogLocalRows, catalogOriginalRows, maxCols]);

  const unsavedValuesChangesCount = useMemo(() => {
    let editCount = 0;
    valuesLocalRows.forEach((row, ri) => {
      const rowLen = Math.max(row.length, valuesOriginalRows[ri]?.length || 0);
      for (let ci = 0; ci < rowLen; ci++) {
        // We only care about edits made on cell B1 (row 0, col 1) & B2 (row 1, col 1)
        if ((ri === 0 && ci === 1) || (ri === 1 && ci === 1)) {
          const origVal = valuesOriginalRows[ri]?.[ci] ?? '';
          const localVal = row[ci] ?? '';
          if (origVal !== localVal) {
            editCount++;
          }
        }
      }
    });
    return editCount;
  }, [valuesLocalRows, valuesOriginalRows]);

  // Selector controls and mutators for values B1 and B2
  const valB1 = useMemo(() => {
    if (valuesLocalRows.length > 0 && valuesLocalRows[0]) {
      return valuesLocalRows[0][1] ?? '';
    }
    return '';
  }, [valuesLocalRows]);

  const valB2 = useMemo(() => {
    if (valuesLocalRows.length > 1 && valuesLocalRows[1]) {
      return valuesLocalRows[1][1] ?? '';
    }
    return '';
  }, [valuesLocalRows]);

  const handleUpdateB1 = (newVal: string) => {
    setValuesLocalRows((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      while (copy.length < 1) copy.push([]);
      while (copy[0].length < 2) copy[0].push('');
      copy[0][1] = newVal;
      return copy;
    });
  };

  const handleUpdateB2 = (newVal: string) => {
    setValuesLocalRows((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      while (copy.length < 2) copy.push([]);
      while (copy[1].length < 2) copy[1].push('');
      copy[1][1] = newVal;
      return copy;
    });
  };

  const handleUndoValuesChanges = () => {
    setValuesLocalRows(JSON.parse(JSON.stringify(valuesOriginalRows)));
    showToast('success', 'Reverted unsaved B1 & B2 coordinates edits');
  };

  const isCatalogBusy = isCatalogLoading || isCatalogSaving;
  const isValuesBusy = isValuesLoading || isValuesSaving;

  return (
    <div className="min-h-screen bg-slate-50/75 flex flex-col justify-between text-gray-800 antialiased selection:bg-teal-100 selection:text-teal-900">
      
      {/* Top Navigation Header bar */}
      <header className="bg-white border-b border-gray-150 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 self-start sm:self-center">
            <div className="w-9 h-9 bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center justify-center text-white shadow-xs transition-colors">
              <FileSpreadsheet size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-sans font-bold text-gray-900 text-sm tracking-tight flex items-center gap-2">
                <span>Google Sheets Premium Catalog</span>
                <span className="bg-emerald-50 text-emerald-700 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md border border-emerald-100 font-mono">Dual-Sync</span>
              </h1>
              <p className="text-[11px] text-gray-400 font-medium font-sans">Parallel card visualizer and live values sheet editor</p>
            </div>
          </div>

          <div className="w-full sm:w-auto self-end sm:self-center">
            {user && (
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Authorized'}
                    className="w-8 h-8 rounded-full border border-gray-150 shadow-3xs"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs font-sans">
                    {user.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="hidden md:block text-right">
                  <p className="text-xs font-bold text-gray-700">{user.displayName || 'Authorized Account'}</p>
                  <button
                    onClick={handleLogout}
                    className="text-[10px] text-gray-400 hover:text-red-500 font-bold transition-colors border-none p-0 cursor-pointer"
                  >
                    Logout Session
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </header>

      {/* Main Workspace Frame container */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col gap-6">
        
        {/* Dynamic Warning Notification banner (Toasts) */}
        <AnimatePresence>
          {toastMsg && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-4 rounded-xl border flex items-center justify-between gap-3 shadow-xs ${
                toastMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                  : 'bg-red-50 border-red-100 text-red-800'
              }`}
            >
              <div className="flex items-center gap-2.5 text-xs font-medium">
                {toastMsg.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                <span>{toastMsg.text}</span>
              </div>
              <button
                onClick={() => setToastMsg(null)}
                className="text-xs font-sans hover:opacity-75 font-semibold text-gray-500 hover:text-gray-800"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dual spreadsheet connection configurations */}
        <div className="bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-extrabold font-mono text-slate-400 uppercase tracking-widest">Connected Workbooks Setup</h3>
              <p className="text-xs text-slate-500 mt-0.5">Connected in real-time. Change or paste any custom sheet URL you want initialized in the background.</p>
            </div>
            {accessToken && (
              <button
                onClick={handleRefreshBothSheets}
                disabled={isLoading || isCatalogBusy || isValuesBusy}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs inline-flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                <span>{isLoading ? 'Refreshing both...' : 'Reload Workbooks'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
            {/* Sheet 1 Input - Catalog */}
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100/80 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold font-mono uppercase bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">
                  📔 catalog sheet link
                </span>
                <a
                  href={catalogSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-blue-600 font-semibold hover:underline inline-flex items-center gap-0.5 animate-pulse"
                >
                  <span>Open Sheet</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={catalogSheetUrl}
                  onChange={(e) => handleCatalogUrlChange(e.target.value)}
                  placeholder="Paste Google sheet link for premium products..."
                  className="w-full pl-3 pr-3 py-2 bg-white border border-gray-200 focus:border-emerald-400 text-xs text-gray-750 font-medium rounded-lg outline-hidden focus:bg-white transition-all shadow-3xs"
                />
              </div>

              {catalogMetadata && (
                <div className="text-[10.5px] text-gray-500 flex items-center justify-between flex-wrap gap-1 font-sans">
                  <span>Workbook: <strong className="text-gray-700 font-bold">{catalogMetadata.title}</strong></span>
                  <span>Sheets: <strong className="text-emerald-700 font-bold">{catalogMetadata.sheets.length} tabs</strong></span>
                </div>
              )}
            </div>

            {/* Sheet 2 Input - Values */}
            <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100/80 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold font-mono uppercase bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                  ⚡ quick values sheet link
                </span>
                <a
                  href={valuesSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-indigo-600 font-semibold hover:underline inline-flex items-center gap-0.5 animate-pulse"
                >
                  <span>Open Sheet</span>
                  <ExternalLink size={10} />
                </a>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={valuesSheetUrl}
                  onChange={(e) => handleValuesUrlChange(e.target.value)}
                  placeholder="Paste Google sheet link with B1 & B2 coordinates values..."
                  className="w-full pl-3 pr-3 py-2 bg-white border border-gray-200 focus:border-indigo-400 text-xs text-gray-750 font-medium rounded-lg outline-hidden focus:bg-white transition-all shadow-3xs"
                />
              </div>

              {valuesMetadata && (
                <div className="text-[10.5px] text-gray-500 flex items-center justify-between flex-wrap gap-1 font-sans">
                  <span>Workbook: <strong className="text-gray-700 font-bold">{valuesMetadata.title}</strong></span>
                  <span>Active Tab: <strong className="text-indigo-700 font-bold">{selectedValuesTab || 'First tab'}</strong></span>
                </div>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="bg-amber-50/50 border border-amber-200 text-amber-955 rounded-xl p-3.5 text-xs flex items-start gap-2 animate-feed-in">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Integrated Connector Notice</p>
                <p className="mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}
        </div>

        {/* Dynamic Auth Barrier Block */}
        {needsAuth ? (
          <div className="bg-white border border-gray-150 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-6 shadow-xs max-w-lg mx-auto my-6">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center border border-amber-100 shadow-3xs">
              <Database size={24} />
            </div>
            <div>
              <h2 className="font-sans font-bold text-slate-900 text-base">Google Authentication Requested</h2>
              <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
                No active authorization session detected. Connecting to Google Sheets requires authenticating your account to query, update, or edit the selected files securely.
              </p>
            </div>

            <AuthCard
              user={user}
              needsAuth={needsAuth}
              isLoggingIn={isLoggingIn}
              onLogin={handleLogin}
              onLogout={handleLogout}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            
            {/* Split layout block: KPI Metrics card next to cell controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Metric Card Catalog Status (Span 5) */}
              <div className="lg:col-span-5 flex flex-col">
                <MetricCards
                  sheetTitle={catalogMetadata?.title || 'Spreadsheet Catalog'}
                  totalRows={catalogLocalRows.length}
                  totalCols={maxCols}
                  unsavedChangesCount={unsavedCatalogChangesCount}
                  selectedTabName={selectedCatalogTab || 'No active tab'}
                  isSaving={isCatalogSaving}
                  onSave={handleSaveCatalogToGoogleSheets}
                  canSave={unsavedCatalogChangesCount > 0}
                />
              </div>

              {/* B1 & B2 Live controller editor (Span 7) */}
              <div className="lg:col-span-7 bg-white border border-gray-150 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3 mb-4">
                    <div>
                      <h3 className="text-xs font-extrabold font-sans text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                        <span>⚡ Live Coordinate Controls (B1 & B2)</span>
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">Quickly edit values on the connected sheet. Commited coordinate cell changes go to Sheet B.</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {unsavedValuesChangesCount > 0 ? (
                        <button
                          onClick={handleSaveValuesToGoogleSheets}
                          disabled={isValuesSaving}
                          className="px-3.5 py-1.5 bg-indigo-650 hover:bg-indigo-750 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-3xs cursor-pointer transition-all hover:scale-[1.02]"
                        >
                          <Save size={12} />
                          <span>Sync Values ({unsavedValuesChangesCount})</span>
                        </button>
                      ) : (
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-150 text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>Synced & Live</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-50/75 hover:bg-slate-50 border border-slate-100/80 rounded-xl p-3.5 transition-all">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-extrabold px-1.5 py-0.5 rounded-md">
                          CELL B1 (Row 1, Col B)
                        </span>
                        {valB1 !== valuesOriginalRows[0]?.[1] && (
                          <span className="text-[9px] text-amber-600 font-extrabold flex items-center gap-0.5 animate-pulse">
                            Pending
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={valB1}
                        onChange={(e) => handleUpdateB1(e.target.value)}
                        placeholder="Type standard B1 cell value..."
                        className="px-3 py-2 bg-white border border-gray-200 focus:border-indigo-400 text-gray-800 text-xs font-semibold rounded-lg outline-hidden w-full transition-all"
                      />
                    </div>

                    <div className="bg-slate-50/75 hover:bg-slate-50 border border-slate-100/80 rounded-xl p-3.5 transition-all">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-mono text-[9px] bg-teal-50 border border-teal-100 text-teal-700 font-extrabold px-1.5 py-0.5 rounded-md">
                          CELL B2 (Row 2, Col B)
                        </span>
                        {valB2 !== valuesOriginalRows[1]?.[1] && (
                          <span className="text-[9px] text-amber-600 font-extrabold flex items-center gap-0.5 animate-pulse">
                            Pending
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={valB2}
                        onChange={(e) => handleUpdateB2(e.target.value)}
                        placeholder="Type standard B2 cell value..."
                        className="px-3 py-2 bg-white border border-gray-200 focus:border-teal-400 text-gray-800 text-xs font-semibold rounded-lg outline-hidden w-full transition-all"
                      />
                    </div>
                  </div>
                </div>

                {unsavedValuesChangesCount > 0 && (
                  <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                    <button
                      onClick={handleUndoValuesChanges}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs"
                    >
                      Undo Edits
                    </button>
                    <button
                      onClick={handleSaveValuesToGoogleSheets}
                      disabled={isValuesSaving}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1"
                    >
                      {isValuesSaving ? 'Saving...' : 'Save Coordinate Values'}
                    </button>
                  </div>
                )}
              </div>

            </div>

            {/* Catalog tab selector controllers */}
            {catalogMetadata && catalogMetadata.sheets.length > 1 && (
              <div className="bg-white border border-gray-150 rounded-xl p-3 shadow-3xs flex items-center gap-2 overflow-x-auto select-none">
                <span className="text-xs font-bold font-sans text-gray-400 uppercase tracking-wider px-2 flex items-center gap-1.5 flex-shrink-0">
                  <Layers size={13} />
                  <span>Worksheets:</span>
                </span>
                <div className="flex items-center gap-1">
                  {catalogMetadata.sheets.map((sheet) => (
                    <button
                      key={sheet.sheetId}
                      onClick={() => setSelectedCatalogTab(sheet.title)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                        selectedCatalogTab === sheet.title
                          ? 'bg-slate-800 text-white shadow-3xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                      }`}
                    >
                      {sheet.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Main Product Catalog browser Display */}
            <div>
              <ProductCardGrid
                originalRows={catalogOriginalRows}
                localRows={catalogLocalRows}
                headers={headers}
                setLocalRows={setCatalogLocalRows}
                hasHeadersRow={hasHeadersRow}
                setHasHeadersRow={setHasHeadersRow}
                onUndoAll={handleUndoCatalogChanges}
                isSaving={isCatalogSaving}
                catalogSheetUrl={catalogSheetUrl}
              />
            </div>

          </div>
        )}

      </main>

      {/* Footer copyright section */}
      <footer className="bg-white border-t border-gray-150 py-5 text-center mt-12">
        <p className="font-mono text-[10px] text-gray-400">
          Sync Connected — Catalog Sheet: {catalogSpreadsheetId?.substring(0, 10)}... — Values Sheet: {valuesSpreadsheetId?.substring(0, 10)}...
        </p>
      </footer>

    </div>
  );
}
