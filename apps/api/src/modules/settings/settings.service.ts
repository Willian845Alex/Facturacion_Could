import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Setting } from './entities/setting.entity';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
  private readonly algorithm = 'aes-256-gcm';

  constructor(
    @InjectRepository(Setting)
    private readonly repo: Repository<Setting>,
    private readonly config: ConfigService,
  ) {}

  private getKey(): Buffer {
    const key = this.config.get<string>('ENCRYPTION_KEY', '');
    return crypto.scryptSync(key, 'facturacion-ec-salt', 32);
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.getKey(), iv) as crypto.CipherGCM;
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(encryptedBase64: string): string {
    const data = Buffer.from(encryptedBase64, 'base64');
    const iv = data.subarray(0, 16);
    const tag = data.subarray(16, 32);
    const encrypted = data.subarray(32);
    const decipher = crypto.createDecipheriv(this.algorithm, this.getKey(), iv) as crypto.DecipherGCM;
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }

  async get(): Promise<Setting> {
    const settings = await this.repo.findOne({ where: {} });
    if (!settings) throw new NotFoundException('Configuración no inicializada');
    return settings;
  }

  async upsert(dto: UpdateSettingsDto): Promise<Setting> {
    let settings = await this.repo.findOne({ where: {} });
    if (!settings) settings = this.repo.create();
    Object.assign(settings, dto);
    return this.repo.save(settings);
  }

  async uploadCertificado(p12Buffer: Buffer, password: string): Promise<void> {
    const settings = await this.get();
    settings.certificadoP12Encrypted = this.encrypt(p12Buffer.toString('base64'));
    settings.certificadoPassword = this.encrypt(password);
    await this.repo.save(settings);
  }

  async getCertificadoDecrypted(): Promise<{ p12Buffer: Buffer; password: string }> {
    const settings = await this.get();
    if (!settings.certificadoP12Encrypted) throw new NotFoundException('No hay certificado configurado');
    return {
      p12Buffer: Buffer.from(this.decrypt(settings.certificadoP12Encrypted), 'base64'),
      password: this.decrypt(settings.certificadoPassword),
    };
  }
}
