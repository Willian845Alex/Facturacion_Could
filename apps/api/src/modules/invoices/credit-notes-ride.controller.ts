import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { CreditNotesService } from './credit-notes.service';

@ApiTags('credit-notes')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('credit-notes')
export class CreditNotesRideController {
  constructor(private readonly service: CreditNotesService) {}

  @Get(':id/ride')
  async getRide(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const pdf = await this.service.getRide(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="NC-RIDE-${id}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }
}
