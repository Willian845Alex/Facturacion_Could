import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Resolved at class-load time so it works both in ts-node (src/) and compiled (dist/)
// From apps/api/src/modules/sri/services/ → 6 levels up = project root
const JAR_PATH = 'C:\\xampp\\htdocs\\Factura_Sri\\apps\\signer\\target\\signer-1.0.0-jar-with-dependencies.jar';

@Injectable()
export class JavaSignerService {
  private readonly logger = new Logger(JavaSignerService.name);

  constructor(private readonly settingsService: SettingsService) { }

  async firmarXml(xmlStr: string): Promise<string> {
    if (!fs.existsSync(JAR_PATH)) {
      throw new InternalServerErrorException(
        `JAR de firma no encontrado en: ${JAR_PATH}. Ejecuta: cd apps/signer && mvn clean package`,
      );
    }

    const { p12Buffer, password } = await this.settingsService.getCertificadoDecrypted();
    const p12Base64 = p12Buffer.toString('base64');

    const payload = JSON.stringify({ xml: xmlStr, p12Base64, password });

    const result = await this.invokeJar(payload);

    if (!result.success) {
      throw new InternalServerErrorException(`Error en firma Java: ${result.error}`);
    }

    return result.signedXml as string;
  }

  private invokeJar(stdinPayload: string): Promise<{ success: boolean; signedXml?: string; error?: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('C:\\Program Files\\Eclipse Adoptium\\jdk-25.0.2.10-hotspot\\bin\\java.exe', ['-jar', JAR_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

      child.on('error', (err) => {
        reject(new InternalServerErrorException(`No se pudo ejecutar java: ${err.message}`));
      });

      child.on('close', (code) => {
        if (stderr) {
          this.logger.debug(`JAR stderr: ${stderr.substring(0, 500)}`);
        }
        const raw = stdout.trim();
        if (!raw) {
          reject(new InternalServerErrorException(
            `JAR no produjo salida (exit code ${code}). stderr: ${stderr.substring(0, 300)}`,
          ));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new InternalServerErrorException(
            `Respuesta JAR no es JSON válido: ${raw.substring(0, 300)}`,
          ));
        }
      });

      child.stdin.write(stdinPayload, 'utf8');
      child.stdin.end();
    });
  }
}
