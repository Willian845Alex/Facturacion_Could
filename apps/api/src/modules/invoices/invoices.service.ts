import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { SriTransaction, SriTransactionStatus } from './entities/sri-transaction.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { SriXmlService } from '../sri/services/sri-xml.service';
import { SriSignatureService } from '../sri/services/sri-signature.service';
import { SriSoapService } from '../sri/services/sri-soap.service';
import { JavaSignerService } from '../sri/services/java-signer.service';
import { SriRideService } from '../sri/services/sri-ride.service';
import { SettingsService } from '../settings/settings.service';
import { ClientsService } from '../clients/clients.service';
import { ProductsService } from '../products/products.service';
import { BranchesService } from '../branches/branches.service';
import { CashRegisterService } from '../cash-register/cash-register.service';
import { InvoiceStatus, DocumentType } from '@facturacion-ec/shared';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceItem) private readonly itemRepo: Repository<InvoiceItem>,
    @InjectRepository(SriTransaction) private readonly sriTxRepo: Repository<SriTransaction>,
    @InjectQueue('sri-queue') private readonly sriQueue: Queue,
    private readonly sriXmlService: SriXmlService,
    private readonly sriSignatureService: SriSignatureService,
    private readonly javaSignerService: JavaSignerService,
    private readonly sriSoapService: SriSoapService,
    private readonly sriRideService: SriRideService,
    private readonly settingsService: SettingsService,
    private readonly clientsService: ClientsService,
    private readonly productsService: ProductsService,
    private readonly branchesService: BranchesService,
    private readonly cashRegisterService: CashRegisterService,
    private readonly dataSource: DataSource,
  ) { }

  async findAll(branchId?: string) {
    const query = this.invoiceRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .leftJoinAndSelect('inv.branch', 'branch')
      .leftJoinAndSelect('inv.user', 'user')
      .orderBy('inv.createdAt', 'DESC');
    if (branchId) query.where('inv.branchId = :branchId', { branchId });
    return query.getMany();
  }

  async findById(id: string) {
    const inv = await this.invoiceRepo.findOne({
      where: { id },
      relations: ['client', 'branch', 'items', 'user'],
    });
    if (!inv) throw new NotFoundException('Factura no encontrada');
    return inv;
  }

  async getTicket(id: string) {
    const inv = await this.findById(id);
    const s = await this.settingsService.get();
    return {
      empresa: {
        ruc: s.ruc,
        razonSocial: s.razonSocial,
        nombreComercial: s.nombreComercial,
        dirMatriz: s.dirMatriz,
        telefono: s.telefono ?? null,
        logoBase64: s.logoBase64 ?? null,
        ambiente: s.ambiente,
      },
      factura: {
        id: inv.id,
        claveAcceso: inv.claveAcceso,
        secuencial: inv.secuencial,
        status: inv.status,
        fechaEmision: inv.fechaEmision,
        formaPago: inv.formaPago,
        subtotal12: Number(inv.subtotal12),
        subtotal0: Number(inv.subtotal0),
        totalDescuento: Number(inv.totalDescuento),
        totalIva: Number(inv.totalIva),
        importeTotal: Number(inv.importeTotal),
        numeroAutorizacion: inv.numeroAutorizacion ?? null,
        fechaAutorizacion: inv.fechaAutorizacion ?? null,
        branch: inv.branch
          ? { codigoEstablecimiento: inv.branch.codigoEstablecimiento, puntoEmision: inv.branch.puntoEmision }
          : null,
        client: inv.client
          ? { name: inv.client.name, identification: inv.client.identification, identificationType: (inv.client as any).identificationType ?? '05' }
          : null,
        items: inv.items.map(it => ({
          code: it.code,
          description: it.description,
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          discount: Number(it.discount),
          ivaRate: it.ivaRate,
          subtotal: Number(it.subtotal),
          total: Number(it.total),
        })),
      },
    };
  }

  async create(dto: CreateInvoiceDto, userId: string): Promise<Invoice> {
    const client = await this.clientsService.findById(dto.clientId);
    const branch = await this.branchesService.findById(dto.branchId);
    const fechaEmision = dto.fechaEmision ? new Date(dto.fechaEmision) : new Date();

    let claveAcceso: string | null = null;
    let secuencial: string | null = null;

    if (!dto.draft) {
      // Verificar que haya una caja abierta para la sucursal
      const openRegister = await this.cashRegisterService.getOpenRegister(dto.branchId);
      if (!openRegister) {
        throw new BadRequestException('Debe abrir la caja antes de facturar');
      }

      const settings = await this.settingsService.get();
      const seq = await this.getNextSecuencial(branch.id);
      secuencial = seq.padStart(9, '0');
      claveAcceso = this.sriXmlService.generarClaveAcceso(
        fechaEmision,
        DocumentType.FACTURA,
        settings.ruc,
        String(settings.ambiente),
        branch.codigoEstablecimiento,
        branch.puntoEmision,
        seq,
      );
    }

    // Calcular totales
    const items: InvoiceItem[] = [];
    let subtotalGravado = 0, subtotal0 = 0, totalDescuento = 0, totalIva = 0;

    for (const itemDto of dto.items) {
      const ivaRate = itemDto.ivaRate ?? 15;
      const qty = Number(itemDto.quantity);
      const price = Number(itemDto.unitPrice);
      const discountPct = Number(itemDto.discount ?? 0);
      const discountAmt = qty * price * discountPct / 100;
      const subtotal = (qty * price) - discountAmt;
      const iva = ivaRate > 0 ? subtotal * ivaRate / 100 : 0;

      if (ivaRate > 0) subtotalGravado += subtotal;
      else subtotal0 += subtotal;
      totalDescuento += discountAmt;
      totalIva += iva;

      const item = this.itemRepo.create({
        productId: itemDto.productId,
        code: itemDto.code,
        description: itemDto.description,
        quantity: qty,
        unitPrice: price,
        discount: discountAmt,
        ivaRate,
        subtotal,
        ivaAmount: iva,
        total: subtotal + iva,
      });
      items.push(item);
    }

    const importeTotal = subtotalGravado + subtotal0 + totalIva;

    // ── Validar stock disponible antes de guardar (solo facturas, no borradores) ──
    if (!dto.draft) {
      // Acumular cantidad requerida por producto (el mismo ítem puede repetirse)
      const stockRequerido = new Map<string, number>();
      for (const itemDto of dto.items) {
        if (itemDto.productId) {
          stockRequerido.set(
            itemDto.productId,
            (stockRequerido.get(itemDto.productId) ?? 0) + Number(itemDto.quantity),
          );
        }
      }
      for (const [productId, requerido] of stockRequerido) {
        const product = await this.productsService.findById(productId);
        if (product.trackInventory && Number(product.stock) < requerido) {
          throw new BadRequestException(
            `Stock insuficiente para "${product.name}": disponible ${Number(product.stock)}, requerido ${requerido}`,
          );
        }
      }
    }

    const invoice = this.invoiceRepo.create({
      claveAcceso,
      secuencial,
      documentType: DocumentType.FACTURA,
      status: dto.draft ? InvoiceStatus.BORRADOR : InvoiceStatus.PENDIENTE,
      fechaEmision,
      clientId: dto.clientId,
      branchId: dto.branchId,
      userId,
      items,
      subtotal12: subtotalGravado,
      subtotal0,
      totalDescuento,
      totalIva,
      importeTotal,
      formaPago: dto.formaPago ?? '01',
    });

    const saved = await this.invoiceRepo.save(invoice);

    if (!dto.draft) {
      // Registrar transacción SRI con status PENDIENTE
      await this.sriTxRepo.save(
        this.sriTxRepo.create({
          invoiceId: saved.id,
          claveAcceso: claveAcceso ?? undefined,
          status: SriTransactionStatus.PENDIENTE,
        }),
      );

      // Encolar para procesamiento SRI
      try {
        await this.sriQueue.add('procesar-factura', { invoiceId: saved.id }, {
          attempts: 10,
          backoff: { type: 'fixed', delay: 30000 }, // 30s entre reintentos
        });
      } catch (err) {
        this.logger.error(`No se pudo encolar la factura ${saved.id} para procesamiento SRI: ${err.message}`);
        // La factura queda en estado PENDIENTE y puede reintentarse manualmente
      }
    }

    return saved;
  }

  async procesarConSri(invoiceId: string): Promise<void> {
    const invoice = await this.findById(invoiceId);

    // Guardia idempotente: si ya fue procesado (AUTORIZADO o RECHAZADO),
    // no reenviar al SRI ni volver a mandar el email.
    // Esto protege contra jobs stalled que Bull reencola al reiniciar el proceso.
    if (invoice.status === InvoiceStatus.AUTORIZADO || invoice.status === InvoiceStatus.RECHAZADO) {
      this.logger.log(`Factura ${invoiceId} ya en estado ${invoice.status} — job saltado (idempotente)`);
      return;
    }

    const settings = await this.settingsService.get();
    const client = await this.clientsService.findById(invoice.clientId);
    const branch = await this.branchesService.findById(invoice.branchId);

    const fechaStr = this.formatFecha(invoice.fechaEmision);

    const detalles = invoice.items.map(item => {
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

    const ambiente = String(settings.ambiente);

    // Construir totalConImpuestos dinámicamente por tasa
    const totalConImpuestos: { codigo: '2'; codigoPorcentaje: string; baseImponible: string; valor: string }[] = [];
    if (Number(invoice.subtotal12) > 0) {
      totalConImpuestos.push({
        codigo: '2',
        codigoPorcentaje: this.getCodigoPorcentaje(15),
        baseImponible: Number(invoice.subtotal12).toFixed(2),
        valor: Number(invoice.totalIva).toFixed(2),
      });
    }
    if (Number(invoice.subtotal0) > 0) {
      totalConImpuestos.push({
        codigo: '2',
        codigoPorcentaje: '0',
        baseImponible: Number(invoice.subtotal0).toFixed(2),
        valor: '0.00',
      });
    }
    if (totalConImpuestos.length === 0) {
      totalConImpuestos.push({
        codigo: '2',
        codigoPorcentaje: '0',
        baseImponible: '0.00',
        valor: '0.00',
      });
    }

    const infoAdicional: { nombre: string; valor: string }[] = [];
    if (client.email) infoAdicional.push({ nombre: 'email', valor: client.email });

    const xmlData = {
      ambiente,
      tipoEmision: '1',
      razonSocial: settings.razonSocial,
      nombreComercial: settings.nombreComercial,
      ruc: settings.ruc,
      claveAcceso: invoice.claveAcceso!,
      codDoc: DocumentType.FACTURA,
      estab: branch.codigoEstablecimiento,
      ptoEmi: branch.puntoEmision,
      secuencial: invoice.secuencial!,
      dirMatriz: settings.dirMatriz,
      fechaEmision: fechaStr,
      dirEstablecimiento: branch.address,
      obligadoContabilidad: 'NO' as const,
      tipoIdentificacionComprador: client.identificationType,
      razonSocialComprador: client.name,
      identificacionComprador: client.identification,
      direccionComprador: client.address,
      totalSinImpuestos: (Number(invoice.subtotal12) + Number(invoice.subtotal0)).toFixed(2),
      totalDescuento: Number(invoice.totalDescuento).toFixed(2),
      totalConImpuestos,
      detalles,
      importeTotal: Number(invoice.importeTotal).toFixed(2),
      moneda: 'DOLAR',
      pagos: [{ formaPago: invoice.formaPago, total: Number(invoice.importeTotal).toFixed(2) }],
      infoAdicional: infoAdicional.length ? infoAdicional : undefined,
    };

    const xmlSinFirma = this.sriXmlService.generarXmlFactura(xmlData);
    const xmlFirmado = await this.javaSignerService.firmarXml(xmlSinFirma);


    await this.invoiceRepo.update(invoiceId, { xmlSinFirma, xmlFirmado });

    // Enviar al SRI
    const recepcion = await this.sriSoapService.enviarComprobante(xmlFirmado, ambiente);
    this.logger.log(`Recepción SRI estado: ${recepcion.estado}`);
    this.logger.log(`Recepción SRI completa: ${JSON.stringify(recepcion, null, 2)}`);

    if (recepcion.estado === 'DEVUELTA') {
      // DEVUELTA = el SRI rechazó el comprobante. Nunca tendrá autorización.
      // La única excepción es el identificador 70 (clave ya registrada):
      // en ese caso el documento YA fue enviado antes y podría estar autorizado.
      const mensajes = (recepcion as any).comprobantes?.mensajes?.mensaje;
      const mensajesArr: any[] = mensajes
        ? Array.isArray(mensajes) ? mensajes : [mensajes]
        : [];

      this.logger.warn(`Mensajes SRI: ${JSON.stringify(mensajesArr, null, 2)}`);

      const soloError70 = mensajesArr.length > 0 &&
        mensajesArr.every((m: any) => m?.identificador === '70');

      if (!soloError70) {
        // Error real: rechazar y no intentar autorizar
        const resumen = mensajesArr
          .map((m: any) => `[${m?.identificador}] ${m?.mensaje} - ${m?.informacionAdicional ?? ''}`)
          .join(' | ');
        await this.invoiceRepo.update(invoiceId, {
          status: InvoiceStatus.RECHAZADO,
          mensajesRespuesta: resumen || JSON.stringify(recepcion),
        });
        return;
      }
      // Si solo es error 70, el comprobante ya existe: continuar a autorizar
      this.logger.log('Clave ya registrada en SRI (error 70), consultando autorización...');
    } else if (recepcion.estado !== 'RECIBIDA') {
      await this.invoiceRepo.update(invoiceId, {
        status: InvoiceStatus.RECHAZADO,
        mensajesRespuesta: JSON.stringify(recepcion),
      });
      return;
    }


    // Esperar y consultar autorización.
    // SRI pruebas puede tardar hasta 10 min. Polling: 20s inicial + 20 intentos × 30s = ~10 min total.
    this.logger.log(`Consultando autorización para clave: ${invoice.claveAcceso}`);
    await new Promise(r => setTimeout(r, 20000));

    let autorizacion: any = null;
    const MAX_INTENTOS = 20;
    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      this.logger.log(`Consultando autorización intento ${intento}/${MAX_INTENTOS}...`);
      autorizacion = await this.sriSoapService.autorizarComprobante(invoice.claveAcceso!, ambiente);
      this.logger.log(`Respuesta autorización: ${JSON.stringify(autorizacion)}`);

      if (autorizacion.numeroAutorizaciones > 0 || autorizacion.autorizaciones?.length > 0) {
        this.logger.log('Autorización recibida del SRI');
        break;
      }

      if (intento < MAX_INTENTOS) {
        await new Promise(r => setTimeout(r, 30000));
      }
    }

    if (!autorizacion?.autorizaciones?.length && !autorizacion?.numeroAutorizaciones) {
      // El SRI no respondió en ~3 minutos. Lanzar excepción para que Bull reintente el job.
      // La factura queda en PENDIENTE en la BD y será reprocesada.
      throw new Error(`SRI no autorizó después de ${MAX_INTENTOS} intentos. Job será reintentado por Bull.`);
    }

    const auth = autorizacion.autorizaciones?.[0];

    if (auth?.estado === 'AUTORIZADO') {
      await this.invoiceRepo.update(invoiceId, {
        status: InvoiceStatus.AUTORIZADO,
        numeroAutorizacion: auth.numeroAutorizacion,
        fechaAutorizacion: auth.fechaAutorizacion ? new Date(auth.fechaAutorizacion) : undefined,
        xmlAutorizado: auth.comprobante,
      });
    } else {
      await this.invoiceRepo.update(invoiceId, {
        status: InvoiceStatus.RECHAZADO,
        mensajesRespuesta: JSON.stringify(auth?.mensajes),
      });
    }
  }

  async getRide(invoiceId: string): Promise<Buffer> {
    const invoice = await this.findById(invoiceId);
    if (invoice.status !== InvoiceStatus.AUTORIZADO) {
      throw new BadRequestException('La factura debe estar autorizada para generar el RIDE');
    }
    const settings = await this.settingsService.get();
    const branch = await this.branchesService.findById(invoice.branchId);

    // Build IVA breakdown by rate
    const subtotalByRate: Record<number, number> = {};
    const ivaByRate: Record<number, number> = {};
    for (const item of invoice.items) {
      const rate = item.ivaRate ?? 15;
      subtotalByRate[rate] = (subtotalByRate[rate] ?? 0) + Number(item.subtotal);
      ivaByRate[rate] = (ivaByRate[rate] ?? 0) + (Number(item.subtotal) * rate / 100);
    }
    const tarifas = Object.keys(subtotalByRate)
      .map(Number)
      .sort((a, b) => a - b)
      .map(rate => ({
        tarifa: rate,
        subtotal: subtotalByRate[rate].toFixed(2),
        iva: ivaByRate[rate].toFixed(2),
      }));

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

    return this.sriRideService.generarRidePdf({
      razonSocial: settings.razonSocial,
      nombreComercial: settings.nombreComercial,
      ruc: settings.ruc,
      dirMatriz: settings.dirMatriz,
      dirEstablecimiento: branch.address ?? branch.codigoEstablecimiento,
      logoBase64: settings.logoBase64,
      obligadoContabilidad: 'NO',
      contribuyenteRimpe: 'CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE',
      ambiente: String(settings.ambiente),
      estab: branch.codigoEstablecimiento,
      ptoEmi: branch.puntoEmision,
      secuencial: invoice.secuencial!,
      claveAcceso: invoice.claveAcceso!,
      numeroAutorizacion: invoice.numeroAutorizacion ?? '',
      fechaAutorizacion: invoice.fechaAutorizacion ? fmt(invoice.fechaAutorizacion, true) : '',
      fechaEmision: fmt(invoice.fechaEmision),
      razonSocialComprador: invoice.client.name,
      tipoIdentificacion: invoice.client.identificationType,
      identificacionComprador: invoice.client.identification,
      detalles: invoice.items.map(i => ({
        codigo: i.code,
        descripcion: i.description,
        cantidad: Number(i.quantity).toFixed(2),
        precioUnitario: Number(i.unitPrice).toFixed(4),
        descuento: Number(i.discount).toFixed(2),
        precioTotalSinIva: Number(i.subtotal).toFixed(2),
      })),
      tarifas,
      descuento: Number(invoice.totalDescuento).toFixed(2),
      propina: '0.00',
      total: Number(invoice.importeTotal).toFixed(2),
      formaPago: invoice.formaPago,
    });
  }

  private async getNextSecuencial(branchId: string): Promise<string> {
    const last = await this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.branchId = :branchId AND inv.status != :borrador', {
        branchId,
        borrador: InvoiceStatus.BORRADOR,
      })
      .orderBy('inv.secuencial', 'DESC')
      .getOne();
    const next = last?.secuencial ? parseInt(last.secuencial) + 1 : 1;
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
}
