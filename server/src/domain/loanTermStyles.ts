/* Shared by the printed document and the email PDF. */
export const loanTermStyles = `
.loan-term-document, .loan-term-document * { box-sizing: border-box; }
.loan-term-print-page { display: none; }
.loan-term-document[data-term-mode="delivery"], .loan-term-document[data-term-mode="return"] { min-height: 0; }
.loan-term-document[data-term-mode="return"] .loan-term-recipient-copy { border-top: 0 !important; }
.loan-term-document { display: flex; flex-direction: column; box-sizing: border-box; width: 194mm; min-height: 268mm; border: 1.5px solid #000; color: #000; background: #fff; font-family: Arial, sans-serif; font-size: 8pt; line-height: 1.4; }
.loan-term-header { display: grid; grid-template-columns: 30mm minmax(0, 1fr); min-height: 16mm; border-bottom: 1px solid #000; }
.loan-term-brand { display: grid; place-items: center; align-content: center; gap: 1mm; border-right: 1px solid #000; }
.loan-term-brand svg { width: 21mm; height: 9mm; object-fit: contain; filter: grayscale(1) brightness(0); }
.loan-term-brand strong { font-size: 7pt; letter-spacing: 3px; font-weight: 500; }
.loan-term-title { display: grid; align-content: center; justify-items: center; gap: 1mm; padding: 2mm; }
.loan-term-title h2 { margin: 0; color: #000; font-size: 12pt; font-weight: 800; text-align: center; }
.loan-term-title small { font-size: 7pt; }
.loan-term-section { min-width: 0; flex-shrink: 0; color: #000; overflow-wrap: anywhere; }
.loan-term-section > h3 { display: flex; align-items: center; justify-content: space-between; margin: 0; padding: .7mm 2mm; border-bottom: 1px solid #000; background: #e6e6e6; color: #000; font-size: 7.5pt; font-weight: 700; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.loan-term-section + .loan-term-section { border-top: 1px solid #000; }
.loan-term-fields { display: grid; gap: 1.5mm; padding: 1.5mm 2mm; }
.loan-term-field { display: flex; align-items: baseline; gap: 2mm; min-width: 0; }
.loan-term-field span { flex-shrink: 0; font-size: 7.5pt; font-weight: 700; }
.loan-term-field strong { flex: 1; min-width: 0; min-height: 4mm; border-bottom: 1px solid #000; font-size: 8pt; font-weight: 500; overflow-wrap: anywhere; }
.loan-term-recipient-row { display: grid; grid-template-columns: minmax(0, 1fr) 42mm; gap: 3mm; }
.loan-term-product-row { display: grid; grid-template-columns: minmax(0, 1fr) 44mm; gap: 3mm; }
.loan-term-accessory-check { display: grid; grid-template-columns: 23mm minmax(0, 1fr); gap: 2mm; min-height: 4mm; }
.loan-term-accessory-check span { display: flex; align-items: center; gap: 1mm; font-size: 7pt; }
.loan-term-accessory-check i { display: inline-grid; place-items: center; width: 3mm; height: 3mm; border: 1px solid #666; font-size: 8pt; font-style: normal; line-height: 1; }
.loan-term-accessory-check > div { border-bottom: 1px solid #000; }
.loan-term-prose { padding: 1.5mm 2mm; font-size: 8pt; }
.loan-term-prose p { margin: 0; color: #000; line-height: 1.4; }
.loan-term-prose ul { margin: 0; padding: 0; list-style: none; }
.loan-term-prose li::before { content: '- '; }
.loan-term-signatures { display: grid; grid-template-columns: minmax(0, 1fr) 38mm; gap: 6mm; padding: 8mm 2mm 1mm; margin-top: auto; }
.loan-term-signatures > div { min-width: 0; display: grid; align-content: end; gap: .6mm; }
.loan-term-signatures span { font-size: 7pt; font-weight: 700; }
.loan-term-signatures i, .loan-term-signatures strong { min-height: 7mm; border-bottom: 1px solid #000; font-size: 8pt; font-weight: 400; text-align: center; }
.loan-term-declaration { display: flex; flex-direction: column; min-height: 55mm; }
.loan-term-return { display: flex; flex: 1; flex-direction: column; min-height: 58mm; }
.loan-term-observations { display: grid; grid-template-columns: 23mm minmax(0, 1fr); gap: 2mm; align-items: baseline; padding: 7mm 2mm 0; }
.loan-term-observations span { font-size: 7.5pt; font-weight: 700; }
.loan-term-observations strong { min-height: 4mm; padding-bottom: .4mm; border-bottom: 1px solid #000; font-size: 8pt; font-weight: 400; line-height: 1.2; white-space: pre-wrap; overflow-wrap: anywhere; }
.loan-term-return .loan-term-signatures { padding-top: 4mm; }
.loan-term-recipient-copy { border-top: 2px dashed #000 !important; }
.loan-term-recipient-copy em { margin-left: 2mm; color: #d00000; font-size: 7pt; text-transform: none; }

/* Mesmas dimensões usadas para medir o termo antes da impressão. */
.loan-term-print-page[data-print-measuring] {
  display: block !important;
  position: fixed !important;
  top: 0 !important;
  left: -10000px !important;
  width: 194mm !important;
  height: auto !important;
  zoom: 1 !important;
  visibility: hidden !important;
}
.loan-term-print-page[data-print-measuring] .loan-term-document {
  position: static !important;
  width: 194mm !important;
  height: auto !important;
  transform: none !important;
  zoom: 1 !important;
}

/* Assinatura e data próximas às linhas, sem o nome abaixo do desenho. */
.loan-term-signatures .loan-term-signature-mark {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 9mm;
  min-height: 9mm;
  padding-bottom: .4mm;
  font-style: normal;
}
.loan-term-signature-mark svg { display: block; width: 70mm; max-width: 100%; height: 8mm; }
.loan-term-signatures strong {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 9mm;
  min-height: 9mm;
  padding-bottom: .6mm;
  line-height: 1;
}
@media print {
 @page { size: A4 portrait; margin: 8mm; }
  .loan-term-print-page {
    display: block !important;
    position: relative;
    width: 194mm;
    height: 269mm;
    margin: 0;
    padding: 0;
    overflow: visible;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .loan-term-document {
    display: flex !important;
    position: absolute;
    top: 0;
    left: 0;
    width: calc(194mm / var(--loan-term-print-scale, 1));
    height: auto;
    min-height: 268mm;
    margin: 0;
    overflow: visible;
    transform: none;
    zoom: var(--loan-term-print-scale, 1);
    color: #000 !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .loan-term-header, .loan-term-section {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .loan-term-header { flex-shrink: 0; }
}
`
