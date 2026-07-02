import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { dashboardApi, invoicesApi, productBatchesApi } from '../../services/api'
import { InvoiceStatus } from '@facturacion-ec/shared'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuthStore } from '../../store/auth.store'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  today: {
    totalSales: number
    invoiceCount: number
    pendingSRI: number
    cashSales: number
    cardSales: number
    transferSales: number
  }
  myToday: {
    totalSales: number
    invoiceCount: number
  }
  lowStockCount: number
  recentInvoices: {
    id: string
    sequential: string | null
    clientName: string
    total: number
    status: InvoiceStatus
    createdAt: string
  }[]
  lowStockProducts: {
    id: string
    name: string
    mainCode: string
    stockQuantity: number
    minStock: number
    unit: string
  }[]
  salesLast7Days: { date: string; total: number; count: number }[]
  openCashRegister: {
    openedAt: string
    totalCash: number
    totalCard: number
    totalTransfer: number
    totalSales: number
  } | null
}

interface InvoiceDetail {
  id: string
  claveAcceso: string
  secuencial: string
  status: string
  fechaEmision: string
  formaPago: string
  subtotal12: number
  subtotal0: number
  totalDescuento: number
  totalIva: number
  importeTotal: number
  numeroAutorizacion: string | null
  fechaAutorizacion: string | null
  branch: { codigoEstablecimiento: string; puntoEmision: string } | null
  client: { name: string; identification: string; identificationType: string } | null
  items: {
    code: string
    description: string
    quantity: number
    unitPrice: number
    discount: number
    ivaRate: number
    subtotal: number
    total: number
  }[]
}

interface ProductBatch {
  id: string
  productId: string
  batchNumber: string
  expirationDate: string
  remainingQuantity: number
  quantity: number
  isActive: boolean
  product?: { id: string; name: string; code: string; unit?: string }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_LABEL: Record<string, string> = {
  [InvoiceStatus.AUTORIZADO]: 'Autorizada',
  [InvoiceStatus.PENDIENTE]: 'Pendiente',
  [InvoiceStatus.RECHAZADO]: 'Rechazada',
  [InvoiceStatus.BORRADOR]: 'Borrador',
  [InvoiceStatus.ANULADO]: 'Anulada',
}

const STATUS_CLASS: Record<string, string> = {
  [InvoiceStatus.AUTORIZADO]: 'bg-emerald-100 text-emerald-700',
  [InvoiceStatus.PENDIENTE]: 'bg-amber-100 text-amber-700',
  [InvoiceStatus.RECHAZADO]: 'bg-rose-100 text-rose-700',
  [InvoiceStatus.BORRADOR]: 'bg-gray-100 text-gray-600',
  [InvoiceStatus.ANULADO]: 'bg-gray-100 text-gray-500',
}

const PAYMENT_LABELS: Record<string, string> = {
  '01': 'Efectivo',
  '19': 'Tarjeta de crédito',
  '16': 'Tarjeta de débito',
  '17': 'Transferencia',
  '20': 'Otros',
}

function batchDaysLeft(expirationDate: string): number {
  const today = new Date()
  const exp = new Date(expirationDate)
  return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function batchStatusStyle(days: number): { label: string; cls: string } {
  if (days < 0) return { label: 'Caducado', cls: 'bg-red-100 text-red-700' }
  if (days <= 30) return { label: `${days}d`, cls: 'bg-rose-100 text-rose-700' }
  if (days <= 90) return { label: `${days}d`, cls: 'bg-amber-100 text-amber-700' }
  return { label: `${days}d`, cls: 'bg-slate-100 text-slate-600' }
}

function dayLabel(dateStr: string) {
  try { return format(parseISO(dateStr), 'EEE', { locale: es }) } catch { return dateStr }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-4" />
      <div className="h-8 bg-gray-200 rounded w-2/3" />
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const Icon = {
  sales: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 8v2m9-4a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  invoice: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  clock: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  pill: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13a3 3 0 11-4.243-4.243l4-4a3 3 0 114.243 4.243l-4 4zM5 11a3 3 0 104.243 4.243l4-4A3 3 0 109 7l-4 4z" /></svg>,
  cash: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  card: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  transfer: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  bell: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>,
  eye: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>,
  batch: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>,
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────

function InvoiceDetailModal({ invoiceId, onClose }: {
  invoiceId: string
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['invoice-detail-dashboard', invoiceId],
    queryFn: () => invoicesApi.getTicket(invoiceId).then(r => (r.data as any)?.factura as InvoiceDetail),
    enabled: !!invoiceId,
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Detalle de factura</h2>
            {data && (
              <p className="text-xs text-gray-400 mt-0.5 font-mono">
                {data.branch
                  ? `${data.branch.codigoEstablecimiento}-${data.branch.puntoEmision}-${data.secuencial}`
                  : data.secuencial}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
            </div>
          ) : !data ? (
            <p className="text-sm text-gray-400 text-center py-8">No se pudo cargar la factura</p>
          ) : (
            <>
              {/* Estado + fecha */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLASS[data.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_LABEL[data.status] ?? data.status}
                </span>
                <span className="text-xs text-gray-400">
                  {format(new Date(data.fechaEmision), "d 'de' MMMM yyyy", { locale: es })}
                </span>
              </div>

              {/* Cliente */}
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Cliente</p>
                <p className="text-sm font-semibold text-slate-900">{data.client?.name ?? 'Consumidor Final'}</p>
                {data.client && (
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{data.client.identification}</p>
                )}
              </div>

              {/* Forma de pago */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Forma de pago</span>
                <span className="font-medium text-gray-800">{PAYMENT_LABELS[data.formaPago] ?? data.formaPago}</span>
              </div>

              {/* Autorización */}
              {data.numeroAutorizacion && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Autorización SRI</p>
                  <p className="text-[11px] font-mono text-emerald-800 break-all">{data.numeroAutorizacion}</p>
                  {data.fechaAutorizacion && (
                    <p className="text-[11px] text-emerald-600 mt-1">
                      {format(new Date(data.fechaAutorizacion), "d/MM/yyyy HH:mm")}
                    </p>
                  )}
                </div>
              )}

              {/* Items */}
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Productos</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left pb-1.5 text-gray-400 font-medium">Descripción</th>
                      <th className="text-center pb-1.5 text-gray-400 font-medium w-12">Cant.</th>
                      <th className="text-right pb-1.5 text-gray-400 font-medium w-16">Precio</th>
                      <th className="text-right pb-1.5 text-gray-400 font-medium w-16">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.items.map((it, i) => (
                      <tr key={i}>
                        <td className="py-1.5 text-gray-800 font-medium">{it.description}</td>
                        <td className="py-1.5 text-center text-gray-500 tabular-nums">{it.quantity}</td>
                        <td className="py-1.5 text-right text-gray-500 tabular-nums">${Number(it.unitPrice).toFixed(2)}</td>
                        <td className="py-1.5 text-right font-semibold text-gray-900 tabular-nums">${Number(it.total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totales */}
              <div className="border-t border-gray-100 pt-3 space-y-1.5">
                {data.subtotal0 > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Subtotal 0%</span>
                    <span className="tabular-nums">${fmt(data.subtotal0)}</span>
                  </div>
                )}
                {data.subtotal12 > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Subtotal gravado</span>
                    <span className="tabular-nums">${fmt(data.subtotal12)}</span>
                  </div>
                )}
                {data.totalDescuento > 0 && (
                  <div className="flex justify-between text-xs text-rose-500">
                    <span>Descuento</span>
                    <span className="tabular-nums">-${fmt(data.totalDescuento)}</span>
                  </div>
                )}
                {data.totalIva > 0 && (
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>IVA</span>
                    <span className="tabular-nums">${fmt(data.totalIva)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-gray-900 pt-1 border-t border-gray-100">
                  <span>Total</span>
                  <span className="tabular-nums">${fmt(data.importeTotal)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const authUser = useAuthStore(s => s.user)
  const isVendedor = authUser?.role === 'VENDEDOR'
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)

  const { data, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.getStats().then(r => r.data),
    refetchInterval: 30_000,
  })

  const { data: expiringBatches = [] } = useQuery<ProductBatch[]>({
    queryKey: ['batches-expiring-soon'],
    queryFn: () => productBatchesApi.expiringSoon(90).then(r => r.data as ProductBatch[]),
    refetchInterval: 60_000,
  })

  const firstName = authUser?.name?.split(' ')[0] ?? ''

  return (
    <div className="space-y-5 pb-6">

      {/* ── Hero header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 px-6 py-7 text-white">
        <div className="absolute -right-6 -top-6 opacity-10">
          <svg className="w-40 h-40" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 13a3 3 0 11-4.243-4.243l4-4a3 3 0 114.243 4.243l-4 4zM5 11a3 3 0 104.243 4.243l4-4A3 3 0 109 7l-4 4z" />
          </svg>
        </div>
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-emerald-100 text-sm font-medium">
              {isVendedor ? `Hola, ${firstName}` : 'Resumen de hoy'}
            </p>
            <h1 className="text-2xl font-bold mt-0.5 tracking-tight">
              {format(new Date(), "EEEE d 'de' MMMM", { locale: es })}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {expiringBatches.length > 0 && (
              <div className="flex items-center gap-2 bg-amber-400/20 border border-amber-300/40 rounded-full px-4 py-2 backdrop-blur-sm">
                <span className="text-amber-200">{Icon.batch}</span>
                <span className="text-sm font-medium text-amber-100">
                  {expiringBatches.filter(b => batchDaysLeft(b.expirationDate) < 0).length > 0
                    ? `${expiringBatches.filter(b => batchDaysLeft(b.expirationDate) < 0).length} lote(s) caducado(s)`
                    : `${expiringBatches.length} lote(s) por caducar`}
                </span>
              </div>
            )}
            {!isError && (
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-2 backdrop-blur-sm">
                {Icon.bell}
                <span className="text-sm font-medium">
                  {(data?.today.pendingSRI ?? 0) > 0
                    ? `${data?.today.pendingSRI} factura(s) pendiente(s)`
                    : 'Todo al día con el SRI'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : isVendedor ? (
          <>
            <MetricCard label="Mis ventas hoy" value={`$${fmt(data?.myToday.totalSales ?? 0)}`} icon={Icon.sales} tint="emerald" hint="Facturas autorizadas" />
            <MetricCard label="Mis facturas hoy" value={data?.myToday.invoiceCount ?? 0} icon={Icon.invoice} tint="blue" />
            <MetricCard label="Pendientes SRI" value={data?.today.pendingSRI ?? 0} icon={Icon.clock} tint="amber" />
            <MetricCard label="Stock bajo" value={data?.lowStockCount ?? 0} icon={Icon.pill} tint="rose" urgent={(data?.lowStockCount ?? 0) > 0} />
          </>
        ) : (
          <>
            <MetricCard label="Ventas hoy" value={`$${fmt(data?.today.totalSales ?? 0)}`} icon={Icon.sales} tint="emerald" />
            <MetricCard label="Facturas emitidas" value={data?.today.invoiceCount ?? 0} icon={Icon.invoice} tint="blue" />
            <MetricCard label="Pendientes SRI" value={data?.today.pendingSRI ?? 0} icon={Icon.clock} tint="amber" />
            <MetricCard label="Stock bajo" value={data?.lowStockCount ?? 0} icon={Icon.pill} tint="rose" urgent={(data?.lowStockCount ?? 0) > 0} />
          </>
        )}
      </div>

      {/* ── Caja + Gráfico ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div>
          {isLoading ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse h-full">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-3 bg-gray-200 rounded w-3/4 mb-3" />)}
            </div>
          ) : data?.openCashRegister ? (
            <div className="h-full rounded-2xl bg-gradient-to-br from-sky-600 to-blue-700 p-6 text-white flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-sky-100">Caja abierta</p>
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              </div>
              <p className="text-xs text-sky-200 mb-5">
                Desde las {format(new Date(data.openCashRegister.openedAt), 'HH:mm')}
              </p>
              <div className="space-y-3 text-sm flex-1">
                <CashRow icon={Icon.cash} label="Efectivo" amount={data.openCashRegister.totalCash} />
                <CashRow icon={Icon.card} label="Tarjeta" amount={data.openCashRegister.totalCard} />
                <CashRow icon={Icon.transfer} label="Transferencia" amount={data.openCashRegister.totalTransfer} />
              </div>
              <div className="border-t border-white/20 pt-3 mt-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm text-sky-100">Total del turno</span>
                  <span className="text-2xl font-bold tabular-nums">${fmt(data.openCashRegister.totalSales)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl p-6 h-full flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3 text-gray-400">{Icon.cash}</div>
              <p className="text-sm text-gray-400">No hay caja abierta</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-800">Ventas últimos 7 días</p>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              {data?.salesLast7Days?.reduce((a, d) => a + d.count, 0) ?? 0} facturas
            </span>
          </div>
          {isLoading ? (
            <div className="h-48 bg-gray-100 rounded animate-pulse mt-4" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={(data?.salesLast7Days ?? []).map(d => ({ ...d, label: dayLabel(d.date) }))}
                margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={42} />
                <Tooltip
                  formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Ventas']}
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                  cursor={{ stroke: '#10b981', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area type="monotone" dataKey="total" stroke="#059669" strokeWidth={2.5} fill="url(#salesGradient)" dot={{ r: 3, fill: '#059669', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Últimas facturas + Stock bajo ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Últimas facturas del día */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Últimas facturas del día</p>
            <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center">{Icon.invoice}</span>
          </div>
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (data?.recentInvoices?.length ?? 0) === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">Sin facturas hoy</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="px-6 py-2.5 text-left font-medium">Hora</th>
                  <th className="px-6 py-2.5 text-left font-medium">Cliente</th>
                  <th className="px-6 py-2.5 text-right font-medium">Total</th>
                  <th className="px-6 py-2.5 text-right font-medium">Estado</th>
                  <th className="px-3 py-2.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.recentInvoices.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50/80 transition-colors group">
                    <td className="px-6 py-2.5 text-gray-400 whitespace-nowrap text-xs">
                      {format(new Date(inv.createdAt), 'HH:mm')}
                    </td>
                    <td className="px-6 py-2.5 text-gray-800 font-medium truncate max-w-[120px]">
                      {inv.clientName}
                    </td>
                    <td className="px-6 py-2.5 text-right text-gray-900 font-semibold tabular-nums">
                      ${fmt(inv.total)}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_CLASS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setSelectedInvoiceId(inv.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100"
                        title="Ver detalle"
                      >
                        {Icon.eye}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Stock bajo */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">Productos con stock bajo</p>
            <span className="w-7 h-7 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center">{Icon.pill}</span>
          </div>
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (data?.lowStockProducts?.length ?? 0) === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">Sin alertas de stock</div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {data?.lowStockProducts.map(p => (
                <li key={p.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-gray-50/80 transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${p.stockQuantity <= 0 ? 'bg-rose-500' : 'bg-amber-400'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-400">
                        Stock: {p.stockQuantity} {p.unit} · Mín: {p.minStock} {p.unit}
                      </p>
                    </div>
                  </div>
                  <span className={`ml-3 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${p.stockQuantity <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                    {p.stockQuantity <= 0 ? 'Agotado' : 'Bajo'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Lotes próximos a caducar ── */}
      {expiringBatches.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">Lotes próximos a caducar</p>
              <p className="text-xs text-gray-400 mt-0.5">Próximos 90 días — solo lotes con stock restante</p>
            </div>
            <span className="w-7 h-7 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center">{Icon.batch}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100">
                <th className="px-6 py-2.5 text-left font-medium">Producto</th>
                <th className="px-6 py-2.5 text-left font-medium">N° Lote</th>
                <th className="px-6 py-2.5 text-right font-medium">Restante</th>
                <th className="px-6 py-2.5 text-right font-medium">Caducidad</th>
                <th className="px-6 py-2.5 text-right font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {expiringBatches.map(b => {
                const days = batchDaysLeft(b.expirationDate)
                const status = batchStatusStyle(days)
                return (
                  <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-3 text-gray-900 font-medium truncate max-w-[200px]">
                      {b.product?.name ?? '—'}
                      <p className="text-xs text-gray-400 font-mono font-normal">{b.product?.code}</p>
                    </td>
                    <td className="px-6 py-3 text-gray-600 font-mono text-xs">{b.batchNumber}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-gray-700">
                      {Number(b.remainingQuantity).toFixed(0)} {b.product?.unit ?? ''}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-500 text-xs whitespace-nowrap">
                      {format(new Date(b.expirationDate), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${status.cls}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de detalle de factura */}
      {selectedInvoiceId && (
        <InvoiceDetailModal
          invoiceId={selectedInvoiceId}
          onClose={() => setSelectedInvoiceId(null)}
        />
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const TINTS: Record<string, { bg: string; text: string }> = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600' },
}

function MetricCard({ label, value, icon, tint, hint, urgent }: {
  label: string
  value: string | number
  icon: React.ReactNode
  tint: keyof typeof TINTS
  hint?: string
  urgent?: boolean
}) {
  const t = TINTS[tint]
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 p-5 ${urgent ? 'ring-2 ring-rose-100' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${t.bg} ${t.text}`}>{icon}</span>
      </div>
      <p className="text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function CashRow({ icon, label, amount }: { icon: React.ReactNode; label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sky-100">{icon}<span>{label}</span></div>
      <span className="font-medium tabular-nums">${amount.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  )
}