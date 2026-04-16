import { NextResponse } from "next/server";
import { requireSession } from "../../../../lib/auth";
import { getXtzInvoiceById } from "@lsc/db";
import type { XtzInvoiceItemRow } from "@lsc/db";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const NAVY = [26, 35, 50] as const; // #1a2332
const WHITE = [255, 255, 255] as const;
const GRAY = [107, 114, 128] as const;
const DARK = [31, 41, 55] as const;
const LIGHT_BG = [249, 250, 251] as const;

const fmt = (n: number, currency: string): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

const SECTION_LABELS: Record<string, string> = {
  payroll: "PAYROLL",
  mdg_fees: "THIRD PARTY VENDORS",
  reimbursement: "REIMBURSEMENTS",
  software_expense: "SOFTWARE EXPENSES",
  provision: "PROVISIONS",
  other: "OTHER"
};

const SECTION_ORDER = ["payroll", "mdg_fees", "reimbursement", "software_expense", "provision", "other"];

export async function GET(
  _request: Request,
  context: { params: Promise<{ invoiceId: string }> }
) {
  try {
    await requireSession();
    const { invoiceId } = await context.params;

    const result = await getXtzInvoiceById(invoiceId);
    if (!result) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }
    const { header, items } = result;

    // Group items by section
    const grouped: Record<string, XtzInvoiceItemRow[]> = {};
    for (const item of items) {
      if (!grouped[item.section]) grouped[item.section] = [];
      grouped[item.section]!.push(item);
    }

    const sectionTotals: Record<string, number> = {};
    for (const sec of Object.keys(grouped)) {
      sectionTotals[sec] = grouped[sec]!.reduce((s, i) => s + i.amount, 0);
    }

    const isXteIssuer =
      header.issuerLegalName.includes("Esports Tech") ||
      header.issuerLegalName.includes("XTZ Esports");

    // ── Build PDF ──
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 18;
    const contentWidth = pageWidth - margin * 2;

    // ── Top navy bar ──
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pageWidth, 4, "F");

    // ── Company name + address (left) ──
    let y = 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...NAVY);
    doc.text(header.issuerLegalName, margin, y);

    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    const addressLines = header.issuerAddress.split("\n");
    for (const line of addressLines) {
      doc.text(line, margin, y);
      y += 3.5;
    }

    // ── INVOICE title (right) ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    doc.setTextColor(...NAVY);
    doc.text("INVOICE", pageWidth - margin, 18, { align: "right" });

    // ── Meta fields (right) ──
    const metaX = pageWidth - margin;
    const labelX = metaX - 55;
    let metaY = 26;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");

    const metaRows = [
      ["INVOICE NO:", header.invoiceNumber],
      ["DATE:", header.invoiceDate],
      ["PERIOD:", header.payrollMonth],
      ["PAYMENT TERMS:", "Payable on Receipt"]
    ];
    for (const [label, value] of metaRows) {
      doc.setTextColor(...GRAY);
      doc.text(label, labelX, metaY, { align: "right" });
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.text(value, metaX, metaY, { align: "right" });
      doc.setFont("helvetica", "normal");
      metaY += 4.5;
    }

    // ── BILL TO ──
    y = Math.max(y, metaY) + 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text("BILL TO", margin, y);
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(header.recipientLegalName, margin, y);
    y += 4;

    if (header.recipientAddress) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      for (const line of header.recipientAddress.split("\n")) {
        doc.text(line, margin, y);
        y += 3.5;
      }
    }

    y += 6;

    // ── Line items by section ──
    for (const sec of SECTION_ORDER) {
      if (!grouped[sec]) continue;
      const sectionItems = grouped[sec]!;

      // Section header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(SECTION_LABELS[sec] ?? sec.toUpperCase(), margin, y);
      y += 4;

      // Table
      const tableData = sectionItems.map((item) => [
        item.description + (item.referenceNote ? `\n${item.referenceNote}` : ""),
        String(item.quantity),
        fmt(item.unitPrice, header.currency),
        fmt(item.amount, header.currency)
      ]);

      // Subtotal row
      tableData.push([
        `${SECTION_LABELS[sec]} SUBTOTAL`,
        "",
        "",
        fmt(sectionTotals[sec] ?? 0, header.currency)
      ]);

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["DESCRIPTION", "QTY", "UNIT PRICE", "AMOUNT"]],
        body: tableData,
        theme: "plain",
        headStyles: {
          fillColor: [...NAVY],
          textColor: [...WHITE],
          fontSize: 7,
          fontStyle: "bold",
          cellPadding: 3,
          halign: "left"
        },
        columnStyles: {
          0: { cellWidth: contentWidth * 0.50, fontSize: 8 },
          1: { cellWidth: contentWidth * 0.10, halign: "center", fontSize: 8 },
          2: { cellWidth: contentWidth * 0.20, halign: "right", fontSize: 8 },
          3: { cellWidth: contentWidth * 0.20, halign: "right", fontSize: 8, fontStyle: "bold" }
        },
        bodyStyles: {
          textColor: [...DARK],
          fontSize: 8,
          cellPadding: 3
        },
        alternateRowStyles: {
          fillColor: [...LIGHT_BG]
        },
        didParseCell: (data) => {
          // Style the subtotal row
          if (data.row.index === tableData.length - 1 && data.section === "body") {
            data.cell.styles.fillColor = [243, 244, 246];
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fontSize = 7;
            data.cell.styles.textColor = [...DARK];
          }
        }
      });

      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }

    // ── Totals ──
    const totalsX = pageWidth - margin - 80;
    y += 2;

    // Subtotal
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text("Subtotal", totalsX, y);
    doc.setTextColor(...DARK);
    doc.text(fmt(header.subtotal, header.currency), pageWidth - margin, y, { align: "right" });
    y += 5;

    // Tax
    doc.setTextColor(...GRAY);
    doc.text("Tax (0%)", totalsX, y);
    doc.setTextColor(...DARK);
    doc.text(fmt(header.taxAmount, header.currency), pageWidth - margin, y, { align: "right" });
    y += 7;

    // TOTAL DUE badge
    doc.setFillColor(...NAVY);
    doc.roundedRect(totalsX - 4, y - 4, 84 + 4, 10, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    doc.text("TOTAL DUE", totalsX, y + 2.5);
    doc.setFontSize(11);
    doc.text(fmt(header.totalAmount, header.currency), pageWidth - margin, y + 3, { align: "right" });

    y += 18;

    // ── Check if we need a new page for bank details ──
    if (y > 240) {
      doc.addPage();
      y = 18;
    }

    // ── BANK DETAILS ──
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text("BANK DETAILS", margin, y);
    y += 5;

    // Bank details box
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);

    const bankRows: [string, string][] = [
      ["Beneficiary", header.issuerLegalName],
      ["Address", header.issuerAddress.replace(/\n/g, ", ")],
      ["Bank Name", header.bankName],
      ["Branch Address", header.bankBranchAddress || header.bankBranch || ""],
      ["Account No.", header.bankAccountNumber]
    ];

    if (isXteIssuer) {
      bankRows.push(["IBAN", header.bankIfsc]);
      bankRows.push(["Routing Code", header.bankAdCode]);
    } else {
      bankRows.push(["IFSC", header.bankIfsc]);
      bankRows.push(["AD Code", header.bankAdCode]);
    }
    bankRows.push(["SWIFT Code", header.bankSwift]);

    if (!isXteIssuer && header.issuerGstin) {
      bankRows.push(["GSTIN", header.issuerGstin]);
      bankRows.push(["PAN", header.issuerPan]);
    }

    // Draw bordered box
    const boxX = margin;
    const boxWidth = contentWidth;
    const rowHeight = 6.5;
    const boxHeight = bankRows.length * rowHeight;
    doc.rect(boxX, y, boxWidth, boxHeight);

    for (let i = 0; i < bankRows.length; i++) {
      const [label, value] = bankRows[i];
      const rowY = y + i * rowHeight;

      if (i > 0) {
        doc.setDrawColor(243, 244, 246);
        doc.line(boxX, rowY, boxX + boxWidth, rowY);
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.text(label, boxX + 4, rowY + 4.2);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...DARK);
      // Truncate long values
      const maxValWidth = boxWidth - 40;
      const truncated = doc.getTextWidth(value) > maxValWidth
        ? value.substring(0, 60) + "..."
        : value;
      doc.text(truncated, boxX + 36, rowY + 4.2);
    }

    y += boxHeight + 8;

    // ── Notes ──
    if (header.notes) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.text(`Notes: ${header.notes}`, margin, y);
      y += 6;
    }

    // ── Footer text ──
    y = doc.internal.pageSize.getHeight() - 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    const footerText = `${header.issuerLegalName} • ${header.issuerAddress.split("\n").join(", ")} • Thank you for your business`;
    doc.text(footerText, pageWidth / 2, y, { align: "center", maxWidth: contentWidth });

    // ── Bottom navy bar ──
    doc.setFillColor(...NAVY);
    doc.rect(0, doc.internal.pageSize.getHeight() - 4, pageWidth, 4, "F");

    // ── Output ──
    const pdfBuffer = doc.output("arraybuffer");

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${header.invoiceNumber}.pdf"`,
        "Cache-Control": "no-cache"
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
