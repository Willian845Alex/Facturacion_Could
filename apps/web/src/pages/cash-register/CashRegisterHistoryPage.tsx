import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cashRegisterApi } from '../../services/api'
import Pagination from '../../components/ui/Pagination'

interface CashSession {
  id: string
  userName: string
  branchId: string
  status: 'ABIERTA' | 'CERRADA'
  openedAt: string
  closedAt: string | null
  initialAmount: number
  totalSales: number
  totalInvoices: number
  totalCash: number
  totalCard: number
  totalTransfer: number
  expectedAmount: number | null
  actualAmount: number | null
  difference: number | null
  notes: string | null
}

interface SessionReport {
  session: CashSession
  invoices: Array<{
    id: string
    secuencial: string | null
    fechaEmision: string
    clientName: string
    formaPago: string
    importeTotal: number
  }>
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${Number(n).toFixed(2)}`
}

const PAYMENT_LABELS: Record<string, string> = {
  '01': 'Efectivo', '16': 'T. Débito', '17': 'Transferencia',
  '18': 'T. Prepago', '19': 'T. Crédito', '20': 'Otros',
}

// ─── Report Modal ──────────────────────────────────────────────────────────────

function ReportModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['cash-report', sessionId],
    queryFn: () => cashRegisterApi.report(sessionId).then(r => r.data as SessionReport),
  })

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-10 shadow-2xl">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
        </div>
      </div>
    )
  }

  if (!data) return null
  const s = data.session

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Reporte de Caja</h2>
            <p className="text-xs text-gray-500">{fmt(s.openedAt)} — {s.closedAt ? fmt(s.closedAt) : 'Abierta'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="overflow-auto flex-1 px-6 py-4 space-y-5">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Cajero', value: s.userName },
              { label: 'Facturas emitidas', value: String(s.totalInvoices) },
              { label: 'Fondo inicial', value: fmtMoney(s.initialAmount) },
              { label: 'Total ventas', value: fmtMoney(s.totalSales) },
              { label: 'Efectivo ventas', value: fmtMoney(s.totalCash) },
              { label: 'Tarjeta', value: fmtMoney(s.totalCard) },
              { label: 'Transferencia', value: fmtMoney(s.totalTransfer) },
              { label: 'Total esperado en caja', value: fmtMoney(s.expectedAmount) },
              { label: 'Efectivo contado', value: fmtMoney(s.actualAmount) },
            ].map(row => (
              <div key={row.label} className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-500">{row.label}</p>
                <p className="font-semibold text-gray-900">{row.value}</p>
              </div>
            ))}
            <div className={`rounded-lg px-3 py-2 ${
              s.difference == null ? 'bg-gray-50'
              : s.difference >= 0 ? 'bg-green-50' : 'bg-red-50'
            }`}>
              <p className="text-xs text-gray-500">Diferencia</p>
              <p className={`font-bold ${
                s.difference == null ? 'text-gray-700'
                : s.difference >= 0 ? 'text-green-700' : 'text-red-700'
              }`}>
                {s.difference == null ? '—' : (s.difference >= 0 ? '+' : '') + fmtMoney(s.difference)}
              </p>
            </div>
          </div>

          {s.notes && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-amber-700 mb-0.5">Observaciones</p>
              <p className="text-sm text-amber-900">{s.notes}</p>
            </div>
          )}

          {/* Invoice list */}
          {data.invoices.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Facturas de la sesión</h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">No.</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Cliente</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Pago</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.invoices.map(inv => (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{inv.secuencial ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{inv.clientName}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{PAYMENT_LABELS[inv.formaPago] ?? inv.formaPago}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">${inv.importeTotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── History Page ──────────────────────────────────────────────────────────────

const LIMIT = 20

export default function CashRegisterHistoryPage() {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['cash-history', page],
    queryFn: () => cashRegisterApi.history(page, LIMIT).then(r => r.data as { data: CashSession[]; total: number; totalPages: number }),
    staleTime: 10000,
  })

  const sessions = data?.data ?? []
  const totalItems = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Historial de Caja</h1>
        <p className="text-sm text-gray-500 mt-1">Registro de aperturas y cierres de caja</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm">No hay registros de caja</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Apertura</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cierre</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cajero</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ventas</th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Facturas</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Diferencia</th>
                    <th className="text-center px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sessions.map(s => {
                    const diff = s.difference
                    const diffOk = diff == null || diff >= 0
                    return (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 whitespace-nowrap text-gray-700">{fmt(s.openedAt)}</td>
                        <td className="px-5 py-3 whitespace-nowrap text-gray-500">{s.closedAt ? fmt(s.closedAt) : '—'}</td>
                        <td className="px-5 py-3 text-gray-700 font-medium">{s.userName}</td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-gray-900">{fmtMoney(s.totalSales)}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{s.totalInvoices}</td>
                        <td className="px-5 py-3 text-right">
                          {diff != null ? (
                            <span className={`font-mono font-semibold ${diffOk ? 'text-green-700' : 'text-red-700'}`}>
                              {diff >= 0 ? '+' : ''}{fmtMoney(diff)}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {s.status === 'ABIERTA' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                              Abierta
                            </span>
                          ) : (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${diffOk ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                              Cerrada
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => setSelectedId(s.id)}
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium hover:underline"
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-5 border-t border-gray-100">
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalItems={totalItems}
                itemsPerPage={LIMIT}
                onPageChange={setPage}
              />
            </div>
          </>
        )}
      </div>

      {selectedId && (
        <ReportModal sessionId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
