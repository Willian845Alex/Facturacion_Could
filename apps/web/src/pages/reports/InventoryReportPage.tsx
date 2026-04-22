import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reportsApi, productsApi, openBlob } from '../../services/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface StockItem {
  id: string
  code: string
  name: string
  unit: string
  stock: number
  minStock: number
  cost: number
  valorTotal: number
  status: 'ok' | 'bajo' | 'agotado'
}

interface KardexRow {
  id: string
  createdAt: string
  product: { id: string; code: string; name: string; unit: string } | null
  type: string
  typeLabel: string
  quantity: number
  unitCost: number | null
  total: number | null
  stockAfter: number
  reference: string
}

const TYPE_COLORS: Record<string, string> = {
  ENTRADA_COMPRA: 'bg-green-100 text-green-700',
  ENTRADA_AJUSTE: 'bg-green-100 text-green-700',
  ENTRADA_DEVOLUCION: 'bg-green-100 text-green-700',
  SALIDA_VENTA:   'bg-blue-100 text-blue-700',
  SALIDA_MERMA:   'bg-red-100 text-red-700',
  SALIDA_AJUSTE:  'bg-red-100 text-red-700',
  ENTRADA: 'bg-green-100 text-green-700',
  SALIDA:  'bg-red-100 text-red-700',
  AJUSTE:  'bg-amber-100 text-amber-700',
}

function fmt(n: number) { return n.toFixed(2) }
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-EC', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InventoryReportPage() {
  const [activeSection, setActiveSection] = useState<'stock' | 'kardex'>('stock')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reporte de Inventario</h1>
        <p className="text-sm text-gray-500">Stock actual y movimientos de kardex</p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-3">
        <button
          onClick={() => setActiveSection('stock')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === 'stock' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          A) Stock actual
        </button>
        <button
          onClick={() => setActiveSection('kardex')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === 'kardex' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          B) Kardex de movimientos
        </button>
      </div>

      {activeSection === 'stock' && <StockSection />}
      {activeSection === 'kardex' && <KardexSection />}
    </div>
  )
}

// ─── Section A: Stock actual ──────────────────────────────────────────────────
function StockSection() {
  const [isExporting, setIsExporting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => reportsApi.getInventory().then(r => r.data as { items: StockItem[]; valorTotalGeneral: number }),
    gcTime: 0,
  })

  const items = data?.items ?? []
  const valorTotal = data?.valorTotalGeneral ?? 0

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await reportsApi.exportInventory()
      openBlob(res.data as Blob, 'reporte-inventario.xlsx', true)
    } catch {
      alert('Error al exportar. Intente de nuevo.')
    } finally {
      setIsExporting(false)
    }
  }

  function stockBadge(status: string) {
    if (status === 'agotado') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Agotado</span>
    if (status === 'bajo') return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Stock bajo</span>
    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{items.length} productos con control de inventario</p>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700">
            Valor total: <span className="text-blue-700 font-bold">${fmt(valorTotal)}</span>
          </span>
          <button
            onClick={handleExport}
            disabled={isExporting || isLoading}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {isExporting ? 'Exportando...' : '↓ Exportar Excel'}
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Unidad</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Stock actual</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Stock mín.</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Costo unit.</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Valor total</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
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
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  No hay productos con control de inventario activo.
                </td>
              </tr>
            ) : (
              items.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500">{item.unit}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span className={
                      item.status === 'agotado' ? 'text-red-600 font-semibold' :
                      item.status === 'bajo' ? 'text-amber-600 font-semibold' :
                      'text-gray-900'
                    }>
                      {item.stock % 1 === 0 ? item.stock.toFixed(0) : item.stock.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-400">
                    {item.minStock % 1 === 0 ? item.minStock.toFixed(0) : item.minStock.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">${fmt(item.cost)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-blue-700">${fmt(item.valorTotal)}</td>
                  <td className="px-4 py-3 text-center">{stockBadge(item.status)}</td>
                </tr>
              ))
            )}
          </tbody>
          {!isLoading && items.length > 0 && (
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-gray-600 text-right">TOTAL INVENTARIO</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-blue-700">${fmt(valorTotal)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ─── Section B: Kardex ────────────────────────────────────────────────────────
function KardexSection() {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const firstOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const [productSearch, setProductSearch] = useState('')
  const [productId, setProductId] = useState('')
  const [productName, setProductName] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [fromDate, setFromDate] = useState(firstOfMonth)
  const [toDate, setToDate] = useState(todayStr)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const params = {
    ...(productId ? { productId } : {}),
    ...(fromDate ? { from: fromDate } : {}),
    ...(toDate ? { to: toDate } : {}),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['report-kardex', params],
    queryFn: () => reportsApi.getKardex(params).then(r => r.data as KardexRow[]),
    gcTime: 0,
  })

  const allRows = Array.isArray(data) ? data : []
  const rows = typeFilter ? allRows.filter(r => r.type === typeFilter) : allRows

  const { data: productsData } = useQuery({
    queryKey: ['products-kardex-filter', productSearch],
    queryFn: () => productsApi.findAll({ search: productSearch || undefined, status: 'all' })
      .then(r => ((r.data as any)?.data ?? r.data) as { id: string; code: string; name: string }[]),
    enabled: productSearch.length > 0,
  })
  const foundProducts = Array.isArray(productsData) ? productsData : []

  async function handleExport() {
    setIsExporting(true)
    try {
      const res = await reportsApi.exportKardex(params)
      openBlob(res.data as Blob, 'reporte-kardex.xlsx', true)
    } catch {
      alert('Error al exportar. Intente de nuevo.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Producto */}
          <div className="flex-1 min-w-[220px] relative">
            <label className="text-xs font-medium text-gray-500 block mb-1">Producto</label>
            {productId ? (
              <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                <span className="text-sm text-gray-900 flex-1 truncate">{productName}</span>
                <button
                  type="button"
                  onClick={() => { setProductId(''); setProductName(''); setProductSearch('') }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div>
                <input
                  type="text"
                  placeholder="Todos los productos..."
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true) }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProductDropdown(false), 200)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {showProductDropdown && productSearch && foundProducts.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 border border-gray-200 rounded-lg bg-white shadow-lg max-h-40 overflow-y-auto">
                    {foundProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={() => {
                          setProductId(p.id); setProductName(p.name)
                          setProductSearch(p.name); setShowProductDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      >
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">({p.code})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Tipo</label>
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos</option>
              <option value="ENTRADA_COMPRA">Entradas compra</option>
              <option value="ENTRADA_DEVOLUCION">Devoluciones</option>
              <option value="SALIDA_VENTA">Salidas venta</option>
              <option value="ENTRADA_AJUSTE">Ajustes entrada</option>
              <option value="SALIDA_AJUSTE">Ajustes salida</option>
              <option value="SALIDA_MERMA">Mermas</option>
            </select>
          </div>

          {/* Fecha desde */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Desde</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>

          {/* Fecha hasta */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Hasta</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{rows.length} movimientos</p>
        <button
          onClick={handleExport}
          disabled={isExporting || isLoading}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {isExporting ? 'Exportando...' : '↓ Exportar Excel'}
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Producto</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Cantidad</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Costo unit.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Stock result.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Referencia</th>
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
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                    No hay movimientos en el período seleccionado.
                  </td>
                </tr>
              ) : (
                rows.map(row => {
                  const isExit = row.type.startsWith('SALIDA')
                  const qtyColor = isExit ? 'text-red-700' : row.type.startsWith('ENTRADA') ? 'text-green-700' : 'text-amber-700'
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtDate(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{row.product?.name ?? '—'}</span>
                        <span className="ml-2 text-xs text-gray-400 font-mono">{row.product?.code}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[row.type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {row.typeLabel}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-mono ${qtyColor}`}>
                        {isExit ? '−' : '+'}{row.quantity.toFixed(2)} {row.product?.unit ?? ''}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        {row.unitCost != null ? `$${fmt(row.unitCost)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {row.total != null ? `$${fmt(row.total)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-gray-900">
                        {row.stockAfter.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[150px] truncate">
                        {row.reference || '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
