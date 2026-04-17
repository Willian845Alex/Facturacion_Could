import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { reportsApi, branchesApi, usersApi, openBlob } from '../../services/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SalesInvoice {
  id: string
  fechaEmision: string
  secuencial: string | null
  status: string
  formaPagoLabel: string
  client: { name: string; identification: string } | null
  user: { name: string } | null
  branch: { name: string } | null
  subtotal: number
  totalIva: number
  importeTotal: number
}

interface SalesReport {
  summary: { totalVentas: number; totalFacturas: number; promedioFactura: number; totalIva: number }
  byDay: { date: string; total: number; count: number }[]
  byPayment: Record<string, number>
  facturas: SalesInvoice[]
}

type Period = 'today' | 'week' | 'month' | 'custom'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toFixed(2) }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getPeriodDates(period: Period, customFrom: string, customTo: string) {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (period === 'today') {
    const t = iso(now)
    return { from: t, to: t }
  }
  if (period === 'week') {
    const day = now.getDay() || 7
    const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
    return { from: iso(mon), to: iso(now) }
  }
  if (period === 'month') {
    return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: iso(now) }
  }
  return { from: customFrom, to: customTo }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="h-7 bg-gray-200 rounded w-2/3" />
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SalesReportPage() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const firstOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`

  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState(firstOfMonth)
  const [customTo, setCustomTo] = useState(todayStr)
  const [branchId, setBranchId] = useState('')
  const [userId, setUserId] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { from, to } = getPeriodDates(period, customFrom, customTo)

  const { data: report, isLoading } = useQuery<SalesReport>({
    queryKey: ['report-sales', from, to, branchId, userId],
    queryFn: () =>
      reportsApi.getSales({ from, to, branchId: branchId || undefined, userId: userId || undefined })
        .then(r => r.data as SalesReport),
    enabled: !!(from && to),
    gcTime: 0,
  })

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.findAll().then(r => r.data as { id: string; name: string }[]),
  })
  const branches = Array.isArray(branchesData) ? branchesData : []

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.findAll().then(r => r.data as { id: string; name: string }[]),
  })
  const users = Array.isArray(usersData) ? usersData : []

  // Chart data: label dates as dd/mm
  const chartData = useMemo(() => (report?.byDay ?? []).map(d => ({
    ...d,
    label: new Date(d.date + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit' }),
  })), [report])

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await reportsApi.exportSales({ from, to, branchId: branchId || undefined, userId: userId || undefined })
      openBlob(res.data as Blob, `reporte-ventas-${from}.xlsx`, true)
    } catch {
      alert('Error al exportar. Intente de nuevo.')
    } finally {
      setIsExporting(false)
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    AUTORIZADO: 'bg-green-100 text-green-700',
    PENDIENTE: 'bg-yellow-100 text-yellow-700',
    RECHAZADO: 'bg-red-100 text-red-700',
    ANULADO: 'bg-gray-100 text-gray-500',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reporte de Ventas</h1>
          <p className="text-sm text-gray-500">Facturas autorizadas por período</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || isLoading || !report}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
        >
          {isExporting ? 'Exportando...' : '↓ Exportar Excel'}
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        {/* Período */}
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {{ today: 'Hoy', week: 'Esta semana', month: 'Este mes', custom: 'Personalizado' }[p]}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-gray-500">Desde</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            <label className="text-xs text-gray-500">Hasta</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Todas las sucursales</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <select value={userId} onChange={e => setUserId(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            <option value="">Todos los vendedores</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <SummaryCard label="Total ventas" value={`$${fmt(report?.summary.totalVentas ?? 0)}`} color="blue" />
            <SummaryCard label="Cantidad facturas" value={String(report?.summary.totalFacturas ?? 0)} color="green" />
            <SummaryCard label="Promedio por factura" value={`$${fmt(report?.summary.promedioFactura ?? 0)}`} color="purple" />
            <SummaryCard label="Total IVA recaudado" value={`$${fmt(report?.summary.totalIva ?? 0)}`} color="amber" />
          </>
        )}
      </div>

      {/* Gráfica por día */}
      {!isLoading && chartData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Ventas por día</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip
                formatter={(v: number) => [`$${fmt(v)}`, 'Total']}
                labelStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="total" fill="#2563eb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabla detallada */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Detalle de facturas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">No. Factura</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vendedor</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Subtotal</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">IVA</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : (report?.facturas ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                    No hay facturas en el período seleccionado.
                  </td>
                </tr>
              ) : (
                (report?.facturas ?? []).map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.fechaEmision)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.secuencial ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-900">{inv.client?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.user?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-mono">${fmt(inv.subtotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">${fmt(inv.totalIva)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-blue-700">${fmt(inv.importeTotal)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {!isLoading && (report?.facturas ?? []).length > 0 && (
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">TOTAL</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    ${fmt((report?.facturas ?? []).reduce((s, f) => s + f.subtotal, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-500">
                    ${fmt((report?.facturas ?? []).reduce((s, f) => s + f.totalIva, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">
                    ${fmt((report?.facturas ?? []).reduce((s, f) => s + f.importeTotal, 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Resumen por forma de pago */}
      {!isLoading && report && Object.keys(report.byPayment).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Resumen por forma de pago</h2>
          <div className="flex flex-wrap gap-4">
            {Object.entries(report.byPayment).map(([label, amount]) => (
              <div key={label} className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-2.5">
                <span className="text-sm text-gray-600">{label}:</span>
                <span className="text-sm font-semibold text-gray-900">${fmt(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'border-l-blue-500 bg-blue-50',
    green: 'border-l-green-500 bg-green-50',
    purple: 'border-l-purple-500 bg-purple-50',
    amber: 'border-l-amber-500 bg-amber-50',
  }
  const textColors: Record<string, string> = {
    blue: 'text-blue-700',
    green: 'text-green-700',
    purple: 'text-purple-700',
    amber: 'text-amber-700',
  }
  return (
    <div className={`bg-white border border-gray-200 border-l-4 rounded-xl p-5 ${colors[color]}`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${textColors[color]}`}>{value}</p>
    </div>
  )
}
