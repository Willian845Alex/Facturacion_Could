import { Injectable, Logger } from '@nestjs/common';
import * as soap from 'soap';

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

@Injectable()
export class SriSoapService {
  private readonly logger = new Logger(SriSoapService.name);

  private getUrls(ambiente: string) {
    return ambiente === '2' ? WSDL.produccion : WSDL.pruebas;
  }

  async enviarComprobante(xmlFirmado: string, ambiente = '1'): Promise<SriRecepcionResponse> {
    const { recepcion } = this.getUrls(ambiente);
    try {
      const client = await soap.createClientAsync(recepcion);
      const xmlBase64 = Buffer.from(xmlFirmado, 'utf8').toString('base64');
      const result = await client.validarComprobanteAsync({ xml: xmlBase64 });
      const response = result[0]?.RespuestaRecepcionComprobante;
      this.logger.log(`Recepción SRI: ${response?.estado}`);
      return {
        estado: response?.estado ?? 'DESCONOCIDO',
        comprobantes: response?.comprobantes?.comprobante,
      };
    } catch (err) {
      this.logger.error('Error enviando al SRI', err?.message);
      throw err;
    }
  }

  async autorizarComprobante(claveAcceso: string, ambiente = '1'): Promise<SriAutorizacionResponse> {
    const { autorizacion } = this.getUrls(ambiente);
    try {
      const client = await soap.createClientAsync(autorizacion);
      const result = await client.autorizacionComprobanteAsync({ claveAccesoComprobante: claveAcceso });
      this.logger.log(`Respuesta SOAP autorización cruda: ${JSON.stringify(result[0])}`);
      const response = result[0]?.RespuestaAutorizacionComprobante;
      // El SRI devuelve "numeroComprobantes" (no "numeroAutorizaciones")
      const numAuth = Number(response?.numeroComprobantes ?? response?.numeroAutorizaciones ?? 0);

      // node-soap parsea <autorizacion> como objeto (1 item) o array (varios)
      const raw = response?.autorizaciones?.autorizacion ?? response?.autorizaciones;
      const autorizaciones = raw
        ? (Array.isArray(raw) ? raw : [raw]).filter((a: any) => a && typeof a === 'object' && a.estado)
        : [];

      this.logger.log(`SRI comprobantes: ${numAuth}, autorizaciones parseadas: ${autorizaciones.length}`);
      return { numeroAutorizaciones: numAuth, autorizaciones };
    } catch (err) {
      this.logger.error('Error autorizando en SRI', err?.message);
      throw err;
    }
  }
}
