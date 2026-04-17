import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  // ─── Sales ────────────────────────────────────────────────────────────────

  @Get('sales')
  getSales(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('userId') userId?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to + 'T23:59:59') : new Date(new Date().setHours(23, 59, 59, 999));
    return this.service.getSalesReport(fromDate, toDate, branchId, userId);
  }

  @Get('sales/export')
  async exportSales(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branchId') branchId?: string,
    @Query('userId') userId?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to + 'T23:59:59') : new Date(new Date().setHours(23, 59, 59, 999));
    const buffer = await this.service.exportSalesExcel(fromDate, toDate, branchId, userId);
    const filename = `reporte-ventas-${from ?? 'hoy'}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  // ─── ATS ──────────────────────────────────────────────────────────────────

  @Get('ats/preview')
  getAtsPreview(
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.service.getAtsPreview(parseInt(year), parseInt(month));
  }

  // IMPORTANT: declared before /ats (no param) to avoid ambiguity — but since it's a different path this is fine
  @Get('ats')
  async downloadAts(
    @Res() res: Response,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    const y = parseInt(year);
    const m = parseInt(month);
    const xml = await this.service.generateATS(y, m);
    const filename = `ATS-${y}-${String(m).padStart(2, '0')}.xml`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(xml);
  }

  // ─── Inventory ────────────────────────────────────────────────────────────

  @Get('inventory')
  getInventory() {
    return this.service.getInventoryReport();
  }

  @Get('inventory/export')
  async exportInventory(@Res() res: Response) {
    const buffer = await this.service.exportInventoryExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-inventario.xlsx"');
    res.send(buffer);
  }

  // ─── Kardex ───────────────────────────────────────────────────────────────

  @Get('kardex')
  getKardex(
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getKardexReport(productId, from, to);
  }

  @Get('kardex/export')
  async exportKardex(
    @Res() res: Response,
    @Query('productId') productId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.service.exportKardexExcel(productId, from, to);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte-kardex.xlsx"');
    res.send(buffer);
  }

  // ─── Legacy (backward compat) ─────────────────────────────────────────────

  @Get('ventas')
  reporteVentasLegacy(
    @Query('desde') desde: string,
    @Query('hasta') hasta: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.reporteVentas(new Date(desde), new Date(hasta), branchId);
  }

  @Get('anexo-transaccional')
  anexoLegacy(
    @Query('anio') anio: string,
    @Query('mes') mes: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.anexoTransaccional(parseInt(anio), parseInt(mes), branchId);
  }
}
