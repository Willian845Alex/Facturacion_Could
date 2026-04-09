import { Injectable } from '@nestjs/common';
import { JavaSignerService } from './java-signer.service';

@Injectable()
export class SriSignatureService {
  constructor(private readonly javaSignerService: JavaSignerService) {}

  async firmarXml(xmlStr: string): Promise<string> {
    return this.javaSignerService.firmarXml(xmlStr);
  }
}
