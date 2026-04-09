import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CreditNotesService } from './credit-notes.service';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('invoices')
export class CreditNotesController {
  constructor(private readonly service: CreditNotesService) {}

  @Post(':id/credit-note')
  create(
    @Param('id') invoiceId: string,
    @Body() dto: CreateCreditNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.service.create(invoiceId, dto, user.id);
  }

  @Get(':id/credit-notes')
  findByInvoice(@Param('id') invoiceId: string) {
    return this.service.findByInvoice(invoiceId);
  }
}
