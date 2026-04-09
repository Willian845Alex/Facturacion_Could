import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('ventas')
  reporteVentas(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.reporteVentas(new Date(desde), new Date(hasta), branchId);
  }

  @Get('anexo-transaccional')
  anexo(
    @Query('anio') anio: string,
    @Query('mes') mes: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.anexoTransaccional(parseInt(anio), parseInt(mes), branchId);
  }
}
