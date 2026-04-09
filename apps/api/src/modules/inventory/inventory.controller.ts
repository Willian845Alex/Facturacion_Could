import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
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
    @Query('type') type?: MovementType,
  ) {
    return this.service.getMovements(productId, type);
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
