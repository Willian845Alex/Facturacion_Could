import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';

// Puppeteer loaded lazily so the module resolves even if the binary isn't
// present at startup; the error surfaces only when a PDF is requested.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const puppeteer = require('puppeteer');

// ─── Data contract ────────────────────────────────────────────────────────────

export interface TarifaIva {
  tarifa: number;       // 0, 5, 8, 15
  subtotal: string;     // formatted decimal
  iva: string;          // formatted decimal
}

export interface RideData {
  // Emisor
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  dirMatriz: string;
  dirEstablecimiento: string;
  logoBase64?: string | null;
  obligadoContabilidad: 'SI' | 'NO';
  contribuyenteRimpe?: string | null;
  ambiente: string;           // '1'=pruebas  '2'=produccion
  estab: string;
  ptoEmi: string;
  secuencial: string;
  claveAcceso: string;
  numeroAutorizacion: string;
  fechaAutorizacion: string;  // DD/MM/YYYY HH:MM:SS
  fechaEmision: string;       // DD/MM/YYYY

  // Comprador
  razonSocialComprador: string;
  tipoIdentificacion: string;
  identificacionComprador: string;
  direccionComprador?: string;

  // Detalle
  detalles: Array<{
    codigo: string;
    descripcion: string;
    cantidad: string;
    precioUnitario: string;
    descuento: string;
    precioTotalSinIva: string;
  }>;

  // Totales
  tarifas: TarifaIva[];     // one entry per distinct IVA rate
  descuento: string;
  propina: string;
  total: string;

  // Pago
  formaPago: string;

  // Extras
  infoAdicional?: Array<{ nombre: string; valor: string }>;
}

export interface RideNotaCreditoData {
  // Emisor
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  dirMatriz: string;
  dirEstablecimiento: string;
  logoBase64?: string | null;
  contribuyenteRimpe?: string | null;
  ambiente: string;
  estab: string;
  ptoEmi: string;
  secuencial: string;
  claveAcceso: string;
  numeroAutorizacion: string;
  fechaAutorizacion: string;  // DD/MM/YYYY HH:MM:SS
  fechaEmision: string;       // DD/MM/YYYY

  // Comprador
  razonSocialComprador: string;
  tipoIdentificacion: string;
  identificacionComprador: string;

  // Documento modificado
  numDocModificado: string;           // 001-001-000000073
  fechaEmisionDocSustento: string;    // DD/MM/YYYY
  motive: string;

  // Detalle
  detalles: Array<{
    codigo: string;
    descripcion: string;
    cantidad: string;
    precioUnitario: string;
    descuento: string;
    precioTotalSinIva: string;
  }>;

  // Totales
  tarifas: TarifaIva[];
  descuento: string;
  total: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SriRideService implements OnModuleDestroy {
  private readonly logger = new Logger(SriRideService.name);
  private browser: any = null;

  async onModuleDestroy() {
    if (this.browser) {
      await this.browser.close().catch(() => { });
    }
  }

  private async getBrowser() {
    if (!this.browser || !this.browser.connected) {
      this.browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
    return this.browser;
  }

  async generarRidePdf(data: RideData): Promise<Buffer> {
    const qrDataUrl = await QRCode.toDataURL(data.claveAcceso, {
      width: 100, margin: 1, errorCorrectionLevel: 'M',
    });

    const html = this.buildHtml(data, qrDataUrl);

    let page: any;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        scale: 0.9,
        printBackground: true,
      });
      return Buffer.from(pdf);
    } catch (err: any) {
      this.logger.error('Error generando PDF con Puppeteer: ' + err.message);
      // If the browser crashed, clear the instance so next call re-launches
      this.browser = null;
      throw err;
    } finally {
      if (page) await page.close().catch(() => { });
    }
  }

  async generarRideNotaCredito(data: RideNotaCreditoData): Promise<Buffer> {
    const qrDataUrl = await QRCode.toDataURL(data.claveAcceso, {
      width: 100, margin: 1, errorCorrectionLevel: 'M',
    });
    const html = this.buildHtmlNC(data, qrDataUrl);
    let page: any;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4',
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
        scale: 0.9,
        printBackground: true,
      });
      return Buffer.from(pdf);
    } catch (err: any) {
      this.logger.error('Error generando PDF NC con Puppeteer: ' + err.message);
      this.browser = null;
      throw err;
    } finally {
      if (page) await page.close().catch(() => { });
    }
  }

  private buildHtmlNC(d: RideNotaCreditoData, qrUrl: string): string {
    const ncNum = `${d.estab}-${d.ptoEmi}-${d.secuencial}`;
    const isPruebas = d.ambiente === '1';

    const logoCell = d.logoBase64
      ? `<img src="${d.logoBase64}" alt="logo" style="max-height:70px;max-width:180px;">`
      : `<div style="font-size:13px;font-weight:bold;text-align:center;">${this.esc(d.razonSocial)}</div>`;

    const tarifaRows = d.tarifas.map(t => `
      <tr>
        <td class="tot-label">SUBTOTAL IVA ${t.tarifa}%</td>
        <td class="tot-value">$ ${t.subtotal}</td>
      </tr>
      ${Number(t.iva) > 0 ? `
      <tr>
        <td class="tot-label">IVA ${t.tarifa}%</td>
        <td class="tot-value">$ ${t.iva}</td>
      </tr>` : ''}
    `).join('');

    const detalleRows = d.detalles.map((det, i) => `
      <tr style="${i % 2 === 1 ? 'background:#f9fafb;' : ''}">
        <td>${this.esc(det.codigo)}</td>
        <td>${this.esc(det.descripcion)}</td>
        <td class="right">${det.cantidad}</td>
        <td class="right">${det.precioUnitario}</td>
        <td class="right">${det.descuento}</td>
        <td class="right">${det.precioTotalSinIva}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; background: #fff; }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #c0c0c0; padding: 3px 5px; vertical-align: top; }
  .noborder td, .noborder th { border: none; }
  .th { background: #e8e8e8; font-weight: bold; white-space: nowrap; }
  .right { text-align: right; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .section-header td { background: #d1d5db; font-weight: bold; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 6px; }
  .detail-head th { background: #e8e8e8; font-size: 9px; text-align: center; font-weight: bold; }
  .tot-label { text-align: right; font-size: 10px; background: #f9fafb; padding: 3px 8px; }
  .tot-value { text-align: right; font-size: 10px; padding: 3px 8px; white-space: nowrap; }
  .tot-final { font-weight: bold; font-size: 12px; background: #f3f4f6; }
  .access-key { font-size: 8px; font-family: monospace; text-align: center; word-break: break-all; padding: 4px; border: 1px solid #c0c0c0; margin-top: 4px; }
  .auth-box { border: 1.5px solid #555; padding: 4px 6px; margin-bottom: 4px; font-size: 8.5px; }
  .pruebas-badge { background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; font-weight: bold; font-size: 9px; text-align: center; padding: 2px 4px; margin-top: 3px; }
  .footer-text { text-align: center; font-weight: bold; font-size: 9px; border: 2px solid #374151; padding: 5px; margin-top: 8px; }
  .spacer { height: 6px; }
  .nc-badge { background: #fee2e2; border: 1.5px solid #dc2626; color: #991b1b; font-size: 13px; font-weight: bold; padding: 3px 8px; margin-bottom: 4px; }
</style>
</head>
<body>

<!-- CABECERA -->
<table>
  <tr>
    <td style="width:200px;text-align:center;padding:10px;vertical-align:middle;">${logoCell}</td>
    <td style="padding:6px 10px;">
      <div class="bold" style="font-size:11px;">${this.esc(d.razonSocial)}</div>
      <div style="margin-top:2px;">${this.esc(d.nombreComercial)}</div>
      <div style="margin-top:4px;font-size:9px;"><strong>Dirección Matriz:</strong> ${this.esc(d.dirMatriz)}</div>
      <div style="margin-top:2px;font-size:9px;"><strong>Dirección Establecimiento:</strong> ${this.esc(d.dirEstablecimiento)}</div>
      ${d.contribuyenteRimpe ? `<div style="margin-top:2px;font-size:8.5px;color:#374151;"><strong>Contribuyente:</strong> ${this.esc(d.contribuyenteRimpe)}</div>` : ''}
      <div style="margin-top:2px;font-size:9px;"><strong>Obligado a llevar contabilidad:</strong> NO</div>
    </td>
    <td style="width:210px;text-align:center;padding:6px;">
      <div class="bold" style="font-size:13px;border:1.5px solid #555;padding:3px 8px;margin-bottom:4px;">RUC: ${this.esc(d.ruc)}</div>
      <div class="nc-badge">NOTA DE CRÉDITO</div>
      <div class="bold" style="font-size:12px;border:1.5px solid #dc2626;padding:3px 8px;margin-bottom:6px;">No. ${this.esc(ncNum)}</div>
      <div class="auth-box">
        <div class="bold" style="font-size:8px;margin-bottom:2px;">NÚMERO DE AUTORIZACIÓN</div>
        <div style="font-size:7.5px;font-family:monospace;word-break:break-all;">${this.esc(d.numeroAutorizacion)}</div>
      </div>
      <div style="font-size:8px;margin-bottom:2px;"><strong>Fecha y Hora de Autorización:</strong><br>${this.esc(d.fechaAutorizacion)}</div>
      <div style="font-size:8px;margin-bottom:2px;"><strong>Ambiente:</strong> ${isPruebas ? 'PRUEBAS' : 'PRODUCCIÓN'}</div>
      <div style="font-size:8px;margin-bottom:4px;"><strong>Emisión:</strong> NORMAL</div>
      <img src="${qrUrl}" alt="QR" style="width:80px;height:80px;">
      ${isPruebas ? `<div class="pruebas-badge">⚠ AMBIENTE DE PRUEBAS</div>` : ''}
    </td>
  </tr>
</table>

<div class="access-key"><strong>CLAVE DE ACCESO: </strong>${this.esc(d.claveAcceso)}</div>
<div class="spacer"></div>

<!-- DATOS DEL COMPRADOR -->
<table>
  <tr class="section-header"><td colspan="4">DATOS DEL COMPRADOR</td></tr>
  <tr>
    <td class="th" style="width:22%;">Razón Social / Nombres</td>
    <td style="width:28%;">${this.esc(d.razonSocialComprador)}</td>
    <td class="th" style="width:22%;">Identificación</td>
    <td style="width:28%;">${this.esc(d.identificacionComprador)} (${this.esc(d.tipoIdentificacion)})</td>
  </tr>
  <tr>
    <td class="th">Fecha Emisión</td>
    <td>${this.esc(d.fechaEmision)}</td>
    <td class="th"></td>
    <td></td>
  </tr>
</table>
<div class="spacer"></div>

<!-- DATOS DEL DOCUMENTO MODIFICADO -->
<table>
  <tr class="section-header"><td colspan="4">DATOS DEL DOCUMENTO MODIFICADO</td></tr>
  <tr>
    <td class="th" style="width:30%;">Comprobante que modifica</td>
    <td style="width:20%;">FACTURA</td>
    <td class="th" style="width:25%;">Número</td>
    <td style="width:25%;">${this.esc(d.numDocModificado)}</td>
  </tr>
  <tr>
    <td class="th">Fecha emisión doc. sustento</td>
    <td>${this.esc(d.fechaEmisionDocSustento)}</td>
    <td class="th">Motivo</td>
    <td>${this.esc(d.motive)}</td>
  </tr>
</table>
<div class="spacer"></div>

<!-- DETALLE -->
<table>
  <tr class="section-header"><td colspan="6">DETALLE</td></tr>
  <tr class="detail-head">
    <th style="width:12%;">Cód. Principal</th>
    <th style="width:*;">Descripción</th>
    <th style="width:8%;">Cantidad</th>
    <th style="width:10%;">Precio Unitario</th>
    <th style="width:9%;">Descuento</th>
    <th style="width:11%;">Precio Total sin IVA</th>
  </tr>
  ${detalleRows}
</table>
<div class="spacer"></div>

<!-- TOTALES -->
<table class="noborder">
  <tr>
    <td style="width:55%;vertical-align:top;border:none;"></td>
    <td style="width:45%;vertical-align:top;border:none;">
      <table>
        <tr class="section-header"><td colspan="2">TOTALES</td></tr>
        ${tarifaRows}
        ${Number(d.descuento) > 0 ? `<tr><td class="tot-label">DESCUENTO</td><td class="tot-value">$ ${d.descuento}</td></tr>` : ''}
        <tr>
          <td class="tot-label tot-final">VALOR TOTAL</td>
          <td class="tot-value tot-final">$ ${d.total}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<div class="footer-text">
  DOCUMENTO GENERADO ELECTRÓNICAMENTE — AUTORIZADO POR EL SERVICIO DE RENTAS INTERNAS
</div>
</body>
</html>`;
  }

  // ─── HTML template ──────────────────────────────────────────────────────────

  private esc(s: string): string {
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private buildHtml(d: RideData, qrUrl: string): string {
    const invoiceNum = `${d.estab}-${d.ptoEmi}-${d.secuencial}`;
    const isPruebas = d.ambiente === '1';

    // Left column: logo or company name
    const logoCell = d.logoBase64
      ? `<img src="${d.logoBase64}" alt="logo" style="max-height:70px;max-width:180px;">`
      : `<div style="font-size:13px;font-weight:bold;text-align:center;">${this.esc(d.razonSocial)}</div>`;

    // IVA rates rows
    const tarifaRows = d.tarifas.map(t => `
      <tr>
        <td class="tot-label">SUBTOTAL IVA ${t.tarifa}%</td>
        <td class="tot-value">$ ${t.subtotal}</td>
      </tr>
      ${Number(t.iva) > 0 ? `
      <tr>
        <td class="tot-label">IVA ${t.tarifa}%</td>
        <td class="tot-value">$ ${t.iva}</td>
      </tr>` : ''}
    `).join('');

    // Detalle rows
    const detalleRows = d.detalles.map((det, i) => `
      <tr style="${i % 2 === 1 ? 'background:#f9fafb;' : ''}">
        <td>${this.esc(det.codigo)}</td>
        <td>${this.esc(det.descripcion)}</td>
        <td class="right">${det.cantidad}</td>
        <td class="right">${det.precioUnitario}</td>
        <td class="right">${det.descuento}</td>
        <td class="right">${det.precioTotalSinIva}</td>
      </tr>
    `).join('');

    // Info adicional rows
    const infoRows = (d.infoAdicional ?? []).map(f => `
      <tr>
        <td class="th">${this.esc(f.nombre)}</td>
        <td>${this.esc(f.valor)}</td>
      </tr>
    `).join('');

    const PAYMENT_LABELS: Record<string, string> = {
      '01': 'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO',
      '16': 'TARJETA DE DÉBITO', '19': 'TARJETA DE CRÉDITO',
      '17': 'DINERO ELECTRÓNICO', '18': 'TARJETA PREPAGO',
      '20': 'OTROS', '15': 'COMPENSACIÓN DE DEUDAS',
    };

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    color: #111;
    background: #fff;
  }
  table { width: 100%; border-collapse: collapse; }
  td, th { border: 1px solid #c0c0c0; padding: 3px 5px; vertical-align: top; }
  .noborder td, .noborder th { border: none; }
  .th { background: #e8e8e8; font-weight: bold; white-space: nowrap; }
  .right { text-align: right; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .section-header td {
    background: #d1d5db;
    font-weight: bold;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 3px 6px;
  }
  .detail-head th {
    background: #e8e8e8;
    font-size: 9px;
    text-align: center;
    font-weight: bold;
  }
  .tot-label { text-align: right; font-size: 10px; background: #f9fafb; padding: 3px 8px; }
  .tot-value { text-align: right; font-size: 10px; padding: 3px 8px; white-space: nowrap; }
  .tot-final { font-weight: bold; font-size: 12px; background: #f3f4f6; }
  .access-key {
    font-size: 8px;
    font-family: monospace;
    text-align: center;
    word-break: break-all;
    padding: 4px;
    border: 1px solid #c0c0c0;
    margin-top: 4px;
  }
  .auth-box {
    border: 1.5px solid #555;
    padding: 4px 6px;
    margin-bottom: 4px;
    font-size: 8.5px;
  }
  .pruebas-badge {
    background: #fef3c7;
    border: 1px solid #f59e0b;
    color: #92400e;
    font-weight: bold;
    font-size: 9px;
    text-align: center;
    padding: 2px 4px;
    margin-top: 3px;
  }
  .footer-text {
    text-align: center;
    font-weight: bold;
    font-size: 9px;
    border: 2px solid #374151;
    padding: 5px;
    margin-top: 8px;
  }
  .spacer { height: 6px; }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════ CABECERA -->
<table>
  <tr>
    <!-- LOGO / NOMBRE EMPRESA -->
    <td style="width:200px;text-align:center;padding:10px;vertical-align:middle;">
      ${logoCell}
    </td>

    <!-- DATOS EMISOR -->
    <td style="padding:6px 10px;">
      <div class="bold" style="font-size:11px;">${this.esc(d.razonSocial)}</div>
      <div style="margin-top:2px;">${this.esc(d.nombreComercial)}</div>
      <div style="margin-top:4px;font-size:9px;">
        <strong>Dirección Matriz:</strong> ${this.esc(d.dirMatriz)}
      </div>
      <div style="margin-top:2px;font-size:9px;">
        <strong>Dirección Establecimiento:</strong> ${this.esc(d.dirEstablecimiento)}
      </div>
      ${d.contribuyenteRimpe ? `
      <div style="margin-top:2px;font-size:8.5px;color:#374151;">
        <strong>Contribuyente:</strong> ${this.esc(d.contribuyenteRimpe)}
      </div>` : ''}
      <div style="margin-top:2px;font-size:9px;">
        <strong>Obligado a llevar contabilidad:</strong> ${d.obligadoContabilidad}
      </div>
    </td>

    <!-- TIPO DOC / NÚMERO / AUTORIZACIÓN / QR -->
    <td style="width:210px;text-align:center;padding:6px;">
      <div class="bold" style="font-size:13px;border:1.5px solid #555;padding:3px 8px;margin-bottom:4px;">
        RUC: ${this.esc(d.ruc)}
      </div>
      <div class="bold" style="font-size:13px;border:1.5px solid #555;padding:3px 8px;margin-bottom:4px;">
        FACTURA
      </div>
      <div class="bold" style="font-size:12px;border:1.5px solid #555;padding:3px 8px;margin-bottom:6px;">
        No. ${this.esc(invoiceNum)}
      </div>

      <div class="auth-box">
        <div class="bold" style="font-size:8px;margin-bottom:2px;">NÚMERO DE AUTORIZACIÓN</div>
        <div style="font-size:7.5px;font-family:monospace;word-break:break-all;">
          ${this.esc(d.numeroAutorizacion)}
        </div>
      </div>
      <div style="font-size:8px;margin-bottom:2px;">
        <strong>Fecha y Hora de Autorización:</strong><br>${this.esc(d.fechaAutorizacion)}
      </div>
      <div style="font-size:8px;margin-bottom:2px;">
        <strong>Ambiente:</strong> ${isPruebas ? 'PRUEBAS' : 'PRODUCCIÓN'}
      </div>
      <div style="font-size:8px;margin-bottom:4px;">
        <strong>Emisión:</strong> NORMAL
      </div>

      <img src="${qrUrl}" alt="QR" style="width:80px;height:80px;">

      ${isPruebas ? `<div class="pruebas-badge">⚠ AMBIENTE DE PRUEBAS</div>` : ''}
    </td>
  </tr>
</table>

<!-- CLAVE DE ACCESO -->
<div class="access-key">
  <strong>CLAVE DE ACCESO: </strong>${this.esc(d.claveAcceso)}
</div>

<div class="spacer"></div>

<!-- ═══════════════════════════════════════════════════ DATOS COMPRADOR -->
<table>
  <tr class="section-header"><td colspan="4">DATOS DEL COMPRADOR</td></tr>
  <tr>
    <td class="th" style="width:22%;">Razón Social / Nombres</td>
    <td style="width:28%;">${this.esc(d.razonSocialComprador)}</td>
    <td class="th" style="width:22%;">Identificación</td>
    <td style="width:28%;">${this.esc(d.identificacionComprador)} (${this.esc(d.tipoIdentificacion)})</td>
  </tr>
  <tr>
    <td class="th">Fecha Emisión</td>
    <td>${this.esc(d.fechaEmision)}</td>
    <td class="th">Dirección</td>
    <td>${this.esc(d.direccionComprador ?? '')}</td>
  </tr>
</table>

<div class="spacer"></div>

<!-- ═══════════════════════════════════════════════════ DETALLE -->
<table>
  <tr class="section-header"><td colspan="6">DETALLE</td></tr>
  <tr class="detail-head">
    <th style="width:12%;">Cód. Principal</th>
    <th style="width:*;">Descripción</th>
    <th style="width:8%;">Cantidad</th>
    <th style="width:10%;">Precio Unitario</th>
    <th style="width:9%;">Descuento</th>
    <th style="width:11%;">Precio Total sin IVA</th>
  </tr>
  ${detalleRows}
</table>

<div class="spacer"></div>

<!-- ═════════════════════════════════════════ INFO ADICIONAL (opcional) -->
${(d.infoAdicional?.length ?? 0) > 0 ? `
<table>
  <tr class="section-header"><td colspan="2">INFORMACIÓN ADICIONAL</td></tr>
  ${infoRows}
</table>
<div class="spacer"></div>
` : ''}

<!-- ═══════════════════════════════════════════ TOTALES + FORMA DE PAGO -->
<table class="noborder">
  <tr>
    <!-- FORMA DE PAGO -->
    <td style="width:55%;vertical-align:top;">
      <table>
        <tr class="section-header"><td colspan="4">FORMA DE PAGO</td></tr>
        <tr>
          <th style="width:40%;">Forma de Pago</th>
          <th style="width:20%;">Valor</th>
          <th style="width:20%;">Plazo</th>
          <th style="width:20%;">Tiempo</th>
        </tr>
        <tr>
          <td>${PAYMENT_LABELS[d.formaPago] ?? this.esc(d.formaPago)}</td>
          <td class="right">$ ${d.total}</td>
          <td class="center">—</td>
          <td class="center">—</td>
        </tr>
      </table>
    </td>

    <!-- TOTALES -->
    <td style="width:45%;vertical-align:top;">
      <table>
        <tr class="section-header"><td colspan="2">TOTALES</td></tr>
        ${tarifaRows}
        ${Number(d.descuento) > 0 ? `
        <tr>
          <td class="tot-label">DESCUENTO</td>
          <td class="tot-value">$ ${d.descuento}</td>
        </tr>` : ''}
        ${Number(d.propina) > 0 ? `
        <tr>
          <td class="tot-label">PROPINA</td>
          <td class="tot-value">$ ${d.propina}</td>
        </tr>` : ''}
        <tr>
          <td class="tot-label tot-final">VALOR TOTAL</td>
          <td class="tot-value tot-final">$ ${d.total}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- ═══════════════════════════════════════════════════════════ PIE -->
<div class="footer-text">
  DOCUMENTO GENERADO ELECTRÓNICAMENTE — AUTORIZADO POR EL SERVICIO DE RENTAS INTERNAS
</div>

</body>
</html>`;
  }
}
