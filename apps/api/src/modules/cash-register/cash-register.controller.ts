import {
  Controller, Get, Post, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CashRegisterService } from './cash-register.service';
import { OpenCashDto } from './dto/open-cash.dto';
import { CloseCashDto } from './dto/close-cash.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('cash-register')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('cash-register')
export class CashRegisterController {
  constructor(private readonly service: CashRegisterService) {}

  @Post('open')
  @HttpCode(HttpStatus.CREATED)
  open(@Body() dto: OpenCashDto, @CurrentUser() user: any) {
    return this.service.open(dto, { id: user.id, name: user.name });
  }

  @Get('current')
  getCurrent(@Query('branchId') branchId?: string) {
    return this.service.getCurrent(branchId);
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  close(@Body() dto: CloseCashDto) {
    return this.service.close(dto);
  }

  @Get('history')
  getHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getHistory(Number(page ?? 1), Number(limit ?? 20));
  }

  @Get(':id/report')
  getReport(@Param('id') id: string) {
    return this.service.getReport(id);
  }
}
