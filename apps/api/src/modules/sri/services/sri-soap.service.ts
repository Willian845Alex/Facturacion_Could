import { Injectable, Logger } from '@nestjs/common';
import * as soap from 'soap';
import * as https from 'https';

export interface SriRecepcionResponse {
  estado: string;
  comprobantes?: { claveAcceso: string; mensajes?: any[] }[];
}

export interface SriAutorizacionResponse {
  numeroAutorizaciones: number;
  autorizaciones?: {
    claveAcceso: string;
    estado: string;
    fechaAutorizacion?: string;
    numeroAutorizacion?: string;
    comprobante?: string;
    mensajes?: any[];
  }[];
}

const WSDL = {
  pruebas: {
    recepcion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    autorizacion: 'https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
  produccion: {
    recepcion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl',
    autorizacion: 'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl',
  },
};

/**
 * Agente HTTPS personalizado para las llamadas al SRI.
 *
 * El SRI sirve sus endpoints detrás de un balanceador de carga cuya IP
 * puede no coincidir con los Subject Alternative Names (SAN) del
 * certificado presentado. Esto provoca el error nativo de Node:
 *   "Hostname/IP does not match certificate's altnames"
 *
 * checkServerIdentity personalizado: seguimos validando que el
 * certificado sea válido y esté vigente (no desactivamos rejectUnauthorized),
 * solo omitimos la comprobación estricta de hostname/IP — que es exactamente
 * la que falla por la infraestructura del SRI, fuera de nuestro control.
 */
const sriHttpsAgent = new https.Agent({
  keepAlive: true,
  checkServerIdentity: () => undefined, // omite solo la validación de hostname/IP
});

@Injectable()
export class SriSoapService {
  private readonly logger = new Logger(SriSoapService.name);

  private getUrls(ambiente: string) {
    return ambiente === '2' ? WSDL.produccion : WSDL.pruebas;
  }

  /**
   * Parchea el httpClient interno de node-soap para que TODAS las
   * peticiones HTTP reales (no solo la descarga del WSDL) usen
   * nuestro agente con checkServerIdentity relajado.
   */
  private patchClientAgent(client: any) {
    const originalRequest = client.httpClient.request.bind(client.httpClient);
    client.httpClient.request = (
      rurl: string, data: any, callback: any, exheaders: any, exoptions: any,
    ) => {
      const opts = { ...(exoptions ?? {}), agent: sriHttpsAgent };
      return originalRequest(rurl, data, callback, exheaders, opts);
    };
    return client;
  }

  async enviarComprobante(xmlFirmado: string, ambiente = '1'): Promise<SriRecepcionResponse> {
    const { recepcion } = this.getUrls(ambiente);
    try {
      const client = await soap.createClientAsync(recepcion, {
        wsdl_options: { agent: sriHttpsAgent },
      });
      this.patchClientAgent(client);

      const xmlBase64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');
      const result = await client.validarComprobanteAsync({ xml: xmlBase64 });
      const response = result[0]?.RespuestaRecepcionComprobante;
      this.logger.log(`Recepción SRI: ${response?.estado}`);
      return {
        estado: response?.estado ?? 'DESCONOCIDO',
        comprobantes: response?.comprobantes?.comprobante,
      };
    } catch (err: any) {
      this.logger.error('Error enviando al SRI', err?.message);
      throw err;
    }
  }

  async autorizarComprobante(claveAcceso: string, ambiente = '1'): Promise<SriAutorizacionResponse> {
    const { autorizacion } = this.getUrls(ambiente);
    try {
      const client = await soap.createClientAsync(autorizacion, {
        wsdl_options: { agent: sriHttpsAgent },
      });
      this.patchClientAgent(client);

      const result = await client.autorizacionComprobanteAsync({ claveAccesoComprobante: claveAcceso });
      this.logger.log(`Respuesta SOAP autorización cruda: ${JSON.stringify(result[0])}`);
      const response = result[0]?.RespuestaAutorizacionComprobante;
      const numAuth = Number(response?.numeroComprobantes ?? response?.numeroAutorizaciones ?? 0);

      const raw = response?.autorizaciones?.autorizacion ?? response?.autorizaciones;
      const autorizaciones = raw
        ? (Array.isArray(raw) ? raw : [raw]).filter((a: any) => a && typeof a === 'object' && a.estado)
        : [];

      this.logger.log(`SRI comprobantes: ${numAuth}, autorizaciones parseadas: ${autorizaciones.length}`);
      return { numeroAutorizaciones: numAuth, autorizaciones };
    } catch (err: any) {
      this.logger.error('Error autorizando en SRI', err?.message);
      throw err;
    }
  }
}