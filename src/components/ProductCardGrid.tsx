import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Plus,
  Trash2,
  Edit3,
  Undo2,
  Bookmark,
  DollarSign,
  Package,
  Tags,
  Image as ImageIcon,
  Check,
  X,
  HelpCircle,
  AlertCircle,
  FolderOpen,
  SlidersHorizontal,
  Grid,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  ExternalLink
} from 'lucide-react';
import { SortingState } from '../types';

interface ProductCardGridProps {
  originalRows: string[][];
  localRows: string[][];
  headers: string[];
  setLocalRows: React.Dispatch<React.SetStateAction<string[][]>>;
  hasHeadersRow: boolean;
  setHasHeadersRow: (val: boolean) => void;
  onUndoAll: () => void;
  isSaving: boolean;
  catalogSheetUrl?: string;
}

// Simple fuzzy string match helper that allows minor misspelling/typos
const fuzzyMatch = (text: string, query: string): boolean => {
  text = text.toLowerCase().trim();
  query = query.toLowerCase().trim();
  if (!query) return true;
  if (!text) return false;
  if (text.includes(query)) return true; // Direct substring match

  const words = text.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const queryWords = query.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return true;

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

  // Check if every word of query matches some word in text with low distance
  return queryWords.every(qw => {
    if (qw.length <= 1) {
      return words.some(w => w.includes(qw));
    }
    return words.some(w => {
      if (w.includes(qw) || qw.includes(w)) return true;
      const dist = getLevenshteinDistance(w, qw);
      // Allow 1 edit for 2-3 char query, 2 edits for 4-6 chars, and 3 edits for longer queries
      const maxAllowed = qw.length <= 3 ? 1 : qw.length <= 6 ? 2 : 3;
      return dist <= maxAllowed;
    });
  });
};

// Simple image URL helper
const isImageUrl = (val: string): boolean => {
  if (!val) return false;
  const cleaned = val.trim();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) return false;
  return (
    /\.(jpeg|jpg|gif|png|webp|svg|bmp|tiff)(?:\?.*)?$/i.test(cleaned) ||
    /drive\.google\.com\/uc/i.test(cleaned) ||
    /images\.unsplash\.com/i.test(cleaned) ||
    /picsum\.photos/i.test(cleaned) ||
    /cloudinary\.com/i.test(cleaned) ||
    /image|photo|img|picture|asset/i.test(cleaned)
  );
};

// Converts Google Drive share links to streamable image URLs
const getDirectImageUrl = (val: string): string => {
  if (!val) return '';
  const cleaned = val.trim();
  
  // Format drive.google.com/file/d/.../view
  let match = cleaned.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  
  // Format drive.google.com/open?id=...
  match = cleaned.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    return `https://drive.google.com/uc?export=download&id=${match[1]}`;
  }
  
  return cleaned;
};

export default function ProductCardGrid({
  originalRows,
  localRows,
  headers,
  setLocalRows,
  hasHeadersRow,
  setHasHeadersRow,
  onUndoAll,
  isSaving,
  catalogSheetUrl,
}: ProductCardGridProps) {
  const sheetLink = catalogSheetUrl || 'https://docs.google.com/spreadsheets/d/1JHfI4RsTXZgu0X3njJhLja0oQ8LeWxlyshoppxmLCk/edit?usp=drivesdk';
  // Navigation & Search Controls
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(8); // limit cards per page for legibility

  // Edit Product Modal states
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalFields, setModalFields] = useState<string[]>([]);
  
  // Sort states
  const [sortByColIdx, setSortByColIdx] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

  // Derive standard column count safely
  const maxCols = useMemo(() => {
    let count = headers.length;
    localRows.forEach(row => {
      count = Math.max(count, row.length);
    });
    return count;
  }, [headers, localRows]);

  // Map sheet columns to recognizable product fields dynamically
  const columnRoles = useMemo(() => {
    let titleIdx = 0;
    let imgIdx = -1;
    let priceIdx = -1;
    let catIdx = -1;
    let descIdx = -1;
    let stockIdx = -1;

    headers.forEach((h, idx) => {
      const name = h.toLowerCase();
      if (name.includes('name') || name.includes('title') || name.includes('product') || name.includes('item') || name.includes('book') || name.includes('model')) {
        if (titleIdx === 0 || name === 'name' || name === 'title' || name === 'product') {
          titleIdx = idx;
        }
      } else if (name.includes('image') || name.includes('img') || name.includes('photo') || name.includes('pic') || name.includes('url') || name.includes('link')) {
        const hasImg = localRows.some(row => isImageUrl(row[idx]));
        if (hasImg || imgIdx === -1) {
          imgIdx = idx;
        }
      } else if (name.includes('price') || name.includes('cost') || name.includes('rate') || name.includes('usd') || name.includes('amount')) {
        priceIdx = idx;
      } else if (name.includes('category') || name.includes('type') || name.includes('genre') || name.includes('dept') || name.includes('department') || name.includes('class')) {
        catIdx = idx;
      } else if (name.includes('desc') || name.includes('detail') || name.includes('summary') || name.includes('note') || name.includes('text')) {
        descIdx = idx;
      } else if (name.includes('stock') || name.includes('quantity') || name.includes('qty') || name.includes('avail') || name.includes('count')) {
        stockIdx = idx;
      }
    });

    // Smart fallback overrides
    if (titleIdx === 0 && headers.length > 0) {
      if (headers[0].toLowerCase() === 'id' && headers.length > 1) {
        titleIdx = 1;
      }
    }

    // Auto find any column that is fully loaded with images if not named explicitly
    if (imgIdx === -1) {
      for (let idx = 0; idx < headers.length; idx++) {
        if (localRows.some(row => isImageUrl(row[idx]))) {
          imgIdx = idx;
          break;
        }
      }
    }

    return { titleIdx, imgIdx, priceIdx, catIdx, descIdx, stockIdx };
  }, [headers, localRows]);

  // Determine all available Category values dynamically for filtering
  const allCategories = useMemo(() => {
    const list = new Set<string>();
    const cIdx = columnRoles.catIdx;
    
    // Skip row 1 if it represents titles
    const startIdx = hasHeadersRow ? 1 : 0;
    
    for (let i = startIdx; i < localRows.length; i++) {
      const row = localRows[i];
      if (row && cIdx !== -1 && row[cIdx]) {
        const val = row[cIdx].trim();
        if (val) list.add(val);
      }
    }
    return ['All', ...Array.from(list)];
  }, [localRows, columnRoles.catIdx, hasHeadersRow]);

  // Format dynamic currency if recognized
  const formatCurrency = (val: string) => {
    if (!val) return '—';
    const cleaned = val.replace(/[$,\s]/g, '').trim();
    if (!isNaN(Number(cleaned)) && cleaned !== '') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(cleaned));
    }
    return val;
  };

  // Convert column indexes to Excel letters
  const getColumnLetter = (index: number): string => {
    let letter = '';
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  // Helper calculation to check if any properties in a card's row differ from original
  const isRowModified = (originalIndex: number): boolean => {
    if (originalIndex >= originalRows.length) return true; // new row!
    const rowLocal = localRows[originalIndex];
    const rowOrig = originalRows[originalIndex];
    if (!rowLocal || !rowOrig) return true;

    for (let c = 0; c < maxCols; c++) {
      if ((rowLocal[c] ?? '') !== (rowOrig[c] ?? '')) {
        return true;
      }
    }
    return false;
  };

  // Process rows - sorting, search, category filtering
  const filteredProcessedProducts = useMemo(() => {
    // We treat row 0 as header, and rest as records if hasHeadersRow is true
    const startOffset = hasHeadersRow ? 1 : 0;
    
    // Map with true structural index to maintain editing paths
    let items = localRows.slice(startOffset).map((row, relativeIdx) => {
      const trueIndex = relativeIdx + startOffset;
      return { row, trueIndex };
    });

    // 1. Filter by Search term (with misspelling tolerance)
    if (searchTerm.trim() !== '') {
      items = items.filter(item => {
        return item.row.some(cell => fuzzyMatch(cell || '', searchTerm));
      });
    }

    // 2. Filter by Category
    if (selectedCategory !== 'All' && columnRoles.catIdx !== -1) {
      items = items.filter(item => {
        const catVal = item.row[columnRoles.catIdx] || '';
        return catVal.trim().toLowerCase() === selectedCategory.toLowerCase();
      });
    }

    // 3. Dynamic Sorting
    if (sortByColIdx !== null && sortDirection !== null) {
      const col = sortByColIdx;
      const dir = sortDirection;

      items.sort((a, b) => {
        const valA = a.row[col] || '';
        const valB = b.row[col] || '';

        // Number sorting
        const numA = Number(valA.replace(/[$,%]/g, '').trim());
        const numB = Number(valB.replace(/[$,%]/g, '').trim());

        if (!isNaN(numA) && !isNaN(numB)) {
          return dir === 'asc' ? numA - numB : numB - numA;
        }

        // text sorting
        return dir === 'asc'
          ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' })
          : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: 'base' });
      });
    }

    return items;
  }, [localRows, hasHeadersRow, searchTerm, selectedCategory, columnRoles, sortByColIdx, sortDirection]);

  // Paginated cards output
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProcessedProducts.slice(start, start + pageSize);
  }, [filteredProcessedProducts, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredProcessedProducts.length / pageSize) || 1;

  // Toggle sort on fields
  const toggleSort = (colIdx: number) => {
    if (sortByColIdx === colIdx) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortByColIdx(null);
        setSortDirection(null);
      }
    } else {
      setSortByColIdx(colIdx);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Delete product row helper
  const handleDeleteProduct = (trueIndex: number) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this product? The data will be updated locally before you synchronize.'
    );
    if (!confirmed) return;

    setLocalRows(prev => prev.filter((_, idx) => idx !== trueIndex));
    // Reset state pages if empty
    if (paginatedProducts.length <= 1 && currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  };

  // Open Edit Dialog Modal
  const openEditModal = (trueIndex: number) => {
    setEditingRowIndex(trueIndex);
    const row = localRows[trueIndex] || [];
    // Pad row with empty items to align with max headers count
    const padded = Array.from({ length: maxCols }).map((_, cIdx) => row[cIdx] ?? '');
    setModalFields(padded);
  };

  // Open Create Dialog Modal
  const openCreateModal = () => {
    setIsCreateModalOpen(true);
    setModalFields(Array(maxCols).fill(''));
  };

  // Submit Modal Updates back to state
  const saveModalEdit = () => {
    if (editingRowIndex === null) return;

    setLocalRows(prev => {
      return prev.map((row, idx) => {
        if (idx === editingRowIndex) {
          return [...modalFields];
        }
        return row;
      });
    });

    setEditingRowIndex(null);
  };

  // Submit newly added row/product
  const saveCreateModal = () => {
    setLocalRows(prev => [...prev, [...modalFields]]);
    setIsCreateModalOpen(false);
    // Jump to the latest page
    const targetPage = Math.ceil((localRows.length + 1) / pageSize);
    setCurrentPage(targetPage);
  };

  // Total amount of pending local edits across rows
  const unsavedEditsCount = useMemo(() => {
    let edits = 0;
    localRows.forEach((row, ri) => {
      for (let ci = 0; ci < maxCols; ci++) {
        if ((row[ci] ?? '') !== (originalRows[ri]?.[ci] ?? '')) {
          edits++;
        }
      }
    });
    return edits;
  }, [localRows, originalRows, maxCols]);

  return (
    <div className="flex flex-col gap-6">
      
      {/* Search, Filter categories and Header options area */}
      <div className="bg-white border border-neutral-200/60 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
        
        {/* Row 1: Search and Header Action buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-neutral-400">
              <Search size={15} />
            </span>
            <input
              type="text"
              placeholder="Search products, descriptions, prices or codes..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10 pr-4 py-2 bg-neutral-50 border border-neutral-200 focus:border-neutral-900 text-neutral-800 placeholder-neutral-400 text-xs font-sans rounded-xl outline-hidden w-full transition-all focus:bg-white focus:ring-1 focus:ring-neutral-950/10"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
            {unsavedEditsCount > 0 && (
              <button
                onClick={onUndoAll}
                className="px-3 py-2 border border-emerald-200 hover:border-emerald-300 bg-emerald-50/20 text-emerald-800 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Discard all pending changes made locally"
              >
                <Undo2 size={12} />
                <span>Discard Edits ({unsavedEditsCount})</span>
              </button>
            )}

            <button
              onClick={openCreateModal}
              className="px-4 py-2 bg-emerald-900 hover:bg-emerald-950 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Row 2: Sort shortcuts and Headers row selection */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[9px] uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1">
              <SlidersHorizontal size={11} className="text-neutral-400" />
              Sort:
            </span>
            <button
              onClick={() => toggleSort(columnRoles.titleIdx)}
              className={`px-2.5 py-1 rounded-lg border font-medium text-xs transition-all cursor-pointer ${
                sortByColIdx === columnRoles.titleIdx
                  ? 'bg-emerald-900 border-emerald-900 text-white font-semibold'
                  : 'bg-white border-neutral-200 hover:border-neutral-350 text-neutral-600'
              }`}
            >
              Name {sortByColIdx === columnRoles.titleIdx && (sortDirection === 'asc' ? '↓' : '↑')}
            </button>

            {columnRoles.priceIdx !== -1 && (
              <button
                onClick={() => toggleSort(columnRoles.priceIdx)}
                className={`px-2.5 py-1 rounded-lg border font-medium text-xs transition-all cursor-pointer ${
                  sortByColIdx === columnRoles.priceIdx
                    ? 'bg-emerald-900 border-emerald-900 text-white font-semibold'
                    : 'bg-white border-neutral-200 hover:border-neutral-350 text-neutral-605'
                }`}
              >
                Price {sortByColIdx === columnRoles.priceIdx && (sortDirection === 'asc' ? '↓' : '↑')}
              </button>
            )}

            {columnRoles.stockIdx !== -1 && (
              <button
                onClick={() => toggleSort(columnRoles.stockIdx)}
                className={`px-2.5 py-1 rounded-lg border font-medium text-xs transition-all cursor-pointer ${
                  sortByColIdx === columnRoles.stockIdx
                    ? 'bg-emerald-900 border-emerald-900 text-white font-semibold'
                    : 'bg-white border-neutral-200 hover:border-neutral-350 text-neutral-605'
                }`}
              >
                Stock {sortByColIdx === columnRoles.stockIdx && (sortDirection === 'asc' ? '↓' : '↑')}
              </button>
            )}
          </div>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasHeadersRow}
              onChange={(e) => setHasHeadersRow(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-neutral-905 focus:ring-neutral-950 border-neutral-300"
            />
            <span className="font-medium text-neutral-450 text-xs">First row specifies headers</span>
          </label>
        </div>

        {/* Row 3: Category filter chips */}
        {allCategories.length > 2 && (
          <div className="flex items-center gap-1.5 border-t border-neutral-100 pt-3 overflow-x-auto select-none no-scrollbar">
            <span className="font-mono text-[9px] uppercase font-bold text-neutral-400 tracking-wider flex items-center gap-1 flex-shrink-0">
              <FolderOpen size={11} className="text-neutral-400" />
              Categories:
            </span>
            <div className="flex items-center gap-1.5 py-0.5">
              {allCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-emerald-900 text-white shadow-xs'
                      : 'bg-neutral-50 border border-neutral-200/50 hover:bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Product Cards Browser Grid */}
      {paginatedProducts.length === 0 ? (
        <div className="bg-white border border-gray-150 rounded-2xl p-16 text-center shadow-2xs flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 bg-slate-50 text-slate-350 rounded-full flex items-center justify-center border border-slate-100">
            <Grid size={22} />
          </div>
          <div>
            <h4 className="font-sans font-bold text-gray-700 text-sm">No items matched your query</h4>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">Try clearing your filters or editing search keyword values in the configurations above.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {paginatedProducts.map(({ row, trueIndex }) => {
            const isModified = isRowModified(trueIndex);
            
            // Core attributes mapping
            const title = row[columnRoles.titleIdx] || `Product #${trueIndex + 1}`;
            const imgUrl = columnRoles.imgIdx !== -1 ? row[columnRoles.imgIdx] : '';
            const price = columnRoles.priceIdx !== -1 ? row[columnRoles.priceIdx] : '';
            const category = columnRoles.catIdx !== -1 ? row[columnRoles.catIdx] : '';
            const desc = columnRoles.descIdx !== -1 ? row[columnRoles.descIdx] : '';
            const stock = columnRoles.stockIdx !== -1 ? row[columnRoles.stockIdx] : '';

            // Generate clean background gradient based on title name text hash for cards that don't have images
            const fallbackGradient = (() => {
              let hash = 0;
              for (let i = 0; i < title.length; i++) {
                hash = title.charCodeAt(i) + ((hash << 5) - hash);
              }
              const h1 = Math.abs(hash % 360);
              const h2 = (h1 + 40) % 360;
              return `linear-gradient(135deg, hsl(${h1}, 65%, 45%), hsl(${h2}, 70%, 35%))`;
            })();

            return (
              <motion.div
                key={trueIndex}
                layoutId={`product-card-${trueIndex}`}
                className="bg-white border border-gray-150 rounded-2xl shadow-3xs hover:shadow-sm hover:border-gray-250 transition-all flex flex-col justify-between overflow-hidden relative group"
              >
                
                {/* Image / Header Visual Section */}
                <div className="relative h-44 bg-slate-100 overflow-hidden select-none border-b border-gray-100">
                  {imgUrl && isImageUrl(imgUrl) ? (
                    <img
                      src={getDirectImageUrl(imgUrl)}
                      alt={title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        // If it fails to load, clear src attribute and let fallback gradient handle illustration
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          const fallbackNode = parent.querySelector('.fallback-gradient-illustration');
                          if (fallbackNode) {
                            (fallbackNode as HTMLElement).style.display = 'flex';
                          }
                        }
                      }}
                    />
                  ) : null}

                  {/* Fallback illustration banner if no picture link is active */}
                  <div
                    className="fallback-gradient-illustration absolute inset-0 text-white flex flex-col items-center justify-center p-4 text-center font-sans gap-2"
                    style={{
                      display: (!imgUrl || !isImageUrl(imgUrl)) ? 'flex' : 'none',
                      background: fallbackGradient
                    }}
                  >
                    <Bookmark size={30} className="stroke-[1.5] drop-shadow-sm opacity-90" />
                    <span className="font-mono text-[9px] uppercase tracking-widest font-bold opacity-75">
                      {category || 'ITEM CATALOG'}
                    </span>
                    <h4 className="font-bold text-xs truncate max-w-full drop-shadow-sm px-2">
                      {title}
                    </h4>
                  </div>

                  {/* Category Status pill overlay */}
                  {category && (
                    <span className="absolute top-3 left-3 bg-white/95 backdrop-blur-xs text-gray-800 border border-gray-150 px-2.5 py-0.5 rounded-full font-sans font-bold text-[10px] uppercase shadow-3xs select-none">
                      {category}
                    </span>
                  )}

                  {/* Local Modify indicators */}
                  {isModified && (
                    <span className="absolute top-3 left-3 bg-amber-500 text-white px-2.5 py-0.5 rounded-full font-sans font-extrabold text-[10px] uppercase shadow-2xs select-none flex items-center gap-1 z-10">
                      <span className="w-1.5 h-1.5 rounded-full bg-white inline-block animate-ping"></span>
                      <span>EDITS PENDING</span>
                    </span>
                  )}

                  {/* Corner Edit & Motility Spreadsheet Navigation (Corner edit requested by user) */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                    <a
                      href={sheetLink}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 bg-white/95 hover:bg-white text-blue-600 hover:text-blue-800 rounded-lg shadow-2xs hover:shadow-xs transition-all border border-blue-200 hover:scale-105 cursor-pointer flex items-center justify-center"
                      title="Open Google Sheets workbook for direct edit"
                    >
                      <ExternalLink size={14} className="stroke-[2.5]" />
                    </a>
                    <button
                      onClick={() => openEditModal(trueIndex)}
                      className="p-1.5 bg-white/95 hover:bg-white text-gray-600 hover:text-emerald-700 rounded-lg shadow-2xs hover:shadow-xs transition-all border border-gray-200 hover:scale-105 cursor-pointer"
                      title="Edit Product Values"
                    >
                      <Edit3 size={14} className="stroke-[2.5]" />
                    </button>
                  </div>
                </div>

                {/* Core Content Body section */}
                <div className="p-4 flex flex-col gap-3 flex-1 justify-between">
                  
                  {/* Title & Description */}
                  <div className="flex flex-col gap-1.5">
                    <h3 className="font-sans font-bold text-gray-900 group-hover:text-emerald-700 transition-colors text-sm line-clamp-1" title={title}>
                      {title}
                    </h3>
                    
                    {desc ? (
                      <p className="font-sans text-[11px] text-gray-400 line-clamp-2 leading-relaxed" title={desc}>
                        {desc}
                      </p>
                    ) : (
                      <p className="font-sans text-[11px] italic text-gray-300">No product summary listed...</p>
                    )}
                  </div>

                  {/* Specific Grid of organized specification details */}
                  <div className="border-t border-gray-50 pt-3 flex flex-col gap-2">
                    {/* Primary Highlight KPI row */}
                    <div className="flex items-center justify-between gap-2">
                      {/* Price Section */}
                      {price && (
                        <div className="flex flex-col">
                          <span className="text-[9px] uppercase font-mono font-bold text-gray-400 tracking-wider">Price</span>
                          <span className="font-sans font-extrabold text-sm text-emerald-600">
                            {formatCurrency(price)}
                          </span>
                        </div>
                      )}

                      {/* Stock Section */}
                      {stock && (
                        <div className="flex flex-col text-right">
                          <span className="text-[9px] uppercase font-mono font-bold text-gray-400 tracking-wider">Availability</span>
                          <span className="font-sans font-bold text-xs text-gray-700 inline-flex items-center gap-1.5 justify-end">
                            <span className={`w-1.5 h-1.5 rounded-full ${Number(stock) > 0 || isNaN(Number(stock)) ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                            <span>{stock} units</span>
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Secondary Specifications drawer panel listing remaining items */}
                    <div className="bg-slate-50/75 rounded-lg p-2 flex flex-col gap-1 border border-slate-100/50">
                      <span className="text-[8.5px] uppercase font-mono font-bold text-gray-400 tracking-wider block">Specifications:</span>
                      
                      {headers.map((h, colIdx) => {
                        // Skip mapped common values to avoid redundant specifications duplication
                        if (
                          colIdx === columnRoles.titleIdx ||
                          colIdx === columnRoles.imgIdx ||
                          colIdx === columnRoles.priceIdx ||
                          colIdx === columnRoles.catIdx ||
                          colIdx === columnRoles.descIdx ||
                          colIdx === columnRoles.stockIdx
                        ) return null;

                        const val = row[colIdx];
                        if (val === undefined || val.trim() === '') return null;

                        return (
                          <div key={colIdx} className="flex items-center justify-between gap-4 text-[10px]">
                            <span className="text-gray-400 font-medium truncate max-w-[80px]" title={h}>{h}:</span>
                            <span className="text-gray-600 font-bold truncate max-w-[110px]" title={val}>{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>

                {/* Footer utility Actions on Card */}
                <div className="px-4 pb-4 pt-1 flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-[9px] text-gray-300">
                    Row Index: {trueIndex + 1}
                  </span>
                  
                  <button
                    onClick={() => handleDeleteProduct(trueIndex)}
                    className="p-1 hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-lg transition-colors cursor-pointer"
                    title="Delete item from local catalogue"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer Controls */}
      <div className="bg-white border border-gray-150 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-3xs">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Browsing page</span>
          <span className="font-mono text-xs font-bold text-gray-700 bg-slate-50 border border-slate-150 rounded-lg px-2 py-0.5">
            {currentPage} of {totalPages}
          </span>
          <span className="text-xs text-gray-400">
            ({filteredProcessedProducts.length} filtered items total out of {localRows.length - (hasHeadersRow ? 1 : 0)})
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Card size per page select dropdown */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span>Size:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-white border border-gray-200 text-gray-600 rounded-lg text-xs px-2.5 py-1.5 font-medium outline-hidden hover:border-gray-350 select-none"
            >
              <option value="4">4 cards</option>
              <option value="8">8 cards</option>
              <option value="12">12 cards</option>
              <option value="16">16 cards</option>
              <option value="24">24 cards</option>
            </select>
          </div>

          <div className="inline-flex gap-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={`p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors flex items-center justify-center cursor-pointer ${
                currentPage === 1
                  ? 'opacity-40 cursor-not-allowed bg-slate-50/50'
                  : 'hover:bg-slate-50 hover:text-gray-700'
              }`}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={`p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 transition-colors flex items-center justify-center cursor-pointer ${
                currentPage === totalPages
                  ? 'opacity-40 cursor-not-allowed bg-slate-50/50'
                  : 'hover:bg-slate-50 hover:text-gray-700'
              }`}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Edit Product Values popup overlay Modal */}
      <AnimatePresence>
        {editingRowIndex !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Modal Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingRowIndex(null)}
              className="absolute inset-0 bg-slate-900/45 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white border border-gray-150 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto relative z-10 flex flex-col"
            >
              
              {/* Modal Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
                    <Edit3 size={16} />
                  </div>
                  <div>
                    <h3 className="font-sans font-bold text-gray-800 text-sm">Modify Product Details</h3>
                    <p className="font-mono text-[9.5px] text-gray-400">Updating cell coordinates in row #{editingRowIndex + 1}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5">
                  <a
                    href={sheetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-3xs hover:scale-[1.02] transition-all"
                    title="Open Google Sheets directly"
                  >
                    <ExternalLink size={12} className="stroke-[2.5]" />
                    <span>Open Sheet</span>
                  </a>
                  <button
                    onClick={() => setEditingRowIndex(null)}
                    className="p-1.5 hover:bg-slate-100 text-gray-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Modal Scroll Content Fields */}
              <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                
                {/* Image Live Pre-visualizer preview inside form */}
                {columnRoles.imgIdx !== -1 && modalFields[columnRoles.imgIdx] && isImageUrl(modalFields[columnRoles.imgIdx]) && (
                  <div className="mb-2 bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center gap-4">
                    <img
                      src={getDirectImageUrl(modalFields[columnRoles.imgIdx])}
                      alt="Product visualizer"
                      className="w-16 h-16 rounded-lg object-cover border border-gray-200"
                      referrerPolicy="no-referrer"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-gray-700">Image Asset Previsualizer</p>
                      <p className="text-[10px] text-gray-400 leading-normal mt-0.5 break-all max-w-[400px]">
                        {modalFields[columnRoles.imgIdx]}
                      </p>
                    </div>
                  </div>
                )}

                {/* Iterate fields of product */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {headers.map((h, cIdx) => {
                    const val = modalFields[cIdx] ?? '';
                    const isLongText = (cIdx === columnRoles.descIdx) || (val.length > 50 && h.toLowerCase().includes('desc'));

                    return (
                      <div key={cIdx} className={`flex flex-col gap-1.5 ${isLongText ? 'sm:col-span-2' : ''}`}>
                        <label className="text-xs font-bold text-gray-500 font-sans flex items-center gap-1">
                          <span>{h}</span>
                          <span className="font-mono text-[9px] text-gray-300 font-normal">({getColumnLetter(cIdx)})</span>
                        </label>
                        
                        {isLongText ? (
                          <textarea
                            value={val}
                            onChange={(e) => {
                              const copy = [...modalFields];
                              copy[cIdx] = e.target.value;
                              setModalFields(copy);
                            }}
                            rows={3}
                            placeholder={`Enter product ${h.toLowerCase()}...`}
                            className="bg-slate-50 border border-gray-205 focus:border-emerald-400 text-gray-800 text-xs font-medium rounded-xl p-3 outline-hidden w-full transition-all focus:bg-white resize-y"
                          />
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => {
                              const copy = [...modalFields];
                              copy[cIdx] = e.target.value;
                              setModalFields(copy);
                            }}
                            placeholder={`Enter ${h.toLowerCase()} value...`}
                            className="bg-slate-50 border border-gray-205 focus:border-emerald-400 text-gray-800 text-xs font-medium rounded-xl px-3.5 py-2.5 outline-hidden w-full transition-all focus:bg-white"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Modal Footer actions */}
              <div className="p-4 border-t border-gray-100 flex items-center justify-between gap-2.5 sticky bottom-0 bg-white z-10 shadow-lg">
                <a
                  href={sheetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-700 font-bold rounded-xl text-xs inline-flex items-center gap-1.5 transition-all"
                  title="Open the Google Sheets workbook document"
                >
                  <ExternalLink size={13} className="text-slate-500" />
                  <span>Go to Spreadsheet URL</span>
                </a>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingRowIndex(null)}
                    className="px-4 py-2 border border-gray-200 hover:bg-slate-50 text-gray-600 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={saveModalEdit}
                    className="px-4.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  >
                    <Check size={14} />
                    <span>Commit Edits</span>
                  </button>
                </div>
              </div>

            </motion.div>

          </div>
        )}
      </AnimatePresence>

      {/* Create Dynamic New Product Form Modal */}
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="bg-white border border-gray-150 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto relative z-10 flex flex-col"
            >
              
              {/* Modal Header */}
              <div className="p-5 border-b border-gray-100 flex items-center justify-between gap-4 sticky top-0 bg-white z-10">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">
                    <Plus size={16} />
                  </div>
                  <div>
                    <h3 className="font-sans font-bold text-gray-800 text-sm">Add New Product</h3>
                    <p className="font-mono text-[9.5px] text-gray-400">Append a new record row back to the bottom of the worksheet</p>
                  </div>
                </div>
                
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1.5 hover:bg-slate-100 text-gray-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal Scroll Fields */}
              <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {headers.map((h, cIdx) => {
                    const val = modalFields[cIdx] ?? '';
                    const isLongText = (cIdx === columnRoles.descIdx) || (h.toLowerCase().includes('desc'));

                    return (
                      <div key={cIdx} className={`flex flex-col gap-1.5 ${isLongText ? 'sm:col-span-2' : ''}`}>
                        <label className="text-xs font-bold text-gray-500 font-sans flex items-center gap-1">
                          <span>{h}</span>
                          <span className="font-mono text-[9px] text-gray-300 font-normal">({getColumnLetter(cIdx)})</span>
                        </label>
                        
                        {isLongText ? (
                          <textarea
                            value={val}
                            onChange={(e) => {
                              const copy = [...modalFields];
                              copy[cIdx] = e.target.value;
                              setModalFields(copy);
                            }}
                            rows={3}
                            placeholder={`Enter product ${h.toLowerCase()} description...`}
                            className="bg-slate-50 border border-gray-205 focus:border-emerald-400 text-gray-800 text-xs font-medium rounded-xl p-3 outline-hidden w-full transition-all focus:bg-white resize-y"
                          />
                        ) : (
                          <input
                            type="text"
                            value={val}
                            onChange={(e) => {
                              const copy = [...modalFields];
                              copy[cIdx] = e.target.value;
                              setModalFields(copy);
                            }}
                            placeholder={`Enter ${h.toLowerCase()}...`}
                            className="bg-slate-50 border border-gray-250 focus:border-emerald-400 text-gray-800 text-xs font-medium rounded-xl px-3.5 py-2.5 outline-hidden w-full transition-all focus:bg-white"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer actions */}
              <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2.5 sticky bottom-0 bg-white z-10 shadow-lg">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 hover:bg-slate-50 text-gray-600 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveCreateModal}
                  className="px-4.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <Check size={14} />
                  <span>Create Item</span>
                </button>
              </div>

            </motion.div>

          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
