import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bull';
import { InvoicesService } from '../invoices.service';
import { CreditNotesService } from '../credit-notes.service';
import { InvoiceGateway } from '../gateways/invoice.gateway';
import { SriTransaction, SriTransactionStatus } from '../entities/sri-transaction.entity';
import { MailerService } from '../services/mailer.service';
import { InvoiceStatus } from '@facturacion-ec/shared';

@Processor('sri-queue')
export class SriQueueProcessor {
  private readonly logger = new Logger(SriQueueProcessor.name);

  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly creditNotesService: CreditNotesService,
    private readonly invoiceGateway: InvoiceGateway,
    private readonly mailerService: MailerService,
    @InjectRepository(SriTransaction)
    private readonly sriTxRepo: Repository<SriTransaction>,
  ) {}

  @Process('procesar-factura')
  async handleProcesarFactura(job: Job<{ invoiceId: string }>) {
    return this.procesarYNotificar(job);
  }

  @Process('send-invoice')
  async handleSendInvoice(job: Job<{ invoiceId: string }>) {
    return this.procesarYNotificar(job);
  }

  @Process('procesar-nota-credito')
  async handleProcesarNotaCredito(job: Job<{ creditNoteId: string }>) {
    const { creditNoteId } = job.data;
    this.logger.log(`Procesando nota de crédito ${creditNoteId} (intento ${job.attemptsMade + 1})`);
    try {
      await this.creditNotesService.procesarConSri(creditNoteId);
      this.logger.log(`Nota de crédito ${creditNoteId} procesada`);
    } catch (err) {
      this.logger.error(`Error procesando NC ${creditNoteId}: ${err.message}`);
      throw err; // Bull reintentará
    }
  }

  private async procesarYNotificar(job: Job<{ invoiceId: string }>) {
    const { invoiceId } = job.data;
    this.logger.log(`Procesando factura ${invoiceId} (intento ${job.attemptsMade + 1})`);

    try {
      await this.invoicesService.procesarConSri(invoiceId);
    } catch (err) {
      this.logger.error(`Error procesando factura ${invoiceId}: ${err.message}`);
      await this.updateSriTransaction(invoiceId, SriTransactionStatus.ERROR, err.message);
      this.invoiceGateway.emitRejected(invoiceId, {
        invoiceId,
        secuencial: '',
        status: InvoiceStatus.RECHAZADO,
        errors: err.message,
      });
      throw err; // re-throw so Bull retries
    }

    // Reload invoice to get final status
    const invoice = await this.invoicesService.findById(invoiceId);

    if (invoice.status === InvoiceStatus.AUTORIZADO) {
      await this.updateSriTransaction(invoiceId, SriTransactionStatus.AUTORIZADO);
      this.invoiceGateway.emitAuthorized(invoiceId, {
        invoiceId,
        secuencial: invoice.secuencial ?? '',
        numeroAutorizacion: invoice.numeroAutorizacion ?? '',
        fechaAutorizacion: invoice.fechaAutorizacion?.toISOString() ?? '',
        importeTotal: Number(invoice.importeTotal),
        status: invoice.status,
      });
      this.logger.log(`Factura ${invoiceId} autorizada: ${invoice.numeroAutorizacion}`);
      try {
        await this.mailerService.sendInvoiceEmail(invoiceId);
      } catch (mailErr) {
        this.logger.warn(`No se pudo enviar email para factura ${invoiceId}: ${mailErr.message}`);
      }
    } else {
      await this.updateSriTransaction(invoiceId, SriTransactionStatus.RECHAZADO, invoice.mensajesRespuesta);
      this.invoiceGateway.emitRejected(invoiceId, {
        invoiceId,
        secuencial: invoice.secuencial ?? '',
        status: invoice.status,
        errors: invoice.mensajesRespuesta ?? 'Rechazada por el SRI',
      });
      this.logger.warn(`Factura ${invoiceId} rechazada: ${invoice.mensajesRespuesta}`);
    }
  }

  private async updateSriTransaction(invoiceId: string, status: SriTransactionStatus, errorMessage?: string) {
    const tx = await this.sriTxRepo.findOne({ where: { invoiceId } });
    if (tx) {
      tx.status = status;
      tx.attempts = (tx.attempts ?? 0) + 1;
      if (errorMessage) tx.errorMessage = errorMessage;
      await this.sriTxRepo.save(tx);
    }
  }
}
