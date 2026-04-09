import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';

/**
 * Public endpoints for invoices — no JWT required.
 * The invoice ID (UUID) already acts as an opaque token;
 * ticket data contains no sensitive company configuration.
 */
@ApiTags('invoices-public')
@Controller('invoices')
export class InvoicesPublicController {
  constructor(private readonly service: InvoicesService) {}

  @Get(':id/ticket')
  getTicket(@Param('id') id: string) {
    return this.service.getTicket(id);
  }
}
