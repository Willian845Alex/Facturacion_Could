import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';

export interface ProductFilters {
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  ivaRate?: number;
  stockFilter?: 'all' | 'low' | 'out';
  page?: number;
  limit?: number;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
  ) { }

  async findAll(filters: ProductFilters | string = {}) {
    // Backward-compat: accept plain string search as before
    if (typeof filters === 'string') {
      filters = { search: filters };
    }
    const { search, status = 'active', ivaRate, stockFilter, page = 1, limit = 50 } = filters;

    const qb = this.repo.createQueryBuilder('p');

    if (status !== 'all') {
      qb.andWhere('p.isActive = :isActive', { isActive: status !== 'inactive' });
    }

    if (search) {
      qb.andWhere(
        '(p.name ILIKE :s OR p.code ILIKE :s OR p.auxiliaryCode ILIKE :s)',
        { s: `%${search}%` },
      );
    }

    if (ivaRate !== undefined) {
      qb.andWhere('p.ivaRate = :ivaRate', { ivaRate });
    }

    if (stockFilter === 'out') {
      qb.andWhere('p.trackInventory = true AND p.stock = 0');
    } else if (stockFilter === 'low') {
      qb.andWhere('p.trackInventory = true AND p.stock > 0 AND p.stock <= p.minStock');
    }

    qb.orderBy('p.name', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async findAllActive(): Promise<Product[]> {
    return this.repo.find({ where: { isActive: true } });
  }

  async findById(id: string) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  async create(dto: CreateProductDto) {
    let attempts = 0;

    while (attempts < 3) {
      try {
        if (!dto.code) {
          dto.code = await this.generateCode();
        }

        return await this.repo.save(this.repo.create(dto));
      } catch (error: any) {
        if (error.code === '23505') {
          dto.code = undefined;
          attempts++;
        } else {
          throw error;
        }
      }
    }

    throw new Error('No se pudo generar un código único');
  }

  private async generateCode(): Promise<string> {
    const lastProduct = await this.repo
      .createQueryBuilder('product')
      .where("product.code ~ '^P[0-9]+$'") // regex más seguro
      .orderBy("CAST(SUBSTRING(product.code FROM 2) AS INTEGER)", "DESC")
      .getOne();

    let nextNumber = 1;

    if (lastProduct) {
      const lastNumber = parseInt(lastProduct.code.replace('P', ''), 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    return 'P' + nextNumber.toString().padStart(6, '0');
  }

  async update(id: string, dto: Partial<CreateProductDto>) {
    const p = await this.findById(id);
    Object.assign(p, dto);
    return this.repo.save(p);
  }

  async adjustStock(id: string, delta: number) {
    const p = await this.findById(id);
    p.stock = Number(p.stock) + delta;
    return this.repo.save(p);
  }

  async deactivate(id: string) {
    await this.findById(id);
    await this.repo.update(id, { isActive: false });
  }
}
