import { FileSpreadsheet, ListTodo, Edit2, AlertCircle, RefreshCw } from 'lucide-react';

interface MetricCardsProps {
  sheetTitle: string;
  totalRows: number;
  totalCols: number;
  unsavedChangesCount: number;
  selectedTabName: string;
  isSaving: boolean;
  onSave: () => void;
  canSave: boolean;
}

export default function MetricCards({
  sheetTitle,
  totalRows,
  totalCols,
  unsavedChangesCount,
  selectedTabName,
  isSaving,
  onSave,
  canSave,
}: MetricCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Block 1: Active Document */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 shadow-2xs">
        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
          <FileSpreadsheet size={22} />
        </div>
        <div className="overflow-hidden">
          <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider block">Spreadsheet Title</p>
          <h3 className="font-sans font-bold text-gray-800 text-sm truncate mt-0.5" title={sheetTitle}>
            {sheetTitle || 'No Sheet Loaded'}
          </h3>
          <p className="font-sans text-xs text-gray-400 mt-0.5 truncate bg-slate-50 border border-slate-100/50 rounded-md px-1.5 py-0.5 inline-block">
            Tab: {selectedTabName}
          </p>
        </div>
      </div>

      {/* Block 2: Total Rows */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 shadow-2xs">
        <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
          <ListTodo size={22} />
        </div>
        <div>
          <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider block">Dataset Size</p>
          <h3 className="font-sans font-bold text-gray-800 text-lg mt-0.5">
            {totalRows} <span className="text-xs text-gray-400 font-medium">rows</span>
          </h3>
          <p className="font-sans text-xs text-gray-400 mt-0.5">
            across {totalCols} columns
          </p>
        </div>
      </div>

      {/* Block 3: Local Pending Changes */}
      <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 shadow-2xs">
        <div className={`p-3 rounded-xl ${unsavedChangesCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
          <Edit2 size={22} className={unsavedChangesCount > 0 ? 'animate-pulse' : ''} />
        </div>
        <div>
          <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider block">Unsaved Edits</p>
          <h3 className="font-sans font-bold text-gray-800 text-lg mt-0.5">
            {unsavedChangesCount} <span className="text-xs text-gray-400 font-medium">pending</span>
          </h3>
          <p className="font-sans text-xs text-gray-400 mt-0.5 truncate">
            {unsavedChangesCount > 0 ? 'Changes only exist locally' : 'Synced with Sheets API'}
          </p>
        </div>
      </div>

      {/* Block 4: Commit Action Card */}
      <div className={`rounded-xl p-4 flex items-center justify-between gap-4 border transition-all ${
        unsavedChangesCount > 0 
          ? 'bg-amber-50/40 border-amber-100 shadow-xs' 
          : 'bg-white border-gray-100 shadow-2xs'
      }`}>
        <div className="overflow-hidden flex-1">
          <p className="font-mono text-[10px] text-gray-400 uppercase tracking-wider block">Google Server Status</p>
          {unsavedChangesCount > 0 ? (
            <div className="flex items-center gap-1.5 text-amber-700 font-medium text-xs mt-1">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>Unsaved changes!</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-emerald-700 font-medium text-xs mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-ping"></span>
              <span>Fully Aligned</span>
            </div>
          )}
        </div>
        
        <button
          onClick={onSave}
          disabled={!canSave || isSaving}
          className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
            unsavedChangesCount > 0
              ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs hover:shadow-md'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isSaving ? (
            <RefreshCw size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          <span>{isSaving ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      </div>
    </div>
  );
}
