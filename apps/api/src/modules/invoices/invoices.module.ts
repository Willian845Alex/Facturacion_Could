import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Invoice } from './entities/invoice.entity';
import { InvoiceItem } from './entities/invoice-item.entity';
import { SriTransaction } from './entities/sri-transaction.entity';
import { InvoicesController } from './invoices.controller';
import { InvoicesPublicController } from './invoices-public.controller';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotesRideController } from './credit-notes-ride.controller';
import { MailerService } from './services/mailer.service';
import { InvoicesService } from './invoices.service';
import { CreditNotesService } from './credit-notes.service';
import { CreditNote } from './entities/credit-note.entity';
import { SriModule } from '../sri/sri.module';
import { SettingsModule } from '../settings/settings.module';
import { ClientsModule } from '../clients/clients.module';
import { ProductsModule } from '../products/products.module';
import { BranchesModule } from '../branches/branches.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CashRegisterModule } from '../cash-register/cash-register.module';
import { SriQueueProcessor } from './processors/sri-queue.processor';
import { InvoiceGateway } from './gateways/invoice.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceItem, SriTransaction, CreditNote]),
    BullModule.registerQueue({ name: 'sri-queue' }),
    SriModule,
    SettingsModule,
    ClientsModule,
    ProductsModule,
    BranchesModule,
    InventoryModule,
    CashRegisterModule,
  ],
  controllers: [InvoicesController, InvoicesPublicController, CreditNotesController, CreditNotesRideController],
  providers: [InvoicesService, CreditNotesService, SriQueueProcessor, InvoiceGateway, MailerService],
  exports: [InvoicesService, InvoiceGateway],
})
export class InvoicesModule {}
