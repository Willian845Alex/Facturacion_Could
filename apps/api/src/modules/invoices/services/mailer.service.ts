import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoicesService } from '../invoices.service';
import { SettingsService } from '../../settings/settings.service';
import { SriRideService } from '../../sri/services/sri-ride.service';
import { Invoice } from '../entities/invoice.entity';
import { Setting } from '../../settings/entities/setting.entity';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly apiKey: string | null;
  private readonly apiUrl = 'https://api.brevo.com/v3/smtp/email';

  constructor(
    private readonly config: ConfigService,
    private readonly invoicesService: InvoicesService,
    private readonly settingsService: SettingsService,
    private readonly rideService: SriRideService,
  ) {
    this.apiKey = config.get<string>('BREVO_API_KEY') ?? null;
    if (!this.apiKey) {
      this.logger.warn('BREVO_API_KEY no configurado — envío de emails deshabilitado');
    }
  }

  async sendInvoiceEmail(invoiceId: string): Promise<void> {
    if (!this.apiKey) return;

    const settings = await this.settingsService.get();
    if (!settings.sendInvoiceEmail) return;

    const inv = await this.invoicesService.findById(invoiceId);
    if (!inv.client?.email) return;

    const invoiceNum = this.formatNum(inv);
    const fechaStr = new Date(inv.fechaEmision).toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const senderEmail = this.config.get<string>('SMTP_USER') ?? this.config.get<string>('BREVO_SENDER_EMAIL') ?? '';
    const senderName = settings.nombreComercial;

    // Generar PDF
    let ridePdf: Buffer | null = null;
    try {
      ridePdf = await this.invoicesService.getRide(invoiceId);
    } catch (pdfErr: any) {
      this.logger.warn(`No se pudo generar RIDE para email ${invoiceId}: ${pdfErr.message}`);
    }

    const attachments: any[] = [];
    if (ridePdf) {
      attachments.push({
        name: `FACTURA-${invoiceNum}.pdf`,
        content: ridePdf.toString('base64'),
      });
    }
    if (inv.xmlAutorizado) {
      attachments.push({
        name: `FACTURA-${invoiceNum}.xml`,
        content: Buffer.from(inv.xmlAutorizado).toString('base64'),
      });
    }

    const payload: any = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: inv.client.email, name: inv.client.name }],
      subject: `Factura electrónica No. ${invoiceNum} - ${senderName}`,
      htmlContent: this.buildHtml(settings, inv, invoiceNum, fechaStr),
    };

    if (attachments.length > 0) {
      payload.attachment = attachments;
    }

    await this.sendViaApi(payload);
    this.logger.log(`Email enviado → ${inv.client.email}  factura ${invoiceNum}`);
  }

  async sendCreditNoteEmail(opts: {
    clientEmail: string;
    clientName: string;
    ncSequential: string;
    facturaNum: string;
    total: number;
    motive: string;
    xmlAutorizado: string | null;
    ridePdf?: Buffer | null;
  }): Promise<void> {
    if (!this.apiKey) return;

    const settings = await this.settingsService.get();
    const senderEmail = this.config.get<string>('SMTP_USER') ?? this.config.get<string>('BREVO_SENDER_EMAIL') ?? '';
    const senderName = settings.nombreComercial;

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

    const attachments: any[] = [];
    if (opts.ridePdf) {
      attachments.push({
        name: `NOTA-CREDITO-${opts.ncSequential}.pdf`,
        content: opts.ridePdf.toString('base64'),
      });
    }
    if (opts.xmlAutorizado) {
      attachments.push({
        name: `NC-${opts.ncSequential}.xml`,
        content: Buffer.from(opts.xmlAutorizado).toString('base64'),
      });
    }

    const payload: any = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: opts.clientEmail, name: opts.clientName }],
      subject: `Nota de crédito No. ${opts.ncSequential} - ${senderName}`,
      htmlContent: html,
    };

    if (attachments.length > 0) {
      payload.attachment = attachments;
    }

    await this.sendViaApi(payload);
    this.logger.log(`Email NC enviado → ${opts.clientEmail}  NC ${opts.ncSequential}`);
  }

  // ── API caller ───────────────────────────────────────────────────────────────

  private async sendViaApi(payload: any): Promise<void> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': this.apiKey!,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Brevo API error ${response.status}: ${error}`);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

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
      <tr>
        <td style="background:#1d4ed8;padding:28px 32px;text-align:center;">
          ${logoBlock}
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${this.escape(s.nombreComercial)}</h1>
          <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">RUC: ${this.escape(s.ruc)}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 24px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">Estimado/a <strong>${this.escape(clientName)}</strong>,</p>
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
            Adjunto encontrará su <strong>factura electrónica autorizada por el SRI</strong>.
          </p>
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
                <td style="padding:10px 16px;text-align:right;font-family:monospace;font-weight:600;border-bottom:1px solid #f3f4f6;">${this.escape(invoiceNum)}</td>
              </tr>
              <tr style="background:#fafafa;">
                <td style="padding:10px 16px;color:#374151;border-bottom:1px solid #f3f4f6;">Fecha de emisión</td>
                <td style="padding:10px 16px;text-align:right;border-bottom:1px solid #f3f4f6;">${fechaStr}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#374151;border-bottom:1px solid #f3f4f6;">Total</td>
                <td style="padding:10px 16px;text-align:right;font-size:16px;font-weight:700;color:#1d4ed8;border-bottom:1px solid #f3f4f6;">${total}</td>
              </tr>
              <tr style="background:#fafafa;">
                <td style="padding:10px 16px;color:#374151;">Nro. autorización SRI</td>
                <td style="padding:10px 16px;text-align:right;font-family:monospace;font-size:11px;word-break:break-all;">${this.escape(authDisplay)}</td>
              </tr>
            </tbody>
          </table>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:28px;">
            <p style="margin:0;font-size:13px;color:#166534;">
              ✅ <strong>Documento válido como comprobante tributario.</strong>
            </p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center">
                <a href="${sriPortalUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">
                  Ver factura en el portal SRI →
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">${this.escape(s.razonSocial)}</p>
          <p style="margin:0 0 4px;font-size:12px;color:#6b7280;">RUC: ${this.escape(s.ruc)} &nbsp;|&nbsp; ${this.escape(s.dirMatriz)}</p>
          ${s.telefono ? `<p style="margin:0;font-size:12px;color:#6b7280;">Tel: ${this.escape(s.telefono)}</p>` : ''}
          <p style="margin:12px 0 0;font-size:11px;color:#9ca3af;">Mensaje generado automáticamente.</p>
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