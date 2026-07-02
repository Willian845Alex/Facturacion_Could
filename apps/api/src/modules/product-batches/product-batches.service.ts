import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ProductBatch } from './entities/product-batch.entity';
import { Product } from '../products/entities/product.entity';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';

@Injectable()
export class ProductBatchesService {
  constructor(
    @InjectRepository(ProductBatch)
    private readonly batchRepo: Repository<ProductBatch>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  /** Lista todos los lotes de un producto, los más próximos a caducar primero */
  async findByProduct(productId: string) {
    return this.batchRepo.find({
      where: { productId },
      order: { expirationDate: 'ASC' },
    });
  }

  async findById(id: string) {
    const batch = await this.batchRepo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!batch) throw new NotFoundException('Lote no encontrado');
    return batch;
  }

  /**
   * Crea un lote nuevo y, si el producto controla inventario, suma la
   * cantidad al stock total del producto (igual que una entrada normal).
   */
  async create(dto: CreateBatchDto) {
    const product = await this.productRepo.findOne({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Producto no encontrado');

    const batch = this.batchRepo.create({
      productId: dto.productId,
      batchNumber: dto.batchNumber,
      expirationDate: new Date(dto.expirationDate),
      quantity: dto.quantity,
      remainingQuantity: dto.quantity,
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
      unitCost: dto.unitCost,
      notes: dto.notes,
    });

    const saved = await this.batchRepo.save(batch);

    if (product.trackInventory) {
      product.stock = Number(product.stock) + Number(dto.quantity);
      await this.productRepo.save(product);
    }

    return saved;
  }

  async update(id: string, dto: UpdateBatchDto) {
    const batch = await this.findById(id);

    if (dto.remainingQuantity !== undefined && dto.remainingQuantity > Number(batch.quantity)) {
      throw new BadRequestException('La cantidad restante no puede ser mayor a la cantidad original del lote');
    }

    Object.assign(batch, {
      ...dto,
      expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : batch.expirationDate,
    });

    return this.batchRepo.save(batch);
  }

  /** Desactiva un lote (no lo borra — mantiene trazabilidad histórica) */
  async deactivate(id: string) {
    const batch = await this.findById(id);
    batch.isActive = false;
    return this.batchRepo.save(batch);
  }

  /**
   * Lotes que caducan dentro de los próximos `days` días (default 90),
   * para la alerta del dashboard. Incluye también los ya caducados
   * que aún tengan cantidad restante (para que no se pierdan de vista).
   */
  async findExpiringSoon(days = 90) {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + days);

    return this.batchRepo
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.product', 'product')
      .where('batch.isActive = true')
      .andWhere('batch.remainingQuantity > 0')
      .andWhere('batch.expirationDate <= :limitDate', { limitDate })
      .orderBy('batch.expirationDate', 'ASC')
      .getMany();
  }

  /** Solo los ya caducados con stock restante — para una alerta más urgente */
  async findExpired() {
    const today = new Date();
    return this.batchRepo
      .createQueryBuilder('batch')
      .leftJoinAndSelect('batch.product', 'product')
      .where('batch.isActive = true')
      .andWhere('batch.remainingQuantity > 0')
      .andWhere('batch.expirationDate < :today', { today })
      .orderBy('batch.expirationDate', 'ASC')
      .getMany();
  }
}