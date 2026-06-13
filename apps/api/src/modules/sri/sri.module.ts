import { Module } from '@nestjs/common';
import { SriXmlService } from './services/sri-xml.service';
import { SriSignatureService } from './services/sri-signature.service';
import { SriSoapService } from './services/sri-soap.service';
import { SriRideService } from './services/sri-ride.service';
import { JavaSignerService } from './services/java-signer.service';
import { SettingsModule } from '../settings/settings.module';
import { SriReceptionService } from './sri-reception.service';


@Module({
  imports: [SettingsModule],
  providers: [SriXmlService, SriSignatureService, SriSoapService, SriRideService, JavaSignerService, SriReceptionService],
  exports: [SriXmlService, SriSignatureService, SriSoapService, SriRideService, JavaSignerService, SriReceptionService],
})
export class SriModule {}
