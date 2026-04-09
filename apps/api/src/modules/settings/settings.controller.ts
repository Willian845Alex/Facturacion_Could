import {
  Controller, Get, Patch, Post, Body, UseGuards,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@facturacion-ec/shared';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  get() { return this.service.get(); }

  @Patch()
  upsert(@Body() dto: UpdateSettingsDto) { return this.service.upsert(dto); }

  @Post('certificado')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCertificado(
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Body('password') password: string,
  ) {
    await this.service.uploadCertificado(file.buffer, password);
    return { message: 'Certificado cargado correctamente' };
  }
}
