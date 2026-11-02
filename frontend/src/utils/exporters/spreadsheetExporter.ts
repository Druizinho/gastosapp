import type { NormalizedExportDocument } from './entityTemplates';
import { sanitizeSheetName } from './entityTemplates';

/**
 * Escapes a cell for RFC 4180 CSV formatting.
 */
function escapeCsvCell(val: string | number | null | undefined): string {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports a NormalizedExportDocument to Excel (.xlsx) with dynamic import of 'xlsx'.
 * Max rows per table defaults to 10,000 for mobile memory safety.
 */
export async function exportToExcel(
  doc: NormalizedExportDocument,
  maxRows = 10000
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  // Dynamic import to keep initial bundle size at 0 KB
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // 1. Resumen Sheet
  const summaryAoa: (string | number)[][] = [
    [doc.title],
    [doc.subtitle || ''],
    ['Moneda:', doc.currency],
  ];

  if (doc.integrityWarning) {
    summaryAoa.push([]);
    summaryAoa.push(['AVISO DE INTEGRIDAD:', doc.integrityWarning]);
  }

  summaryAoa.push([]);
  summaryAoa.push(['INDICADORES CLAVE (KPIs)', 'VALOR']);

  if (doc.headerCards && doc.headerCards.length > 0) {
    doc.headerCards.forEach((card) => {
      summaryAoa.push([card.label, card.value]);
    });
  } else {
    summaryAoa.push(['Sin indicadores clave', '-']);
  }

  summaryAoa.push([]);
  summaryAoa.push(['TABLAS INCLUIDAS EN ESTE REPORTE']);
  doc.tables.forEach((t, idx) => {
    summaryAoa.push([`${idx + 1}. ${t.title} (${t.rows.length.toLocaleString()} registros)`]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoa);
  // Give columns a comfortable initial width
  wsSummary['!cols'] = [{ wch: 36 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

  // 2. Individual Table Sheets
  const usedSheetNames = new Set<string>(['resumen']);

  doc.tables.forEach((table, idx) => {
    let sheetName = sanitizeSheetName(table.sheetName || table.title || `Tabla ${idx + 1}`);
    let counter = 2;
    while (usedSheetNames.has(sheetName.toLowerCase())) {
      const suffix = ` (${counter})`;
      sheetName = `${sheetName.slice(0, 31 - suffix.length)}${suffix}`;
      counter++;
    }
    usedSheetNames.add(sheetName.toLowerCase());

    const isTruncated = table.rows.length > maxRows;
    const rowsSlice = isTruncated ? table.rows.slice(0, maxRows) : table.rows;

    const tableAoa: (string | number)[][] = [
      [table.title],
      [],
      table.headers,
      ...rowsSlice,
    ];

    if (isTruncated) {
      tableAoa.push([]);
      tableAoa.push([
        table.truncatedNote ||
          `Nota: Se muestran solo las primeras ${maxRows.toLocaleString()} filas por límite de seguridad.`,
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(tableAoa);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: mimeType });
  const filename = `${doc.filenameBase || 'reporte-gastosapp'}.xlsx`;

  return { blob, filename, mimeType };
}

/**
 * Exports a NormalizedExportDocument to UTF-8 CSV with BOM (\uFEFF) for Microsoft Excel compatibility.
 */
export async function exportToCsv(
  doc: NormalizedExportDocument,
  maxRows = 10000
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const lines: string[] = [];

  // Title block
  lines.push(escapeCsvCell(doc.title));
  if (doc.subtitle) {
    lines.push(escapeCsvCell(doc.subtitle));
  }
  lines.push(`"Moneda:","${escapeCsvCell(doc.currency)}"`);

  if (doc.integrityWarning) {
    lines.push(`"AVISO DE INTEGRIDAD:","${escapeCsvCell(doc.integrityWarning)}"`);
  }

  lines.push('');
  lines.push('"INDICADOR","VALOR"');
  if (doc.headerCards && doc.headerCards.length > 0) {
    doc.headerCards.forEach((c) => {
      lines.push(`${escapeCsvCell(c.label)},${escapeCsvCell(c.value)}`);
    });
  }

  // Tables
  doc.tables.forEach((table) => {
    lines.push('');
    lines.push(`=== ${escapeCsvCell(table.title)} ===`);
    lines.push(table.headers.map(escapeCsvCell).join(','));

    const isTruncated = table.rows.length > maxRows;
    const rowsSlice = isTruncated ? table.rows.slice(0, maxRows) : table.rows;

    rowsSlice.forEach((row) => {
      lines.push(row.map(escapeCsvCell).join(','));
    });

    if (isTruncated) {
      lines.push(
        escapeCsvCell(
          table.truncatedNote ||
            `Nota: Se muestran solo las primeras ${maxRows.toLocaleString()} filas.`
        )
      );
    }
  });

  // Prepend UTF-8 BOM for Excel compatibility with special characters
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const mimeType = 'text/csv;charset=utf-8;';
  const blob = new Blob([csvContent], { type: mimeType });
  const filename = `${doc.filenameBase || 'reporte-gastosapp'}.csv`;

  return { blob, filename, mimeType };
}

/**
 * Triggers a browser file download via temporary anchor element.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Triggers mobile native share dialog using navigator.share with File objects.
 * Returns true if shared or gracefully dismissed, false if unsupported.
 */
export async function triggerNativeShare(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.share) {
    return false;
  }

  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: filename,
      });
      return true;
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      // User cancelled share dialog cleanly
      return true;
    }
    console.warn('Native share failed:', err);
  }

  return false;
}

/**
 * Converts a Blob to a raw Base64 string (without the data URL scheme prefix),
 * suitable for payload transfer to POST /api/reports/send-email.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(',');
      if (commaIndex !== -1) {
        resolve(result.slice(commaIndex + 1));
      } else {
        resolve(result);
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
