import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare,
  Sparkles,
  Zap,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Clipboard,
  Trash2,
  Search,
  Check,
  Package,
  X,
  RefreshCw,
} from 'lucide-react';

interface ExtractedItem {
  name: string;
  quantity: number;
  matchedRowIdx: number; // Row index in catalogLocalRows or -1 if unmatched
}

interface OrderParserProps {
  catalogLocalRows: string[][];
  setCatalogLocalRows: React.Dispatch<React.SetStateAction<string[][]>>;
  headers: string[];
  columnRoles: { titleIdx: number; stockIdx: number };
  hasHeadersRow: boolean;
  showToast: (type: 'success' | 'error', text: string) => void;
}

// Arabic/English normalization and typing variations helper
const normalizeArabicText = (str: string): string => {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    // Convert Eastern Arabic/Persian digits U+0660-U+0669 and U+06F0-U+06F9 to standard digits
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    // Normalize Arabic letters and hamzas:
    .replace(/[أإآاٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ڤ/g, 'ف')  // Map "veb" to "feh" for robust product cross-matching
    // Remove Arabic diacritics (Harakat) & Kashida/Tatweel
    .replace(/[\u064e\u064f\u0650\u0651\u0652\u064b\u064c\u064d\u0640]/g, '');
};

const matchProductRowIdx = (
  extractedName: string,
  rows: string[][],
  titleIdx: number,
  arabicTitleIdx: number,
  hasHeadersRow: boolean
): number => {
  const startOffset = hasHeadersRow ? 1 : 0;
  if (!extractedName || rows.length <= startOffset) return -1;

  const normExtracted = normalizeArabicText(extractedName);
  const extractedWords = normExtracted.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const squashExtracted = normExtracted.replace(/\s+/g, '');

  if (extractedWords.length === 0) return -1;

  let bestIdx = -1;
  let bestScore = 0;

  const getLevenshteinDistance = (s1: string, s2: string): number => {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            }
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  for (let i = startOffset; i < rows.length; i++) {
    const row = rows[i];
    const itemTitle = row[titleIdx] || '';
    const itemTitleAr = arabicTitleIdx !== -1 ? row[arabicTitleIdx] || '' : '';

    const calculateColScore = (itemTitleText: string): number => {
      const normItem = normalizeArabicText(itemTitleText);
      if (!normItem) return 0;

      // Direct or squash match is perfect
      if (normItem === normExtracted) {
        return 1.0; // exact match
      }

      const squashItem = normItem.replace(/\s+/g, '');
      if (squashItem === squashExtracted) {
        return 0.95; // exact match without spaces
      }

      const itemWords = normItem.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
      if (itemWords.length === 0) return 0;

      // Word intersection and Levenshtein score
      let matchedWordsCount = 0;
      extractedWords.forEach((ew) => {
        // Direct containment or low Levenshtein distance
        if (
          itemWords.includes(ew) ||
          itemWords.some((iw) => {
            if (iw.includes(ew) || ew.includes(iw)) return true;
            const maxDist = Math.max(1, Math.floor(ew.length / 3));
            return getLevenshteinDistance(iw, ew) <= maxDist;
          })
        ) {
          matchedWordsCount++;
        }
      });

      const wordsScore = matchedWordsCount / Math.max(extractedWords.length, itemWords.length);

      // Squash-containment score as fallback
      let squashScore = 0;
      if (squashItem.includes(squashExtracted) || squashExtracted.includes(squashItem)) {
        squashScore = Math.min(squashItem.length, squashExtracted.length) / Math.max(squashItem.length, squashExtracted.length);
      }

      return Math.max(wordsScore, squashScore);
    };

    const englishScore = calculateColScore(itemTitle);
    const arabicScore = calculateColScore(itemTitleAr);

    // Max score of either column is the row's matching score representer
    const score = Math.max(englishScore, arabicScore);

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  // Acceptance threshold (match must share substantial lexical overlap)
  return bestScore > 0.25 ? bestIdx : -1;
};

export default function OrderParser({
  catalogLocalRows,
  setCatalogLocalRows,
  headers,
  columnRoles,
  hasHeadersRow,
  showToast,
}: OrderParserProps) {
  const [inputText, setInputText] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [showResultsBlock, setShowResultsBlock] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Manual search re-mapping state
  const [activeSearchIdx, setActiveSearchIdx] = useState<number | null>(null);
  const [manualSearchQuery, setManualSearchQuery] = useState<string>('');

  const hasStockColumn = columnRoles.stockIdx !== -1;

  // Detect Arabic name/title column index dynamically
  const arabicTitleIdx = useMemo(() => {
    // Search in headers for candidate indicators
    for (let idx = 0; idx < headers.length; idx++) {
      const h = headers[idx] || '';
      const name = h.toLowerCase();
      if (idx !== columnRoles.titleIdx) {
        if (
          name.includes('arabic') ||
          name.includes('عربي') ||
          name.includes('عربى') ||
          name.includes('الاسم بالكامل') ||
          name.includes('اسم') ||
          name.includes('أسم') ||
          /[\u0600-\u06FF]/.test(h)
        ) {
          return idx;
        }
      }
    }
    // Fallback: check actual values of local rows to see which column has the most Arabic chars
    const startOffset = hasHeadersRow ? 1 : 0;
    if (catalogLocalRows.length > startOffset) {
      const counts = Array(headers.length).fill(0);
      const sampleSize = Math.min(30, catalogLocalRows.length - startOffset);
      for (let rIdx = startOffset; rIdx < startOffset + sampleSize; rIdx++) {
        const row = catalogLocalRows[rIdx];
        if (!row) continue;
        for (let cIdx = 0; cIdx < row.length; cIdx++) {
          if (cIdx === columnRoles.titleIdx) continue;
          const cell = row[cIdx] || '';
          if (/[\u0600-\u06FF]/.test(cell)) {
            counts[cIdx]++;
          }
        }
      }
      let maxIdx = -1;
      let maxCount = 0;
      for (let cIdx = 0; cIdx < counts.length; cIdx++) {
        if (counts[cIdx] > maxCount) {
          maxCount = counts[cIdx];
          maxIdx = cIdx;
        }
      }
      if (maxCount >= Math.ceil(sampleSize * 0.2)) {
        return maxIdx;
      }
    }
    return -1;
  }, [headers, catalogLocalRows, columnRoles.titleIdx, hasHeadersRow]);

  // Clear or load default example Arabic WhatsApp order ticket
  const pasteArabicExampleOrder = () => {
    setInputText(`*طلب جديد من صيدلية النجدي*

👤 *arcane plotter*
📍 bsbsh
🏢 hdbdbs

-------------------
1. *سيتال* (x1)
   12.00 EGP
2. *أ ڤيتون 50000* (x1)
   1999.00 EGP
3. *أبيمول* (x1)
   15.00 EGP
4. *أتور 20* (x1)
   56.00 EGP
5. *أسبرين بروتكت 100* (x1)
   35.00 EGP
6. *أفرين* (x1)
   25.00 EGP
7. *ألداكتون 25* (x1)
   33.00 EGP
-------------------

المجموع الفرعي: 2175.00 EGP
خدمة التوصيل: 66.00 EGP
*الإجمالي: 2241.00 EGP*`);
  };

  // Clear or load default example English WhatsApp order ticket
  const pasteEnglishExampleOrder = () => {
    setInputText(`*New Order from El-Nagdy Pharmacy*

👤 *bshhs*
📍 ndns
🏢 ndns

-------------------
1. *1 2 2003* (x1)
   25.00 EGP
2. *A-Viton 50000 I.U.* (x1)
   1999.00 EGP
3. *Abimol* (x1)
   15.00 EGP
4. *Aerius* (x1)
   85.00 EGP
-------------------

Subtotal: 2124.00 EGP
Delivery Fee: 66.00 EGP
*Total: 2190.00 EGP*`);
  };

  const handleParseReceipt = () => {
    if (!inputText.trim()) {
      showToast('error', 'Please paste or type an order receipt message first.');
      return;
    }

    setIsParsing(true);
    setErrorMsg(null);
    setExtractedItems([]);
    setShowResultsBlock(false);

    // Simulate a brief, satisfying scanning animation (300ms) for a polished feel
    setTimeout(() => {
      try {
        const textLines = inputText.split(/\r?\n/);
        const parsedItems: { name: string; quantity: number }[] = [];

        textLines.forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          // Normalize Eastern Arabic/Persian digits to standard Western ASCII digits first
          const normalizedDigitsLine = trimmed
            .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String(d.charCodeAt(0) - 1632))
            .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => String(d.charCodeAt(0) - 1776));

          const lower = normalizedDigitsLine.toLowerCase();
          
          // Identify and exclude irrelevant metadata/header/footer content
          if (
            lower.includes('طلب جديد') ||
            lower.includes('new order') ||
            lower.includes('صيدلية') ||
            lower.includes('pharmacy') ||
            lower.includes('👤') ||
            lower.includes('📍') ||
            lower.includes('🏢') ||
            lower.includes('------') ||
            lower.includes('المجموع') ||
            lower.includes('subtotal') ||
            lower.includes('sub-total') ||
            lower.includes('التوصيل') ||
            lower.includes('delivery') ||
            lower.includes('الإجمالي') ||
            lower.includes('الاجمالي') ||
            lower.includes('total') ||
            lower.includes('fee') ||
            lower.includes('خدمه') ||
            lower.includes('خدمة') ||
            (lower.includes('egp') && !lower.includes('(') && !lower.includes('*')) ||
            /^\s*\d+(?:\.\d+)?\s*(?:egp|egp\*|egp|le|l\.e\.)?\s*$/i.test(lower)
          ) {
            return;
          }

          // 1. Detect and parse quantity multiplier, e.g., (x1), (x 2), x3, (1)
          let quantity = 1;
          let tempLine = normalizedDigitsLine;

          const qtyPatterns = [
            /\(\s*[xX]\s*(\d+)\s*\)/,    // (x1), (x 2)
            /\(\s*(\d+)\s*\)/,           // (1)
            /\b[xX]\s*(\d+)\b/,          // x1, x 3
          ];

          for (const pattern of qtyPatterns) {
            const match = tempLine.match(pattern);
            if (match) {
              quantity = parseInt(match[1], 10) || 1;
              tempLine = tempLine.replace(pattern, '');
              break;
            }
          }

          // 2. Extract product name (either inside asterisks or cleaned text)
          let productName = '';
          const asteriskMatch = tempLine.match(/\*([^*]+)\*/);
          
          if (asteriskMatch && asteriskMatch[1].trim()) {
            productName = asteriskMatch[1].trim();
          } else {
            // Strip bullets, serial numbers or bullet dashes like "1. ", "2- ", "• " at the start
            let cleanedLine = tempLine.replace(/^\s*(?:[•\-*]|\d+[\.\-)]?)\s+/, '');
            
            // Remove lingering price definitions like "19.00 EGP"
            cleanedLine = cleanedLine.replace(/\d+(?:\.\d+)?\s*(?:egp|EGP|جنيها|جنيه|LE|le)\b/gi, '');
            productName = cleanedLine.trim();
          }

          // Ensure we have a valid product name of safe length
          if (productName.length >= 2) {
            parsedItems.push({
              name: productName,
              quantity,
            });
          }
        });

        if (parsedItems.length === 0) {
          throw new Error("No products could be extracted. Please make sure the items follow the '*Product* (x1)' format.");
        }

        // Map extracted products to catalog row index
        const mapped: ExtractedItem[] = parsedItems.map((item) => {
          const matchedIdx = matchProductRowIdx(
            item.name,
            catalogLocalRows,
            columnRoles.titleIdx,
            arabicTitleIdx,
            hasHeadersRow
          );
          return {
            name: item.name,
            quantity: item.quantity,
            matchedRowIdx: matchedIdx,
          };
        });

        setExtractedItems(mapped);
        setShowResultsBlock(true);
        showToast('success', `Extracted ${mapped.length} item(s) from receipt! Review the mapping below.`);
      } catch (err: any) {
        console.error(err);
        setErrorMsg(err.message || 'Could not parse message.');
        showToast('error', 'Could not parse message.');
      } finally {
        setIsParsing(false);
      }
    }, 300);
  };

  // Replace matched row manually for an item
  const handleAssignManualItem = (itemIndex: number, rowIdx: number) => {
    setExtractedItems((prev) =>
      prev.map((item, idx) => (idx === itemIndex ? { ...item, matchedRowIdx: rowIdx } : item))
    );
    setActiveSearchIdx(null);
    setManualSearchQuery('');
  };

  // Perform client-side fuzzy list filter for manual matching dropdown candidates
  const filteredCandidates = useMemo(() => {
    if (!manualSearchQuery.trim()) {
      return catalogLocalRows
        .slice(hasHeadersRow ? 1 : 0)
        .map((row, idx) => ({ row, actualIdx: idx + (hasHeadersRow ? 1 : 0) }))
        .slice(0, 10); // show top 10 if blank
    }
    const cleanQuery = normalizeArabicText(manualSearchQuery);
    return catalogLocalRows
      .slice(hasHeadersRow ? 1 : 0)
      .map((row, idx) => {
        const actualIdx = idx + (hasHeadersRow ? 1 : 0);
        const title = row[columnRoles.titleIdx] || '';
        const arabicTitle = arabicTitleIdx !== -1 ? row[arabicTitleIdx] || '' : '';
        
        const engMatch = normalizeArabicText(title).includes(cleanQuery);
        const arMatch = arabicTitle ? normalizeArabicText(arabicTitle).includes(cleanQuery) : false;
        
        const score = (engMatch || arMatch) ? 2 : 0;
        return { row, actualIdx, score };
      })
      .filter((item) => item.score > 0 || normalizeArabicText(item.row.join(' ')).includes(cleanQuery))
      .slice(0, 12);
  }, [manualSearchQuery, catalogLocalRows, columnRoles.titleIdx, arabicTitleIdx, hasHeadersRow]);

  // Apply reductions directly to catalogLocalRows in React State
  const handleApplyReductions = () => {
    if (!hasStockColumn) {
      showToast('error', 'Cannot apply reductions: Stock/quantity column not found in spreadsheet metadata.');
      return;
    }

    const matchedOnly = extractedItems.filter((i) => i.matchedRowIdx !== -1);
    if (matchedOnly.length === 0) {
      showToast('error', 'No mapped products found. Please link products manually first.');
      return;
    }

    // Clone rows
    const updatedRows = JSON.parse(JSON.stringify(catalogLocalRows));
    let changeLogCount = 0;

    matchedOnly.forEach((item) => {
      const rowIdx = item.matchedRowIdx;
      if (rowIdx < 0 || rowIdx >= updatedRows.length) return;

      const currentValString = updatedRows[rowIdx][columnRoles.stockIdx] || '0';
      const currentValNum = parseInt(currentValString.replace(/[^\d-]/g, ''), 10);
      const startNum = isNaN(currentValNum) ? 0 : currentValNum;
      
      const newNum = Math.max(0, startNum - item.quantity);
      updatedRows[rowIdx][columnRoles.stockIdx] = String(newNum);
      changeLogCount++;
    });

    setCatalogLocalRows(updatedRows);
    setShowResultsBlock(false);
    setExtractedItems([]);
    setInputText('');
    showToast(
      'success',
      `Reduced stock for ${changeLogCount} items locally! Click "Save changes" in Status card to write to Google Sheets.`
    );
  };

  return (
    <div className="bg-white border border-neutral-155 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <h3 className="text-xs font-extrabold font-sans text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
            <MessageSquare size={14} className="text-emerald-800" />
            <span>📋 Stock Reducer from WhatsApp/Order Ticket</span>
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Reduce product quantities directly from WhatsApp order receipts.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 self-start sm:self-center">
          <button
            onClick={pasteArabicExampleOrder}
            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-bold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <Sparkles size={10} className="text-emerald-600" />
            <span>Paste Arabic Receipt</span>
          </button>
          <button
            onClick={pasteEnglishExampleOrder}
            className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-800 text-[10px] font-bold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <Sparkles size={10} />
            <span>Paste English Receipt</span>
          </button>
        </div>
      </div>

      {/* Main Text Area Form */}
      <div className="flex flex-col gap-2 relative">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Paste ticket with items / counts, for example:&#10;1. *أ ڤيتون 50000* (x1)&#10;19.00 EGP"
          rows={5}
          disabled={isParsing}
          className="w-full bg-slate-50/50 border border-gray-205 focus:border-emerald-400 text-gray-800 placeholder-gray-400 text-xs font-mono font-medium p-4 rounded-xl outline-hidden focus:bg-white focus:ring-1 focus:ring-emerald-400/25 transition-all resize-y"
        />

        <div className="flex items-center justify-between gap-3">
          {!hasStockColumn && (
            <span className="text-[10px] bg-amber-50 border border-amber-150 text-amber-800 font-bold px-2 py-1 rounded-md inline-flex items-center gap-1.5">
              <AlertCircle size={11} className="text-amber-600" />
              <span>No stock column mapped in Sheet. Reduced edits can't commit until a col matches 'stock'/'qty'.</span>
            </span>
          )}
          <span className="flex-1" />
          <button
            onClick={handleParseReceipt}
            disabled={isParsing || !inputText.trim()}
            className="px-5 py-2.5 bg-emerald-990 bg-emerald-900 hover:bg-emerald-950 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            {isParsing ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                <span>Parsing order ticket...</span>
              </>
            ) : (
              <>
                <Zap size={12} className="fill-white" />
                <span>Parse Order & Update Stock</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50/50 border border-red-200 text-red-900 text-xs p-3.5 rounded-xl flex items-start gap-2.5 animate-feed-in">
          <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-bold">Order tickets extraction failed</p>
            <p className="mt-0.5 text-red-700">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Results Dashboard Block */}
      <AnimatePresence>
        {showResultsBlock && extractedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="border border-slate-150 rounded-xl bg-slate-50/20 p-4 flex flex-col gap-3.5 mt-2 shadow-inner"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-dashed border-gray-200 pb-2.5">
              <span className="text-xs font-bold text-gray-700 inline-flex items-center gap-1.5">
                <CheckCircle size={14} className="text-emerald-500" />
                <span>Extracted Receipt Stock Reductions ({extractedItems.length} items)</span>
              </span>
              <span className="text-[10px] text-gray-400 font-sans">
                Review the automatically mapped sheet rows before applying
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {extractedItems.map((item, index) => {
                const hasMatch = item.matchedRowIdx !== -1;
                const matchedRow = hasMatch ? catalogLocalRows[item.matchedRowIdx] : null;
                const matchProductTitle = matchedRow ? matchedRow[columnRoles.titleIdx] : '';

                // Capture stock details
                const currentStockValStr = matchedRow && hasStockColumn ? matchedRow[columnRoles.stockIdx] || '0' : '0';
                const currentStock = parseInt(currentStockValStr.replace(/[^\d-]/g, ''), 10) || 0;
                const nextStock = Math.max(0, currentStock - item.quantity);

                return (
                  <div
                    key={index}
                    className="bg-white border border-gray-150 rounded-xl p-3 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all hover:bg-slate-50/10"
                  >
                    {/* Step 1: Extracted Item Tag info */}
                    <div className="flex-1 flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="bg-slate-100 text-slate-700 text-[10px] font-bold font-sans px-2 py-0.5 rounded-full">
                          Ticket product
                        </span>
                        <strong className="text-xs font-extrabold text-[#2a2a2a] truncate">{item.name}</strong>
                      </div>
                      <div className="text-[11px] text-gray-400 inline-flex items-center gap-1">
                        <span>Quantity requested in invoice:</span>
                        <strong className="text-slate-700 font-bold bg-slate-100 rounded-md px-1 py-0.5">
                          {item.quantity} unit{item.quantity > 1 ? 's' : ''}
                        </strong>
                      </div>
                    </div>

                    {/* Step 2: Matched Spreadsheet Product */}
                    <div className="flex-1 flex flex-col gap-1.5">
                      <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-gray-400">
                        Mapped Product Catalog Record
                      </span>

                      {hasMatch ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Package size={13} className="text-emerald-600" />
                          <span className="font-sans font-bold text-gray-800 truncate" title={matchProductTitle}>
                            {matchProductTitle}
                          </span>
                          <span className="text-[10px] text-gray-400 bg-slate-50 border border-slate-100 px-1 py-0.5 rounded font-mono">
                            Row {item.matchedRowIdx + 1}
                          </span>
                          <button
                            onClick={() => {
                              setActiveSearchIdx(index);
                              setManualSearchQuery('');
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-800 underline ml-1 cursor-pointer font-bold whitespace-nowrap"
                          >
                            Re-map
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-amber-700 font-semibold bg-amber-50/40 p-1.5 rounded-lg border border-amber-100">
                          <AlertCircle size={12} className="text-amber-600" />
                          <span>Auto-match failed.</span>
                          <button
                            onClick={() => {
                              setActiveSearchIdx(index);
                              setManualSearchQuery('');
                            }}
                            className="bg-slate-900 text-white rounded-md px-2 py-0.5 text-[10px] font-bold hover:bg-black transition-colors ml-auto cursor-pointer"
                          >
                            Map Manually
                          </button>
                        </div>
                      )}

                      {/* Manual Search dropdown portal box */}
                      {activeSearchIdx === index && (
                        <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-2 relative z-10 animate-slide-up">
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[10px] font-bold text-gray-500">Pick product from catalog:</span>
                            <button
                              onClick={() => setActiveSearchIdx(null)}
                              className="text-gray-400 hover:text-gray-600 text-[10px] font-bold"
                            >
                              Close
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              value={manualSearchQuery}
                              onChange={(e) => setManualSearchQuery(e.target.value)}
                              placeholder="Fuzzy search matching products names..."
                              autoFocus
                              className="w-full bg-white border border-gray-200 rounded-md py-1 px-2.5 text-xs outline-hidden focus:border-emerald-400"
                            />
                          </div>
                          <div className="max-h-28 overflow-y-auto border border-gray-150 rounded bg-white mt-1 divide-y divide-gray-100 shadow-sm">
                            {filteredCandidates.length === 0 ? (
                              <div className="p-2 text-center text-[10px] text-gray-400">No products found...</div>
                            ) : (
                              filteredCandidates.map((cand) => {
                                const titleVal = cand.row[columnRoles.titleIdx] || 'Unnamed row';
                                const stockVal = hasStockColumn ? cand.row[columnRoles.stockIdx] || '0' : '0';
                                return (
                                  <button
                                    key={cand.actualIdx}
                                    type="button"
                                    onClick={() => handleAssignManualItem(index, cand.actualIdx)}
                                    className="w-full text-left p-1.5 hover:bg-slate-50 text-[10.5px] truncate block font-sans"
                                  >
                                    <span className="font-bold text-gray-700">{titleVal}</span>
                                    <span className="text-gray-400 ml-1.5 font-mono text-[9px]">
                                      (Row {cand.actualIdx + 1} • Stock: {stockVal})
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Step 3: Stock delta preview */}
                    <div className="flex items-center gap-3 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 min-w-[130px] justify-between">
                      <div className="text-right">
                        <span className="block text-[8px] uppercase tracking-wider font-bold text-gray-400">STOCK VARIATION</span>
                        {hasMatch ? (
                          <div className="flex items-center gap-1.5 justify-end text-xs font-bold font-sans">
                            <span className="text-gray-400 line-through">{currentStock}</span>
                            <ArrowRight size={11} className="text-gray-400" />
                            <span className="text-emerald-700 font-extrabold">{nextStock}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-300 font-bold italic">No match</span>
                        )}
                      </div>
                      <span className="w-1.5 h-6 border-l border-slate-200"></span>
                      <button
                        onClick={() =>
                          setExtractedItems((prev) => prev.filter((_, idx) => idx !== index))
                        }
                        className="p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                        title="Remove item"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Commit Action Buttons */}
            <div className="border-t border-gray-200 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-[10.5px] text-amber-700 font-semibold inline-flex items-center gap-1.5">
                <AlertCircle size={12} />
                <span>Changes apply locally. Remember to push to Sheets manually.</span>
              </span>

              <div className="flex items-center gap-2 self-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowResultsBlock(false);
                    setExtractedItems([]);
                  }}
                  className="px-3.5 py-2 border border-gray-200 bg-white hover:bg-slate-50 text-gray-600 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Discard Analysis
                </button>
                <button
                  type="button"
                  onClick={handleApplyReductions}
                  disabled={!hasStockColumn}
                  className="px-4.5 py-2 bg-emerald-900 hover:bg-emerald-950 disabled:bg-slate-150 disabled:cursor-not-allowed text-white text-xs font-extrabold rounded-xl inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Check size={13} className="stroke-[2.5]" />
                  <span>Confirm Reductions & Apply</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
