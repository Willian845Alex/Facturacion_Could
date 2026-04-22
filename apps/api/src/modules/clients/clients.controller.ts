import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clients')
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findAll(
      search,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }

  @Get(':id')
  findById(@Param('id') id: string) { return this.service.findById(id); }

  @Post()
  create(@Body() dto: CreateClientDto) { return this.service.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateClientDto>) { return this.service.update(id, dto); }

  @Delete(':id')
  deactivate(@Param('id') id: string) { return this.service.deactivate(id); }
}
