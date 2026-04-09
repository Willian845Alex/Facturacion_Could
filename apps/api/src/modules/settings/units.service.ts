import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Unit } from './unit.entity';
import { CreateUnitDto } from './dto/create-unit.dto';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly repo: Repository<Unit>,
  ) {}

  findAll(): Promise<Unit[]> {
    return this.repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async findById(id: string): Promise<Unit> {
    const unit = await this.repo.findOne({ where: { id } });
    if (!unit) throw new NotFoundException('Unidad de medida no encontrada');
    return unit;
  }

  async create(dto: CreateUnitDto): Promise<Unit> {
    const exists = await this.repo.findOne({
      where: { abbreviation: dto.abbreviation.toUpperCase() },
    });
    if (exists) throw new ConflictException(`La abreviatura '${dto.abbreviation}' ya existe`);
    return this.repo.save(
      this.repo.create({ ...dto, abbreviation: dto.abbreviation.toUpperCase(), name: dto.name.toUpperCase() }),
    );
  }

  async update(id: string, dto: Partial<CreateUnitDto>): Promise<Unit> {
    const unit = await this.findById(id);
    if (dto.abbreviation) dto.abbreviation = dto.abbreviation.toUpperCase();
    if (dto.name) dto.name = dto.name.toUpperCase();
    Object.assign(unit, dto);
    return this.repo.save(unit);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.repo.update(id, { isActive: false });
  }

  async seedDefaults(): Promise<void> {
    const defaults = [
      { name: 'UNIDAD',     abbreviation: 'UND' },
      { name: 'KILOGRAMO',  abbreviation: 'KG'  },
      { name: 'GRAMO',      abbreviation: 'G'   },
      { name: 'LIBRA',      abbreviation: 'LB'  },
      { name: 'LITRO',      abbreviation: 'L'   },
      { name: 'MILILITRO',  abbreviation: 'ML'  },
      { name: 'METRO',      abbreviation: 'M'   },
      { name: 'CENTIMETRO', abbreviation: 'CM'  },
      { name: 'CAJA',       abbreviation: 'CJA' },
      { name: 'FUNDA',      abbreviation: 'FND' },
      { name: 'DOCENA',     abbreviation: 'DOC' },
      { name: 'PAR',        abbreviation: 'PAR' },
    ];

    for (const u of defaults) {
      const exists = await this.repo.findOne({ where: { abbreviation: u.abbreviation } });
      if (!exists) await this.repo.save(this.repo.create(u));
    }
  }
}
