import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '@facturacion-ec/shared';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async findAll() {
    return this.repo.find({
      select: ['id', 'email', 'name', 'role', 'branchId', 'isActive', 'createdAt'],
      relations: ['branch'],
      order: { createdAt: 'ASC' },
    });
  }

  async findById(id: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  async create(dto: CreateUserDto) {
    const exists = await this.findByEmail(dto.email);
    if (exists) throw new ConflictException('El email ya está registrado');

    if (dto.role === UserRole.VENDEDOR && !dto.branchId) {
      throw new BadRequestException('El vendedor debe tener un punto de emisión asignado');
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = this.repo.create({ ...dto, password: hashed });
    const saved = await this.repo.save(user);
    const { password: _, ...result } = saved;
    return result;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findById(id);

    const effectiveRole = dto.role ?? user.role;
    const effectiveBranchId = dto.branchId !== undefined ? dto.branchId : user.branchId;
    if (effectiveRole === UserRole.VENDEDOR && !effectiveBranchId) {
      throw new BadRequestException('El vendedor debe tener un punto de emisión asignado');
    }

    if (dto.password) dto.password = await bcrypt.hash(dto.password, 12);
    Object.assign(user, dto);
    const saved = await this.repo.save(user);
    const { password: _, ...result } = saved;
    return result;
  }

  async deactivate(id: string) {
    await this.findById(id);
    await this.repo.update(id, { isActive: false });
  }

  async seedAdmin() {
    const admin = await this.findByEmail('admin@empresa.ec');
    if (!admin) {
      await this.create({
        email: 'admin@empresa.ec',
        password: 'Admin1234!',
        name: 'Administrador',
        role: UserRole.ADMIN,
      });
      console.log('Admin seed: admin@empresa.ec / Admin1234!');
    }
  }

  async seedVendedorDemo(branchId: string | null) {
    const existing = await this.findByEmail('vendedor@facturacion.com');
    if (!existing && branchId) {
      await this.create({
        email: 'vendedor@facturacion.com',
        password: 'Vendedor123!',
        name: 'Vendedor Demo',
        role: UserRole.VENDEDOR,
        branchId,
      });
      console.log('Vendedor seed: vendedor@facturacion.com / Vendedor123!');
    }
  }
}
