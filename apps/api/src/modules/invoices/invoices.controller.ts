import {
  Controller, Get, Post, Delete, Param, Body, Query, UseGuards,
  Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { MailerService } from './services/mailer.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('invoices')

export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly mailerService: MailerService,
  ) { }

  @Get()
  findAll(
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.findAll(
      branchId,
      status,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      search,
      dateFrom,
      dateTo,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDraft(@Param('id') id: string) { return this.service.deleteDraft(id); }



  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Get(':id/ride')
  async getRide(@Param('id') id: string, @Res() res: Response) {
    const inv = await this.service.findById(id);
    const pdf = await this.service.getRide(id);
    const num = inv.branch
      ? `${inv.branch.codigoEstablecimiento}-${inv.branch.puntoEmision}-${inv.secuencial}`
      : inv.secuencial ?? id;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="RIDE-${num}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.status(HttpStatus.OK).send(pdf);
  }

  @Post(':id/send-email')
  @HttpCode(HttpStatus.OK)
  async sendEmail(@Param('id') id: string) {
    await this.mailerService.sendInvoiceEmail(id);
    return { message: 'Email enviado correctamente' };
  }

  @Get(':id/xml')
  async getXml(@Param('id') id: string, @Res() res: Response) {
    const inv = await this.service.findById(id);
    const xml = inv.xmlAutorizado || inv.xmlFirmado || inv.xmlSinFirma;
    res.set({
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="factura-${inv.claveAcceso}.xml"`,
    });
    res.status(HttpStatus.OK).send(xml);
  }

  @Get(':id/retry-data')
  getRetryData(@Param('id') id: string) {
    return this.service.getRetryData(id);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const invoice = await this.service.findById(id);
    console.log('findById response:', {
      id: invoice.id,
      status: invoice.status,
      numeroAutorizacion: invoice.numeroAutorizacion,
    });
    return invoice;
  }
}
