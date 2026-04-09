import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import * as crypto from 'crypto';
import { DocumentType } from '@facturacion-ec/shared';

export interface TotalImpuestoXml {
  codigo: '2';
  codigoPorcentaje: string; // '0'=0%, '4'=15%
  baseImponible: string;
  valor: string;
}

export interface FacturaDetalle {
  codigoPrincipal: string;
  codigoAuxiliar?: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  descuento: string;
  precioTotalSinImpuesto: string;
  codigoPorcentaje: string;
  tarifa: string;
  baseImponible: string;
  valor: string;
}

export interface NotaCreditoXmlData {
  ambiente: string;
  tipoEmision: string;
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  claveAcceso: string;
  estab: string;
  ptoEmi: string;
  secuencial: string;
  dirMatriz: string;
  fechaEmision: string;        // DD/MM/YYYY — fecha de la nota de crédito
  dirEstablecimiento: string;
  tipoIdentificacionComprador: string;
  razonSocialComprador: string;
  identificacionComprador: string;
  obligadoContabilidad: 'SI' | 'NO';
  numDocModificado: string;    // 001-001-000000073
  fechaEmisionDocSustento: string; // DD/MM/YYYY — fecha factura original
  totalSinImpuestos: string;
  valorModificacion: string;
  motive: string;
  totalConImpuestos: TotalImpuestoXml[];
  detalles: FacturaDetalle[];
  infoAdicional?: { nombre: string; valor: string }[];
}

export interface FacturaXmlData {
  ambiente: string;
  tipoEmision: string;
  razonSocial: string;
  nombreComercial: string;
  ruc: string;
  claveAcceso: string;
  codDoc: string;
  estab: string;
  ptoEmi: string;
  secuencial: string;
  dirMatriz: string;
  fechaEmision: string; // DD/MM/YYYY
  dirEstablecimiento: string;
  contribuyenteEspecial?: string;
  obligadoContabilidad: 'SI' | 'NO';
  tipoIdentificacionComprador: string;
  razonSocialComprador: string;
  identificacionComprador: string;
  direccionComprador?: string;
  totalSinImpuestos: string;
  totalDescuento: string;
  totalConImpuestos: TotalImpuestoXml[];
  detalles: FacturaDetalle[];
  importeTotal: string;
  moneda: string;
  pagos: { formaPago: string; total: string; plazo?: string; unidadTiempo?: string }[];
  infoAdicional?: { nombre: string; valor: string }[];
}

@Injectable()
export class SriXmlService {
  /**
   * Genera clave de acceso 49 dígitos según ficha técnica SRI
   */
  generarClaveAcceso(
    fechaEmision: Date,
    tipoDoc: string,
    ruc: string,
    ambiente: string,
    estab: string,
    ptoEmi: string,
    secuencial: string,
    tipoEmision = '1',
  ): string {
    const fecha = this.formatFechaClave(fechaEmision);
    const serie = `${estab}${ptoEmi}${secuencial.padStart(9, '0')}`;
    const codigo = this.generarCodigoNumerico();
    const claveBase = `${fecha}${tipoDoc}${ruc}${ambiente}${serie}${codigo}${tipoEmision}`;
    const digitoVerificador = this.calcularModulo11(claveBase);
    return `${claveBase}${digitoVerificador}`;
  }

  private formatFechaClave(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear().toString();
    return `${d}${m}${y}`;
  }

  private generarCodigoNumerico(): string {
    return Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  }

  calcularModulo11(clave: string): number {
    const factores = [2, 3, 4, 5, 6, 7];
    let suma = 0;
    let factorIdx = 0;
    for (let i = clave.length - 1; i >= 0; i--) {
      suma += parseInt(clave[i]) * factores[factorIdx % factores.length];
      factorIdx++;
    }
    const residuo = suma % 11;
    if (residuo === 0) return 0;
    if (residuo === 1) return 1;
    return 11 - residuo;
  }

  generarXmlFactura(data: FacturaXmlData): string {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('factura', { id: 'comprobante', version: '1.1.0' });

    // infoTributaria
    const infoTrib = root.ele('infoTributaria');
    infoTrib.ele('ambiente').txt(data.ambiente);
    infoTrib.ele('tipoEmision').txt(data.tipoEmision);
    infoTrib.ele('razonSocial').txt(data.razonSocial);
    infoTrib.ele('nombreComercial').txt(data.nombreComercial);
    infoTrib.ele('ruc').txt(data.ruc);
    infoTrib.ele('claveAcceso').txt(data.claveAcceso);
    infoTrib.ele('codDoc').txt(data.codDoc);
    infoTrib.ele('estab').txt(data.estab);
    infoTrib.ele('ptoEmi').txt(data.ptoEmi);
    infoTrib.ele('secuencial').txt(data.secuencial);
    infoTrib.ele('dirMatriz').txt(data.dirMatriz);
    infoTrib.ele('contribuyenteRimpe').txt('CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE');

    // infoFactura — orden exacto del esquema SRI v2.1
    const infoFac = root.ele('infoFactura');
    infoFac.ele('fechaEmision').txt(data.fechaEmision);
    infoFac.ele('dirEstablecimiento').txt(data.dirEstablecimiento);
    if (data.contribuyenteEspecial) infoFac.ele('contribuyenteEspecial').txt(data.contribuyenteEspecial);
    infoFac.ele('obligadoContabilidad').txt(data.obligadoContabilidad);
    infoFac.ele('tipoIdentificacionComprador').txt(data.tipoIdentificacionComprador);
    infoFac.ele('razonSocialComprador').txt(data.razonSocialComprador);
    infoFac.ele('identificacionComprador').txt(data.identificacionComprador);
    if (data.direccionComprador) infoFac.ele('direccionComprador').txt(data.direccionComprador);
    infoFac.ele('totalSinImpuestos').txt(data.totalSinImpuestos);
    infoFac.ele('totalDescuento').txt(data.totalDescuento);

    const totalConImpuestos = infoFac.ele('totalConImpuestos');
    for (const imp of data.totalConImpuestos) {
      const ti = totalConImpuestos.ele('totalImpuesto');
      ti.ele('codigo').txt(imp.codigo);
      ti.ele('codigoPorcentaje').txt(imp.codigoPorcentaje);
      ti.ele('baseImponible').txt(imp.baseImponible);
      ti.ele('valor').txt(imp.valor);
    }

    infoFac.ele('propina').txt('0.00');
    infoFac.ele('importeTotal').txt(data.importeTotal);
    infoFac.ele('moneda').txt(data.moneda);

    const pagos = infoFac.ele('pagos');
    for (const pago of data.pagos) {
      const p = pagos.ele('pago');
      p.ele('formaPago').txt(pago.formaPago);
      p.ele('total').txt(pago.total);
      if (pago.plazo) p.ele('plazo').txt(pago.plazo);
      if (pago.unidadTiempo) p.ele('unidadTiempo').txt(pago.unidadTiempo);
    }

    // detalles
    const detalles = root.ele('detalles');
    for (const det of data.detalles) {
      const d = detalles.ele('detalle');
      d.ele('codigoPrincipal').txt(det.codigoPrincipal);
      if (det.codigoAuxiliar) d.ele('codigoAuxiliar').txt(det.codigoAuxiliar);
      d.ele('descripcion').txt(det.descripcion);
      d.ele('cantidad').txt(det.cantidad);
      d.ele('precioUnitario').txt(det.precioUnitario);
      d.ele('descuento').txt(det.descuento);
      d.ele('precioTotalSinImpuesto').txt(det.precioTotalSinImpuesto);
      const impuestos = d.ele('impuestos');
      const imp = impuestos.ele('impuesto');
      imp.ele('codigo').txt('2');
      imp.ele('codigoPorcentaje').txt(det.codigoPorcentaje);
      imp.ele('tarifa').txt(det.tarifa);
      imp.ele('baseImponible').txt(det.baseImponible);
      imp.ele('valor').txt(det.valor);
    }

    if (data.infoAdicional?.length) {
      const info = root.ele('infoAdicional');
      for (const campo of data.infoAdicional) {
        info.ele('campoAdicional', { nombre: campo.nombre }).txt(campo.valor);
      }
    }

    return root.end({ prettyPrint: false });
  }

  generarXmlNotaCredito(data: NotaCreditoXmlData): string {
    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('notaCredito', { id: 'comprobante', version: '1.1.0' });

    // infoTributaria — igual que factura pero codDoc=04
    const infoTrib = root.ele('infoTributaria');
    infoTrib.ele('ambiente').txt(data.ambiente);
    infoTrib.ele('tipoEmision').txt(data.tipoEmision);
    infoTrib.ele('razonSocial').txt(data.razonSocial);
    infoTrib.ele('nombreComercial').txt(data.nombreComercial);
    infoTrib.ele('ruc').txt(data.ruc);
    infoTrib.ele('claveAcceso').txt(data.claveAcceso);
    infoTrib.ele('codDoc').txt('04');
    infoTrib.ele('estab').txt(data.estab);
    infoTrib.ele('ptoEmi').txt(data.ptoEmi);
    infoTrib.ele('secuencial').txt(data.secuencial);
    infoTrib.ele('dirMatriz').txt(data.dirMatriz);
    infoTrib.ele('contribuyenteRimpe').txt('CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE');

    // infoNotaCredito — orden exacto del esquema SRI v1.1.0
    const infoNC = root.ele('infoNotaCredito');
    infoNC.ele('fechaEmision').txt(data.fechaEmision);
    infoNC.ele('dirEstablecimiento').txt(data.dirEstablecimiento);
    infoNC.ele('tipoIdentificacionComprador').txt(data.tipoIdentificacionComprador);
    infoNC.ele('razonSocialComprador').txt(data.razonSocialComprador);
    infoNC.ele('identificacionComprador').txt(data.identificacionComprador);
    infoNC.ele('obligadoContabilidad').txt(data.obligadoContabilidad);
    infoNC.ele('codDocModificado').txt('01'); // 01 = factura
    infoNC.ele('numDocModificado').txt(data.numDocModificado);
    infoNC.ele('fechaEmisionDocSustento').txt(data.fechaEmisionDocSustento);
    infoNC.ele('totalSinImpuestos').txt(data.totalSinImpuestos);
    infoNC.ele('valorModificacion').txt(data.valorModificacion);
    infoNC.ele('moneda').txt('DOLAR');

    const totalConImpuestos = infoNC.ele('totalConImpuestos');
    for (const imp of data.totalConImpuestos) {
      const ti = totalConImpuestos.ele('totalImpuesto');
      ti.ele('codigo').txt(imp.codigo);
      ti.ele('codigoPorcentaje').txt(imp.codigoPorcentaje);
      ti.ele('baseImponible').txt(imp.baseImponible);
      ti.ele('valor').txt(imp.valor);
    }

    // motivo va DESPUÉS de totalConImpuestos según XSD del SRI
    infoNC.ele('motivo').txt(data.motive);

    // detalles — nota de crédito usa codigoInterno/codigoAdicional (≠ factura)
    const detalles = root.ele('detalles');
    for (const det of data.detalles) {
      const d = detalles.ele('detalle');
      d.ele('codigoInterno').txt(det.codigoPrincipal);
      if (det.codigoAuxiliar) d.ele('codigoAdicional').txt(det.codigoAuxiliar);
      d.ele('descripcion').txt(det.descripcion);
      d.ele('cantidad').txt(det.cantidad);
      d.ele('precioUnitario').txt(det.precioUnitario);
      d.ele('descuento').txt(det.descuento);
      d.ele('precioTotalSinImpuesto').txt(det.precioTotalSinImpuesto);
      const impuestos = d.ele('impuestos');
      const imp = impuestos.ele('impuesto');
      imp.ele('codigo').txt('2');
      imp.ele('codigoPorcentaje').txt(det.codigoPorcentaje);
      imp.ele('tarifa').txt(det.tarifa);
      imp.ele('baseImponible').txt(det.baseImponible);
      imp.ele('valor').txt(det.valor);
    }

    if (data.infoAdicional?.length) {
      const info = root.ele('infoAdicional');
      for (const campo of data.infoAdicional) {
        info.ele('campoAdicional', { nombre: campo.nombre }).txt(campo.valor);
      }
    }

    return root.end({ prettyPrint: false });
  }
}
