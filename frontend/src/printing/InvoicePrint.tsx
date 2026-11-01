import React from 'react';
import { Invoice, ShopSettings, api } from '../services/api';
import './invoice-print.css';
import { Printer, X } from 'lucide-react';

interface InvoicePrintProps {
  invoice: Invoice;
  settings: ShopSettings;
  onClose?: () => void;
}

export const InvoicePrint: React.FC<InvoicePrintProps> = ({ invoice, settings, onClose }) => {
  const handlePrint = () => {
    // 1. Electron Native A4 Print IPC
    if (typeof window !== 'undefined' && (window as any).electronAPI?.printInvoice) {
      (window as any).electronAPI.printInvoice().then((res: any) => {
        if (!res?.success && res?.error) {
          console.warn('Electron print returned error, fallback to browser print:', res.error);
          window.print();
        }
      }).catch((err: any) => {
        console.warn('Electron IPC error, fallback to browser print:', err);
        window.print();
      });
      return;
    }

    // 2. Android Native PrintManager Bridge
    if (typeof window !== 'undefined' && (window as any).AndroidPrinter?.print) {
      try {
        (window as any).AndroidPrinter.print();
        return;
      } catch (err) {
        console.warn('AndroidPrinter bridge failed, fallback to browser print:', err);
      }
    }

    // 3. Universal Web Browser Print
    window.print();
  };

  // Helper to split float into Rupees and Paise strings
  const splitRupeesPaise = (num: number) => {
    if (num === null || num === undefined || isNaN(num)) {
      return { rs: '0', ps: '00' };
    }
    const fixed = num.toFixed(2);
    const [rs, ps] = fixed.split('.');
    return { rs, ps };
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Check if supply was Interstate (IGST) or Intrastate (CGST + SGST)
  const isInterstate = (invoice.igst_amount > 0) || (
    Boolean(invoice.state_code && settings.state_code && invoice.state_code.trim() !== settings.state_code.trim())
  );

  // Compute distinct GST rate breakdown for multi-rate invoices
  const rateBreakdownMap = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number }>();
  const totalGoodsSubtotal = invoice.subtotal || 1;
  const transportTotal = invoice.transport_charges || 0;

  invoice.items.forEach(it => {
    if (it.gst_rate > 0) {
      const baseTaxable = it.taxable_amount || (it.quantity * it.unit_price);
      // Apportion transport share if GST bill
      const itemTransportShare = (invoice.is_gst_bill && transportTotal > 0 && totalGoodsSubtotal > 0)
        ? (baseTaxable / totalGoodsSubtotal) * transportTotal
        : 0;
      const effectiveTaxable = baseTaxable + itemTransportShare;

      const existing = rateBreakdownMap.get(it.gst_rate) || { rate: it.gst_rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      existing.taxable = Math.round((existing.taxable + effectiveTaxable) * 100) / 100;
      existing.cgst = Math.round((existing.cgst + (it.cgst_amount || 0)) * 100) / 100;
      existing.sgst = Math.round((existing.sgst + (it.sgst_amount || 0)) * 100) / 100;
      existing.igst = Math.round((existing.igst + (it.igst_amount || 0)) * 100) / 100;
      rateBreakdownMap.set(it.gst_rate, existing);
    }
  });
  const rateBreakdowns = Array.from(rateBreakdownMap.values()).sort((a, b) => a.rate - b.rate);

  // Compute uniform GST rate label if all items have the same rate
  const distinctRates = Array.from(new Set(invoice.items.filter(it => it.gst_rate > 0).map(it => it.gst_rate)));
  const singleRate = distinctRates.length === 1 ? distinctRates[0] : null;

  const cgstLabel = singleRate ? `CGST (${singleRate / 2}%)` : 'CGST';
  const sgstLabel = singleRate ? `SGST (${singleRate / 2}%)` : 'SGST';
  const igstLabel = singleRate ? `IGST (${singleRate}%)` : 'IGST';

  // Total lines to display for realistic bill pad appearance
  const MIN_ROWS = 8;
  const currentItemCount = invoice.items.length;
  const emptyRowsNeeded = Math.max(0, MIN_ROWS - currentItemCount);

  // Splits for currency display
  const grossSubtotal = Math.round(((invoice.subtotal || 0) + (invoice.discount_amount || 0)) * 100) / 100;
  const grossSubtotalSplit = splitRupeesPaise(grossSubtotal);
  const subtotalSplit = splitRupeesPaise(invoice.subtotal || 0);
  const discountSplit = splitRupeesPaise(invoice.discount_amount || 0);
  const cgstSplit = splitRupeesPaise(invoice.cgst_amount || 0);
  const sgstSplit = splitRupeesPaise(invoice.sgst_amount || 0);
  const igstSplit = splitRupeesPaise(invoice.igst_amount || 0);
  const totalTaxSplit = splitRupeesPaise(invoice.total_tax || 0);
  const transportSplit = splitRupeesPaise(invoice.transport_charges || 0);
  const grandTotalSplit = splitRupeesPaise(invoice.total_amount || 0);

  return (
    <div className="flex flex-col items-center">
      {/* Top Action Bar (hidden when printing) */}
      <div className="no-print w-full max-w-[200mm] mb-4 flex items-center justify-between bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-lg">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm">Invoice Preview: {invoice.invoice_number}</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-medium">
            {invoice.is_gst_bill ? (isInterstate ? 'GST Interstate' : 'GST Intrastate') : 'Non-GST Bill'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all shadow-md active:scale-95"
          >
            <Printer className="w-4 h-4" /> Print Invoice
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Printable Invoice Container */}
      <div id="invoice-print-area" className="invoice-container bg-white text-black p-4 text-[12px] leading-tight select-text">
        {/* Top Header Section with 2 columns */}
        <div className="grid grid-cols-12 border-b-2 border-black">
          {/* Shop Details (Left, 7 columns) */}
          <div className="col-span-7 p-2.5 border-r border-black flex flex-col justify-center">
            <h1 className="font-bold text-sm leading-snug tracking-tight text-black mb-1">
              {settings.shop_name}
            </h1>
            <p className="text-[11px] leading-tight text-slate-800 mb-1">
              {settings.address}
            </p>
            {settings.gstin && (
              <p className="font-bold text-[11px] text-black">
                GSTIN: <span className="font-mono">{settings.gstin}</span>
              </p>
            )}
            <div className="text-[10px] text-slate-700 mt-0.5 space-y-0.5">
              {settings.email && <p>E-Mail: {settings.email}</p>}
              {settings.contact_no && <p className="font-semibold">Contact No: {settings.contact_no}</p>}
            </div>
          </div>

          {/* Invoice Meta Box (Right, 5 columns) */}
          <div className="col-span-5 flex flex-col justify-between">
            <div className="py-1.5 text-center font-extrabold text-sm border-b border-black tracking-wider uppercase bg-slate-50 print:bg-transparent">
              {invoice.is_gst_bill ? 'TAX INVOICE' : 'INVOICE'}
            </div>
            <div className="p-2 space-y-1 text-[11px]">
              <div className="flex">
                <span className="font-semibold w-24">Invoice No:</span>
                <span className="font-bold font-mono text-black">{invoice.invoice_number}</span>
              </div>
              <div className="flex">
                <span className="font-semibold w-24">Invoice Date:</span>
                <span>{formatDate(invoice.invoice_date)}</span>
              </div>
              <div className="flex">
                <span className="font-semibold w-24">Payment Mode :</span>
                <span className="font-medium">{invoice.payment_mode || 'Cash'}</span>
              </div>
              <div className="flex text-[10px]">
                <span className="font-semibold w-24">State :</span>
                <span>{invoice.state || settings.state || 'Tamilnadu'}.&nbsp;&nbsp;&nbsp;Code: {invoice.state_code || settings.state_code || '33'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Customer / Party Details Section */}
        <div className="p-2.5 border-b-2 border-black text-[11px] leading-relaxed">
          <div className="font-bold">To</div>
          <div className="flex items-baseline">
            <span className="font-semibold w-8">M/s.</span>
            <span className="flex-1 font-bold text-black border-b border-dotted border-slate-400 min-h-[18px]">
              {invoice.customer_name || 'Counter Customer'}
            </span>
          </div>
          <div className="flex items-baseline mt-0.5">
            <span className="w-8"></span>
            <span className="flex-1 text-slate-800 border-b border-dotted border-slate-400 min-h-[18px]">
              {invoice.customer_address ? `${invoice.customer_address} ` : ''}
              {invoice.customer_phone ? `(Ph: ${invoice.customer_phone})` : ''}
            </span>
          </div>
          <div className="flex items-baseline mt-0.5">
            <span className="font-semibold w-28">Party's GSTIN :</span>
            <span className="flex-1 font-mono font-medium text-black border-b border-dotted border-slate-400 min-h-[18px]">
              {invoice.customer_gstin || ''}
            </span>
          </div>
        </div>

        {/* Products Table */}
        <table className="w-full invoice-table border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-black text-center font-bold bg-slate-50 print:bg-transparent">
              <th className="py-2 px-1 w-10 border-r border-black">Sl.<br/>No.</th>
              <th className="py-2 px-1 w-14 border-r border-black">Unit</th>
              <th className="py-2 px-2 text-left border-r border-black">Name of Product / Service</th>
              <th className="py-2 px-1 w-12 border-r border-black">Qty.</th>
              <th className="py-1 px-1 w-24 border-r border-black">
                <div>Rate Per Unit</div>
                <div className="grid grid-cols-2 border-t border-black text-[9px] mt-0.5">
                  <span className="border-r border-black">Rs.</span>
                  <span>Ps.</span>
                </div>
              </th>
              <th className="py-2 px-1 w-12 border-r border-black">GST<br/>%</th>
              <th className="py-1 px-1 w-28 border-r-0">
                <div>Amount</div>
                <div className="grid grid-cols-2 border-t border-black text-[9px] mt-0.5">
                  <span className="border-r border-black">Rs.</span>
                  <span>Ps.</span>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item, idx) => {
              const rateSplit = splitRupeesPaise(item.unit_price);
              // Amount in product table represents base taxable value (Qty * Rate) before GST
              const amountSplit = splitRupeesPaise(item.taxable_amount || (item.quantity * item.unit_price));

              return (
                <tr key={item.id || idx} className="border-b border-black text-center align-top min-h-[24px]">
                  <td className="py-1.5 px-1 border-r border-black font-medium">{idx + 1}</td>
                  <td className="py-1.5 px-1 border-r border-black">{item.unit}</td>
                  <td className="py-1.5 px-2 text-left border-r border-black font-medium text-black">
                    {item.product_name}
                    {item.product_code && <span className="text-[9px] text-slate-600 ml-1">({item.product_code})</span>}
                  </td>
                  <td className="py-1.5 px-1 border-r border-black font-semibold">{item.quantity}</td>
                  <td className="py-1.5 px-0 border-r border-black">
                    <div className="grid grid-cols-2">
                      <span className="text-right pr-1 border-r border-black font-mono">{rateSplit.rs}</span>
                      <span className="text-center pl-0.5 font-mono">{rateSplit.ps}</span>
                    </div>
                  </td>
                  <td className="py-1.5 px-1 border-r border-black">
                    {invoice.is_gst_bill ? (item.gst_rate > 0 ? `${item.gst_rate}%` : '0%') : '-'}
                  </td>
                  <td className="py-1.5 px-0">
                    <div className="grid grid-cols-2 font-mono">
                      <span className="text-right pr-1 border-r border-black">{amountSplit.rs}</span>
                      <span className="text-center pl-0.5">{amountSplit.ps}</span>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Empty filler rows to preserve authentic printed bill-pad look */}
            {Array.from({ length: emptyRowsNeeded }).map((_, idx) => (
              <tr key={`empty-${idx}`} className="border-b border-black h-6">
                <td className="border-r border-black">&nbsp;</td>
                <td className="border-r border-black">&nbsp;</td>
                <td className="border-r border-black">&nbsp;</td>
                <td className="border-r border-black">&nbsp;</td>
                <td className="border-r border-black">
                  <div className="grid grid-cols-2 h-full">
                    <span className="border-r border-black">&nbsp;</span>
                    <span>&nbsp;</span>
                  </div>
                </td>
                <td className="border-r border-black">&nbsp;</td>
                <td>
                  <div className="grid grid-cols-2 h-full">
                    <span className="border-r border-black">&nbsp;</span>
                    <span>&nbsp;</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Lower Section: Words, Terms & Right Totals */}
        <div className="grid grid-cols-12 border-b-2 border-black">
          {/* Words and Terms (Left 7 columns) */}
          <div className="col-span-7 p-2.5 border-r border-black flex flex-col justify-between">
            <div className="mb-3">
              <div className="font-bold text-[11px] mb-1">Total Amount in words :</div>
              <div className="font-medium italic text-[11px] leading-tight text-slate-900 border-b border-dotted border-slate-400 pb-1">
                {invoice.total_amount_words || 'Zero Rupees Only'}
              </div>
            </div>

            <div>
              <div className="font-bold text-[10px] uppercase tracking-wide text-slate-800 mb-0.5 underline">
                Terms &amp; Conditions
              </div>
              <div className="text-[9.5px] leading-tight text-slate-700 whitespace-pre-line">
                {invoice.terms_and_conditions || settings.default_terms}
              </div>
            </div>
          </div>

          {/* Right Totals Box (5 columns) with Clear Tax Breakdown */}
          <div className="col-span-5 flex flex-col justify-end text-[11px]">
            {invoice.is_gst_bill ? (
              /* GST TAX INVOICE TOTALS BREAKDOWN */
              <>
                {/* Gross Subtotal, Discount & Subtotal (Before GST) */}
                {(invoice.discount_amount || 0) > 0 ? (
                  <>
                    <div className="grid grid-cols-12 border-b border-black py-1 px-2 text-slate-700">
                      <div className="col-span-7 font-medium">Gross Subtotal</div>
                      <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                        <span className="border-r border-black pr-1">{grossSubtotalSplit.rs}</span>
                        <span className="text-center pl-0.5">{grossSubtotalSplit.ps}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 border-b border-black py-1 px-2 text-rose-700">
                      <div className="col-span-7 font-medium">Discount Deducted</div>
                      <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                        <span className="border-r border-black pr-1">-{discountSplit.rs}</span>
                        <span className="text-center pl-0.5">{discountSplit.ps}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 border-b border-black py-1 px-2 bg-slate-50/40 print:bg-transparent font-semibold">
                      <div className="col-span-7">Total Without GST (Subtotal)</div>
                      <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                        <span className="border-r border-black pr-1">{subtotalSplit.rs}</span>
                        <span className="text-center pl-0.5">{subtotalSplit.ps}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-12 border-b border-black py-1 px-2 font-semibold">
                    <div className="col-span-7">Total Without GST (Subtotal)</div>
                    <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                      <span className="border-r border-black pr-1">{subtotalSplit.rs}</span>
                      <span className="text-center pl-0.5">{subtotalSplit.ps}</span>
                    </div>
                  </div>
                )}

                {rateBreakdowns.length > 1 ? (
                  /* Multi-Rate Breakdown */
                  rateBreakdowns.map(rb => {
                    const cgstS = splitRupeesPaise(rb.cgst);
                    const sgstS = splitRupeesPaise(rb.sgst);
                    const igstS = splitRupeesPaise(rb.igst);
                    return isInterstate ? (
                      <div key={rb.rate} className="grid grid-cols-12 border-b border-black py-0.5 px-2 text-[10px]">
                        <div className="col-span-7 font-medium">IGST ({rb.rate}% on ₹{rb.taxable.toFixed(2)})</div>
                        <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                          <span className="border-r border-black pr-1">{igstS.rs}</span>
                          <span className="text-center pl-0.5">{igstS.ps}</span>
                        </div>
                      </div>
                    ) : (
                      <React.Fragment key={rb.rate}>
                        <div className="grid grid-cols-12 border-b border-black py-0.5 px-2 text-[10px]">
                          <div className="col-span-7 font-medium">CGST ({rb.rate / 2}% on ₹{rb.taxable.toFixed(2)})</div>
                          <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                            <span className="border-r border-black pr-1">{cgstS.rs}</span>
                            <span className="text-center pl-0.5">{cgstS.ps}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-12 border-b border-black py-0.5 px-2 text-[10px]">
                          <div className="col-span-7 font-medium">SGST ({rb.rate / 2}% on ₹{rb.taxable.toFixed(2)})</div>
                          <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                            <span className="border-r border-black pr-1">{sgstS.rs}</span>
                            <span className="text-center pl-0.5">{sgstS.ps}</span>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                ) : isInterstate ? (
                  /* Single Rate Interstate: IGST Only */
                  <div className="grid grid-cols-12 border-b border-black py-1 px-2">
                    <div className="col-span-7 font-medium">{igstLabel}</div>
                    <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                      <span className="border-r border-black pr-1">{igstSplit.rs}</span>
                      <span className="text-center pl-0.5">{igstSplit.ps}</span>
                    </div>
                  </div>
                ) : (
                  /* Single Rate Intrastate: CGST and SGST Only */
                  <>
                    <div className="grid grid-cols-12 border-b border-black py-1 px-2">
                      <div className="col-span-7 font-medium">{cgstLabel}</div>
                      <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                        <span className="border-r border-black pr-1">{cgstSplit.rs}</span>
                        <span className="text-center pl-0.5">{cgstSplit.ps}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 border-b border-black py-1 px-2">
                      <div className="col-span-7 font-medium">{sgstLabel}</div>
                      <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                        <span className="border-r border-black pr-1">{sgstSplit.rs}</span>
                        <span className="text-center pl-0.5">{sgstSplit.ps}</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Total GST */}
                <div className="grid grid-cols-12 border-b border-black py-1 px-2 bg-slate-50/50 print:bg-transparent font-semibold">
                  <div className="col-span-7">Total GST</div>
                  <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                    <span className="border-r border-black pr-1">{totalTaxSplit.rs}</span>
                    <span className="text-center pl-0.5">{totalTaxSplit.ps}</span>
                  </div>
                </div>

                {/* Transport Charges if any */}
                {(invoice.transport_charges || 0) > 0 && (
                  <div className="grid grid-cols-12 border-b border-black py-1 px-2">
                    <div className="col-span-7 font-medium">Transport Charges</div>
                    <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                      <span className="border-r border-black pr-1">{transportSplit.rs}</span>
                      <span className="text-center pl-0.5">{transportSplit.ps}</span>
                    </div>
                  </div>
                )}

                {/* Grand Total (Including GST) */}
                <div className="grid grid-cols-12 py-1.5 px-2 bg-slate-50 print:bg-transparent font-extrabold text-xs">
                  <div className="col-span-7 uppercase">Total With GST (Grand Total)</div>
                  <div className="col-span-5 grid grid-cols-2 font-mono text-right text-black font-bold">
                    <span className="border-r border-black pr-1">{grandTotalSplit.rs}</span>
                    <span className="text-center pl-0.5">{grandTotalSplit.ps}</span>
                  </div>
                </div>
              </>
            ) : (
              /* NON-GST BILL TOTALS BREAKDOWN */
              <>
                {/* Subtotal & Discount if any */}
                {(invoice.discount_amount || 0) > 0 ? (
                  <>
                    <div className="grid grid-cols-12 border-b border-black py-1.5 px-2 text-slate-700">
                      <div className="col-span-7 font-medium">Gross Subtotal</div>
                      <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                        <span className="border-r border-black pr-1">{grossSubtotalSplit.rs}</span>
                        <span className="text-center pl-0.5">{grossSubtotalSplit.ps}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 border-b border-black py-1 px-2 text-rose-700">
                      <div className="col-span-7 font-medium">Discount Deducted</div>
                      <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                        <span className="border-r border-black pr-1">-{discountSplit.rs}</span>
                        <span className="text-center pl-0.5">{discountSplit.ps}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 border-b border-black py-1.5 px-2 font-semibold">
                      <div className="col-span-7">Subtotal</div>
                      <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                        <span className="border-r border-black pr-1">{subtotalSplit.rs}</span>
                        <span className="text-center pl-0.5">{subtotalSplit.ps}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-12 border-b border-black py-1.5 px-2 font-semibold">
                    <div className="col-span-7">Subtotal</div>
                    <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                      <span className="border-r border-black pr-1">{subtotalSplit.rs}</span>
                      <span className="text-center pl-0.5">{subtotalSplit.ps}</span>
                    </div>
                  </div>
                )}

                {/* Transport Charges if any */}
                {(invoice.transport_charges || 0) > 0 && (
                  <div className="grid grid-cols-12 border-b border-black py-1.5 px-2">
                    <div className="col-span-7 font-medium">Transport Charges</div>
                    <div className="col-span-5 grid grid-cols-2 font-mono text-right">
                      <span className="border-r border-black pr-1">{transportSplit.rs}</span>
                      <span className="text-center pl-0.5">{transportSplit.ps}</span>
                    </div>
                  </div>
                )}

                {/* Total Amount Payable */}
                <div className="grid grid-cols-12 py-2 px-2 bg-slate-50 print:bg-transparent font-extrabold text-xs">
                  <div className="col-span-7 uppercase">Total Amount Payable</div>
                  <div className="col-span-5 grid grid-cols-2 font-mono text-right text-black font-bold">
                    <span className="border-r border-black pr-1">{grandTotalSplit.rs}</span>
                    <span className="text-center pl-0.5">{grandTotalSplit.ps}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom Signatures & Seal Section */}
        <div className="grid grid-cols-2 p-3 pt-4 items-end">
          {/* Customer Signature */}
          <div className="text-left">
            <div className="h-14"></div>
            <div className="font-bold text-xs uppercase tracking-wide border-t border-black inline-block pt-1 pr-6">
              Customer Signature
            </div>
          </div>

          {/* Authorized Seal & Signature */}
          <div className="text-right flex flex-col items-end">
            <div className="h-16 flex items-center justify-center min-w-[130px] mb-1">
              {(settings as any).cached_seal_base64 || settings.seal_image_path ? (
                <img
                  src={(settings as any).cached_seal_base64 || api.getSealImageUrl()}
                  alt="Authorised Seal"
                  className="max-h-16 max-w-32 object-contain mix-blend-multiply"
                />
              ) : (
                /* Blank space if no seal is uploaded */
                <div className="w-24 h-14 border border-transparent"></div>
              )}
            </div>
            <div className="font-bold text-xs uppercase tracking-wide border-t border-black inline-block pt-1 pl-6">
              Authorised Signature
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
