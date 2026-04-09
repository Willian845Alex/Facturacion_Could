import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
  ) {}

  findAll(search?: string) {
    if (search) {
      return this.repo.find({
        where: [
          { name: ILike(`%${search}%`), isActive: true },
          { code: ILike(`%${search}%`), isActive: true },
        ],
      });
    }
    return this.repo.find({ where: { isActive: true } });
  }

  async findById(id: string) {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  create(dto: CreateProductDto) { return this.repo.save(this.repo.create(dto)); }

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
