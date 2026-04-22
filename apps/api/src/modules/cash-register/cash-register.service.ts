import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashRegister, CashRegisterStatus } from './entities/cash-register.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { OpenCashDto } from './dto/open-cash.dto';
import { CloseCashDto } from './dto/close-cash.dto';
import { InvoiceStatus } from '@facturacion-ec/shared';

@Injectable()
export class CashRegisterService {
  constructor(
    @InjectRepository(CashRegister)
    private readonly repo: Repository<CashRegister>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async open(dto: OpenCashDto, user: { id: string; name: string }) {
    const existing = await this.repo.findOne({
      where: { status: CashRegisterStatus.ABIERTA, branchId: dto.branchId },
    });
    if (existing) {
      throw new BadRequestException(
        `Ya existe una caja abierta para esta sucursal desde ${existing.openedAt.toLocaleTimeString('es-EC')}`,
      );
    }

    const cr = this.repo.create({
      userId: user.id,
      userName: user.name,
      branchId: dto.branchId,
      initialAmount: dto.initialAmount,
      status: CashRegisterStatus.ABIERTA,
    });
    return this.repo.save(cr);
  }

  async getCurrent(branchId?: string) {
    const where: any = { status: CashRegisterStatus.ABIERTA };
    if (branchId) where.branchId = branchId;

    const cr = await this.repo.findOne({ where });
    if (!cr) return null;

    const now = new Date();
    console.log('Ecuador ahora:', this.ecNow().toISOString());
    console.log('Sesión de caja desde:', cr.openedAt.toISOString(), 'hasta:', now.toISOString());

    const stats = await this.computeStats(cr.branchId, cr.openedAt, now);
    return { ...cr, ...stats };
  }

  async getOpenRegister(branchId: string): Promise<CashRegister | null> {
    return this.repo.findOne({
      where: { status: CashRegisterStatus.ABIERTA, branchId },
    });
  }

  async close(dto: CloseCashDto) {
    const cr = await this.repo.findOne({ where: { status: CashRegisterStatus.ABIERTA } });
    if (!cr) throw new NotFoundException('No hay caja abierta');

    const now = new Date();
    const stats = await this.computeStats(cr.branchId, cr.openedAt, now);

    const expectedAmount = Number(cr.initialAmount) + stats.totalCash;
    const difference = Number(dto.actualAmount) - expectedAmount;

    await this.repo.update(cr.id, {
      status: CashRegisterStatus.CERRADA,
      closedAt: now,
      totalSales: stats.totalSales,
      totalInvoices: stats.totalInvoices,
      totalCash: stats.totalCash,
      totalCard: stats.totalCard,
      totalTransfer: stats.totalTransfer,
      expectedAmount,
      actualAmount: dto.actualAmount,
      difference,
      notes: dto.notes ?? null,
    });

    return this.repo.findOne({ where: { id: cr.id } });
  }

  async getHistory(page = 1, limit = 20) {
    const [data, total] = await this.repo.findAndCount({
      order: { openedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getReport(id: string) {
    const cr = await this.repo.findOne({ where: { id } });
    if (!cr) throw new NotFoundException('Caja no encontrada');

    const closeDate = cr.closedAt ?? new Date();
    const invoices = await this.getSessionInvoices(cr.branchId, cr.openedAt, closeDate);

    return {
      session: cr,
      invoices: invoices.map(inv => ({
        id: inv.id,
        secuencial: inv.secuencial,
        fechaEmision: inv.fechaEmision,
        clientName: (inv as any).client?.name ?? '—',
        formaPago: inv.formaPago,
        importeTotal: Number(inv.importeTotal),
      })),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /** Hora actual en Ecuador (UTC-5), sin depender de la zona horaria del servidor. */
  private ecNow(): Date {
    return new Date(Date.now() - 5 * 60 * 60 * 1000);
  }

  private async computeStats(branchId: string, from: Date, to: Date) {
    const invoices = await this.getSessionInvoices(branchId, from, to);

    let totalSales = 0, totalCash = 0, totalCard = 0, totalTransfer = 0;
    for (const inv of invoices) {
      const amount = Number(inv.importeTotal);
      totalSales += amount;
      if (inv.formaPago === '01') totalCash += amount;
      else if (['16', '18', '19'].includes(inv.formaPago)) totalCard += amount;
      else if (inv.formaPago === '17') totalTransfer += amount;
      else totalCash += amount; // otros: contar como efectivo
    }

    return {
      totalSales,
      totalInvoices: invoices.length,
      totalCash,
      totalCard,
      totalTransfer,
    };
  }

  private async getSessionInvoices(branchId: string, from: Date, to: Date) {
    return this.invoiceRepo
      .createQueryBuilder('inv')
      .leftJoinAndSelect('inv.client', 'client')
      .where('inv.branchId = :branchId', { branchId })
      .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO })
      .andWhere('inv.createdAt >= :from', { from })
      .andWhere('inv.createdAt <= :to', { to })
      .orderBy('inv.createdAt', 'ASC')
      .getMany();
  }
}
