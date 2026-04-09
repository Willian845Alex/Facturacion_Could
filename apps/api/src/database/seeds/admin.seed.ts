import { AppDataSource } from '../data-source';
import * as bcrypt from 'bcryptjs';

async function seed() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository('users');

  const email = 'admin@facturacion.com';
  const exists = await userRepo.findOne({ where: { email } });

  if (exists) {
    console.log(`✓ Admin '${email}' ya existe, omitiendo seed.`);
    await AppDataSource.destroy();
    return;
  }

  const password = await bcrypt.hash('Admin123!', 12);

  await userRepo.save(
    userRepo.create({
      name: 'Administrador',
      email,
      password,
      role: 'ADMIN',
      isActive: true,
    }),
  );

  console.log('✓ Usuario administrador creado:');
  console.log('  Email   : admin@facturacion.com');
  console.log('  Password: Admin123!');
  console.log('  Rol     : ADMIN');

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Error en seed:', err.message);
  process.exit(1);
});
