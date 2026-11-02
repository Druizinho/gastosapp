import type { NormalizedExportDocument } from './entityTemplates';

/**
 * Converts an in-DOM SVGSVGElement into a high-resolution PNG Data URL.
 */
async function svgToPngDataUrl(
  svg: SVGSVGElement
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    try {
      const rect = svg.getBoundingClientRect();
      const rawWidth =
        rect.width > 0
          ? rect.width
          : parseInt(svg.getAttribute('width') || '600', 10) || 600;
      const rawHeight =
        rect.height > 0
          ? rect.height
          : parseInt(svg.getAttribute('height') || '300', 10) || 300;

      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', `${rawWidth}`);
      clone.setAttribute('height', `${rawHeight}`);

      const serializer = new XMLSerializer();
      const svgXml = serializer.serializeToString(clone);
      const svgBlob = new Blob([svgXml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      const img = new Image();
      img.onload = () => {
        try {
          const scale = 2; // 2x scale for sharp vector look on print
          const canvas = document.createElement('canvas');
          canvas.width = rawWidth * scale;
          canvas.height = rawHeight * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Canvas 2D context not available'));
            return;
          }

          ctx.scale(scale, scale);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, rawWidth, rawHeight);
          ctx.drawImage(img, 0, 0, rawWidth, rawHeight);

          const dataUrl = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve({ dataUrl, width: rawWidth, height: rawHeight });
        } catch (canvasErr) {
          URL.revokeObjectURL(url);
          reject(canvasErr);
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load SVG into Image: ${e}`));
      };
      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Safely executes autoTable regardless of whether it was bound to jsPDF prototype
 * or exported as a standalone function.
 */
function runAutoTable(doc: any, autoTableFn: any, options: any): void {
  if (typeof doc.autoTable === 'function') {
    doc.autoTable(options);
  } else if (typeof autoTableFn === 'function') {
    autoTableFn(doc, options);
  } else {
    console.error('jsPDF autoTable plugin not found');
  }
}

/**
 * Exports a NormalizedExportDocument to an executive styled PDF with dynamic import of 'jspdf'
 * and 'jspdf-autotable'. Max rows per table defaults to 2,000 for PDF performance and readability.
 */
export async function exportToPdf(
  doc: NormalizedExportDocument,
  includeCharts = false,
  maxRows = 2000
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  // Dynamic imports to preserve 0 KB initial bundle overhead
  const { jsPDF } = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = (autoTableModule.default || autoTableModule) as any;

  // A4 dimensions: 210mm x 297mm
  const pdfDoc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const margin = 14;
  const usableWidth = 182; // 210 - 28
  const pageHeight = 297;
  let currentY = margin;

  // 1. Executive Brand Header Banner
  pdfDoc.setFillColor(15, 23, 42); // slate-900
  pdfDoc.roundedRect(margin, currentY, usableWidth, 22, 2, 2, 'F');

  pdfDoc.setTextColor(255, 255, 255);
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.setFontSize(14);
  pdfDoc.text('GastosApp', margin + 6, currentY + 9);

  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(8);
  pdfDoc.setTextColor(148, 163, 184); // slate-400
  pdfDoc.text('Control Financiero y Reportes Ejecutivos', margin + 6, currentY + 15);

  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(255, 255, 255);
  pdfDoc.text(`Moneda: ${doc.currency}`, margin + usableWidth - 6, currentY + 9, { align: 'right' });

  const now = new Date();
  const dateFormatted = `${now.toLocaleDateString('es-VE')} ${now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
  pdfDoc.setFont('helvetica', 'normal');
  pdfDoc.setFontSize(7.5);
  pdfDoc.setTextColor(148, 163, 184);
  pdfDoc.text(`Emisión: ${dateFormatted}`, margin + usableWidth - 6, currentY + 15, { align: 'right' });

  currentY += 27;

  // 2. Report Title & Subtitle
  pdfDoc.setFont('helvetica', 'bold');
  pdfDoc.setFontSize(13);
  pdfDoc.setTextColor(15, 23, 42);
  pdfDoc.text(doc.title, margin, currentY);
  currentY += 5.5;

  if (doc.subtitle) {
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setFontSize(8.5);
    pdfDoc.setTextColor(100, 116, 139); // slate-500
    pdfDoc.text(doc.subtitle, margin, currentY);
    currentY += 6;
  }

  // 3. Integrity Warning Banner (if asymmetric or present)
  if (doc.integrityWarning) {
    pdfDoc.setFontSize(7.5);
    const warningLines = pdfDoc.splitTextToSize(
      `AVISO DE INTEGRIDAD: ${doc.integrityWarning}`,
      usableWidth - 8
    );
    const bannerHeight = warningLines.length * 3.8 + 5;

    pdfDoc.setFillColor(254, 243, 199); // amber-100
    pdfDoc.setDrawColor(245, 158, 11); // amber-500
    pdfDoc.setLineWidth(0.3);
    pdfDoc.roundedRect(margin, currentY, usableWidth, bannerHeight, 1.5, 1.5, 'FD');

    pdfDoc.setTextColor(146, 64, 14); // amber-800
    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.text(warningLines, margin + 4, currentY + 4.5);
    currentY += bannerHeight + 5;
  }

  // 4. KPI Summary Cards Grid
  if (doc.headerCards && doc.headerCards.length > 0) {
    const cards = doc.headerCards;
    const numCols = cards.length <= 4 ? cards.length : cards.length <= 6 ? 3 : 4;
    const gap = 3;
    const cardWidth = (usableWidth - (numCols - 1) * gap) / numCols;
    const cardHeight = 14;

    const totalRows = Math.ceil(cards.length / numCols);

    for (let r = 0; r < totalRows; r++) {
      if (currentY + cardHeight > pageHeight - 20) {
        pdfDoc.addPage();
        currentY = margin;
      }

      for (let c = 0; c < numCols; c++) {
        const idx = r * numCols + c;
        if (idx >= cards.length) break;

        const card = cards[idx];
        const cardX = margin + c * (cardWidth + gap);
        const cardY = currentY;

        // Card container
        pdfDoc.setFillColor(248, 250, 252); // slate-50
        pdfDoc.setDrawColor(226, 232, 240); // slate-200
        pdfDoc.setLineWidth(0.2);
        pdfDoc.roundedRect(cardX, cardY, cardWidth, cardHeight, 1.2, 1.2, 'FD');

        // Card label
        pdfDoc.setFont('helvetica', 'normal');
        pdfDoc.setFontSize(6.5);
        pdfDoc.setTextColor(100, 116, 139);
        const labelLines = pdfDoc.splitTextToSize(card.label.toUpperCase(), cardWidth - 6);
        pdfDoc.text(labelLines[0] || card.label.toUpperCase(), cardX + 3, cardY + 4.5);

        // Card value color based on highlight
        if (card.highlight === 'positive') {
          pdfDoc.setTextColor(5, 150, 105); // emerald-600
        } else if (card.highlight === 'negative') {
          pdfDoc.setTextColor(225, 29, 72); // rose-600
        } else if (card.highlight === 'warning') {
          pdfDoc.setTextColor(217, 119, 6); // amber-600
        } else {
          pdfDoc.setTextColor(15, 23, 42); // slate-900
        }

        pdfDoc.setFont('helvetica', 'bold');
        pdfDoc.setFontSize(8.5);
        const valLines = pdfDoc.splitTextToSize(card.value, cardWidth - 6);
        pdfDoc.text(valLines[0] || card.value, cardX + 3, cardY + 10.5);
      }

      currentY += cardHeight + gap;
    }

    currentY += 4;
  }

  // 5. Embedded SVG Charts (if enabled and present)
  if (includeCharts && doc.svgElements && doc.svgElements.length > 0) {
    for (const svg of doc.svgElements) {
      try {
        const { dataUrl, width, height } = await svgToPngDataUrl(svg);
        const aspectRatio = height / width;
        const chartWidthMm = usableWidth;
        const chartHeightMm = Math.min(chartWidthMm * aspectRatio, 80);

        if (currentY + chartHeightMm > pageHeight - 25) {
          pdfDoc.addPage();
          currentY = margin;
        }

        pdfDoc.addImage(dataUrl, 'PNG', margin, currentY, chartWidthMm, chartHeightMm);
        currentY += chartHeightMm + 6;
      } catch (chartErr) {
        console.warn('Skipping chart rasterization for PDF:', chartErr);
      }
    }
  }

  // 6. Tables with autoTable
  for (const table of doc.tables) {
    if (currentY > pageHeight - 35) {
      pdfDoc.addPage();
      currentY = margin;
    }

    pdfDoc.setFont('helvetica', 'bold');
    pdfDoc.setFontSize(9.5);
    pdfDoc.setTextColor(15, 23, 42);
    pdfDoc.text(table.title, margin, currentY);
    currentY += 3;

    const isTruncated = table.rows.length > maxRows;
    const displayRows = isTruncated ? table.rows.slice(0, maxRows) : table.rows;

    runAutoTable(pdfDoc, autoTable, {
      startY: currentY,
      head: [table.headers],
      body: displayRows,
      margin: { left: margin, right: margin, bottom: 20, top: margin },
      theme: 'striped',
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 7.5,
        fontStyle: 'bold',
        halign: 'left',
        cellPadding: 2,
      },
      bodyStyles: {
        fontSize: 7,
        textColor: [30, 41, 59],
        cellPadding: 1.8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    currentY = ((pdfDoc as any).lastAutoTable?.finalY ?? (currentY + 25)) + 4;

    if (isTruncated) {
      pdfDoc.setFont('helvetica', 'italic');
      pdfDoc.setFontSize(7);
      pdfDoc.setTextColor(100, 116, 139);
      pdfDoc.text(
        table.truncatedNote ||
          `Nota: Se muestran solo las primeras ${maxRows.toLocaleString()} filas. Para el listado completo utilice la exportación a Excel o CSV.`,
        margin,
        currentY
      );
      currentY += 5;
    }

    currentY += 3;
  }

  // 7. Footer across all generated pages
  const totalPages = (pdfDoc.internal as any).getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    pdfDoc.setPage(p);

    pdfDoc.setDrawColor(226, 232, 240); // slate-200
    pdfDoc.setLineWidth(0.25);
    pdfDoc.line(margin, pageHeight - 12, margin + usableWidth, pageHeight - 12);

    pdfDoc.setFont('helvetica', 'normal');
    pdfDoc.setFontSize(7);
    pdfDoc.setTextColor(148, 163, 184); // slate-400
    pdfDoc.text('GastosApp — Control Financiero Inteligente', margin, pageHeight - 7);
    pdfDoc.text(`Página ${p} de ${totalPages}`, margin + usableWidth, pageHeight - 7, {
      align: 'right',
    });
  }

  const blob = pdfDoc.output('blob');
  const filename = `${doc.filenameBase || 'reporte-gastosapp'}.pdf`;
  const mimeType = 'application/pdf';

  return { blob, filename, mimeType };
}
