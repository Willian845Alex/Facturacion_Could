import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TicketData {
  empresa: {
    ruc: string
    razonSocial: string
    nombreComercial: string
    dirMatriz: string
    telefono?: string | null
    logoBase64?: string | null
    ambiente: number
  }
  factura: {
    id: string
    claveAcceso: string | null
    secuencial: string | null
    status: string
    fechaEmision: string
    formaPago: string
    subtotal12: number
    subtotal0: number
    totalDescuento: number
    totalIva: number
    importeTotal: number
    numeroAutorizacion: string | null
    fechaAutorizacion: string | null
    branch: { codigoEstablecimiento: string; puntoEmision: string } | null
    client: { name: string; identification: string; identificationType: string } | null
    items: Array<{
      code: string
      description: string
      quantity: number
      unitPrice: number
      discount: number
      ivaRate: number
      subtotal: number
      total: number
    }>
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toFixed(2)
}

function invoiceNum(f: TicketData['factura']) {
  if (!f.branch) return f.secuencial ?? ''
  return `${f.branch.codigoEstablecimiento}-${f.branch.puntoEmision}-${f.secuencial}`
}

function formatAuthGroups(num: string) {
  return num.match(/.{1,10}/g)?.join(' ') ?? num
}

const PAYMENT_LABELS: Record<string, string> = {
  '01': 'EFECTIVO',
  '15': 'COMPENSACIÓN DE DEUDAS',
  '16': 'TARJETA DE DÉBITO',
  '17': 'DINERO ELECTRÓNICO',
  '18': 'TARJETA PREPAGO',
  '19': 'TARJETA DE CRÉDITO',
  '20': 'OTROS',
  '21': 'ENDOSO DE TÍTULOS',
}

const ID_LABELS: Record<string, string> = {
  '04': 'RUC',
  '05': 'CÉDULA',
  '06': 'PASAPORTE',
  '07': 'CONSUMIDOR FINAL',
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TICKET_CSS = `
.tk-root {
  width: 72mm;
  max-width: 72mm;
  font-family: 'Courier New', Courier, monospace;
  font-size: 10pt;
  line-height: 1.4;
  color: #000;
  background: #fff;
  padding: 3mm 2mm 6mm;
  box-sizing: border-box;
}
.tk-center { text-align: center; }
.tk-bold   { font-weight: bold; }
.tk-upper  { text-transform: uppercase; }
.tk-small  { font-size: 8pt; }
.tk-large  { font-size: 13pt; font-weight: bold; }
.tk-mono   { font-family: 'Courier New', monospace; word-break: break-all; }

.tk-divider {
  border: none;
  border-top: 1px dashed #000;
  margin: 3mm 0;
}
.tk-divider-solid {
  border: none;
  border-top: 1px solid #000;
  margin: 2mm 0;
}

.tk-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1mm;
}
.tk-row-label { flex-shrink: 0; margin-right: 2mm; }
.tk-row-value { text-align: right; word-break: break-all; }

.tk-auth {
  margin: 1mm 0 2mm;
  font-size: 7.5pt;
  word-break: break-all;
  line-height: 1.5;
}

.tk-items-head {
  display: grid;
  grid-template-columns: 28px 1fr 46px 46px;
  gap: 0 3px;
  font-weight: bold;
  font-size: 8pt;
  padding-bottom: 1mm;
  border-bottom: 1px solid #000;
  margin-bottom: 1mm;
}
.tk-item-row {
  display: grid;
  grid-template-columns: 28px 1fr 46px 46px;
  gap: 0 3px;
  font-size: 9pt;
  margin-bottom: 0.5mm;
}
.tk-col-qty   { text-align: right; }
.tk-col-desc  { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.tk-col-price { text-align: right; }
.tk-col-total { text-align: right; }

.tk-total-row {
  display: flex;
  justify-content: space-between;
  font-size: 10pt;
  margin-bottom: 0.5mm;
}
.tk-total-final {
  display: flex;
  justify-content: space-between;
  font-size: 13pt;
  font-weight: bold;
  margin: 1mm 0;
}

.tk-logo {
  display: block;
  max-height: 60px;
  max-width: 180px;
  margin: 0 auto 2mm;
}
.tk-qr {
  display: block;
  margin: 3mm auto 2mm;
  width: 80px;
  height: 80px;
}

@media print {
  @page {
    size: 80mm auto;
    margin: 0;
  }
  body {
    margin: 0;
    padding: 0;
    background: white;
  }
  .tk-root {
    width: 72mm;
    margin: 0 auto;
  }
}
`

// ─── Component ────────────────────────────────────────────────────────────────

export default function TicketPrint({ data }: { data: TicketData }) {
  const [qrUrl, setQrUrl] = useState<string>('')
  const { empresa, factura } = data

  useEffect(() => {
    if (factura.claveAcceso) {
      QRCode.toDataURL(factura.claveAcceso, {
        width: 160,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then(url => setQrUrl(url))
        .catch(() => {})
    }
  }, [factura.claveAcceso])

  const fechaEmision = new Date(factura.fechaEmision)
  const fechaStr = fechaEmision.toLocaleDateString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const horaStr = fechaEmision.toLocaleTimeString('es-EC', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const printTime = new Date().toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

  // Group subtotals by IVA rate from items
  const subtotalByRate: Record<number, number> = {}
  for (const item of factura.items) {
    subtotalByRate[item.ivaRate] = (subtotalByRate[item.ivaRate] ?? 0) + item.subtotal
  }
  const ivaRates = Object.keys(subtotalByRate).map(Number).sort((a, b) => a - b)

  const clientIdLabel = ID_LABELS[factura.client?.identificationType ?? '07'] ?? 'ID'
  const paymentLabel = PAYMENT_LABELS[factura.formaPago] ?? factura.formaPago

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: TICKET_CSS }} />

      <div className="tk-root">

        {/* ── CABECERA ─────────────────────────────────────────── */}
        {empresa.logoBase64 && (
          <img className="tk-logo" src={empresa.logoBase64} alt="logo" />
        )}
        <div className="tk-center tk-large tk-upper" style={{ marginBottom: '1mm' }}>
          {empresa.nombreComercial}
        </div>
        <div className="tk-center tk-bold tk-upper tk-small" style={{ marginBottom: '0.5mm' }}>
          {empresa.razonSocial}
        </div>
        <div className="tk-center tk-small">RUC: {empresa.ruc}</div>
        <div className="tk-center tk-small">{empresa.dirMatriz}</div>
        {empresa.telefono && (
          <div className="tk-center tk-small">Tel: {empresa.telefono}</div>
        )}

        <hr className="tk-divider" />

        {/* ── DATOS DEL COMPROBANTE ─────────────────────────────── */}
        <div className="tk-row">
          <span className="tk-row-label">FACTURA No:</span>
          <span className="tk-row-value tk-bold tk-mono">{invoiceNum(factura)}</span>
        </div>

        {factura.claveAcceso && (
          <div style={{ marginBottom: '1mm' }}>
            <div className="tk-small tk-bold">AUTORIZACIÓN:</div>
            <div className="tk-auth tk-mono">
              {formatAuthGroups(factura.claveAcceso)}
            </div>
          </div>
        )}

        <div className="tk-row">
          <span className="tk-row-label tk-small">FECHA: {fechaStr}</span>
          <span className="tk-small">HORA: {horaStr}</span>
        </div>

        <hr className="tk-divider" />

        {/* ── DATOS DEL CLIENTE ─────────────────────────────────── */}
        <div className="tk-row">
          <span className="tk-row-label">CLIENTE:</span>
          <span className="tk-row-value">{factura.client?.name ?? 'CONSUMIDOR FINAL'}</span>
        </div>
        <div className="tk-row">
          <span className="tk-row-label">{clientIdLabel}:</span>
          <span className="tk-row-value tk-mono">
            {factura.client?.identification ?? '9999999999999'}
          </span>
        </div>

        <hr className="tk-divider" />

        {/* ── DETALLE DE PRODUCTOS ──────────────────────────────── */}
        <div className="tk-items-head">
          <span className="tk-col-qty">CAN</span>
          <span className="tk-col-desc">DESCRIPCIÓN</span>
          <span className="tk-col-price">P.U.</span>
          <span className="tk-col-total">TOTAL</span>
        </div>

        {factura.items.map((item, i) => (
          <div key={i} className="tk-item-row">
            <span className="tk-col-qty">{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(2)}</span>
            <span className="tk-col-desc">{item.description}</span>
            <span className="tk-col-price">{fmt(item.unitPrice)}</span>
            <span className="tk-col-total">{fmt(item.total)}</span>
          </div>
        ))}

        <hr className="tk-divider" />

        {/* ── TOTALES ───────────────────────────────────────────── */}
        {ivaRates.map(rate => (
          <div key={rate} className="tk-total-row">
            <span>SUBTOTAL {rate}%:</span>
            <span>${fmt(subtotalByRate[rate])}</span>
          </div>
        ))}

        {factura.totalDescuento > 0 && (
          <div className="tk-total-row">
            <span>DESCUENTO:</span>
            <span>-${fmt(factura.totalDescuento)}</span>
          </div>
        )}

        <div className="tk-total-row">
          <span>IVA:</span>
          <span>${fmt(factura.totalIva)}</span>
        </div>

        <hr className="tk-divider-solid" />

        <div className="tk-total-final">
          <span>TOTAL:</span>
          <span>${fmt(factura.importeTotal)}</span>
        </div>

        <hr className="tk-divider" />

        {/* ── FORMA DE PAGO ─────────────────────────────────────── */}
        <div className="tk-total-row">
          <span>{paymentLabel}:</span>
          <span>${fmt(factura.importeTotal)}</span>
        </div>

        <hr className="tk-divider" />

        {/* ── PIE ───────────────────────────────────────────────── */}
        <div className="tk-center tk-small" style={{ marginTop: '2mm' }}>
          Documento autorizado por el SRI
        </div>
        <div className="tk-center tk-small tk-bold">
          Ambiente: {empresa.ambiente === 2 ? 'PRODUCCIÓN' : 'PRUEBAS'}
        </div>

        <div className="tk-center tk-bold" style={{ fontSize: '11pt', marginTop: '2mm' }}>
          ¡Gracias por su compra!
        </div>

        <div className="tk-center tk-small" style={{ marginTop: '3mm', color: '#555' }}>
          Impreso: {printTime}
        </div>

      </div>
    </>
  )
}
