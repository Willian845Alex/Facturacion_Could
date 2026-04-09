import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '@facturacion-ec/shared';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
  ) {}

  async reporteVentas(desde: Date, hasta: Date, branchId?: string) {
    const query = this.invoiceRepo.createQueryBuilder('inv')
      .where('inv.fechaEmision BETWEEN :desde AND :hasta', { desde, hasta })
      .andWhere('inv.status = :status', { status: InvoiceStatus.AUTORIZADO });
    if (branchId) query.andWhere('inv.branchId = :branchId', { branchId });
    const facturas = await query.getMany();

    return {
      totalFacturas: facturas.length,
      totalSubtotal: facturas.reduce((s, f) => s + Number(f.subtotal12) + Number(f.subtotal0), 0),
      totalIva: facturas.reduce((s, f) => s + Number(f.totalIva), 0),
      totalImporte: facturas.reduce((s, f) => s + Number(f.importeTotal), 0),
      facturas,
    };
  }

  async anexoTransaccional(anio: number, mes: number, branchId?: string) {
    const desde = new Date(anio, mes - 1, 1);
    const hasta = new Date(anio, mes, 0, 23, 59, 59);
    return this.reporteVentas(desde, hasta, branchId);
  }
}
