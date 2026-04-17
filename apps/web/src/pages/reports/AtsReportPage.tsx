import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, openBlob } from '../../services/api'

interface AtsPreview {
  year: number
  month: number
  totalFacturas: number
  totalVentas: number
  totalIva: number
  facturas: {
    id: string
    secuencial: string | null
    fechaEmision: string
    cliente: string
    identificacion: string
    baseImponible: number
    baseNoGravada: number
    montoIva: number
    importeTotal: number
    formaPago: string
  }[]
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function fmt(n: number) { return n.toFixed(2) }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AtsReportPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [isDownloading, setIsDownloading] = useState(false)

  const { data: preview, isLoading } = useQuery<AtsPreview>({
    queryKey: ['ats-preview', year, month],
    queryFn: () => reportsApi.getAtsPreview({ year, month }).then(r => r.data as AtsPreview),
    gcTime: 0,
  })

  async function handleDownloadAts() {
    setIsDownloading(true)
    try {
      const res = await reportsApi.downloadAts({ year, month })
      openBlob(res.data as Blob, `ATS-${year}-${String(month).padStart(2, '0')}.xml`, true)
    } catch {
      alert('Error al generar el ATS. Intente de nuevo.')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ATS — Anexo Transaccional Simplificado</h1>
          <p className="text-sm text-gray-500">Archivo XML para declaración mensual al SRI</p>
        </div>
        <button
          onClick={handleDownloadAts}
          disabled={isDownloading || isLoading || (preview?.totalFacturas ?? 0) === 0}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isDownloading ? 'Generando...' : '↓ Generar ATS (.xml)'}
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-4 items-center">
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Año</label>
          <input
            type="number"
            value={year}
            min={2020}
            max={2030}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1">Mes</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div className="self-end pb-0.5">
          <span className="text-sm text-gray-500 bg-gray-100 px-3 py-2 rounded-lg">
            Período: <strong>{MONTHS[month - 1]} {year}</strong>
          </span>
        </div>
      </div>

      {/* Resumen */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
              <div className="h-7 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 border-l-4 border-l-blue-500 rounded-xl p-5">
            <p className="text-xs font-medium text-gray-500 mb-1">Facturas emitidas</p>
            <p className="text-3xl font-bold text-blue-700">{preview?.totalFacturas ?? 0}</p>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-green-500 rounded-xl p-5">
            <p className="text-xs font-medium text-gray-500 mb-1">Total ventas</p>
            <p className="text-3xl font-bold text-green-700">${fmt(preview?.totalVentas ?? 0)}</p>
          </div>
          <div className="bg-white border border-gray-200 border-l-4 border-l-amber-500 rounded-xl p-5">
            <p className="text-xs font-medium text-gray-500 mb-1">Total IVA</p>
            <p className="text-3xl font-bold text-amber-700">${fmt(preview?.totalIva ?? 0)}</p>
          </div>
        </div>
      )}

      {/* Info ATS */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-1">
        <p className="font-semibold">¿Qué contiene el ATS?</p>
        <p>El archivo XML incluye el resumen de todas las facturas autorizadas del período, agrupadas por cliente con los totales de base imponible, IVA y forma de pago, en el formato requerido por el SRI Ecuador.</p>
        <p className="text-xs text-blue-600 mt-1">Solo se incluyen facturas con estado <strong>AUTORIZADO</strong>.</p>
      </div>

      {/* Preview table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Preview de facturas incluidas
            {preview && <span className="ml-2 text-gray-400 font-normal">({preview.totalFacturas})</span>}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No. Factura</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Identificación</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Base grav.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Base 0%</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">IVA</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : (preview?.facturas ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                    No hay facturas autorizadas en este período.
                  </td>
                </tr>
              ) : (
                (preview?.facturas ?? []).map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.fechaEmision)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.secuencial ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-900">{inv.cliente}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{inv.identificacion}</td>
                    <td className="px-4 py-3 text-right font-mono">${fmt(inv.baseImponible)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-400">${fmt(inv.baseNoGravada)}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-600">${fmt(inv.montoIva)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-blue-700">${fmt(inv.importeTotal)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && (preview?.facturas ?? []).length > 0 && (
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">TOTAL</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    ${fmt((preview?.facturas ?? []).reduce((s, f) => s + f.baseImponible, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-400">
                    ${fmt((preview?.facturas ?? []).reduce((s, f) => s + f.baseNoGravada, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-amber-600">
                    ${fmt((preview?.facturas ?? []).reduce((s, f) => s + f.montoIva, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                    ${fmt((preview?.facturas ?? []).reduce((s, f) => s + f.importeTotal, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
