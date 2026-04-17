import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { UsersService } from './modules/users/users.service';
import { UnitsService } from './modules/settings/units.service';
import { ClientsService } from './modules/clients/clients.service';
import { BranchesService } from './modules/branches/branches.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { BranchesModule } from './modules/branches/branches.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ProductsModule } from './modules/products/products.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SriModule } from './modules/sri/sri.module';
import { CashRegisterModule } from './modules/cash-register/cash-register.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

async function seedWithRetry(seedFn: () => Promise<void>, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await seedFn();
      return;
    } catch (err) {
      if (i < retries - 1) {
        console.log(`Seed falló, reintentando en 3s... (${i + 1}/${retries})`);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.error('Seed falló después de varios intentos:', err.message);
      }
    }
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASSWORD', ''),
        database: config.get('DB_NAME', 'facturacion'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        autoLoadEntities: true,
        synchronize: config.get('DB_SYNCHRONIZE') === 'true' ||
          config.get('NODE_ENV') === 'development',
        migrationsRun: config.get('NODE_ENV') !== 'development' &&
          config.get('DB_SYNCHRONIZE') !== 'true',
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    AuthModule,
    UsersModule,
    BranchesModule,
    SettingsModule,
    ClientsModule,
    ProductsModule,
    InvoicesModule,
    InventoryModule,
    ReportsModule,
    SriModule,
    CashRegisterModule,
    DashboardModule,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(
    private readonly usersService: UsersService,
    private readonly unitsService: UnitsService,
    private readonly clientsService: ClientsService,
    private readonly branchesService: BranchesService,
  ) { }

  async onApplicationBootstrap() {
    await seedWithRetry(() => this.usersService.seedAdmin());
    await seedWithRetry(() => this.unitsService.seedDefaults());
    await seedWithRetry(() => this.clientsService.seedConsumidorFinal());

    // Seed vendedor demo con la primera sucursal disponible
    const branches = await this.branchesService.findAll();
    const firstBranch = branches.find(b => b.isActive) ?? branches[0] ?? null;
    await seedWithRetry(() => this.usersService.seedVendedorDemo(firstBranch?.id ?? null));
  }
}
