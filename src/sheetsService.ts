import { SpreadsheetMetadata, SheetInfo } from './types';

// Extract spreadsheet ID from a Google Sheets URL
export const extractSpreadsheetId = (url: string): string | null => {
  if (!url) return null;
  
  // Custom check for just the ID pasted directly
  if (/^[a-zA-Z0-9-_]{40,60}$/.test(url.trim())) {
    return url.trim();
  }

  // Regex to extract ID from standard Google Sheets URL format
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
};

// Fetch Spreadsheet Metadata (Title and Sheets list)
export const fetchSpreadsheetMetadata = async (
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets(properties(sheetId,title,gridProperties))`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Failed to fetch metadata (HTTP ${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  const title = data.properties?.title || 'Untitled Spreadsheet';
  const sheets: SheetInfo[] = (data.sheets || []).map((s: any) => {
    const props = s.properties || {};
    return {
      sheetId: props.sheetId ?? 0,
      title: props.title || 'Sheet1',
      rowCount: props.gridProperties?.rowCount ?? 0,
      columnCount: props.gridProperties?.columnCount ?? 0,
    };
  });

  return { id: spreadsheetId, title, sheets };
};

// Fetch Row Values of a specific Sheet (Tab)
export const fetchSheetValues = async (
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<string[][]> => {
  // Use safe range fetch
  const encodedTitle = encodeURIComponent(sheetTitle);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTitle}?valueRenderOption=FORMATTED_VALUE`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Failed to fetch sheet values (HTTP ${response.status})`;
    throw new Error(message);
  }

  const data = await response.json();
  return data.values || [];
};

// Write Updated Row Values back to Google Sheets ranges
export const updateSheetValues = async (
  spreadsheetId: string,
  sheetTitle: string,
  values: string[][],
  accessToken: string
): Promise<void> => {
  // We want to clear the existing sheets first or fetch dimensions to write cleanly.
  // Using PUT on the entire target block is the cleanest method.
  // We can write to the spreadsheet range (e.g. "Sheet1!A1")
  const encodedTitle = encodeURIComponent(sheetTitle);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTitle}!A1?valueInputOption=USER_ENTERED`;

  // Pad the empty values appropriately
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: `${sheetTitle}!A1`,
      majorDimension: 'ROWS',
      values: values,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Failed to save changes back to Sheets (HTTP ${response.status})`;
    throw new Error(message);
  }
};

// Clear sheet before writing new structure if row count decreases or columns shrink
export const clearSheetValues = async (
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string
): Promise<void> => {
  const encodedTitle = encodeURIComponent(sheetTitle);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedTitle}:clear`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Failed to reset sheet content (HTTP ${response.status})`;
    throw new Error(message);
  }
};
