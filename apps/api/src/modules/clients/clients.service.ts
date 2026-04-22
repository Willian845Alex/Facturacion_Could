import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { IdentificationType } from '@facturacion-ec/shared';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly repo: Repository<Client>,
  ) {}

  async findAll(search?: string, page = 1, limit = 50) {
    const where = search
      ? [
          { name: ILike(`%${search}%`), isActive: true },
          { identification: ILike(`%${search}%`), isActive: true },
        ]
      : [{ isActive: true }];

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { name: 'ASC' as const },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async findById(id: string) {
    const client = await this.repo.findOne({ where: { id } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async findByIdentification(identification: string) {
    return this.repo.findOne({ where: { identification } });
  }

  create(dto: CreateClientDto) { return this.repo.save(this.repo.create(dto)); }

  async update(id: string, dto: Partial<CreateClientDto>) {
    const client = await this.findById(id);
    Object.assign(client, dto);
    return this.repo.save(client);
  }

  async deactivate(id: string) {
    await this.findById(id);
    await this.repo.update(id, { isActive: false });
  }

  async seedConsumidorFinal() {
    const existing = await this.repo.findOne({ where: { identification: '9999999999999' } });
    if (!existing) {
      await this.repo.save(this.repo.create({
        identificationType: IdentificationType.CONSUMIDOR_FINAL,
        identification: '9999999999999',
        name: 'CONSUMIDOR FINAL',
        isActive: true,
      }));
    }
  }
}
