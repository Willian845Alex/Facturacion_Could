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
  ) {}

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
    if (!dto.code) {
      dto = { ...dto, code: await this.generateCode() };
    }
    return this.repo.save(this.repo.create(dto));
  }

  private async generateCode(): Promise<string> {
    const raw = await this.repo
      .createQueryBuilder('p')
      .select('MAX(p.code)', 'maxCode')
      .where("p.code LIKE 'P%'")
      .getRawOne<{ maxCode: string | null }>();
    let num = 1;
    if (raw?.maxCode) {
      const parsed = parseInt(raw.maxCode.slice(1), 10);
      if (!isNaN(parsed)) num = parsed + 1;
    }
    return `P${String(num).padStart(6, '0')}`;
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
