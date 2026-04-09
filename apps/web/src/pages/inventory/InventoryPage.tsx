import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { inventoryApi, productsApi } from '../../services/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Product {
  id: string
  code: string
  name: string
  stock: number
  cost?: number
  unit?: string
  trackInventory: boolean
  isActive: boolean
}

interface Movement {
  id: string
  productId: string
  product: Product
  type: string
  quantity: number
  stockBefore: number
  stockAfter: number
  reference?: string
  unitCost?: number
  notes?: string
  createdAt: string
}

type Tab = 'movimientos' | 'kardex'

const TYPE_LABELS: Record<string, string> = {
  // Tipos específicos
  ENTRADA_COMPRA: 'Entrada compra',
  ENTRADA_AJUSTE: 'Ajuste entrada',
  SALIDA_VENTA:   'Salida venta',
  SALIDA_MERMA:   'Merma / pérdida',
  SALIDA_AJUSTE:  'Ajuste salida',
  // Legados
  ENTRADA: 'Entrada',
  SALIDA:  'Salida',
  AJUSTE:  'Ajuste',
}

const TYPE_COLORS: Record<string, string> = {
  ENTRADA_COMPRA: 'bg-green-100 text-green-700',
  ENTRADA_AJUSTE: 'bg-green-100 text-green-700',
  SALIDA_VENTA:   'bg-blue-100 text-blue-700',
  SALIDA_MERMA:   'bg-red-100 text-red-700',
  SALIDA_AJUSTE:  'bg-red-100 text-red-700',
  // Legados
  ENTRADA: 'bg-green-100 text-green-700',
  SALIDA:  'bg-red-100 text-red-700',
  AJUSTE:  'bg-amber-100 text-amber-700',
}

function fmt(n: number | string | undefined) {
  return Number(n ?? 0).toFixed(2)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('movimientos')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'movimientos', label: 'Movimientos de inventario' },
    { key: 'kardex', label: 'Kardex' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Inventario</h1>
        <p className="text-sm text-gray-500">Movimientos y kardex de productos</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div>
        {activeTab === 'movimientos' && <MovimientosTab />}
        {activeTab === 'kardex'      && <KardexTab />}
      </div>
    </div>
  )
}

// ─── Tab 1: Movimientos ───────────────────────────────────────────────────────
function MovimientosTab() {
  const queryClient = useQueryClient()
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [showModal, setShowModal] = useState<'entrada' | 'salida' | 'ajuste' | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['inventory-movements', typeFilter],
    queryFn: () =>
      inventoryApi.getMovements(typeFilter ? { type: typeFilter } : undefined)
        .then(r => r.data as Movement[]),
    gcTime: 0,
  })

  const movements = Array.isArray(data) ? data : []

  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const entryMutation = useMutation({
    mutationFn: (dto: unknown) => inventoryApi.createEntry(dto),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      const m = res.data as Movement
      setSuccessMsg(`Entrada registrada. Stock actual: ${fmt(m.stockAfter)} ${m.product?.unit ?? ''}`)
      setShowModal(null)
      setTimeout(() => setSuccessMsg(null), 4000)
    },
  })

  const exitMutation = useMutation({
    mutationFn: (dto: unknown) => inventoryApi.createExit(dto),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      const m = res.data as Movement
      setSuccessMsg(`Salida registrada. Stock actual: ${fmt(m.stockAfter)} ${m.product?.unit ?? ''}`)
      setShowModal(null)
      setTimeout(() => setSuccessMsg(null), 4000)
    },
  })

  const adjustMutation = useMutation({
    mutationFn: (dto: unknown) => inventoryApi.createAdjustment(dto),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      const m = res.data as Movement
      setSuccessMsg(`Ajuste registrado. Stock actual: ${fmt(m.stockAfter)} ${m.product?.unit ?? ''}`)
      setShowModal(null)
      setTimeout(() => setSuccessMsg(null), 4000)
    },
  })

  return (
    <div className="space-y-4">
      {/* Éxito */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3">
          {successMsg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los movimientos</option>
          <option value="ENTRADA_COMPRA">Entradas compra</option>
          <option value="SALIDA_VENTA">Salidas venta</option>
          <option value="ENTRADA_AJUSTE">Ajustes entrada</option>
          <option value="SALIDA_AJUSTE">Ajustes salida</option>
          <option value="SALIDA_MERMA">Mermas / pérdidas</option>
        </select>

        <div className="flex gap-2">
          <button
            onClick={() => setShowModal('entrada')}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"
          >
            + Registrar entrada
          </button>
          <button
            onClick={() => setShowModal('salida')}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
          >
            − Registrar salida
          </button>
          <button
            onClick={() => setShowModal('ajuste')}
            className="bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600"
          >
            ⇄ Ajuste de inventario
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Cargando...</p>
        ) : movements.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No hay movimientos registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Cantidad</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock ant.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock nuevo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Referencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {movements.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {fmtDate(m.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{m.product?.name ?? '—'}</span>
                    <span className="ml-2 text-xs text-gray-400 font-mono">{m.product?.code}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[m.type] ?? 'bg-gray-100 text-gray-600'}`}>
                      {TYPE_LABELS[m.type] ?? m.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {(() => {
                      const isExit = m.type.startsWith('SALIDA')
                      const color = isExit ? 'text-red-700' : m.type.startsWith('ENTRADA') ? 'text-green-700' : 'text-amber-700'
                      return <span className={color}>{isExit ? '−' : '+'}{fmt(m.quantity)} {m.product?.unit ?? ''}</span>
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-500">{fmt(m.stockBefore)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900 font-medium">{fmt(m.stockAfter)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">
                    {m.reference ?? m.notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal entrada / salida */}
      {(showModal === 'entrada' || showModal === 'salida') && (
        <MovementForm
          mode={showModal}
          onCancel={() => setShowModal(null)}
          onSubmit={dto => {
            if (showModal === 'entrada') entryMutation.mutate(dto)
            else exitMutation.mutate(dto)
          }}
          loading={entryMutation.isPending || exitMutation.isPending}
        />
      )}

      {/* Modal ajuste */}
      {showModal === 'ajuste' && (
        <AdjustmentForm
          onCancel={() => setShowModal(null)}
          onSubmit={dto => adjustMutation.mutate(dto)}
          loading={adjustMutation.isPending}
        />
      )}
    </div>
  )
}

// ─── Tab 2: Kardex ────────────────────────────────────────────────────────────
// ─── Tipos para kardex ────────────────────────────────────────────────────────
interface KardexRow {
  id: string
  date: string
  detail: string
  document: string
  entrada: { qty: number; unitCost: number; total: number } | null
  salida:  { qty: number; unitCost: number; total: number } | null
  saldo:   { qty: number; promedio: number; total: number }
}
interface KardexData {
  product:      { id: string; code: string; name: string; unit: string; stock: number; minStock: number }
  empresa:      { razonSocial: string; ruc: string } | null
  from:         string | null
  to:           string | null
  saldoInicial: { qty: number; promedio: number; total: number }
  rows:         KardexRow[]
  totals:       { entradaQty: number; entradaValue: number; salidaQty: number; salidaValue: number; saldoFinal: { qty: number; promedio: number; total: number } }
}
interface SummaryItem {
  id: string; code: string; name: string; unit: string
  stock: number; minStock: number; costoPromedio: number; valorTotal: number
}

function fmtMoney(n: number) { return n.toFixed(4) }
function fmtQty(n: number)   { return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2) }

// ─── Tab 2: Kardex ─────────────────────────────────────────────────────────────
function KardexTab() {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

  if (selectedProductId) {
    return <KardexDetallado productId={selectedProductId} onBack={() => setSelectedProductId(null)} />
  }

  return <KardexResumen onSelect={setSelectedProductId} />
}

// ─── Resumen de todos los productos ──────────────────────────────────────────
function KardexResumen({ onSelect }: { onSelect: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => inventoryApi.getSummary().then(r => r.data as SummaryItem[]),
    gcTime: 0,
  })
  const items = Array.isArray(data) ? data : []
  const valorTotalGeneral = items.reduce((s, i) => s + i.valorTotal, 0)

  function stockBadge(item: SummaryItem) {
    if (item.stock === 0)
      return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Agotado</span>
    if (item.stock <= item.minStock)
      return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Stock bajo</span>
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} productos con control de inventario</p>
        <p className="text-sm text-gray-700 font-medium">
          Valor total inventario: <span className="text-blue-700">${fmt(valorTotalGeneral)}</span>
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Cargando...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No hay productos con control de stock.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Unidad</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock actual</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Costo promedio</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Valor total</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock mín.</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map(item => (
                <tr
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="hover:bg-blue-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-gray-500">{item.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">{fmtQty(item.stock)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">${fmtMoney(item.costoPromedio)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-blue-700">${fmt(item.valorTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-400">{fmtQty(item.minStock)}</td>
                  <td className="px-4 py-3 text-center">{stockBadge(item)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-sm font-medium text-gray-600 text-right">TOTAL</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">${fmt(valorTotalGeneral)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      <p className="text-xs text-gray-400 text-center">Haz clic en un producto para ver su kardex detallado</p>
    </div>
  )
}

// ─── Kardex detallado SRI ─────────────────────────────────────────────────────
function KardexDetallado({ productId, onBack }: { productId: string; onBack: () => void }) {
  const now = new Date()
  const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const lastOfMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`

  const [from, setFrom] = useState(firstOfMonth)
  const [to,   setTo]   = useState(lastOfMonth)

  const { data, isLoading } = useQuery({
    queryKey: ['kardex-detail', productId, from, to],
    queryFn: () => inventoryApi.getKardex(productId, from, to).then(r => r.data as KardexData),
    gcTime: 0,
  })

  function handlePrint() {
    const style = document.createElement('style')
    style.id = '__kardex_print__'
    style.innerHTML = `
      @media print {
        body > * { display: none !important; }
        #kardex-print-area { display: block !important; position: fixed; top: 0; left: 0; width: 100%; }
      }
    `
    document.head.appendChild(style)
    window.print()
    window.addEventListener('afterprint', () => {
      document.getElementById('__kardex_print__')?.remove()
    }, { once: true })
  }

  if (isLoading) return <div className="py-12 text-center text-sm text-gray-500">Cargando kardex...</div>
  if (!data) return <div className="py-12 text-center text-sm text-gray-400">Sin datos</div>

  const { product, empresa, saldoInicial, rows, totals } = data

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap no-print">
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          ← Volver al resumen
        </button>
        <div className="flex-1" />
        <label className="text-xs text-gray-500">Desde</label>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-sm" />
        <label className="text-xs text-gray-500">Hasta</label>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1.5 text-sm" />
        <button onClick={handlePrint}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
          Imprimir / Exportar PDF
        </button>
      </div>

      {/* Documento kardex */}
      <div id="kardex-print-area" className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">

        {/* Encabezado */}
        <div className="text-center space-y-1 border-b border-gray-300 pb-4">
          {empresa && (
            <>
              <p className="font-bold text-gray-900 text-base">{empresa.razonSocial}</p>
              <p className="text-sm text-gray-600">RUC: {empresa.ruc}</p>
            </>
          )}
          <p className="text-lg font-bold text-gray-900 mt-2">KARDEX DE INVENTARIO</p>
          <p className="text-xs text-gray-500">Método de valoración: PROMEDIO PONDERADO</p>
        </div>

        {/* Info producto + período */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Producto:</span>{' '}
            <span className="font-medium text-gray-900">{product.name}</span>
            <span className="ml-2 text-gray-400 font-mono text-xs">({product.code})</span>
          </div>
          <div>
            <span className="text-gray-500">Unidad:</span>{' '}
            <span className="font-medium text-gray-900">{product.unit || '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Período:</span>{' '}
            <span className="font-medium text-gray-900">
              {from ? new Date(from + 'T00:00:00').toLocaleDateString('es-EC') : '—'}{' '}
              al{' '}
              {to ? new Date(to + 'T00:00:00').toLocaleDateString('es-EC') : '—'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Stock actual:</span>{' '}
            <span className="font-bold text-blue-700">{fmtQty(Number(product.stock))} {product.unit || ''}</span>
          </div>
        </div>

        {/* Tabla kardex */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              {/* Grupos */}
              <tr className="bg-gray-800 text-white">
                <th rowSpan={2} className="border border-gray-600 px-2 py-2 text-left">Fecha</th>
                <th rowSpan={2} className="border border-gray-600 px-2 py-2 text-left">Detalle</th>
                <th rowSpan={2} className="border border-gray-600 px-2 py-2 text-left">Documento</th>
                <th colSpan={3} className="border border-gray-600 px-2 py-1.5 text-center">ENTRADAS</th>
                <th colSpan={3} className="border border-gray-600 px-2 py-1.5 text-center">SALIDAS</th>
                <th colSpan={3} className="border border-gray-600 px-2 py-1.5 text-center">SALDO</th>
              </tr>
              <tr className="bg-gray-700 text-white">
                <th className="border border-gray-600 px-2 py-1 text-right">Cant.</th>
                <th className="border border-gray-600 px-2 py-1 text-right">P.Unit</th>
                <th className="border border-gray-600 px-2 py-1 text-right">Total</th>
                <th className="border border-gray-600 px-2 py-1 text-right">Cant.</th>
                <th className="border border-gray-600 px-2 py-1 text-right">P.Unit</th>
                <th className="border border-gray-600 px-2 py-1 text-right">Total</th>
                <th className="border border-gray-600 px-2 py-1 text-right">Cant.</th>
                <th className="border border-gray-600 px-2 py-1 text-right">P.Prom</th>
                <th className="border border-gray-600 px-2 py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {/* Saldo inicial */}
              {(saldoInicial.qty > 0 || rows.length === 0) && (
                <tr className="bg-blue-50">
                  <td className="border border-gray-200 px-2 py-1.5 text-gray-500">
                    {from ? new Date(from + 'T00:00:00').toLocaleDateString('es-EC') : '—'}
                  </td>
                  <td className="border border-gray-200 px-2 py-1.5 font-medium text-gray-700" colSpan={2}>
                    Saldo inicial
                  </td>
                  <td colSpan={6} className="border border-gray-200" />
                  <td className="border border-gray-200 px-2 py-1.5 text-right font-mono">{fmtQty(saldoInicial.qty)}</td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right font-mono">{fmtMoney(saldoInicial.promedio)}</td>
                  <td className="border border-gray-200 px-2 py-1.5 text-right font-mono">{fmt(saldoInicial.total)}</td>
                </tr>
              )}

              {/* Movimientos */}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="border border-gray-200 px-4 py-6 text-center text-gray-400">
                    Sin movimientos en el período seleccionado
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id ?? i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-200 px-2 py-1.5 text-gray-500 whitespace-nowrap">
                      {new Date(r.date).toLocaleDateString('es-EC')}
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-gray-700">{r.detail}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-gray-500 max-w-[100px] truncate">{r.document || '—'}</td>
                    {/* Entradas */}
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-green-700">
                      {r.entrada ? fmtQty(r.entrada.qty) : ''}
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-green-700">
                      {r.entrada ? fmtMoney(r.entrada.unitCost) : ''}
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-green-700">
                      {r.entrada ? fmt(r.entrada.total) : ''}
                    </td>
                    {/* Salidas */}
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-red-700">
                      {r.salida ? fmtQty(r.salida.qty) : ''}
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-red-700">
                      {r.salida ? fmtMoney(r.salida.unitCost) : ''}
                    </td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono text-red-700">
                      {r.salida ? fmt(r.salida.total) : ''}
                    </td>
                    {/* Saldo */}
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono font-medium">{fmtQty(r.saldo.qty)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono">{fmtMoney(r.saldo.promedio)}</td>
                    <td className="border border-gray-200 px-2 py-1.5 text-right font-mono font-medium">{fmt(r.saldo.total)}</td>
                  </tr>
                ))
              )}

              {/* Fila de totales */}
              <tr className="bg-gray-800 text-white font-semibold">
                <td colSpan={3} className="border border-gray-600 px-2 py-2 text-right">TOTALES</td>
                <td className="border border-gray-600 px-2 py-2 text-right font-mono">{fmtQty(totals.entradaQty)}</td>
                <td className="border border-gray-600 px-2 py-2" />
                <td className="border border-gray-600 px-2 py-2 text-right font-mono">{fmt(totals.entradaValue)}</td>
                <td className="border border-gray-600 px-2 py-2 text-right font-mono">{fmtQty(totals.salidaQty)}</td>
                <td className="border border-gray-600 px-2 py-2" />
                <td className="border border-gray-600 px-2 py-2 text-right font-mono">{fmt(totals.salidaValue)}</td>
                <td className="border border-gray-600 px-2 py-2 text-right font-mono">{fmtQty(totals.saldoFinal.qty)}</td>
                <td className="border border-gray-600 px-2 py-2 text-right font-mono">{fmtMoney(totals.saldoFinal.promedio)}</td>
                <td className="border border-gray-600 px-2 py-2 text-right font-mono">{fmt(totals.saldoFinal.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Pie */}
        <p className="text-xs text-gray-400 text-center pt-2">
          Generado: {new Date().toLocaleString('es-EC')} — Método: Promedio Ponderado
        </p>
      </div>
    </div>
  )
}

// ─── Modal de movimiento ──────────────────────────────────────────────────────
function MovementForm({
  mode, onCancel, onSubmit, loading,
}: {
  mode: 'entrada' | 'salida'
  onCancel: () => void
  onSubmit: (dto: unknown) => void
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [reference, setReference] = useState('')

  const { data: productsData } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productsApi.findAll(search || undefined).then(r => r.data as Product[]),
  })
  const products = Array.isArray(productsData)
    ? productsData.filter(p => p.trackInventory && p.isActive)
    : []

  const isEntrada = mode === 'entrada'
  const qty = Number(quantity)
  const stockExceeded = !isEntrada && selectedProduct !== null && qty > Number(selectedProduct.stock)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct || stockExceeded) return
    onSubmit({
      productId: selectedProduct.id,
      quantity: qty,
      unitCost: unitCost ? Number(unitCost) : undefined,
      reference: reference || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className={`text-lg font-bold ${isEntrada ? 'text-green-700' : 'text-red-700'}`}>
          {isEntrada ? '+ Registrar entrada' : '− Registrar salida'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Producto */}
          <div>
            <label className="text-xs font-medium text-gray-600">
              Producto <span className="text-red-500">*</span>
            </label>
            {selectedProduct ? (
              <div className="mt-1 flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{selectedProduct.name}</p>
                  <p className="text-xs text-gray-400 font-mono">
                    {selectedProduct.code} — Stock: {fmt(selectedProduct.stock)} {selectedProduct.unit ?? ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedProduct(null); setSearch(''); setQuantity('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 ml-3 shrink-0"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="mt-1 space-y-1">
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar por nombre o código..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {search && (
                  <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100 shadow-sm">
                    {products.length === 0 ? (
                      <p className="p-3 text-xs text-gray-400">Sin resultados</p>
                    ) : (
                      products.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setSelectedProduct(p); setSearch('') }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex items-center justify-between gap-2"
                        >
                          <span>
                            <span className="font-medium text-gray-900">{p.name}</span>
                            <span className="ml-1.5 text-xs text-gray-400 font-mono">({p.code})</span>
                          </span>
                          <span className="text-xs text-gray-500 shrink-0">
                            Stock: {fmt(p.stock)} {p.unit ?? ''}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cantidad */}
          <div>
            <label className="text-xs font-medium text-gray-600">
              Cantidad <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="number"
              step="1"
              min="1"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                stockExceeded ? 'border-red-400' : 'border-gray-200'
              }`}
              placeholder="0"
            />
            {selectedProduct && !isEntrada && (
              <p className={`text-xs mt-1 ${stockExceeded ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                {stockExceeded
                  ? `Stock insuficiente. Disponible: ${fmt(selectedProduct.stock)} ${selectedProduct.unit ?? ''}`
                  : `Disponible: ${fmt(selectedProduct.stock)} ${selectedProduct.unit ?? ''}`
                }
              </p>
            )}
          </div>

          {/* Costo unitario — solo para entradas */}
          {isEntrada && (
            <div>
              <label className="text-xs font-medium text-gray-600">
                Costo unitario
                <span className="text-gray-400 font-normal ml-1">(opcional)</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={unitCost}
                  onChange={e => setUnitCost(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-sm"
                  placeholder="Si no se ingresa, se usa el costo registrado del producto"
                />
              </div>
            </div>
          )}

          {/* Referencia */}
          <div>
            <label className="text-xs font-medium text-gray-600">
              Referencia
              <span className="text-gray-400 font-normal ml-1">(opcional)</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="Ej: Compra a proveedor, Ajuste inicial..."
            />
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !selectedProduct || stockExceeded || !quantity}
              className={`flex-1 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
                isEntrada ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {loading ? 'Guardando...' : isEntrada ? 'Registrar entrada' : 'Registrar salida'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal de ajuste ──────────────────────────────────────────────────────────
const MOTIVES = [
  'Conteo físico',
  'Producto dañado',
  'Pérdida / robo',
  'Error de sistema',
  'Otro',
]

function AdjustmentForm({
  onCancel, onSubmit, loading,
}: {
  onCancel: () => void
  onSubmit: (dto: unknown) => void
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [newStock, setNewStock] = useState('')
  const [motive, setMotive] = useState(MOTIVES[0])

  const { data: productsData } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productsApi.findAll(search || undefined).then(r => r.data as Product[]),
  })
  const products = Array.isArray(productsData)
    ? productsData.filter(p => p.trackInventory && p.isActive)
    : []

  const currentStock = selectedProduct ? Number(selectedProduct.stock) : null
  const parsedNew = newStock !== '' ? Number(newStock) : null
  const diff = currentStock !== null && parsedNew !== null ? parsedNew - currentStock : null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProduct || parsedNew === null) return
    onSubmit({ productId: selectedProduct.id, newStock: parsedNew, motive })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-amber-600">⇄ Ajuste de inventario</h2>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Producto */}
          <div>
            <label className="text-xs font-medium text-gray-600">
              Producto <span className="text-red-500">*</span>
            </label>
            {selectedProduct ? (
              <div className="mt-1 flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{selectedProduct.name}</p>
                  <p className="text-xs text-gray-400 font-mono">
                    {selectedProduct.code} — Stock actual: {fmt(selectedProduct.stock)} {selectedProduct.unit ?? ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setSelectedProduct(null); setSearch(''); setNewStock('') }}
                  className="text-xs text-gray-400 hover:text-gray-600 ml-3 shrink-0"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <div className="mt-1 space-y-1">
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar por nombre o código..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {search && (
                  <div className="border border-gray-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-gray-100 shadow-sm">
                    {products.length === 0 ? (
                      <p className="p-3 text-xs text-gray-400">Sin resultados</p>
                    ) : (
                      products.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setSelectedProduct(p); setSearch('') }}
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex items-center justify-between gap-2"
                        >
                          <span>
                            <span className="font-medium text-gray-900">{p.name}</span>
                            <span className="ml-1.5 text-xs text-gray-400 font-mono">({p.code})</span>
                          </span>
                          <span className="text-xs text-gray-500 shrink-0">
                            Stock: {fmt(p.stock)} {p.unit ?? ''}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stock real */}
          <div>
            <label className="text-xs font-medium text-gray-600">
              Stock real (conteo físico) <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="number"
              step="1"
              min="0"
              value={newStock}
              onChange={e => setNewStock(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
            {diff !== null && (
              <p className={`text-xs mt-1 font-medium ${diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {diff === 0
                  ? 'Sin diferencia — stock ya está correcto'
                  : `Diferencia: ${diff > 0 ? '+' : ''}${diff} ${selectedProduct?.unit ?? ''}`
                }
              </p>
            )}
          </div>

          {/* Motivo */}
          <div>
            <label className="text-xs font-medium text-gray-600">Motivo</label>
            <select
              value={motive}
              onChange={e => setMotive(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            >
              {MOTIVES.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Botones */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !selectedProduct || newStock === '' || diff === 0}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
