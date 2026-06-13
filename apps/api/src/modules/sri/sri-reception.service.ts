import { Injectable, Logger } from '@nestjs/common';
import {
    SriErrorAction,
    SriMensaje,
    normalizarMensajesSri,
    resolverMensajesSri,
} from './sri-errors';

// ─── Resultado tipado que invoices.service consume ────────────────────────────

export type RecepcionResultado =
    | { tipo: 'RECIBIDA' }
    | { tipo: 'CONSULTAR_AUTORIZACION'; resumen: string }
    | { tipo: 'REINTENTAR'; resumen: string }
    | { tipo: 'RECHAZAR'; resumen: string; alerta: false }
    | { tipo: 'RECHAZAR'; resumen: string; alerta: true };

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Interpreta la respuesta de recepción del SRI y devuelve
 * un resultado tipado. No tiene dependencias de base de datos
 * ni de otros servicios — es pura lógica de negocio SRI.
 */
@Injectable()
export class SriReceptionService {
    private readonly logger = new Logger(SriReceptionService.name);

    /**
     * Procesa la respuesta cruda del endpoint de recepción del SRI
     * y devuelve qué debe hacer el flujo de facturación.
     */
    interpretarRecepcion(recepcion: any): RecepcionResultado {
        // ── Caso feliz: SRI recibió el comprobante ──────────────────────────────
        if (recepcion.estado === 'RECIBIDA') {
            return { tipo: 'RECIBIDA' };
        }

        // ── Caso DEVUELTA: SRI rechazó en recepción ─────────────────────────────
        if (recepcion.estado === 'DEVUELTA') {
            const rawMensajes = recepcion.comprobantes?.mensajes?.mensaje;
            const mensajes: SriMensaje[] = normalizarMensajesSri(rawMensajes);

            this.logger.warn(`Mensajes SRI recepción: ${JSON.stringify(mensajes)}`);

            const { accion, resumen } = resolverMensajesSri(mensajes);

            switch (accion) {
                case SriErrorAction.CONSULTAR_AUTORIZACION:
                    this.logger.log(`SRI: ${resumen} — continuando a consultar autorización`);
                    return { tipo: 'CONSULTAR_AUTORIZACION', resumen };

                case SriErrorAction.REINTENTAR:
                    this.logger.warn(`SRI error transitorio: ${resumen}`);
                    return { tipo: 'REINTENTAR', resumen };

                case SriErrorAction.ALERTAR:
                    this.logger.error(`SRI ALERTA — requiere revisión manual: ${resumen}`);
                    return { tipo: 'RECHAZAR', resumen, alerta: true };

                case SriErrorAction.RECHAZAR:
                default:
                    this.logger.warn(`SRI rechazo definitivo: ${resumen}`);
                    return { tipo: 'RECHAZAR', resumen, alerta: false };
            }
        }

        // ── Estado desconocido — tratar como rechazo ────────────────────────────
        const resumen = `Estado SRI desconocido: ${JSON.stringify(recepcion)}`;
        this.logger.error(resumen);
        return { tipo: 'RECHAZAR', resumen, alerta: false };
    }
}