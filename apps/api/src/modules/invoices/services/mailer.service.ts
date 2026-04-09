import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { InvoicesService } from '../invoices.service';
import { SettingsService } from '../../settings/settings.service';
import { SriRideService } from '../../sri/services/sri-ride.service';
import { Invoice } from '../entities/invoice.entity';
import { Setting } from '../../settings/entities/setting.entity';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor(
    private readonly config: ConfigService,
    private readonly invoicesService: InvoicesService,
    private readonly settingsService: SettingsService,
    private readonly rideService: SriRideService,
  ) {
    const host = config.get<string>('SMTP_HOST');
    if (!host) {
      this.logger.warn('SMTP_HOST no configurado — envío de emails deshabilitado');
      this.transporter = null;
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(config.get<string>('SMTP_PORT') ?? 587),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendInvoiceEmail(invoiceId: string): Promise<void> {
    if (!this.transporter) return;

    const settings = await this.settingsService.get();
    if (!settings.sendInvoiceEmail) return;

    const inv = await this.invoicesService.findById(invoiceId);
    if (!inv.client?.email) return;

    const invoiceNum = this.formatNum(inv);
    const fechaStr = new Date(inv.fechaEmision).toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const from =
      this.config.get<string>('SMTP_FROM') ??
      `"${settings.nombreComercial}" <${this.config.get('SMTP_USER')}>`;

    // Generate RIDE PDF silently (don't fail email if PDF generation fails)
    let ridePdf: Buffer | null = null;
    try {
      ridePdf = await this.invoicesService.getRide(invoiceId);
    } catch (pdfErr) {
      this.logger.warn(`No se pudo generar RIDE para email ${invoiceId}: ${pdfErr.message}`);
    }

    const attachments: nodemailer.SendMailOptions['attachments'] = [];
    if (ridePdf) {
      attachments.push({
        filename: `FACTURA-${invoiceNum}.pdf`,
        content: ridePdf,
        contentType: 'application/pdf',
      });
    }
    if (inv.xmlAutorizado) {
      attachments.push({
        filename: `FACTURA-${invoiceNum}.xml`,
        content: inv.xmlAutorizado,
        contentType: 'application/xml; charset=utf-8',
      });
    }

    await this.transporter.sendMail({
      from,
      to: inv.client.email,
      subject: `Factura electrónica No. ${invoiceNum} - ${settings.nombreComercial}`,
      html: this.buildHtml(settings, inv, invoiceNum, fechaStr),
      attachments,
    });

    this.logger.log(`Email enviado → ${inv.client.email}  factura ${invoiceNum}`);
  }

  async sendCreditNoteEmail(opts: {
    clientEmail: string;
    clientName: string;
    ncSequential: string;     // "001-001-000000001"
    facturaNum: string;       // "001-001-000000073"
    total: number;
    motive: string;
    xmlAutorizado: string | null;
    ridePdf?: Buffer | null;
  }): Promise<void> {
    if (!this.transporter) return;

    const settings = await this.settingsService.get();
    const from =
      this.config.get<string>('SMTP_FROM') ??
      `"${settings.nombreComercial}" <${this.config.get('SMTP_USER')}>`;

    const esc = (s: string) => s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const totalStr = `$${opts.total.toFixed(2)}`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Nota de Crédito</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0"
      style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
      <tr>
        <td style="background:#dc2626;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">Nota de Crédito Electrónica</h1>
          <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">${esc(settings.nombreComercial)} — RUC: ${esc(settings.ruc)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;">Estimado/a <strong>${esc(opts.clientName)}</strong>,</p>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Se ha emitido y autorizado una <strong>nota de crédito electrónica</strong> que anula
            total o parcialmente la factura indicada a continuación.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"
            style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:14px;">
            <tr style="background:#f9fafb;">
              <td style="padding:10px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Nota de crédito No.</td>
              <td style="padding:10px 16px;text-align:right;font-family:monospace;font-weight:600;border-bottom:1px solid #e5e7eb;">${esc(opts.ncSequential)}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Factura anulada</td>
              <td style="padding:10px 16px;text-align:right;font-family:monospace;border-bottom:1px solid #e5e7eb;">${esc(opts.facturaNum)}</td>
            </tr>
            <tr style="background:#fafafa;">
              <td style="padding:10px 16px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Monto nota de crédito</td>
              <td style="padding:10px 16px;text-align:right;font-size:16px;font-weight:700;color:#dc2626;border-bottom:1px solid #e5e7eb;">${esc(totalStr)}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;color:#6b7280;">Motivo</td>
              <td style="padding:10px 16px;text-align:right;">${esc(opts.motive)}</td>
            </tr>
          </table>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#991b1b;">
              Este documento electrónico ha sido autorizado por el SRI. El XML adjunto
              tiene validez tributaria completa.
            </p>
          </div>
        </td>
      </tr>
      <tr>
        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#6b7280;">
            ${esc(settings.razonSocial)} — RUC: ${esc(settings.ruc)} — ${esc(settings.dirMatriz)}
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;">Mensaje generado automáticamente.</p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body></html>`;

    const attachments: nodemailer.SendMailOptions['attachments'] = [];
    if (opts.ridePdf) {
      attachments.push({
        filename: `NOTA-CREDITO-${opts.ncSequential}.pdf`,
        content: opts.ridePdf,
        contentType: 'application/pdf',
      });
    }
    if (opts.xmlAutorizado) {
      attachments.push({
        filename: `NC-${opts.ncSequential}.xml`,
        content: opts.xmlAutorizado,
        contentType: 'application/xml; charset=utf-8',
      });
    }

    await this.transporter.sendMail({
      from,
      to: opts.clientEmail,
      subject: `Nota de crédito No. ${opts.ncSequential} - ${settings.nombreComercial}`,
      html,
      attachments,
    });

    this.logger.log(`Email NC enviado → ${opts.clientEmail}  NC ${opts.ncSequential}`);
  }

  // ─── helpers ────────────────────────────────────────────────────────────────

  private formatNum(inv: Invoice): string {
    if (!inv.branch) return inv.secuencial ?? '';
    return `${inv.branch.codigoEstablecimiento}-${inv.branch.puntoEmision}-${inv.secuencial}`;
  }

  private buildHtml(s: Setting, inv: Invoice, invoiceNum: string, fechaStr: string): string {
    const clientName = inv.client?.name ?? 'Cliente';
    const total = `$${Number(inv.importeTotal).toFixed(2)}`;
    const authNum = inv.numeroAutorizacion ?? '—';
    const authDisplay = authNum !== '—'
      ? authNum.match(/.{1,10}/g)?.join(' ') ?? authNum
      : '—';

    const sriPortalUrl = 'https://srienlinea.sri.gob.ec/sri-en-linea/';

    const logoBlock = s.logoBase64
      ? `<img src="${s.logoBase64}" alt="${s.nombreComercial}" style="max-height:60px;max-width:180px;display:block;margin:0 auto 12px;">`
      : '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Factura electrónica</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

      <!-- CABECERA -->
      <tr>
        <td style="background:#1d4ed8;padding:28px 32px;text-align:center;">
          ${logoBlock}
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">
            ${this.escape(s.nombreComercial)}
          </h1>
          <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">
            RUC: ${this.escape(s.ruc)}
          </p>
        </td>
      </tr>

      <!-- CUERPO -->
      <tr>
        <td style="padding:32px 32px 24px;">

          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Estimado/a <strong>${this.escape(clientName)}</strong>,
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Adjunto encontrará su <strong>factura electrónica autorizada por el SRI</strong>.
            Este documento tiene plena validez tributaria y puede ser descargado desde
            el portal del SRI con el número de autorización indicado a continuación.
          </p>

          <!-- TABLA RESUMEN -->
          <table width="100%" cellpadding="0" cellspacing="0"
            style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:14px;">
            <thead>
              <tr style="background:#f9fafb;">
                <th style="padding:10px 16px;text-align:left;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Detalle</th>
                <th style="padding:10px 16px;text-align:right;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:10px 16px;color:#374151;border-bottom:1px solid #f3f4f6;">Número de factura</td>
                <td style="padding:10px 16px;text-align:right;font-family:monospace;color:#111827;font-weight:600;border-bottom:1px solid #f3f4f6;">${this.escape(invoiceNum)}</td>
              </tr>
              <tr style="background:#fafafa;">
                <td style="padding:10px 16px;color:#374151;border-bottom:1px solid #f3f4f6;">Fecha de emisión</td>
                <td style="padding:10px 16px;text-align:right;color:#111827;border-bottom:1px solid #f3f4f6;">${fechaStr}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#374151;border-bottom:1px solid #f3f4f6;">Total</td>
                <td style="padding:10px 16px;text-align:right;font-size:16px;font-weight:700;color:#1d4ed8;border-bottom:1px solid #f3f4f6;">${total}</td>
              </tr>
              <tr style="background:#fafafa;">
                <td style="padding:10px 16px;color:#374151;">Nro. autorización SRI</td>
                <td style="padding:10px 16px;text-align:right;font-family:monospace;font-size:11px;color:#374151;word-break:break-all;">${this.escape(authDisplay)}</td>
              </tr>
            </tbody>
          </table>

          <!-- NOTA LEGAL -->
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:28px;">
            <p style="margin:0;font-size:13px;color:#166534;">
              ✅ <strong>Documento válido como comprobante tributario.</strong>
              Este comprobante electrónico ha sido autorizado por el Servicio de Rentas Internas del Ecuador.
            </p>
          </div>

          <!-- BOTÓN SRI -->
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <a href="${sriPortalUrl}"
                  style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
                  Ver factura en el portal SRI →
                </a>
              </td>
            </tr>
          </table>

        </td>
      </tr>

      <!-- PIE -->
      <tr>
        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">
            ${this.escape(s.razonSocial)}
          </p>
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">
            RUC: ${this.escape(s.ruc)} &nbsp;|&nbsp; ${this.escape(s.dirMatriz)}
          </p>
          ${s.telefono ? `<p style="margin:0;font-size:12px;color:#6b7280;">Tel: ${this.escape(s.telefono)}</p>` : ''}
          <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">
            Este mensaje fue generado automáticamente. Por favor no responda a este correo.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>

</body>
</html>`;
  }

  private escape(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
