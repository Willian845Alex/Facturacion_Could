import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ProductBatchesService } from './product-batches.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';

@ApiTags('product-batches')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('product-batches')
export class ProductBatchesController {
  constructor(private readonly service: ProductBatchesService) {}

  /** GET /product-batches/expiring-soon?days=90 */
  @Get('expiring-soon')
  findExpiringSoon(@Query('days') days?: string) {
    return this.service.findExpiringSoon(days ? Number(days) : undefined);
  }

  /** GET /product-batches/expired */
  @Get('expired')
  findExpired() {
    return this.service.findExpired();
  }

  /** GET /product-batches/product/:productId */
  @Get('product/:productId')
  findByProduct(@Param('productId') productId: string) {
    return this.service.findByProduct(productId);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  create(@Body() dto: CreateBatchDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBatchDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Param('id') id: string) {
    return this.service.deactivate(id);
  }
}