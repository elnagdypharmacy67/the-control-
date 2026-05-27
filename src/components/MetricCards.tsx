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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Block 1: Active Document */}
      <div className="bg-white border border-neutral-200/60 rounded-xl p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest">Workbook Title</span>
          <FileSpreadsheet size={14} className="text-neutral-400" />
        </div>
        <div className="mt-4">
          <h3 className="font-sans font-semibold text-neutral-900 text-sm truncate animate-fade-in" title={sheetTitle}>
            {sheetTitle || 'No Sheet Loaded'}
          </h3>
          <p className="font-sans text-[10.5px] text-neutral-500 mt-1 truncate bg-neutral-50 border border-neutral-100 rounded px-1.5 py-0.5 inline-block">
            Tab: {selectedTabName}
          </p>
        </div>
      </div>

      {/* Block 2: Total Rows */}
      <div className="bg-white border border-neutral-200/60 rounded-xl p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest">Dataset Size</span>
          <ListTodo size={14} className="text-neutral-400" />
        </div>
        <div className="mt-4">
          <h3 className="font-sans font-semibold text-neutral-900 text-sm">
            {totalRows} <span className="text-xs text-neutral-400 font-normal">items</span>
          </h3>
          <p className="font-sans text-[10.5px] text-neutral-400 mt-1">
            across {totalCols} columns
          </p>
        </div>
      </div>

      {/* Block 3: Local Pending Changes */}
      <div className="bg-white border border-neutral-200/60 rounded-xl p-4 flex flex-col justify-between shadow-xs">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest">Unsaved Edits</span>
          <Edit2 size={14} className={unsavedChangesCount > 0 ? "text-amber-500 animate-pulse" : "text-neutral-400"} />
        </div>
        <div className="mt-4">
          <h3 className="font-sans font-semibold text-neutral-900 text-sm">
            {unsavedChangesCount} <span className="text-xs text-neutral-400 font-normal font-sans">changes</span>
          </h3>
          <p className="font-sans text-[10.5px] text-neutral-400 mt-1 truncate">
            {unsavedChangesCount > 0 ? 'Pending synchronization' : 'Synced with Cloud API'}
          </p>
        </div>
      </div>

      {/* Block 4: Commit Action Card */}
      <div className={`rounded-xl p-4 flex flex-col justify-between border transition-all shadow-xs ${
        unsavedChangesCount > 0 
          ? 'bg-amber-50/10 border-amber-200/75' 
          : 'bg-white border-neutral-200/60'
      }`}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-neutral-400 uppercase tracking-widest">Status</span>
          {unsavedChangesCount > 0 ? (
            <AlertCircle size={14} className="text-amber-500" />
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          )}
        </div>
        
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[10.5px] text-neutral-500 font-medium font-sans">
            {unsavedChangesCount > 0 ? 'Needs save' : 'Up to date'}
          </span>
          <button
            onClick={onSave}
            disabled={!canSave || isSaving}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              unsavedChangesCount > 0
                ? 'bg-emerald-900 hover:bg-emerald-950 text-white shadow-xs'
                : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
            }`}
          >
            {isSaving ? (
              <RefreshCw size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            <span>{isSaving ? 'Saving...' : 'Sync to Sheets'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
