// ─── Acciones posibles ante errores del SRI ───────────────────────────────────

export enum SriErrorAction {
    /** El comprobante ya está en el SRI — solo consultar autorización */
    CONSULTAR_AUTORIZACION = 'CONSULTAR_AUTORIZACION',
    /** Error transitorio — Bull debe reintentar el job */
    REINTENTAR = 'REINTENTAR',
    /** Error definitivo de datos — marcar como RECHAZADO sin reintentar */
    RECHAZAR = 'RECHAZAR',
    /** Error de negocio grave — rechazar y notificar al administrador */
    ALERTAR = 'ALERTAR',
}

export interface SriErrorDefinition {
    descripcion: string;
    accion: SriErrorAction;
}

/**
 * Catálogo oficial de errores del SRI ecuatoriano.
 * Para agregar un nuevo código: solo añadir una entrada aquí.
 * Fuente: Manual del Desarrollador SRI v2.21
 */
export const SRI_ERRORS: Record<string, SriErrorDefinition> = {
    // ── Clave ya procesada — no es error real, solo consultar ──────────────────
    '43': { descripcion: 'Clave acceso registrada', accion: SriErrorAction.CONSULTAR_AUTORIZACION },
    '70': { descripcion: 'Clave acceso en procesamiento', accion: SriErrorAction.CONSULTAR_AUTORIZACION },

    // ── Errores transitorios — reintentar ──────────────────────────────────────
    '49': { descripcion: 'Argumentos WS nulos', accion: SriErrorAction.REINTENTAR },
    '50': { descripcion: 'Error interno SRI', accion: SriErrorAction.REINTENTAR },

    // ── Errores de negocio graves — alertar al administrador ──────────────────
    '56': { descripcion: 'Establecimiento cerrado', accion: SriErrorAction.ALERTAR },
    '57': { descripcion: 'Autorización suspendida', accion: SriErrorAction.ALERTAR },
    '63': { descripcion: 'RUC clausurado', accion: SriErrorAction.ALERTAR },

    // ── Errores definitivos de datos — rechazar ────────────────────────────────
    '45': { descripcion: 'Secuencial registrado', accion: SriErrorAction.RECHAZAR },
    '46': { descripcion: 'RUC no existe', accion: SriErrorAction.RECHAZAR },
    '47': { descripcion: 'Tipo comprobante no existe', accion: SriErrorAction.RECHAZAR },
    '48': { descripcion: 'XSD no existe', accion: SriErrorAction.RECHAZAR },
    '58': { descripcion: 'Error estructura clave acceso', accion: SriErrorAction.RECHAZAR },
    '65': { descripcion: 'Fecha emisión extemporánea', accion: SriErrorAction.RECHAZAR },
    '67': { descripcion: 'Fecha inválida', accion: SriErrorAction.RECHAZAR },
    '80': { descripcion: 'Clave acceso inválida', accion: SriErrorAction.RECHAZAR },
};

// ─── Tipos de respuesta ───────────────────────────────────────────────────────

export interface SriMensaje {
    identificador: string;
    mensaje: string;
    tipo?: string;
    informacionAdicional?: string;
}

export type SriRecepcionResultado =
    | { accion: SriErrorAction.CONSULTAR_AUTORIZACION; resumen: string }
    | { accion: SriErrorAction.REINTENTAR; resumen: string }
    | { accion: SriErrorAction.RECHAZAR; resumen: string }
    | { accion: SriErrorAction.ALERTAR; resumen: string };

// ─── Prioridad de acciones ────────────────────────────────────────────────────

const PRIORIDAD: Record<SriErrorAction, number> = {
    [SriErrorAction.CONSULTAR_AUTORIZACION]: 0,
    [SriErrorAction.REINTENTAR]: 1,
    [SriErrorAction.ALERTAR]: 2,
    [SriErrorAction.RECHAZAR]: 3,
};

// ─── Función pura — sin side effects, 100% testeable ─────────────────────────

/**
 * Dado un array de mensajes SRI, determina la acción a tomar.
 *
 * Regla de prioridad (menor → mayor gravedad):
 *   CONSULTAR_AUTORIZACION → REINTENTAR → ALERTAR → RECHAZAR
 *
 * - Si todos son CONSULTAR_AUTORIZACION → consultar.
 * - Si cualquiera es RECHAZAR → rechazar (es el más grave).
 * - Identificador desconocido → RECHAZAR por defecto (safe fallback).
 */
export function resolverMensajesSri(mensajes: SriMensaje[]): SriRecepcionResultado {
    if (!mensajes.length) {
        return {
            accion: SriErrorAction.RECHAZAR,
            resumen: 'SRI devolvió DEVUELTA sin mensajes de error',
        };
    }

    let accionFinal = SriErrorAction.CONSULTAR_AUTORIZACION;

    for (const m of mensajes) {
        const accion = SRI_ERRORS[m.identificador]?.accion ?? SriErrorAction.RECHAZAR;
        if (PRIORIDAD[accion] > PRIORIDAD[accionFinal]) {
            accionFinal = accion;
        }
    }

    const resumen = mensajes
        .map(m => {
            const desc = SRI_ERRORS[m.identificador]?.descripcion ?? 'Código desconocido';
            const extra = m.informacionAdicional ? ` — ${m.informacionAdicional}` : '';
            return `[${m.identificador}] ${desc}${extra}`;
        })
        .join(' | ');

    return { accion: accionFinal, resumen };
}

/**
 * Normaliza el campo mensajes que el SRI devuelve como objeto o array.
 */
export function normalizarMensajesSri(raw: any): SriMensaje[] {
    if (!raw) return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.filter(Boolean);
}