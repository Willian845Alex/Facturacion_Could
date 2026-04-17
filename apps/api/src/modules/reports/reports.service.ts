import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '@facturacion-ec/shared';
import { Setting } from '../settings/entities/setting.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { Product } from '../products/entities/product.entity';

const PAYMENT_LABELS: Record<string, string> = {
  '01': 'Efectivo',
  '16': 'Tarjeta débito',
  '17': 'Tarjeta crédito',
  '19': 'Transferencia',
  '20': 'Cheque',
};

const MOVEMENT_DETAIL: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_AJUSTE: 'Ajuste de entrada',
  ENTRADA_DEVOLUCION: 'Devolución',
  SALIDA_VENTA: 'Salida por venta',
  SALIDA_MERMA: 'Merma / pérdida',
  SALIDA_AJUSTE: 'Ajuste de salida',
  ENTRADA: 'Entrada',
  SALIDA: 'Salida',
  AJUSTE: 'Ajuste',
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Setting)
    private readonly settingRepo: Repository<Setting>,
    @InjectRepository(InventoryMovement)
    private readonly movementRepo: Repository<InventoryMovement>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  // ─── Sales report ─────────────────────────────────────────────────────────

  async getSalesReport(from: Date, to: Date, branchId?: string, userId?: string) {
    const qb = this.invoiceRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .leftJoinAndSelect('inv.user', 'user')
      .leftJoinAndSelect('inv.branch', 'branch')
      .where('inv.fechaEmision BETWEEN :from AND :to', { from, to })
      .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO })
      .orderBy('inv.fechaEmision', 'DESC');

    if (branchId) qb.andWhere('inv.branchId = :branchId', { branchId });
    if (userId) qb.andWhere('inv.userId = :userId', { userId });

    const invoices = await qb.getMany();

    const totalVentas = invoices.reduce((s, inv) => s + Number(inv.importeTotal), 0);
    const totalIva = invoices.reduce((s, inv) => s + Number(inv.totalIva), 0);
    const totalFacturas = invoices.length;
    const promedioFactura = totalFacturas > 0 ? totalVentas / totalFacturas : 0;

    // By day (sorted ASC for chart)
    const dayMap = new Map<string, { total: number; count: number }>();
    for (const inv of invoices) {
      const day = new Date(inv.fechaEmision).toISOString().split('T')[0];
      const cur = dayMap.get(day) ?? { total: 0, count: 0 };
      cur.total += Number(inv.importeTotal);
      cur.count++;
      dayMap.set(day, cur);
    }
    const byDay = Array.from(dayMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // By payment
    const paymentMap = new Map<string, number>();
    for (const inv of invoices) {
      const label = PAYMENT_LABELS[inv.formaPago] ?? `Forma ${inv.formaPago}`;
      paymentMap.set(label, (paymentMap.get(label) ?? 0) + Number(inv.importeTotal));
    }
    const byPayment = Object.fromEntries(paymentMap.entries());

    return {
      summary: { totalVentas, totalFacturas, promedioFactura, totalIva },
      byDay,
      byPayment,
      facturas: invoices.map(inv => ({
        id: inv.id,
        fechaEmision: inv.fechaEmision,
        secuencial: inv.secuencial,
        claveAcceso: inv.claveAcceso,
        status: inv.status,
        formaPago: inv.formaPago,
        formaPagoLabel: PAYMENT_LABELS[inv.formaPago] ?? inv.formaPago,
        client: inv.client ? { name: inv.client.name, identification: inv.client.identification } : null,
        user: inv.user ? { name: inv.user.name } : null,
        branch: inv.branch ? { name: inv.branch.name } : null,
        subtotal: Number(inv.subtotal12) + Number(inv.subtotal0),
        totalIva: Number(inv.totalIva),
        importeTotal: Number(inv.importeTotal),
      })),
    };
  }

  async exportSalesExcel(from: Date, to: Date, branchId?: string, userId?: string): Promise<Buffer> {
    const report = await this.getSalesReport(from, to, branchId, userId);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Detalle de facturas
    const headers = ['Fecha', 'No. Factura', 'Cliente', 'Vendedor', 'Sucursal', 'Subtotal', 'IVA', 'Total', 'F. Pago', 'Estado'];
    const rows = report.facturas.map(inv => [
      new Date(inv.fechaEmision).toLocaleDateString('es-EC'),
      inv.secuencial ?? '',
      inv.client?.name ?? '',
      inv.user?.name ?? '',
      inv.branch?.name ?? '',
      inv.subtotal,
      inv.totalIva,
      inv.importeTotal,
      inv.formaPagoLabel,
      inv.status,
    ]);
    const ws1 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws1['!cols'] = [12, 14, 30, 20, 20, 12, 12, 12, 15, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Facturas');

    // Sheet 2: Resumen
    const summaryRows = [
      ['REPORTE DE VENTAS'],
      [`Período: ${from.toLocaleDateString('es-EC')} - ${to.toLocaleDateString('es-EC')}`],
      [],
      ['Concepto', 'Valor'],
      ['Total ventas', report.summary.totalVentas],
      ['No. facturas', report.summary.totalFacturas],
      ['Promedio por factura', report.summary.promedioFactura],
      ['Total IVA', report.summary.totalIva],
      [],
      ['FORMA DE PAGO', 'Monto'],
      ...Object.entries(report.byPayment).map(([k, v]) => [k, v]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws2['!cols'] = [{ wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen');

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ─── ATS ──────────────────────────────────────────────────────────────────

  async getAtsPreview(year: number, month: number) {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const invoices = await this.invoiceRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .where('inv.fechaEmision BETWEEN :from AND :to', { from, to })
      .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO })
      .orderBy('inv.fechaEmision', 'DESC')
      .getMany();

    const totalVentas = invoices.reduce((s, inv) => s + Number(inv.importeTotal), 0);
    const totalIva = invoices.reduce((s, inv) => s + Number(inv.totalIva), 0);

    return {
      year,
      month,
      totalFacturas: invoices.length,
      totalVentas,
      totalIva,
      facturas: invoices.map(inv => ({
        id: inv.id,
        secuencial: inv.secuencial,
        fechaEmision: inv.fechaEmision,
        cliente: inv.client?.name ?? 'Consumidor Final',
        identificacion: inv.client?.identification ?? '9999999999999',
        baseImponible: Number(inv.subtotal12),
        baseNoGravada: Number(inv.subtotal0),
        montoIva: Number(inv.totalIva),
        importeTotal: Number(inv.importeTotal),
        formaPago: PAYMENT_LABELS[inv.formaPago] ?? inv.formaPago,
      })),
    };
  }

  async generateATS(year: number, month: number): Promise<string> {
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const settings = await this.settingRepo.findOne({ where: {} }).catch(() => null);

    const invoices = await this.invoiceRepo.createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .where('inv.fechaEmision BETWEEN :from AND :to', { from, to })
      .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO })
      .getMany();

    const totalVentas = invoices.reduce((s, inv) => s + Number(inv.importeTotal), 0);

    // Group by client
    type ClientEntry = {
      client: Invoice['client'];
      count: number;
      baseNoGraIva: number;
      baseImponible: number;
      baseImpGrav: number;
      montoIva: number;
      formaPagos: Set<string>;
    };

    const clientMap = new Map<string, ClientEntry>();

    for (const inv of invoices) {
      const clientId = inv.client?.identification ?? '9999999999999';
      const entry: ClientEntry = clientMap.get(clientId) ?? {
        client: inv.client,
        count: 0,
        baseNoGraIva: 0,
        baseImponible: 0,
        baseImpGrav: 0,
        montoIva: 0,
        formaPagos: new Set<string>(),
      };
      entry.count++;
      entry.baseImponible += Number(inv.subtotal0);
      entry.baseImpGrav += Number(inv.subtotal12);
      entry.montoIva += Number(inv.totalIva);
      entry.formaPagos.add(inv.formaPago ?? '01');
      clientMap.set(clientId, entry);
    }

    const detalleVentasXml = Array.from(clientMap.entries()).map(([clientId, data]) => {
      const tpId = data.client?.identificationType ?? '07';
      const formasPagoXml = Array.from(data.formaPagos)
        .map(fp => `        <formaPago>${fp}</formaPago>`)
        .join('\n');

      return `    <detalleVentas>
      <tpIdCliente>${tpId}</tpIdCliente>
      <idCliente>${clientId}</idCliente>
      <parteRelacion>NO</parteRelacion>
      <tipoComprobante>01</tipoComprobante>
      <tipoEm>E</tipoEm>
      <numeroComprobantes>${data.count}</numeroComprobantes>
      <baseNoGraIva>${data.baseNoGraIva.toFixed(2)}</baseNoGraIva>
      <baseImponible>${data.baseImponible.toFixed(2)}</baseImponible>
      <baseImpGrav>${data.baseImpGrav.toFixed(2)}</baseImpGrav>
      <montoIva>${data.montoIva.toFixed(2)}</montoIva>
      <montoIce>0.00</montoIce>
      <valorRetIva>0.00</valorRetIva>
      <valorRetRenta>0.00</valorRetRenta>
      <formasDePago>
${formasPagoXml}
      </formasDePago>
    </detalleVentas>`;
    }).join('\n');

    const ruc = settings?.ruc ?? '';
    const razonSocial = settings?.razonSocial ?? '';

    return `<?xml version="1.0" encoding="UTF-8"?>
<iva>
  <TipoIDInformante>R</TipoIDInformante>
  <IdInformante>${ruc}</IdInformante>
  <razonSocial>${escapeXml(razonSocial)}</razonSocial>
  <Anio>${year}</Anio>
  <Mes>${String(month).padStart(2, '0')}</Mes>
  <numEstabRuc>001</numEstabRuc>
  <totalVentas>${totalVentas.toFixed(2)}</totalVentas>
  <codigoOperativo>IVA</codigoOperativo>
  <ventas>
${detalleVentasXml}
  </ventas>
</iva>`;
  }

  // ─── Inventory report ─────────────────────────────────────────────────────

  async getInventoryReport() {
    const products = await this.productRepo
      .createQueryBuilder('p')
      .where('p.trackInventory = true AND p.isActive = true')
      .orderBy('p.name', 'ASC')
      .getMany();

    const items = products.map(p => {
      const stock = Number(p.stock);
      const cost = Number(p.cost) || Number(p.price) || 0;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit ?? '',
        stock,
        minStock: Number(p.minStock),
        cost,
        valorTotal: stock * cost,
        status: stock <= 0 ? 'agotado' : stock <= Number(p.minStock) ? 'bajo' : 'ok',
      };
    });

    const valorTotalGeneral = items.reduce((s, i) => s + i.valorTotal, 0);
    return { items, valorTotalGeneral };
  }

  async exportInventoryExcel(): Promise<Buffer> {
    const { items } = await this.getInventoryReport();

    const headers = ['Código', 'Producto', 'Unidad', 'Stock actual', 'Stock mínimo', 'Costo unit.', 'Valor total', 'Estado'];
    const rows = items.map(item => [
      item.code,
      item.name,
      item.unit,
      item.stock,
      item.minStock,
      item.cost,
      item.valorTotal,
      item.status === 'agotado' ? 'AGOTADO' : item.status === 'bajo' ? 'STOCK BAJO' : 'OK',
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [12, 30, 8, 12, 12, 12, 12, 12].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario');

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ─── Kardex report ────────────────────────────────────────────────────────

  async getKardexReport(productId?: string, from?: string, to?: string) {
    const qb = this.movementRepo.createQueryBuilder('m')
      .leftJoinAndSelect('m.product', 'product')
      .orderBy('m.createdAt', 'DESC');

    if (productId) qb.andWhere('m.productId = :productId', { productId });
    if (from) qb.andWhere('m.createdAt >= :from', { from: new Date(from) });
    if (to) qb.andWhere('m.createdAt <= :to', { to: new Date(to + 'T23:59:59') });

    const movements = await qb.getMany();

    return movements.map(m => ({
      id: m.id,
      createdAt: m.createdAt,
      product: m.product
        ? { id: m.product.id, code: m.product.code, name: m.product.name, unit: m.product.unit }
        : null,
      type: m.type,
      typeLabel: MOVEMENT_DETAIL[m.type] ?? m.type,
      quantity: Number(m.quantity),
      unitCost: m.unitCost ? Number(m.unitCost) : null,
      total: m.unitCost ? Number(m.quantity) * Number(m.unitCost) : null,
      stockAfter: Number(m.stockAfter),
      reference: m.reference ?? m.notes ?? '',
    }));
  }

  async exportKardexExcel(productId?: string, from?: string, to?: string): Promise<Buffer> {
    const movements = await this.getKardexReport(productId, from, to);

    const headers = ['Fecha', 'Producto', 'Código', 'Tipo movimiento', 'Cantidad', 'Costo unit.', 'Total', 'Stock resultante', 'Referencia'];
    const rows = movements.map(m => [
      new Date(m.createdAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }),
      m.product?.name ?? '',
      m.product?.code ?? '',
      m.typeLabel,
      m.quantity,
      m.unitCost ?? '',
      m.total ?? '',
      m.stockAfter,
      m.reference,
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [18, 30, 12, 20, 10, 12, 12, 14, 25].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, 'Kardex');

    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  }

  // ─── Legacy ───────────────────────────────────────────────────────────────

  async reporteVentas(desde: Date, hasta: Date, branchId?: string) {
    return this.getSalesReport(desde, hasta, branchId);
  }

  async anexoTransaccional(anio: number, mes: number, branchId?: string) {
    return this.getAtsPreview(anio, mes);
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
