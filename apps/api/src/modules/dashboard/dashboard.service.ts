import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Product } from '../products/entities/product.entity';
import { CashRegister, CashRegisterStatus } from '../cash-register/entities/cash-register.entity';
import { Client } from '../clients/entities/client.entity';
import { InvoiceStatus } from '@facturacion-ec/shared';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(CashRegister)
    private readonly cashRepo: Repository<CashRegister>,
  ) {}

  async getStats(userId: string) {
    const { startUTC: todayStart, endUTC: todayEnd } = this.ecuadorDayRange();

    const [todayStats, pendingSRI, recentInvoices, lowStockProducts, salesLast7Days, openCash, myStats] =
      await Promise.all([
        this.getTodayStats(todayStart, todayEnd),
        this.getPendingSRICount(),
        this.getRecentInvoices(todayStart, todayEnd),
        this.getLowStockProducts(),
        this.getSalesLast7Days(),
        this.getOpenCashRegister(),
        this.getMyTodayStats(userId, todayStart, todayEnd),
      ]);

    return {
      today: {
        totalSales: todayStats.totalSales,
        invoiceCount: todayStats.invoiceCount,
        pendingSRI,
        cashSales: todayStats.cashSales,
        cardSales: todayStats.cardSales,
        transferSales: todayStats.transferSales,
      },
      myToday: {
        totalSales: myStats.totalSales,
        invoiceCount: myStats.invoiceCount,
      },
      lowStockCount: lowStockProducts.length,
      recentInvoices,
      lowStockProducts,
      salesLast7Days,
      openCashRegister: openCash,
    };
  }

  private async getMyTodayStats(userId: string, from: Date, to: Date) {
    const invoices = await this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.fechaEmision BETWEEN :from AND :to', { from, to })
      .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO })
      .andWhere('inv.userId = :userId', { userId })
      .getMany();

    let totalSales = 0;
    for (const inv of invoices) totalSales += Number(inv.importeTotal);
    return { totalSales, invoiceCount: invoices.length };
  }

  private async getTodayStats(from: Date, to: Date) {
    const invoices = await this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.fechaEmision BETWEEN :from AND :to', { from, to })
      .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO })
      .getMany();

    let totalSales = 0, cashSales = 0, cardSales = 0, transferSales = 0;
    for (const inv of invoices) {
      const amount = Number(inv.importeTotal);
      totalSales += amount;
      if (inv.formaPago === '01') cashSales += amount;
      else if (['16', '18', '19'].includes(inv.formaPago)) cardSales += amount;
      else if (inv.formaPago === '17') transferSales += amount;
      else cashSales += amount;
    }

    return { totalSales, invoiceCount: invoices.length, cashSales, cardSales, transferSales };
  }

  private async getPendingSRICount() {
    return this.invoiceRepo.count({
      where: { status: InvoiceStatus.PENDIENTE },
    });
  }

  private async getRecentInvoices(from: Date, to: Date) {
    const invoices = await this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .where('inv.fechaEmision BETWEEN :from AND :to', { from, to })
      .orderBy('inv.createdAt', 'DESC')
      .take(5)
      .getMany();

    return invoices.map((inv) => ({
      id: inv.id,
      sequential: inv.secuencial,
      clientName: (inv.client as Client | null)?.name ?? '—',
      total: Number(inv.importeTotal),
      status: inv.status,
      createdAt: inv.createdAt,
    }));
  }

  private async getLowStockProducts() {
    const products = await this.productRepo
      .createQueryBuilder('p')
      .where('p.trackInventory = true')
      .andWhere('p.isActive = true')
      .andWhere('p.stock <= p.minStock')
      .orderBy('p.stock', 'ASC')
      .take(5)
      .getMany();

    return products.map((p) => ({
      id: p.id,
      name: p.name,
      mainCode: p.code,
      stockQuantity: Number(p.stock),
      minStock: Number(p.minStock),
      unit: p.unit ?? '',
    }));
  }

  private async getSalesLast7Days() {
    const days: { date: string; total: number; count: number }[] = [];

    for (let i = 6; i >= 0; i--) {
      const { startUTC: dayStart, endUTC: dayEnd, label } = this.ecuadorDayRange(i);

      const row = await this.invoiceRepo
        .createQueryBuilder('inv')
        .select('COUNT(inv.id)', 'count')
        .addSelect('COALESCE(SUM(inv.importeTotal), 0)', 'total')
        .where('inv.fechaEmision BETWEEN :from AND :to', { from: dayStart, to: dayEnd })
        .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO })
        .getRawOne();

      days.push({
        date: label,
        total: Number(row?.total ?? 0),
        count: Number(row?.count ?? 0),
      });
    }

    return days;
  }

  /**
   * Fecha/hora actual en Ecuador (UTC-5).
   * Se obtiene restando 5 horas al UTC actual — sin depender de la
   * zona horaria configurada en el servidor.
   */
  private ecNow(): Date {
    return new Date(Date.now() - 5 * 60 * 60 * 1000);
  }

  /**
   * Rango UTC para un día calendario en Ecuador (UTC-5).
   * daysAgo=0 → hoy Ecuador, daysAgo=1 → ayer, etc.
   *
   * fechaEmision se almacena como 'YYYY-MM-DDT00:00:00.000Z' (medianoche UTC
   * de la fecha ingresada), por lo que el rango correcto es
   *   startUTC = 'YYYY-MM-DDT00:00:00.000Z'
   *   endUTC   = 'YYYY-MM-DDT23:59:59.999Z'
   * donde YYYY-MM-DD es la fecha actual en Ecuador.
   */
  private ecuadorDayRange(daysAgo = 0): { startUTC: Date; endUTC: Date; label: string } {
    // Fecha Ecuador: restar 5 h al UTC actual (sin getTimezoneOffset del servidor)
    const ecNow = this.ecNow();
    const label0 = ecNow.toISOString().slice(0, 10); // "YYYY-MM-DD" Ecuador de hoy

    // Retroceder daysAgo días
    const target = new Date(label0 + 'T00:00:00.000Z');
    target.setUTCDate(target.getUTCDate() - daysAgo);
    const label = target.toISOString().slice(0, 10);

    const startUTC = new Date(label + 'T00:00:00.000Z');
    const endUTC   = new Date(label + 'T23:59:59.999Z');

    return { startUTC, endUTC, label };
  }

  private async getOpenCashRegister() {
    const cr = await this.cashRepo.findOne({
      where: { status: CashRegisterStatus.ABIERTA },
    });
    if (!cr) return null;

    // Los campos totalCash/totalCard/totalTransfer del entity solo se
    // persisten al cerrar la caja. Para una caja abierta hay que calcularlos
    // en vivo sumando las facturas de la sesión.
    const invoices = await this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.branchId = :branchId', { branchId: cr.branchId })
      .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO })
      .andWhere('inv.createdAt >= :from', { from: cr.openedAt })
      .getMany();

    let totalCash = 0, totalCard = 0, totalTransfer = 0, totalSales = 0;
    for (const inv of invoices) {
      const amount = Number(inv.importeTotal);
      totalSales += amount;
      if (inv.formaPago === '01') totalCash += amount;
      else if (['16', '18', '19'].includes(inv.formaPago)) totalCard += amount;
      else if (inv.formaPago === '17') totalTransfer += amount;
      else totalCash += amount;
    }

    return {
      openedAt: cr.openedAt,
      totalCash,
      totalCard,
      totalTransfer,
      totalSales,
    };
  }
}
