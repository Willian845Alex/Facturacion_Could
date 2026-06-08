import { Injectable, Logger } from '@nestjs/common';
import * as QRCode from 'qrcode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsFonts = require('pdfmake/build/vfs_fonts');

// ─── Data contracts ───────────────────────────────────────────────────────────

export interface TarifaIva {
  tarifa: number;
  subtotal: string;
  iva: string;
}

export interface RideData {
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  dirMatriz: string;
  dirEstablecimiento: string;
  logoBase64?: string | null;
  obligadoContabilidad: 'SI' | 'NO';
  contribuyenteRimpe?: string | null;
  ambiente: string;
  estab: string;
  ptoEmi: string;
  secuencial: string;
  claveAcceso: string;
  numeroAutorizacion: string;
  fechaAutorizacion: string;
  fechaEmision: string;
  razonSocialComprador: string;
  tipoIdentificacion: string;
  identificacionComprador: string;
  direccionComprador?: string;
  detalles: Array<{
    codigo: string;
    descripcion: string;
    cantidad: string;
    precioUnitario: string;
    descuento: string;
    precioTotalSinIva: string;
  }>;
  tarifas: TarifaIva[];
  descuento: string;
  propina: string;
  total: string;
  formaPago: string;
  infoAdicional?: Array<{ nombre: string; valor: string }>;
}

export interface RideNotaCreditoData {
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
  fechaAutorizacion: string;
  fechaEmision: string;
  razonSocialComprador: string;
  tipoIdentificacion: string;
  identificacionComprador: string;
  numDocModificado: string;
  fechaEmisionDocSustento: string;
  motive: string;
  detalles: Array<{
    codigo: string;
    descripcion: string;
    cantidad: string;
    precioUnitario: string;
    descuento: string;
    precioTotalSinIva: string;
  }>;
  tarifas: TarifaIva[];
  descuento: string;
  total: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  '01': 'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO',
  '16': 'TARJETA DE DÉBITO',
  '19': 'TARJETA DE CRÉDITO',
  '17': 'DINERO ELECTRÓNICO',
  '18': 'TARJETA PREPAGO',
  '20': 'OTROS',
  '15': 'COMPENSACIÓN DE DEUDAS',
};

const FONTS = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};

const H_BG = '#d1d5db';
const ROW_ALT = '#f9fafb';
const TOTAL_BG = '#f3f4f6';
const BORDER_COLOR = '#c0c0c0';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SriRideService {
  private readonly logger = new Logger(SriRideService.name);
  private printer: any;

  constructor() {
    this.printer = new PdfPrinter(FONTS);
    // Registrar fuentes virtuales incluidas en pdfmake
    if (vfsFonts?.pdfMake?.vfs) {
      (this.printer as any).vfs = vfsFonts.pdfMake.vfs;
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async generarRidePdf(data: RideData): Promise<Buffer> {
    const qrDataUrl = await QRCode.toDataURL(data.claveAcceso, {
      width: 100, margin: 1, errorCorrectionLevel: 'M',
    });
    const docDef = this.buildFacturaDocDef(data, qrDataUrl);
    return this.generateBuffer(docDef);
  }

  async generarRideNotaCredito(data: RideNotaCreditoData): Promise<Buffer> {
    const qrDataUrl = await QRCode.toDataURL(data.claveAcceso, {
      width: 100, margin: 1, errorCorrectionLevel: 'M',
    });
    const docDef = this.buildNotaCreditoDocDef(data, qrDataUrl);
    return this.generateBuffer(docDef);
  }

  // ── Buffer generator ─────────────────────────────────────────────────────────

  private generateBuffer(docDef: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = this.printer.createPdfKitDocument(docDef);
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
        pdfDoc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ── Factura DocDef ────────────────────────────────────────────────────────────

  private buildFacturaDocDef(d: RideData, qrDataUrl: string): any {
    const invoiceNum = `${d.estab}-${d.ptoEmi}-${d.secuencial}`;
    const isPruebas = d.ambiente === '1';

    // Logo cell
    const logoCell: any = d.logoBase64
      ? { image: d.logoBase64, width: 100, alignment: 'center' }
      : { text: d.razonSocial, bold: true, fontSize: 9, alignment: 'center' };

    // Header right column
    const headerRight: any[] = [
      { text: `RUC: ${d.ruc}`, bold: true, fontSize: 9, alignment: 'center', border: [true, true, true, true], margin: [0, 2, 0, 2] },
      { text: 'FACTURA', bold: true, fontSize: 11, alignment: 'center', border: [true, true, true, true], margin: [0, 2, 0, 2] },
      { text: `No. ${invoiceNum}`, bold: true, fontSize: 9, alignment: 'center', border: [true, true, true, true], margin: [0, 2, 0, 2] },
      {
        stack: [
          { text: 'NÚMERO DE AUTORIZACIÓN', bold: true, fontSize: 6.5, alignment: 'center' },
          { text: d.numeroAutorizacion, fontSize: 6, alignment: 'center', font: 'Helvetica' },
        ],
        border: [true, true, true, true],
        margin: [2, 2, 2, 2],
      },
      { text: `Fecha Autorización: ${d.fechaAutorizacion}`, fontSize: 7, margin: [0, 1, 0, 1] },
      { text: `Ambiente: ${isPruebas ? 'PRUEBAS' : 'PRODUCCIÓN'}`, fontSize: 7, margin: [0, 1, 0, 1] },
      { text: 'Emisión: NORMAL', fontSize: 7, margin: [0, 1, 0, 1] },
      { image: qrDataUrl, width: 70, alignment: 'center', margin: [0, 4, 0, 0] },
      ...(isPruebas ? [{
        text: '⚠ AMBIENTE DE PRUEBAS',
        bold: true, fontSize: 7, alignment: 'center',
        color: '#92400e', fillColor: '#fef3c7',
        margin: [0, 2, 0, 0],
      }] : []),
    ];

    // Detalle rows
    const detalleRows = d.detalles.map((det, i) => [
      { text: det.codigo, fontSize: 7, fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.descripcion, fontSize: 7, fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.cantidad, fontSize: 7, alignment: 'right', fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.precioUnitario, fontSize: 7, alignment: 'right', fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.descuento, fontSize: 7, alignment: 'right', fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.precioTotalSinIva, fontSize: 7, alignment: 'right', fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
    ]);

    // Tarifa rows
    const tarifaRows: any[] = [];
    for (const t of d.tarifas) {
      tarifaRows.push([
        { text: `SUBTOTAL IVA ${t.tarifa}%`, fontSize: 7, alignment: 'right', fillColor: ROW_ALT },
        { text: `$ ${t.subtotal}`, fontSize: 7, alignment: 'right' },
      ]);
      if (Number(t.iva) > 0) {
        tarifaRows.push([
          { text: `IVA ${t.tarifa}%`, fontSize: 7, alignment: 'right', fillColor: ROW_ALT },
          { text: `$ ${t.iva}`, fontSize: 7, alignment: 'right' },
        ]);
      }
    }
    if (Number(d.descuento) > 0) {
      tarifaRows.push([
        { text: 'DESCUENTO', fontSize: 7, alignment: 'right', fillColor: ROW_ALT },
        { text: `$ ${d.descuento}`, fontSize: 7, alignment: 'right' },
      ]);
    }
    tarifaRows.push([
      { text: 'VALOR TOTAL', bold: true, fontSize: 8, alignment: 'right', fillColor: TOTAL_BG },
      { text: `$ ${d.total}`, bold: true, fontSize: 8, alignment: 'right', fillColor: TOTAL_BG },
    ]);

    // Info adicional
    const infoRows = (d.infoAdicional ?? []).map(inf => [
      { text: inf.nombre, fontSize: 7, bold: true, fillColor: '#e8e8e8' },
      { text: inf.valor, fontSize: 7 },
    ]);

    return {
      pageSize: 'A4',
      pageMargins: [28, 28, 28, 28],
      defaultStyle: { font: 'Helvetica', fontSize: 8 },
      content: [
        // ── HEADER ──
        {
          table: {
            widths: [140, '*', 160],
            body: [[
              { stack: [logoCell], border: [true, true, true, true], margin: [4, 8, 4, 8], alignment: 'center' },
              {
                stack: [
                  { text: d.razonSocial, bold: true, fontSize: 9 },
                  { text: d.nombreComercial, fontSize: 8, margin: [0, 2, 0, 0] },
                  { text: [{ text: 'Dirección Matriz: ', bold: true }, d.dirMatriz], fontSize: 7.5, margin: [0, 3, 0, 0] },
                  { text: [{ text: 'Dir. Establecimiento: ', bold: true }, d.dirEstablecimiento], fontSize: 7.5, margin: [0, 2, 0, 0] },
                  ...(d.contribuyenteRimpe ? [{ text: [{ text: 'Contribuyente: ', bold: true }, d.contribuyenteRimpe], fontSize: 7, margin: [0, 2, 0, 0] }] : []),
                  { text: [{ text: 'Obligado a llevar contabilidad: ', bold: true }, d.obligadoContabilidad], fontSize: 7.5, margin: [0, 2, 0, 0] },
                ],
                border: [true, true, true, true],
                margin: [6, 6, 6, 6],
              },
              { stack: headerRight, border: [true, true, true, true], margin: [4, 4, 4, 4] },
            ]],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
        },

        // ── CLAVE ACCESO ──
        {
          table: {
            widths: ['*'],
            body: [[{ text: `CLAVE DE ACCESO: ${d.claveAcceso}`, fontSize: 7, alignment: 'center', margin: [0, 2, 0, 2] }]],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
          margin: [0, 4, 0, 4],
        },

        // ── DATOS COMPRADOR ──
        this.sectionTitle('DATOS DEL COMPRADOR'),
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'Razón Social / Nombres', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: d.razonSocialComprador, fontSize: 7 },
                { text: 'Identificación', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: `${d.identificacionComprador} (${d.tipoIdentificacion})`, fontSize: 7 },
              ],
              [
                { text: 'Fecha Emisión', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: d.fechaEmision, fontSize: 7 },
                { text: 'Dirección', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: d.direccionComprador ?? '', fontSize: 7 },
              ],
            ],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
          margin: [0, 0, 0, 4],
        },

        // ── DETALLE ──
        this.sectionTitle('DETALLE'),
        {
          table: {
            widths: ['12%', '33%', '8%', '12%', '10%', '15%'],
            body: [
              [
                { text: 'Cód. Principal', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'Descripción', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'Cantidad', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'Precio Unit.', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'Descuento', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'P. Total sin IVA', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
              ],
              ...detalleRows,
            ],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
          margin: [0, 0, 0, 4],
        },

        // ── INFO ADICIONAL ──
        ...(infoRows.length > 0 ? [
          this.sectionTitle('INFORMACIÓN ADICIONAL'),
          {
            table: { widths: ['30%', '70%'], body: infoRows },
            layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
            margin: [0, 0, 0, 4],
          },
        ] : []),

        // ── FORMA DE PAGO + TOTALES ──
        {
          columns: [
            {
              width: '55%',
              stack: [
                this.sectionTitle('FORMA DE PAGO'),
                {
                  table: {
                    widths: ['46%', '22%', '16%', '16%'],
                    body: [
                      [
                        { text: 'Forma de Pago', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                        { text: 'Valor', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                        { text: 'Plazo', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                        { text: 'Tiempo', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                      ],
                      [
                        { text: PAYMENT_LABELS[d.formaPago] ?? d.formaPago, fontSize: 7 },
                        { text: `$ ${d.total}`, fontSize: 7, alignment: 'right' },
                        { text: '—', fontSize: 7, alignment: 'center' },
                        { text: '—', fontSize: 7, alignment: 'center' },
                      ],
                    ],
                  },
                  layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
                },
              ],
            },
            { width: 8, text: '' },
            {
              width: '*',
              stack: [
                this.sectionTitle('TOTALES'),
                {
                  table: {
                    widths: ['60%', '40%'],
                    body: tarifaRows,
                  },
                  layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
                },
              ],
            },
          ],
          margin: [0, 0, 0, 8],
        },

        // ── FOOTER ──
        {
          table: {
            widths: ['*'],
            body: [[{
              text: 'DOCUMENTO GENERADO ELECTRÓNICAMENTE — AUTORIZADO POR EL SERVICIO DE RENTAS INTERNAS',
              bold: true, fontSize: 7.5, alignment: 'center', margin: [0, 4, 0, 4],
            }]],
          },
          layout: { hLineColor: () => '#374151', vLineColor: () => '#374151', hLineWidth: () => 1.5, vLineWidth: () => 1.5 },
        },
      ],
    };
  }

  // ── Nota Crédito DocDef ───────────────────────────────────────────────────────

  private buildNotaCreditoDocDef(d: RideNotaCreditoData, qrDataUrl: string): any {
    const ncNum = `${d.estab}-${d.ptoEmi}-${d.secuencial}`;
    const isPruebas = d.ambiente === '1';

    const logoCell: any = d.logoBase64
      ? { image: d.logoBase64, width: 100, alignment: 'center' }
      : { text: d.razonSocial, bold: true, fontSize: 9, alignment: 'center' };

    const headerRight: any[] = [
      { text: `RUC: ${d.ruc}`, bold: true, fontSize: 9, alignment: 'center', border: [true, true, true, true], margin: [0, 2, 0, 2] },
      { text: 'NOTA DE CRÉDITO', bold: true, fontSize: 11, alignment: 'center', color: '#991b1b', fillColor: '#fee2e2', border: [true, true, true, true], margin: [0, 2, 0, 2] },
      { text: `No. ${ncNum}`, bold: true, fontSize: 9, alignment: 'center', border: [true, true, true, true], margin: [0, 2, 0, 2] },
      {
        stack: [
          { text: 'NÚMERO DE AUTORIZACIÓN', bold: true, fontSize: 6.5, alignment: 'center' },
          { text: d.numeroAutorizacion, fontSize: 6, alignment: 'center' },
        ],
        border: [true, true, true, true],
        margin: [2, 2, 2, 2],
      },
      { text: `Fecha Autorización: ${d.fechaAutorizacion}`, fontSize: 7, margin: [0, 1, 0, 1] },
      { text: `Ambiente: ${isPruebas ? 'PRUEBAS' : 'PRODUCCIÓN'}`, fontSize: 7, margin: [0, 1, 0, 1] },
      { image: qrDataUrl, width: 70, alignment: 'center', margin: [0, 4, 0, 0] },
      ...(isPruebas ? [{ text: '⚠ AMBIENTE DE PRUEBAS', bold: true, fontSize: 7, alignment: 'center', color: '#92400e', fillColor: '#fef3c7', margin: [0, 2, 0, 0] }] : []),
    ];

    const detalleRows = d.detalles.map((det, i) => [
      { text: det.codigo, fontSize: 7, fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.descripcion, fontSize: 7, fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.cantidad, fontSize: 7, alignment: 'right', fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.precioUnitario, fontSize: 7, alignment: 'right', fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.descuento, fontSize: 7, alignment: 'right', fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
      { text: det.precioTotalSinIva, fontSize: 7, alignment: 'right', fillColor: i % 2 === 1 ? ROW_ALT : '#ffffff' },
    ]);

    const tarifaRows: any[] = [];
    for (const t of d.tarifas) {
      tarifaRows.push([
        { text: `SUBTOTAL IVA ${t.tarifa}%`, fontSize: 7, alignment: 'right', fillColor: ROW_ALT },
        { text: `$ ${t.subtotal}`, fontSize: 7, alignment: 'right' },
      ]);
      if (Number(t.iva) > 0) {
        tarifaRows.push([
          { text: `IVA ${t.tarifa}%`, fontSize: 7, alignment: 'right', fillColor: ROW_ALT },
          { text: `$ ${t.iva}`, fontSize: 7, alignment: 'right' },
        ]);
      }
    }
    if (Number(d.descuento) > 0) {
      tarifaRows.push([
        { text: 'DESCUENTO', fontSize: 7, alignment: 'right', fillColor: ROW_ALT },
        { text: `$ ${d.descuento}`, fontSize: 7, alignment: 'right' },
      ]);
    }
    tarifaRows.push([
      { text: 'VALOR TOTAL', bold: true, fontSize: 8, alignment: 'right', fillColor: TOTAL_BG },
      { text: `$ ${d.total}`, bold: true, fontSize: 8, alignment: 'right', fillColor: TOTAL_BG },
    ]);

    return {
      pageSize: 'A4',
      pageMargins: [28, 28, 28, 28],
      defaultStyle: { font: 'Helvetica', fontSize: 8 },
      content: [
        {
          table: {
            widths: [140, '*', 160],
            body: [[
              { stack: [logoCell], border: [true, true, true, true], margin: [4, 8, 4, 8], alignment: 'center' },
              {
                stack: [
                  { text: d.razonSocial, bold: true, fontSize: 9 },
                  { text: d.nombreComercial, fontSize: 8, margin: [0, 2, 0, 0] },
                  { text: [{ text: 'Dirección Matriz: ', bold: true }, d.dirMatriz], fontSize: 7.5, margin: [0, 3, 0, 0] },
                  { text: [{ text: 'Dir. Establecimiento: ', bold: true }, d.dirEstablecimiento], fontSize: 7.5, margin: [0, 2, 0, 0] },
                  ...(d.contribuyenteRimpe ? [{ text: [{ text: 'Contribuyente: ', bold: true }, d.contribuyenteRimpe], fontSize: 7, margin: [0, 2, 0, 0] }] : []),
                ],
                border: [true, true, true, true],
                margin: [6, 6, 6, 6],
              },
              { stack: headerRight, border: [true, true, true, true], margin: [4, 4, 4, 4] },
            ]],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
        },

        {
          table: {
            widths: ['*'],
            body: [[{ text: `CLAVE DE ACCESO: ${d.claveAcceso}`, fontSize: 7, alignment: 'center', margin: [0, 2, 0, 2] }]],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
          margin: [0, 4, 0, 4],
        },

        this.sectionTitle('DATOS DEL COMPRADOR'),
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'Razón Social / Nombres', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: d.razonSocialComprador, fontSize: 7 },
                { text: 'Identificación', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: `${d.identificacionComprador} (${d.tipoIdentificacion})`, fontSize: 7 },
              ],
              [
                { text: 'Fecha Emisión', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: d.fechaEmision, fontSize: 7 },
                { text: '', colSpan: 2 }, {},
              ],
            ],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
          margin: [0, 0, 0, 4],
        },

        this.sectionTitle('DATOS DEL DOCUMENTO MODIFICADO'),
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'Comprobante que modifica', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: 'FACTURA', fontSize: 7 },
                { text: 'Número', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: d.numDocModificado, fontSize: 7 },
              ],
              [
                { text: 'Fecha emisión doc. sustento', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: d.fechaEmisionDocSustento, fontSize: 7 },
                { text: 'Motivo', bold: true, fontSize: 7, fillColor: '#e8e8e8' },
                { text: d.motive, fontSize: 7 },
              ],
            ],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
          margin: [0, 0, 0, 4],
        },

        this.sectionTitle('DETALLE'),
        {
          table: {
            widths: ['12%', '33%', '8%', '12%', '10%', '15%'],
            body: [
              [
                { text: 'Cód. Principal', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'Descripción', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'Cantidad', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'Precio Unit.', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'Descuento', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
                { text: 'P. Total sin IVA', bold: true, fontSize: 7, alignment: 'center', fillColor: '#e8e8e8' },
              ],
              ...detalleRows,
            ],
          },
          layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
          margin: [0, 0, 0, 4],
        },

        {
          columns: [
            { width: '55%', text: '' },
            { width: 8, text: '' },
            {
              width: '*',
              stack: [
                this.sectionTitle('TOTALES'),
                {
                  table: { widths: ['60%', '40%'], body: tarifaRows },
                  layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
                },
              ],
            },
          ],
          margin: [0, 0, 0, 8],
        },

        {
          table: {
            widths: ['*'],
            body: [[{
              text: 'DOCUMENTO GENERADO ELECTRÓNICAMENTE — AUTORIZADO POR EL SERVICIO DE RENTAS INTERNAS',
              bold: true, fontSize: 7.5, alignment: 'center', margin: [0, 4, 0, 4],
            }]],
          },
          layout: { hLineColor: () => '#374151', vLineColor: () => '#374151', hLineWidth: () => 1.5, vLineWidth: () => 1.5 },
        },
      ],
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private sectionTitle(title: string): any {
    return {
      table: {
        widths: ['*'],
        body: [[{
          text: title.toUpperCase(),
          bold: true,
          fontSize: 7.5,
          fillColor: H_BG,
          margin: [4, 2, 4, 2],
        }]],
      },
      layout: { hLineColor: () => BORDER_COLOR, vLineColor: () => BORDER_COLOR },
      margin: [0, 0, 0, 0],
    };
  }
}