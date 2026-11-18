/** Vertical slices of a tall canvas, in canvas pixels, so each fits one page. */
export function pageSlices(canvasH: number, sliceH: number): { y: number; h: number }[] {
  const out: { y: number; h: number }[] = []
  for (let y = 0; y < canvasH; y += sliceH) out.push({ y, h: Math.min(sliceH, canvasH - y) })
  return out
}

/**
 * Renders an element to a downloaded A4 PDF. The page is drawn as an image because jsPDF
 * cannot shape Thai text; the libraries load on first click only.
 */
export async function exportPdf(el: HTMLElement, fileName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 36
  const imgW = pdf.internal.pageSize.getWidth() - margin * 2
  const ratio = imgW / canvas.width // pt per canvas pixel
  const sliceH = Math.floor((pdf.internal.pageSize.getHeight() - margin * 2) / ratio)

  pageSlices(canvas.height, sliceH).forEach(({ y, h }, i) => {
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = h
    slice.getContext('2d')!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    if (i > 0) pdf.addPage()
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, h * ratio)
  })
  pdf.save(fileName)
}
