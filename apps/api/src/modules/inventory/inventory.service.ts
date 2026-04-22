import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { InventoryMovement, MovementType } from './entities/inventory-movement.entity';
import { ProductsService } from '../products/products.service';
import { SettingsService } from '../settings/settings.service';

const MOVEMENT_DETAIL: Record<string, string> = {
  ENTRADA_COMPRA: 'Entrada por compra',
  ENTRADA_AJUSTE: 'Ajuste de entrada',
  SALIDA_VENTA:   'Salida por venta',
  SALIDA_MERMA:   'Merma / pérdida',
  SALIDA_AJUSTE:  'Ajuste de salida',
  ENTRADA:        'Entrada',
  SALIDA:         'Salida',
  AJUSTE:         'Ajuste',
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryMovement)
    private readonly repo: Repository<InventoryMovement>,
    private readonly productsService: ProductsService,
    private readonly settingsService: SettingsService,
  ) {}

  async registrarMovimiento(
    productId: string,
    type: MovementType,
    quantity: number,
    referenceId?: string,
    notes?: string,
    reference?: string,
    unitCost?: number,
  ) {
    const product = await this.productsService.findById(productId);
    const stockBefore = Number(product.stock);
    const isExit = [MovementType.SALIDA, MovementType.SALIDA_VENTA, MovementType.SALIDA_AJUSTE, MovementType.SALIDA_MERMA].includes(type);
    const delta = isExit ? -quantity : quantity;
    const stockAfter = stockBefore + delta;

    // Para entradas sin costo explícito, usar el costo registrado del producto
    const isEntrada = !isExit;
    const effectiveUnitCost = unitCost ?? (isEntrada ? (Number(product.cost) || Number(product.price) || undefined) : undefined);

    const movement = this.repo.create({
      productId,
      type,
      quantity,
      stockBefore,
      stockAfter,
      referenceId,
      notes,
      reference,
      unitCost: effectiveUnitCost,
    });

    await this.repo.save(movement);
    if (product.trackInventory) {
      await this.productsService.adjustStock(productId, delta);
    }
    // reload with product relation for response
    return this.repo.findOne({ where: { id: movement.id }, relations: ['product'] });
  }

  async registrarAjuste(productId: string, newStock: number, motive: string) {
    const product = await this.productsService.findById(productId);
    const currentStock = Number(product.stock);
    const delta = newStock - currentStock;
    if (delta === 0) {
      return { id: null, stockBefore: currentStock, stockAfter: currentStock, product, type: 'AJUSTE', quantity: 0 };
    }

    const isMerma = motive === 'Producto dañado' || motive === 'Pérdida / robo';
    const type = delta > 0
      ? MovementType.ENTRADA_AJUSTE
      : isMerma ? MovementType.SALIDA_MERMA : MovementType.SALIDA_AJUSTE;

    return this.registrarMovimiento(productId, type, Math.abs(delta), undefined, motive, motive);
  }

  async getMovements(productId?: string, type?: MovementType, from?: string, to?: string, search?: string, page = 1, limit = 50) {
    const query = this.repo.createQueryBuilder('m')
      .leftJoin('m.product', 'product')
      .addSelect(['product.id', 'product.name', 'product.code', 'product.unit'])
      .orderBy('m.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (productId) query.andWhere('m.productId = :productId', { productId });
    if (search) {
      query.andWhere(
        '(product.name ILIKE :search OR product.code ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    if (type) query.andWhere('m.type = :type', { type });
    if (from) query.andWhere('m.createdAt >= :from', { from: new Date(from) });
    if (to) query.andWhere('m.createdAt <= :to', { to: new Date(to + 'T23:59:59') });
    const [data, total] = await query.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getKardexExport(): Promise<string> {
    const movements = await this.repo.createQueryBuilder('m')
      .leftJoinAndSelect('m.product', 'product')
      .orderBy('m.createdAt', 'ASC')
      .getMany();

    const header = ['Fecha', 'Producto', 'Código', 'Tipo movimiento', 'Cantidad',
      'Costo unitario', 'Costo total', 'Stock resultante', 'Referencia', 'Notas'].join(';');

    const rows = movements.map(m => {
      const unitCost = m.unitCost ? Number(m.unitCost) : 0;
      const qty = Number(m.quantity);
      const total = unitCost * qty;
      const escape = (s: string) => `"${(s ?? '').replace(/"/g, '""')}"`;
      return [
        new Date(m.createdAt).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' }),
        escape(m.product?.name ?? ''),
        m.product?.code ?? '',
        MOVEMENT_DETAIL[m.type] ?? m.type,
        qty.toFixed(2),
        unitCost.toFixed(4),
        total.toFixed(2),
        Number(m.stockAfter).toFixed(2),
        escape(m.reference ?? ''),
        escape(m.notes ?? ''),
      ].join(';');
    });

    return [header, ...rows].join('\n');
  }

  // ─── Promedio ponderado ──────────────────────────────────────────────────────

  private calcPromedioRows(movements: InventoryMovement[], defaultCost = 0) {
    let saldoQty = 0;
    let saldoValue = 0;
    let promedio = 0;

    const rows = movements.map(m => {
      const isEntrada = m.type.startsWith('ENTRADA');
      const qty = Number(m.quantity);
      let entrada: { qty: number; unitCost: number; total: number } | null = null;
      let salida: { qty: number; unitCost: number; total: number } | null = null;

      if (isEntrada) {
        // Prioridad: unitCost del movimiento → promedio actual → costo/precio del producto
        const unitCost = m.unitCost
          ? Number(m.unitCost)
          : (promedio > 0 ? promedio : defaultCost);
        const entradaTotal = qty * unitCost;
        saldoQty = saldoQty + qty;
        saldoValue = saldoValue + entradaTotal;
        promedio = saldoQty > 0 ? saldoValue / saldoQty : 0;
        entrada = { qty, unitCost, total: entradaTotal };
      } else {
        const salidaTotal = qty * promedio;
        saldoQty = Math.max(0, saldoQty - qty);
        saldoValue = saldoQty * promedio;
        salida = { qty, unitCost: promedio, total: salidaTotal };
      }

      return {
        id: m.id,
        date: m.createdAt,
        detail: MOVEMENT_DETAIL[m.type] ?? m.type,
        document: m.reference ?? m.referenceId ?? '',
        entrada,
        salida,
        saldo: { qty: saldoQty, promedio, total: saldoValue },
      };
    });

    return { rows, saldoFinal: { qty: saldoQty, promedio, total: saldoValue } };
  }

  // ─── Kardex detallado ────────────────────────────────────────────────────────

  async getKardexDetallado(productId: string, from?: string, to?: string) {
    const product = await this.productsService.findById(productId);
    const empresa = await this.settingsService.get().catch(() => null);

    // Fetch ALL movements sorted ASC to calculate running promedio
    const allMovements = await this.repo.find({
      where: { productId },
      order: { createdAt: 'ASC' },
    });

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to + 'T23:59:59') : null;

    // Split: movements before range (for opening balance) and in range (to display)
    const before = fromDate ? allMovements.filter(m => m.createdAt < fromDate) : [];
    const inRange = allMovements.filter(m => {
      if (fromDate && m.createdAt < fromDate) return false;
      if (toDate && m.createdAt > toDate) return false;
      return true;
    });

    const defaultCost = Number(product.cost) || Number(product.price) || 0;

    // Calculate opening balance from movements before range
    const { saldoFinal: saldoInicial } = this.calcPromedioRows(before, defaultCost);

    // Calculate rows in range starting from saldo inicial state
    let saldoQty = saldoInicial.qty;
    let saldoValue = saldoInicial.total;
    let promedio = saldoInicial.promedio;

    const rows = inRange.map(m => {
      const isEntrada = m.type.startsWith('ENTRADA');
      const qty = Number(m.quantity);
      let entrada: { qty: number; unitCost: number; total: number } | null = null;
      let salida: { qty: number; unitCost: number; total: number } | null = null;

      if (isEntrada) {
        const unitCost = m.unitCost
          ? Number(m.unitCost)
          : (promedio > 0 ? promedio : defaultCost);
        const entradaTotal = qty * unitCost;
        saldoQty = saldoQty + qty;
        saldoValue = saldoValue + entradaTotal;
        promedio = saldoQty > 0 ? saldoValue / saldoQty : 0;
        entrada = { qty, unitCost, total: entradaTotal };
      } else {
        const salidaTotal = qty * promedio;
        saldoQty = Math.max(0, saldoQty - qty);
        saldoValue = saldoQty * promedio;
        salida = { qty, unitCost: promedio, total: salidaTotal };
      }

      return {
        id: m.id,
        date: m.createdAt,
        detail: MOVEMENT_DETAIL[m.type] ?? m.type,
        document: m.reference ?? m.referenceId ?? '',
        entrada,
        salida,
        saldo: { qty: saldoQty, promedio, total: saldoValue },
      };
    });

    const totals = rows.reduce(
      (acc, r) => {
        if (r.entrada) { acc.entradaQty += r.entrada.qty; acc.entradaValue += r.entrada.total; }
        if (r.salida)  { acc.salidaQty  += r.salida.qty;  acc.salidaValue  += r.salida.total; }
        return acc;
      },
      { entradaQty: 0, entradaValue: 0, salidaQty: 0, salidaValue: 0 },
    );

    return {
      product: { id: product.id, code: product.code, name: product.name, unit: product.unit, stock: product.stock, minStock: product.minStock },
      empresa: empresa ? { razonSocial: empresa.razonSocial, ruc: empresa.ruc } : null,
      from: from ?? null,
      to: to ?? null,
      saldoInicial,
      rows,
      totals: { ...totals, saldoFinal: { qty: saldoQty, promedio, total: saldoValue } },
    };
  }

  // ─── Resumen de inventario ───────────────────────────────────────────────────

  async getSummary() {
    const all = await this.productsService.findAllActive();
    const tracked = all.filter(p => p.trackInventory);
    if (tracked.length === 0) return [];

    const productIds = tracked.map(p => p.id);
    const allMovements = await this.repo.find({
      where: { productId: In(productIds) },
      order: { createdAt: 'ASC' },
    });

    const movsByProduct = new Map<string, InventoryMovement[]>();
    for (const m of allMovements) {
      const list = movsByProduct.get(m.productId) ?? [];
      list.push(m);
      movsByProduct.set(m.productId, list);
    }

    return tracked.map(p => {
      const movs = movsByProduct.get(p.id) ?? [];
      const defaultCost = Number(p.cost) || Number(p.price) || 0;
      const { saldoFinal } = this.calcPromedioRows(movs, defaultCost);
      const stock = Number(p.stock);
      // Si no hay movimientos de entrada, usar el costo del producto directamente
      const costoPromedio = saldoFinal.promedio > 0 ? saldoFinal.promedio : defaultCost;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        unit: p.unit ?? '',
        stock,
        minStock: Number(p.minStock),
        costoPromedio,
        valorTotal: stock * costoPromedio,
      };
    });
  }
}
