import { AppDataSource } from '../data-source';

const DEFAULT_UNITS = [
  { name: 'UNIDAD',      abbreviation: 'UND' },
  { name: 'KILOGRAMO',   abbreviation: 'KG'  },
  { name: 'GRAMO',       abbreviation: 'G'   },
  { name: 'LIBRA',       abbreviation: 'LB'  },
  { name: 'LITRO',       abbreviation: 'L'   },
  { name: 'MILILITRO',   abbreviation: 'ML'  },
  { name: 'METRO',       abbreviation: 'M'   },
  { name: 'CENTIMETRO',  abbreviation: 'CM'  },
  { name: 'CAJA',        abbreviation: 'CJA' },
  { name: 'FUNDA',       abbreviation: 'FND' },
  { name: 'DOCENA',      abbreviation: 'DOC' },
  { name: 'PAR',         abbreviation: 'PAR' },
];

async function seed() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository('units');

  let created = 0;
  for (const unit of DEFAULT_UNITS) {
    const exists = await repo.findOne({ where: { abbreviation: unit.abbreviation } });
    if (!exists) {
      await repo.save(repo.create(unit));
      created++;
    }
  }

  console.log(`✓ Unidades de medida: ${created} creadas, ${DEFAULT_UNITS.length - created} ya existían.`);
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Error en seed de unidades:', err.message);
  process.exit(1);
});
