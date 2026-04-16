import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('ivaRate') ivaRate?: string,
    @Query('stockFilter') stockFilter?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll({
      search,
      status: (status as 'all' | 'active' | 'inactive') || 'active',
      ivaRate: ivaRate !== undefined && ivaRate !== '' ? Number(ivaRate) : undefined,
      stockFilter: stockFilter as 'all' | 'low' | 'out' | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(':id')
  findById(@Param('id') id: string) { return this.service.findById(id); }

  @Post()
  create(@Body() dto: CreateProductDto) { return this.service.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateProductDto>) { return this.service.update(id, dto); }

  @Delete(':id')
  deactivate(@Param('id') id: string) { return this.service.deactivate(id); }
}
