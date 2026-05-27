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
  ArrowLeft,
  Home,
  MessageSquare,
  Settings,
  Sparkles,
  ChevronRight,
} from 'lucide-react';

import { initAuth, googleSignIn, logout } from './auth';
import { extractSpreadsheetId, fetchSpreadsheetMetadata, fetchSheetValues, updateSheetValues } from './sheetsService';
import { SpreadsheetMetadata } from './types';
import AuthCard from './components/AuthCard';
import MetricCards from './components/MetricCards';
import ProductCardGrid from './components/ProductCardGrid';
import OrderParser from './components/OrderParser';

export default function App() {
  // Navigation active page routing state
  const [activePage, setActivePage] = useState<string>('home');

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

  // Check for expired or invalid authentication credential errors from the Google API
  const checkAuthError = (err: any): boolean => {
    const msg = String(err?.message || err || '').toLowerCase();
    if (
      msg.includes('invalid authentication credentials') ||
      msg.includes('invalid credential') ||
      msg.includes('unauthorized') ||
      msg.includes('oauth 2') ||
      msg.includes('401') ||
      msg.includes('expected oauth 2')
    ) {
      setAccessToken(null);
      setNeedsAuth(true);
      setErrorMsg('Google login session expired or invalid. Please sign in again.');
      showToast('error', 'Google API session expired. Please connect again.');
      return true;
    }
    return false;
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
      if (!checkAuthError(err)) {
        setErrorMsg(`Failed to load Catalog spreadsheet values: ${err.message}`);
      }
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
      if (!checkAuthError(err)) {
        setErrorMsg(`Failed to load Quick Values spreadsheet: ${err.message}`);
      }
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
      if (!checkAuthError(err)) {
        setErrorMsg(`Real-time refresh completed with warnings: ${err.message}`);
      }
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
            if (!checkAuthError(err)) {
              setErrorMsg(`Could not fetch dynamic catalog tab values: ${err.message}`);
            }
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
      if (!checkAuthError(err)) {
        setErrorMsg(`Catalog save writing failed: ${err.message}`);
        showToast('error', 'Failed to update Google Catalog spreadsheet');
      }
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
      if (!checkAuthError(err)) {
        setErrorMsg(`Coordinate values saving failed: ${err.message}`);
        showToast('error', 'Failed to update Google Quick Values spreadsheet');
      }
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

  const columnRoles = useMemo(() => {
    let titleIdx = 0;
    let stockIdx = -1;
    headers.forEach((h, idx) => {
      const name = h.toLowerCase();
      if (name.includes('name') || name.includes('title') || name.includes('product') || name.includes('item') || name.includes('book') || name.includes('model')) {
        if (titleIdx === 0 || name === 'name' || name === 'title' || name === 'product') {
          titleIdx = idx;
        }
      } else if (name.includes('stock') || name.includes('quantity') || name.includes('qty') || name.includes('avail') || name.includes('count')) {
        stockIdx = idx;
      }
    });
    return { titleIdx, stockIdx };
  }, [headers]);

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
    <div className="min-h-screen bg-[#FAFAFC] flex flex-col justify-between text-neutral-800 antialiased">
      
      {/* Top Navigation Header bar */}
      <header className="bg-white/95 backdrop-blur-md border-b border-neutral-200/50 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-2.5 self-start sm:self-center cursor-pointer select-none" onClick={() => setActivePage('home')}>
            <div className="w-8 h-8 bg-emerald-900 hover:bg-emerald-950 rounded-lg flex items-center justify-center text-white transition-colors">
              <FileSpreadsheet width={16} height={16} className="stroke-[2]" />
            </div>
            <div>
              <h1 className="font-sans font-bold text-neutral-900 text-sm tracking-tight uppercase tracking-wider">
                elnagdy pharmacy
              </h1>
            </div>
          </div>

          {/* Page Routing Menu Tabs */}
          {!needsAuth && (
            <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-full self-stretch md:self-auto overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActivePage('home')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap ${
                  activePage === 'home'
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
                }`}
              >
                <Home size={12} />
                <span>Home</span>
              </button>
              <button
                onClick={() => setActivePage('products')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap ${
                  activePage === 'products'
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
                }`}
              >
                <Grid3X3 size={12} />
                <span>Products</span>
              </button>
              <button
                onClick={() => setActivePage('order')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap ${
                  activePage === 'order'
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
                }`}
              >
                <MessageSquare size={12} />
                <span>Order Parser</span>
              </button>
              <button
                onClick={() => setActivePage('coordinates')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap ${
                  activePage === 'coordinates'
                    ? 'bg-emerald-950 text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
                }`}
              >
                <Layers size={12} />
                <span>Coordinate B1/B2</span>
              </button>
              <button
                onClick={() => setActivePage('settings')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap ${
                  activePage === 'settings'
                    ? 'bg-emerald-900 text-white shadow-xs'
                    : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
                }`}
              >
                <Settings size={12} />
                <span>Settings</span>
              </button>
            </div>
          )}

          <div className="w-full sm:w-auto self-end sm:self-center hidden md:block">
            {user && (
              <div className="flex items-center gap-2.5">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Authorized'}
                    className="w-7 h-7 rounded-full border border-neutral-200/60 shadow-3xs"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center font-bold text-xs">
                    {user.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="hidden md:block text-right">
                  <p className="text-[11px] font-semibold text-neutral-700 leading-none">{user.displayName || 'Authorized Account'}</p>
                  <button
                    onClick={handleLogout}
                    className="text-[9px] text-neutral-450 hover:text-red-500 font-semibold transition-colors border-none p-0 cursor-pointer"
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
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 shadow-xs font-sans ${
                toastMsg.type === 'success'
                  ? 'bg-neutral-900 border-neutral-950 text-white'
                  : 'bg-red-50 border-red-150 text-red-800'
              }`}
            >
              <div className="flex items-center gap-2.5 text-xs font-medium">
                {toastMsg.type === 'success' ? <CheckCircle size={14} className="text-white" /> : <AlertCircle size={14} />}
                <span>{toastMsg.text}</span>
              </div>
              <button
                onClick={() => setToastMsg(null)}
                className="text-[10px] uppercase tracking-wider font-extrabold hover:opacity-75 text-neutral-400 hover:text-white"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Auth Barrier Block */}
        {needsAuth ? (
          <div className="bg-white border border-neutral-200/60 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-5 shadow-xs max-w-md mx-auto my-12 animate-fade-in">
            <div className="w-12 h-12 bg-neutral-50 text-neutral-800 rounded-full flex items-center justify-center border border-neutral-100 shadow-3xs">
              <Database size={20} />
            </div>
            <div>
              <h2 className="font-sans font-semibold text-neutral-900 text-sm">Google Sheets Synchronization Required</h2>
              <p className="text-xs text-neutral-500 mt-2 max-w-xs mx-auto leading-relaxed">
                Please grant authorization permissions to safely read, write, and synchronize your catalog products and stock quantities directly via the official Google Sheets API.
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
            
            {/* 🏠 Page 1: Home Dashboard Hub */}
            {activePage === 'home' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                
                {/* Dashboard Welcome Header Banner */}
                <div className="bg-[#022c22] border border-[#064e3b] rounded-2xl p-6 md:p-8 text-white relative overflow-hidden shadow-sm">
                  <div className="relative z-10">
                    <h2 className="text-xl md:text-2xl font-bold font-sans tracking-tight">
                      elnagdy pharmacy
                    </h2>
                    <p className="text-emerald-100 text-xs mt-1.5 font-sans">
                      Welcome Back, {user?.displayName?.split(' ')[0] || 'Pharmacist'}. Manage inventory, parse medical orders, and synchronize coordinate cells directly.
                    </p>
                  </div>
                </div>

                {/* Dashboard Navigation Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  
                  {/* Card 1: View Products */}
                  <div 
                    onClick={() => setActivePage('products')}
                    className="bg-white border border-neutral-200/60 rounded-2xl p-5 hover:border-emerald-800 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[160px] group"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-850 rounded-lg flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-900 group-hover:text-white transition-all">
                        <Grid3X3 size={15} className="stroke-[2.5]" />
                      </div>
                      <div>
                        <h3 className="font-bold text-neutral-900 text-sm font-sans transition-colors group-hover:text-emerald-900">
                          Browse Catalog
                        </h3>
                        <p className="text-[11px] text-neutral-450 mt-1 leading-relaxed font-sans">
                          Search products, edit details, titles, prices, or inventories.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-emerald-900 font-bold font-sans mt-3">
                      <span>Browse Products</span>
                      <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>

                  {/* Card 2: Order Parser */}
                  <div 
                    onClick={() => setActivePage('order')}
                    className="bg-white border border-neutral-200/60 rounded-2xl p-5 hover:border-emerald-800 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[160px] group"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-850 rounded-lg flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-900 group-hover:text-white transition-all">
                        <MessageSquare size={14} className="stroke-[2.5]" />
                      </div>
                      <div>
                        <h3 className="font-bold text-neutral-900 text-sm font-sans transition-colors group-hover:text-emerald-900">
                          Order Parser
                        </h3>
                        <p className="text-[11px] text-neutral-450 mt-1 leading-relaxed font-sans">
                          Paste WhatsApp text orders to reduce quantities from inventory automatically.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-emerald-900 font-bold font-sans mt-3">
                      <span>Reduce Stocks</span>
                      <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>

                  {/* Card 3: Coordinate Live Controls */}
                  <div 
                    onClick={() => setActivePage('coordinates')}
                    className="bg-white border border-neutral-200/60 rounded-2xl p-5 hover:border-emerald-800 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[160px] group"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-850 rounded-lg flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-900 group-hover:text-white transition-all">
                        <Layers size={14} className="stroke-[2.5]" />
                      </div>
                      <div>
                        <h3 className="font-bold text-neutral-900 text-sm font-sans transition-colors group-hover:text-emerald-900">
                          B1 & B2 Coordinates
                        </h3>
                        <p className="text-[11px] text-neutral-450 mt-1 leading-relaxed font-sans">
                          Modify specific cell values for coordinates B1 and B2 on Sheet B.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-emerald-900 font-bold font-sans mt-3">
                      <span>Sync Coordinates</span>
                      <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>

                  {/* Card 4: Connections Settings */}
                  <div 
                    onClick={() => setActivePage('settings')}
                    className="bg-white border border-neutral-200/60 rounded-2xl p-5 hover:border-emerald-800 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between min-h-[160px] group"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-850 rounded-lg flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-900 group-hover:text-white transition-all">
                        <Settings size={14} className="stroke-[2.5]" />
                      </div>
                      <div>
                        <h3 className="font-bold text-neutral-900 text-sm font-sans transition-colors group-hover:text-emerald-900">
                          Workbook Setup Links
                        </h3>
                        <p className="text-[11px] text-neutral-450 mt-1 leading-relaxed font-sans">
                          Configure target workbook Google Sheets URLs.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-emerald-900 font-bold font-sans mt-3">
                      <span>Configure Links</span>
                      <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>

                </div>

                {/* Quick actions box with status indicators */}
                <div className="bg-white border border-neutral-200/60 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs text-neutral-500 font-sans">
                      Connected to Sheets API securely as <strong className="text-neutral-700 font-semibold">{user?.email}</strong>.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRefreshBothSheets}
                      disabled={isLoading || isCatalogBusy || isValuesBusy}
                      className="px-3.5 py-1.5 border border-neutral-200 hover:bg-neutral-50 text-neutral-600 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer select-none"
                    >
                      <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
                      <span>Sync Workbooks Now</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold rounded-lg cursor-pointer select-none"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>

              </div>
            )}

            {/* 💊 Page 2: Products Browsing Catalog view */}
            {activePage === 'products' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                
                {/* Back Link Nav Bar */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button
                    onClick={() => setActivePage('home')}
                    className="px-3.5 py-1.5 border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-3xs"
                  >
                    <ArrowLeft size={12} />
                    <span>Back to Home</span>
                  </button>

                  <div className="flex items-center gap-2 flex-wrap text-xs text-neutral-400">
                    <span>Workbook: <strong className="text-neutral-600 font-semibold">{catalogMetadata?.title || 'Catalog'}</strong></span>
                    <span className="w-1 h-3 border-l border-neutral-200"></span>
                    <span>Tab: <strong className="text-neutral-700 font-bold">{selectedCatalogTab}</strong></span>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                  
                  {/* Metric Summary card limits */}
                  <div className="lg:col-span-12 flex flex-col">
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

                  {/* Worksheet tabs switch box inside the dynamic catalog view */}
                  {catalogMetadata && catalogMetadata.sheets.length > 1 && (
                    <div className="lg:col-span-12 bg-white border border-neutral-200/60 rounded-2xl p-4 shadow-xs flex flex-col">
                      <span className="text-[9px] font-bold font-mono text-neutral-400 uppercase tracking-wider block mb-2.5">
                        SELECT ACTIVE WORKSHEET TAB
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {catalogMetadata.sheets.map((sheet) => (
                          <button
                            key={sheet.sheetId}
                            onClick={() => setSelectedCatalogTab(sheet.title)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                              selectedCatalogTab === sheet.title
                                ? 'bg-neutral-900 text-white shadow-3xs'
                                : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {sheet.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Main Product Catalog card list */}
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

            {/* 📋 Page 3: Instant WhatsApp Order Parser */}
            {activePage === 'order' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                
                {/* Back button */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button
                    onClick={() => setActivePage('home')}
                    className="px-3.5 py-1.5 border border-neutral-200 bg-white hover:bg-slate-50 text-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-3xs"
                  >
                    <ArrowLeft size={12} />
                    <span>Back to Home</span>
                  </button>

                  <div className="text-xs text-neutral-400 font-medium">
                    Order Parser & Pattern-Matching Stock Controller
                  </div>
                </div>

                {/* WhatsApp Parser Form Block */}
                <div>
                  <OrderParser
                    catalogLocalRows={catalogLocalRows}
                    setCatalogLocalRows={setCatalogLocalRows}
                    headers={headers}
                    columnRoles={columnRoles}
                    hasHeadersRow={hasHeadersRow}
                    showToast={showToast}
                  />
                </div>

              </div>
            )}

            {/* ⚡ Page 4: Live coordinate controller (B1 & B2 edits) */}
            {activePage === 'coordinates' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                
                {/* Back button */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button
                    onClick={() => setActivePage('home')}
                    className="px-3.5 py-1.5 border border-neutral-200 bg-white hover:bg-slate-50 text-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-3xs"
                  >
                    <ArrowLeft size={12} />
                    <span>Back to Home</span>
                  </button>

                  <div className="text-xs text-neutral-400 font-sans">
                    Single-Cell Coordinates Writer
                  </div>
                </div>

                {/* B1 & B2 Live controller editor */}
                <div className="bg-white border border-neutral-200/60 rounded-xl p-5 shadow-xs flex flex-col justify-between max-w-4xl">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 pb-3.5 mb-4">
                      <div>
                        <h3 className="text-xs font-semibold font-sans text-neutral-900 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-900"></span>
                          <span>B1 & B2 Coordinate Values</span>
                        </h3>
                        <p className="text-[11px] text-neutral-400 mt-0.5">Quickly edit isolated spreadsheet coordinate cells. Changes apply to Sheet B.</p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {unsavedValuesChangesCount > 0 ? (
                          <button
                            onClick={handleSaveValuesToGoogleSheets}
                            disabled={isValuesSaving}
                            className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-950 text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1 shadow-xs cursor-pointer transition-colors"
                          >
                            <Save size={11} />
                            <span>Sync cell coordinates ({unsavedValuesChangesCount})</span>
                          </button>
                        ) : (
                          <span className="bg-neutral-50 text-neutral-605 border border-neutral-200 text-[10px] font-bold px-2.5 py-1 rounded inline-flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                            <span>Fully Synced</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-neutral-50 border border-neutral-200/40 rounded-xl p-3.5 transition-all">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-[9px] bg-neutral-100 border border-neutral-200 text-neutral-700 font-bold px-1.5 py-0.5 rounded">
                            CELL B1
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
                          placeholder="Type coordinate B1 cell value..."
                          className="px-3 py-1.5 bg-white border border-neutral-200 focus:border-neutral-900 text-neutral-800 text-xs font-medium rounded-lg outline-hidden w-full transition-all focus:ring-1 focus:ring-neutral-950/10"
                        />
                      </div>

                      <div className="bg-neutral-50 border border-neutral-200/40 rounded-xl p-3.5 transition-all">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-mono text-[9px] bg-neutral-100 border border-neutral-200 text-neutral-700 font-bold px-1.5 py-0.5 rounded">
                            CELL B2
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
                          placeholder="Type coordinate B2 cell value..."
                          className="px-3 py-1.5 bg-white border border-neutral-200 focus:border-neutral-900 text-neutral-800 text-xs font-medium rounded-lg outline-hidden w-full transition-all focus:ring-1 focus:ring-neutral-950/10"
                        />
                      </div>
                    </div>
                  </div>

                  {unsavedValuesChangesCount > 0 && (
                    <div className="mt-4 pt-4 border-t border-neutral-100 flex items-center justify-end gap-2 text-xs">
                      <button
                        onClick={handleUndoValuesChanges}
                        className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium rounded-lg text-xs cursor-pointer transition-colors"
                      >
                        Undo Edits
                      </button>
                      <button
                        onClick={handleSaveValuesToGoogleSheets}
                        disabled={isValuesSaving}
                        className="px-3.5 py-1.5 bg-emerald-900 hover:bg-emerald-950 text-white font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {isValuesSaving ? 'Saving...' : 'Sync B1 & B2 Changes'}
                      </button>
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ⚙️ Page 5: Google Sheets Endpoint Connections Settings */}
            {activePage === 'settings' && (
              <div className="flex flex-col gap-6 animate-fade-in">
                
                {/* Back button */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <button
                    onClick={() => setActivePage('home')}
                    className="px-3.5 py-1.5 border border-neutral-200 bg-white hover:bg-slate-50 text-neutral-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-3xs"
                  >
                    <ArrowLeft size={12} />
                    <span>Back to Home</span>
                  </button>

                  <div className="text-xs text-neutral-400 font-semibold font-sans">
                    Workbook Target Configuration Settings
                  </div>
                </div>

                {/* Dual spreadsheet connection configurations */}
                <div className="bg-white border border-neutral-200/60 rounded-2xl p-6 shadow-xs flex flex-col gap-4 max-w-4xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-150 pb-3">
                    <div>
                      <h3 className="text-xs font-semibold font-sans text-neutral-900 uppercase tracking-widest">Connected Shared Workbooks</h3>
                      <p className="text-xs text-neutral-400 mt-0.5">Input your custom shared Google spreadsheet URLs below to bind them directly to the active workspace.</p>
                    </div>
                    {accessToken && (
                      <button
                        onClick={handleRefreshBothSheets}
                        disabled={isLoading || isCatalogBusy || isValuesBusy}
                        className="px-4 py-1.5 bg-emerald-900 hover:bg-emerald-950 text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
                        <span>{isLoading ? 'Refreshing...' : 'Reload Workbooks'}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
                    {/* Sheet 1 Input - Catalog */}
                    <div className="bg-neutral-50/50 rounded-xl p-4 border border-neutral-200/60 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold font-mono uppercase bg-neutral-100 border border-neutral-200 text-neutral-700 px-2 py-0.5 rounded">
                          📔 Catalog spreadsheet link
                        </span>
                        <a
                          href={catalogSheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-neutral-500 font-semibold hover:underline inline-flex items-center gap-0.5"
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
                          className="w-full px-3 py-1.5 bg-white border border-neutral-200 focus:border-neutral-900 text-xs text-neutral-750 font-medium rounded-lg outline-hidden w-full transition-all focus:ring-1 focus:ring-neutral-950/10 shadow-3xs"
                        />
                      </div>

                      {catalogMetadata && (
                        <div className="text-[10px] text-neutral-400 flex items-center justify-between flex-wrap gap-1 font-mono">
                          <span>Name: <strong className="text-neutral-600">{catalogMetadata.title}</strong></span>
                          <span>Tabs count: <strong className="text-neutral-600">{catalogMetadata.sheets.length}</strong></span>
                        </div>
                      )}
                    </div>

                    {/* Sheet 2 Input - Values */}
                    <div className="bg-neutral-50/50 rounded-xl p-4 border border-neutral-200/60 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold font-mono uppercase bg-neutral-100 border border-neutral-200 text-neutral-700 px-2 py-0.5 rounded">
                          ⚡ quick values sheet link
                        </span>
                        <a
                          href={valuesSheetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] text-neutral-500 font-semibold hover:underline inline-flex items-center gap-0.5"
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
                          className="w-full px-3 py-1.5 bg-white border border-neutral-200 focus:border-neutral-900 text-xs text-neutral-750 font-medium rounded-lg outline-hidden w-full transition-all focus:ring-1 focus:ring-neutral-950/10 shadow-3xs"
                        />
                      </div>

                      {valuesMetadata && (
                        <div className="text-[10px] text-neutral-400 flex items-center justify-between flex-wrap gap-1 font-mono">
                          <span>Name: <strong className="text-neutral-600">{valuesMetadata.title}</strong></span>
                          <span>Active tab: <strong className="text-neutral-600">{selectedValuesTab || 'Default'}</strong></span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

      </main>

      {/* Footer copyright section */}
      <footer className="bg-white border-t border-neutral-200/60 py-4 text-center mt-12">
        <p className="font-mono text-[9px] text-neutral-450 leading-relaxed max-w-7xl mx-auto px-4 truncate">
          Connected Active Workbooks — Catalog ID: {catalogSpreadsheetId} — Values ID: {valuesSpreadsheetId}
        </p>
      </footer>

    </div>
  );
}
