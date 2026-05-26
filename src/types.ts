export interface SheetInfo {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
}

export interface SpreadsheetMetadata {
  id: string;
  title: string;
  sheets: SheetInfo[];
}

export interface CellChange {
  row: number; // Row index (0-indexed, including header if not treated as header)
  col: number; // Column index (0-indexed)
  oldValue: string;
  newValue: string;
}

export interface SortingState {
  columnIdx: number | null;
  direction: 'asc' | 'desc' | null;
}

export interface ChartConfig {
  xAxisColIdx: number;
  yAxisColIdx: number;
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area';
}
