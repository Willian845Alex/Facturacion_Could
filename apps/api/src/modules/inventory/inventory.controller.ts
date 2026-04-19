import { Controller, Get, Post, Body, Query, Param, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { InventoryService } from './inventory.service';
import { MovementType } from './entities/inventory-movement.entity';

interface MovementBody {
  productId: string;
  quantity: number;
  reference?: string;
  unitCost?: number;
  notes?: string;
}

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('summary')
  getSummary() {
    return this.service.getSummary();
  }

  @Get('movements')
  getMovements(
    @Query('productId') productId?: string,
    @Query('search') search?: string,
    @Query('type') type?: MovementType,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getMovements(productId, type, from, to, search);
  }

  @Post('movements/entry')
  createEntry(@Body() body: MovementBody) {
    return this.service.registrarMovimiento(
      body.productId, MovementType.ENTRADA_COMPRA, body.quantity,
      undefined, body.notes, body.reference, body.unitCost,
    );
  }

  @Post('movements/exit')
  createExit(@Body() body: MovementBody) {
    return this.service.registrarMovimiento(
      body.productId, MovementType.SALIDA_VENTA, body.quantity,
      undefined, body.notes, body.reference, body.unitCost,
    );
  }

  @Post('movements/adjustment')
  createAdjustment(@Body() body: { productId: string; newStock: number; motive: string }) {
    return this.service.registrarAjuste(body.productId, body.newStock, body.motive);
  }

  // IMPORTANT: this route must be declared BEFORE /kardex/:productId
  @Get('kardex/export')
  async exportKardex(@Res() res: Response) {
    const csv = await this.service.getKardexExport();
    const bom = '\ufeff'; // UTF-8 BOM for Excel compatibility
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kardex-completo.csv"');
    res.send(bom + csv);
  }

  @Get('kardex/:productId')
  getKardex(
    @Param('productId') productId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getKardexDetallado(productId, from, to);
  }

  @Post('movements')
  registrar(@Body() body: { productId: string; type: MovementType; quantity: number; notes?: string }) {
    return this.service.registrarMovimiento(body.productId, body.type, body.quantity, undefined, body.notes);
  }
}
