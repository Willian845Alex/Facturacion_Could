import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Setting } from './entities/setting.entity';
import { Unit } from './unit.entity';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [TypeOrmModule.forFeature([Setting, Unit])],
  controllers: [SettingsController, UnitsController],
  providers: [SettingsService, UnitsService],
  exports: [SettingsService, UnitsService],
})
export class SettingsModule {}
