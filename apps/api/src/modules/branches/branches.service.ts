import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { CreateBranchDto } from './dto/create-branch.dto';
import { PartialType } from '@nestjs/swagger';
import { CreateBranchDto as UpdateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch)
    private readonly repo: Repository<Branch>,
  ) {}

  findAll() { return this.repo.find({ where: { isActive: true } }); }

  async findById(id: string) {
    const branch = await this.repo.findOne({ where: { id } });
    if (!branch) throw new NotFoundException('Sucursal no encontrada');
    return branch;
  }

  async create(dto: CreateBranchDto) {
    const count = await this.repo.count({ where: { isActive: true } });
    if (count >= 3) throw new BadRequestException('Máximo 3 sucursales permitidas');
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: Partial<CreateBranchDto>) {
    const branch = await this.findById(id);
    Object.assign(branch, dto);
    return this.repo.save(branch);
  }

  async deactivate(id: string) {
    await this.findById(id);
    await this.repo.update(id, { isActive: false });
  }
}
