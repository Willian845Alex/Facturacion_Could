import {
  Injectable, NotFoundException, BadRequestException, ConflictException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { CreditNote, CreditNoteStatus } from './entities/credit-note.entity';
import { Invoice } from './entities/invoice.entity';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { SriXmlService } from '../sri/services/sri-xml.service';
import { SriRideService } from '../sri/services/sri-ride.service';
import { JavaSignerService } from '../sri/services/java-signer.service';
import { SriSoapService } from '../sri/services/sri-soap.service';
import { SettingsService } from '../settings/settings.service';
import { BranchesService } from '../branches/branches.service';
import { ClientsService } from '../clients/clients.service';
import { InventoryService } from '../inventory/inventory.service';
import { MovementType } from '../inventory/entities/inventory-movement.entity';
import { MailerService } from './services/mailer.service';
import { InvoiceStatus, DocumentType } from '@facturacion-ec/shared';

@Injectable()
export class CreditNotesService {
  private readonly logger = new Logger(CreditNotesService.name);

  constructor(
    @InjectRepository(CreditNote) private readonly cnRepo: Repository<CreditNote>,
    @InjectRepository(Invoice)    private readonly invoiceRepo: Repository<Invoice>,
    @InjectQueue('sri-queue')     private readonly sriQueue: Queue,
    private readonly sriXmlService: SriXmlService,
    private readonly sriRideService: SriRideService,
    private readonly javaSignerService: JavaSignerService,
    private readonly sriSoapService: SriSoapService,
    private readonly settingsService: SettingsService,
    private readonly branchesService: BranchesService,
    private readonly clientsService: ClientsService,
    private readonly inventoryService: InventoryService,
    private readonly mailerService: MailerService,
  ) {}

  // ─── Crear nota de crédito ─────────────────────────────────────────────────

  async create(invoiceId: string, dto: CreateCreditNoteDto, userId: string): Promise<CreditNote> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId },
      relations: ['client', 'branch', 'items'],
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    if (invoice.status !== InvoiceStatus.AUTORIZADO) {
      throw new BadRequestException('Solo se pueden anular facturas autorizadas');
    }

    if (!invoice.clientId) {
      throw new BadRequestException(
        'Las facturas a Consumidor Final no pueden anularse.'
      );
    }
    const client = await this.clientsService.findById(invoice.clientId);
    if (client.identificationType === '07' || client.identification === '9999999999999') {
      throw new BadRequestException(
        'Las facturas emitidas a Consumidor Final no pueden anularse mediante nota de crédito ' +
        'según la normativa del SRI Ecuador. Solo se pueden anular facturas emitidas a clientes ' +
        'con identificación (cédula o RUC).',
      );
    }

    // Verificar que no exista ya una nota de crédito activa
    const existing = await this.cnRepo.findOne({
      where: { originalInvoiceId: invoiceId, status: CreditNoteStatus.AUTORIZADO },
    });
    if (existing) {
      throw new ConflictException('Esta factura ya tiene una nota de crédito autorizada');
    }

    if (dto.type === 'PARCIAL' && !dto.amount) {
      throw new BadRequestException('Debe indicar el monto para una nota de crédito parcial');
    }

    const settings  = await this.settingsService.get();
    const branch    = await this.branchesService.findById(invoice.branchId);
    const issueDate = new Date();
    const sequential = await this.getNextSequential();
    const seqPadded  = sequential.padStart(9, '0');
    const ambiente   = String(settings.ambiente);

    const claveAcceso = this.sriXmlService.generarClaveAcceso(
      issueDate,
      DocumentType.NOTA_CREDITO, // '04'
      settings.ruc,
      ambiente,
      branch.codigoEstablecimiento,
      branch.puntoEmision,
      seqPadded,
    );

    // Calcular totales según tipo
    const total = dto.type === 'TOTAL'
      ? Number(invoice.importeTotal)
      : Number(dto.amount!);

    // Construir detalles para el XML
    const detallesXml = this.buildDetallesXml(invoice, dto, total);
    const totalSinImpuestos = detallesXml
      .reduce((s, d) => s + Number(d.precioTotalSinImpuesto), 0)
      .toFixed(2);

    // Construir totalConImpuestos
    const totalConImpuestos = this.buildTotalConImpuestos(invoice, dto, total);

    const xmlData = {
      ambiente,
      tipoEmision: '1',
      razonSocial:   settings.razonSocial,
      nombreComercial: settings.nombreComercial,
      ruc:           settings.ruc,
      claveAcceso,
      estab:         branch.codigoEstablecimiento,
      ptoEmi:        branch.puntoEmision,
      secuencial:    seqPadded,
      dirMatriz:     settings.dirMatriz,
      fechaEmision:  this.formatFecha(issueDate),
      dirEstablecimiento: branch.address,
      tipoIdentificacionComprador: client.identificationType,
      razonSocialComprador: client.name,
      identificacionComprador: client.identification,
      obligadoContabilidad: 'NO' as const,
      numDocModificado: `${branch.codigoEstablecimiento}-${branch.puntoEmision}-${invoice.secuencial}`,
      fechaEmisionDocSustento: this.formatFecha(invoice.fechaEmision),
      totalSinImpuestos,
      valorModificacion: total.toFixed(2),
      motive: dto.motive,
      totalConImpuestos,
      detalles: detallesXml,
      infoAdicional: client.email ? [{ nombre: 'email', valor: client.email }] : undefined,
    };

    const xmlSinFirma = this.sriXmlService.generarXmlNotaCredito(xmlData);
    const xmlFirmado  = await this.javaSignerService.firmarXml(xmlSinFirma);

    const cn = await this.cnRepo.save(
      this.cnRepo.create({
        originalInvoiceId: invoiceId,
        sequential: seqPadded,
        claveAcceso,
        motive: dto.motive,
        type: dto.type,
        status: CreditNoteStatus.PENDIENTE,
        issueDate,
        total,
        xmlSinFirma,
        xmlFirmado,
        branchId: invoice.branchId,
        userId,
      }),
    );

    // Encolar procesamiento SRI
    try {
      await this.sriQueue.add('procesar-nota-credito', { creditNoteId: cn.id }, {
        attempts: 10,
        backoff: { type: 'fixed', delay: 30_000 },
      });
    } catch (err) {
      this.logger.error(`No se pudo encolar la nota de crédito ${cn.id}: ${err.message}`);
    }

    return cn;
  }

  // ─── Consultar por factura ─────────────────────────────────────────────────

  async findByInvoice(invoiceId: string): Promise<CreditNote[]> {
    return this.cnRepo.find({
      where: { originalInvoiceId: invoiceId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<CreditNote> {
    const cn = await this.cnRepo.findOne({ where: { id } });
    if (!cn) throw new NotFoundException('Nota de crédito no encontrada');
    return cn;
  }

  // ─── RIDE PDF ─────────────────────────────────────────────────────────────

  async getRide(creditNoteId: string): Promise<Buffer> {
    const cn = await this.cnRepo.findOne({ where: { id: creditNoteId } });
    if (!cn) throw new NotFoundException('Nota de crédito no encontrada');
    if (cn.status !== CreditNoteStatus.AUTORIZADO) {
      throw new BadRequestException('La nota de crédito debe estar autorizada para generar el RIDE');
    }

    const [settings, branch, originalInvoice] = await Promise.all([
      this.settingsService.get(),
      this.branchesService.findById(cn.branchId),
      this.invoiceRepo.findOne({
        where: { id: cn.originalInvoiceId },
        relations: ['client', 'branch', 'items'],
      }),
    ]);

    if (!originalInvoice) throw new NotFoundException('Factura original no encontrada');

    const fmt = (d: Date, withTime = false) => {
      const dd = d.getDate().toString().padStart(2, '0');
      const mm = (d.getMonth() + 1).toString().padStart(2, '0');
      const yyyy = d.getFullYear();
      if (!withTime) return `${dd}/${mm}/${yyyy}`;
      const hh = d.getHours().toString().padStart(2, '0');
      const min = d.getMinutes().toString().padStart(2, '0');
      const ss = d.getSeconds().toString().padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
    };

    const numDocModificado = originalInvoice.branch
      ? `${originalInvoice.branch.codigoEstablecimiento}-${originalInvoice.branch.puntoEmision}-${originalInvoice.secuencial}`
      : originalInvoice.secuencial ?? '';

    // Build IVA breakdown from original invoice items
    const subtotalByRate: Record<number, number> = {};
    const ivaByRate: Record<number, number> = {};
    for (const item of originalInvoice.items) {
      const rate = item.ivaRate ?? 15;
      subtotalByRate[rate] = (subtotalByRate[rate] ?? 0) + Number(item.subtotal);
      ivaByRate[rate]      = (ivaByRate[rate]      ?? 0) + Number(item.ivaAmount);
    }

    // For PARCIAL credit notes, scale proportionally
    const scaleFactor = cn.type === 'PARCIAL'
      ? Number(cn.total) / Number(originalInvoice.importeTotal)
      : 1;

    const tarifas = Object.keys(subtotalByRate).map(Number).sort((a, b) => a - b).map(rate => ({
      tarifa: rate,
      subtotal: (subtotalByRate[rate] * scaleFactor).toFixed(2),
      iva: (ivaByRate[rate] * scaleFactor).toFixed(2),
    }));

    const detalles = originalInvoice.items.map(item => ({
      codigo:          item.code,
      descripcion:     item.description,
      cantidad:        (Number(item.quantity) * scaleFactor).toFixed(2),
      precioUnitario:  Number(item.unitPrice).toFixed(4),
      descuento:       (Number(item.discount) * scaleFactor).toFixed(2),
      precioTotalSinIva: (Number(item.subtotal) * scaleFactor).toFixed(2),
    }));

    return this.sriRideService.generarRideNotaCredito({
      razonSocial:      settings.razonSocial,
      nombreComercial:  settings.nombreComercial,
      ruc:              settings.ruc,
      dirMatriz:        settings.dirMatriz,
      dirEstablecimiento: branch.address,
      logoBase64:       settings.logoBase64,
      contribuyenteRimpe: 'CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE',
      ambiente:         String(settings.ambiente),
      estab:            branch.codigoEstablecimiento,
      ptoEmi:           branch.puntoEmision,
      secuencial:       cn.sequential!,
      claveAcceso:      cn.claveAcceso!,
      numeroAutorizacion: cn.numeroAutorizacion ?? '',
      fechaAutorizacion:  cn.fechaAutorizacion ? fmt(cn.fechaAutorizacion, true) : '',
      fechaEmision:       fmt(cn.issueDate),
      razonSocialComprador: originalInvoice.client?.name ?? '',
      tipoIdentificacion:   originalInvoice.client?.identificationType ?? '',
      identificacionComprador: originalInvoice.client?.identification ?? '',
      numDocModificado,
      fechaEmisionDocSustento: fmt(originalInvoice.fechaEmision),
      motive:  cn.motive,
      detalles,
      tarifas,
      descuento: (Number(originalInvoice.totalDescuento) * scaleFactor).toFixed(2),
      total:     Number(cn.total).toFixed(2),
    });
  }

  // ─── Procesamiento SRI (llamado por el queue processor) ───────────────────

  async procesarConSri(creditNoteId: string): Promise<void> {
    const cn = await this.findById(creditNoteId);

    if (cn.status === CreditNoteStatus.AUTORIZADO || cn.status === CreditNoteStatus.RECHAZADO) {
      this.logger.log(`Nota de crédito ${creditNoteId} ya en estado ${cn.status} — saltado`);
      return;
    }

    const settings = await this.settingsService.get();
    const ambiente = String(settings.ambiente);

    // Enviar al SRI
    const recepcion = await this.sriSoapService.enviarComprobante(cn.xmlFirmado, ambiente);
    this.logger.log(`Recepción NC SRI: ${recepcion.estado}`);

    if (recepcion.estado === 'DEVUELTA') {
      const mensajes = (recepcion as any).comprobantes?.mensajes?.mensaje;
      const mensajesArr: any[] = mensajes
        ? Array.isArray(mensajes) ? mensajes : [mensajes]
        : [];
      const soloError70 = mensajesArr.length > 0 &&
        mensajesArr.every((m: any) => m?.identificador === '70');

      if (!soloError70) {
        const resumen = mensajesArr
          .map((m: any) => `[${m?.identificador}] ${m?.mensaje} - ${m?.informacionAdicional ?? ''}`)
          .join(' | ');
        await this.cnRepo.update(creditNoteId, {
          status: CreditNoteStatus.RECHAZADO,
          mensajesRespuesta: resumen || JSON.stringify(recepcion),
        });
        return;
      }
      this.logger.log('Clave NC ya registrada (error 70), consultando autorización...');
    } else if (recepcion.estado !== 'RECIBIDA') {
      await this.cnRepo.update(creditNoteId, {
        status: CreditNoteStatus.RECHAZADO,
        mensajesRespuesta: JSON.stringify(recepcion),
      });
      return;
    }

    // Polling autorización (mismo patrón que facturas)
    await new Promise(r => setTimeout(r, 20_000));
    let autorizacion: any = null;
    const MAX_INTENTOS = 20;
    for (let i = 1; i <= MAX_INTENTOS; i++) {
      this.logger.log(`Consultando autorización NC intento ${i}/${MAX_INTENTOS}...`);
      autorizacion = await this.sriSoapService.autorizarComprobante(cn.claveAcceso, ambiente);
      if (autorizacion.numeroAutorizaciones > 0 || autorizacion.autorizaciones?.length > 0) break;
      if (i < MAX_INTENTOS) await new Promise(r => setTimeout(r, 30_000));
    }

    if (!autorizacion?.autorizaciones?.length && !autorizacion?.numeroAutorizaciones) {
      throw new Error(`SRI no autorizó la nota de crédito después de ${MAX_INTENTOS} intentos. Job será reintentado.`);
    }

    const auth = autorizacion.autorizaciones?.[0];
    if (auth?.estado === 'AUTORIZADO') {
      await this.cnRepo.update(creditNoteId, {
        status: CreditNoteStatus.AUTORIZADO,
        numeroAutorizacion: auth.numeroAutorizacion,
        fechaAutorizacion:  auth.fechaAutorizacion ? new Date(auth.fechaAutorizacion) : undefined,
        xmlAutorizado: auth.comprobante,
      });

      // Marcar la factura original como ANULADA
      await this.invoiceRepo.update(cn.originalInvoiceId, { status: InvoiceStatus.ANULADO });
      this.logger.log(`NC ${creditNoteId} autorizada. Factura ${cn.originalInvoiceId} marcada como ANULADA.`);

      // Devolver stock al inventario
      await this.devolverStock(cn);

      // Enviar email al cliente
      await this.notificarCliente(cn, auth.comprobante ?? null);
    } else {
      await this.cnRepo.update(creditNoteId, {
        status: CreditNoteStatus.RECHAZADO,
        mensajesRespuesta: JSON.stringify(auth?.mensajes),
      });
    }
  }

  // ─── Post-autorización: inventario ────────────────────────────────────────

  private async devolverStock(cn: CreditNote): Promise<void> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: cn.originalInvoiceId },
      relations: ['items'],
    });
    if (!invoice) return;

    for (const item of invoice.items) {
      if (!item.productId) continue;
      try {
        await this.inventoryService.registrarMovimiento(
          item.productId,
          MovementType.ENTRADA_DEVOLUCION,
          Number(item.quantity),
          cn.id,
          `Devolución NC ${cn.sequential}`,
          `Devolución NC ${cn.sequential}`,
        );
      } catch (err) {
        this.logger.warn(`No se pudo registrar devolución de stock para producto ${item.productId}: ${err.message}`);
      }
    }
  }

  // ─── Post-autorización: email ──────────────────────────────────────────────

  private async notificarCliente(cn: CreditNote, xmlAutorizado: string | null): Promise<void> {
    try {
      const invoice = await this.invoiceRepo.findOne({
        where: { id: cn.originalInvoiceId },
        relations: ['client', 'branch'],
      });
      if (!invoice?.client?.email) return;

      const branch = invoice.branch;
      const facturaNum = branch
        ? `${branch.codigoEstablecimiento}-${branch.puntoEmision}-${invoice.secuencial}`
        : invoice.secuencial ?? '';

      const branchNC = await this.branchesService.findById(cn.branchId);
      const ncNum = branchNC
        ? `${branchNC.codigoEstablecimiento}-${branchNC.puntoEmision}-${cn.sequential}`
        : cn.sequential ?? '';

      // Generate RIDE PDF silently (don't fail email if PDF generation fails)
      let ridePdf: Buffer | null = null;
      try {
        ridePdf = await this.getRide(cn.id);
      } catch (pdfErr) {
        this.logger.warn(`No se pudo generar RIDE NC para email ${cn.id}: ${pdfErr.message}`);
      }

      await this.mailerService.sendCreditNoteEmail({
        clientEmail: invoice.client.email,
        clientName: invoice.client.name,
        ncSequential: ncNum,
        facturaNum,
        total: Number(cn.total),
        motive: cn.motive,
        xmlAutorizado,
        ridePdf,
      });
    } catch (err) {
      this.logger.warn(`No se pudo enviar email de NC ${cn.id}: ${err.message}`);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getNextSequential(): Promise<string> {
    const last = await this.cnRepo
      .createQueryBuilder('cn')
      .orderBy('cn.sequential', 'DESC')
      .getOne();
    const next = last?.sequential ? parseInt(last.sequential) + 1 : 1;
    return next.toString().padStart(9, '0');
  }

  private formatFecha(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${d}/${m}/${date.getFullYear()}`;
  }

  private getCodigoPorcentaje(rate: number): string {
    const map: Record<number, string> = { 0: '0', 5: '5', 8: '8', 15: '4' };
    return map[rate] ?? '4';
  }

  private buildDetallesXml(invoice: Invoice, dto: CreateCreditNoteDto, total: number) {
    if (dto.type === 'TOTAL') {
      return invoice.items.map(item => {
        const codigoPorcentaje = this.getCodigoPorcentaje(item.ivaRate);
        return {
          codigoPrincipal: item.code,
          descripcion: item.description,
          cantidad: Number(item.quantity).toFixed(2),
          precioUnitario: Number(item.unitPrice).toFixed(4),
          descuento: Number(item.discount).toFixed(2),
          precioTotalSinImpuesto: Number(item.subtotal).toFixed(2),
          codigoPorcentaje,
          tarifa: String(item.ivaRate),
          baseImponible: Number(item.subtotal).toFixed(2),
          valor: Number(item.ivaAmount).toFixed(2),
        };
      });
    }

    // PARCIAL — línea única de ajuste
    const ivaRate15 = this.getCodigoPorcentaje(15);
    const subtotal  = Number((total / 1.15).toFixed(2));
    const ivaAmt    = Number((total - subtotal).toFixed(2));
    return [{
      codigoPrincipal: 'NC-AJUSTE',
      descripcion: `Ajuste parcial: ${dto.motive}`,
      cantidad: '1.00',
      precioUnitario: subtotal.toFixed(4),
      descuento: '0.00',
      precioTotalSinImpuesto: subtotal.toFixed(2),
      codigoPorcentaje: ivaRate15,
      tarifa: '15',
      baseImponible: subtotal.toFixed(2),
      valor: ivaAmt.toFixed(2),
    }];
  }

  private buildTotalConImpuestos(invoice: Invoice, dto: CreateCreditNoteDto, total: number) {
    if (dto.type === 'TOTAL') {
      const result: { codigo: '2'; codigoPorcentaje: string; baseImponible: string; valor: string }[] = [];
      if (Number(invoice.subtotal12) > 0) {
        result.push({
          codigo: '2',
          codigoPorcentaje: this.getCodigoPorcentaje(15),
          baseImponible: Number(invoice.subtotal12).toFixed(2),
          valor: Number(invoice.totalIva).toFixed(2),
        });
      }
      if (Number(invoice.subtotal0) > 0) {
        result.push({
          codigo: '2', codigoPorcentaje: '0',
          baseImponible: Number(invoice.subtotal0).toFixed(2), valor: '0.00',
        });
      }
      if (result.length === 0) {
        result.push({ codigo: '2', codigoPorcentaje: '0', baseImponible: '0.00', valor: '0.00' });
      }
      return result;
    }

    // PARCIAL — asumir 15% IVA
    const subtotal = Number((total / 1.15).toFixed(2));
    const ivaAmt   = Number((total - subtotal).toFixed(2));
    return [{
      codigo: '2' as '2',
      codigoPorcentaje: this.getCodigoPorcentaje(15),
      baseImponible: subtotal.toFixed(2),
      valor: ivaAmt.toFixed(2),
    }];
  }
}
