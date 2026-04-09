import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productsApi, unitsApi } from '../../services/api'

interface Product {
  id: string
  code: string
  auxiliaryCode?: string
  name: string
  price: number
  ivaRate: number
  unit?: string
  isService: boolean
  trackInventory: boolean
  stock: number
  minStock: number
  isActive: boolean
}

const TAX_LABELS: Record<number, string> = {
  0: 'IVA 0%',
  15: 'IVA 15%',
  5: 'IVA 5%',
  8: 'IVA 8%',
}

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productsApi.findAll(search || undefined).then(r => r.data),
    gcTime: 0,
  })

  const products: Product[] = Array.isArray(data) ? data : []

  const createMutation = useMutation({
    mutationFn: (dto: unknown) => productsApi.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: unknown }) =>
      productsApi.update(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      setEditing(null)
      setShowForm(false)
    },
  })

  return (
    <div className="space-y-6">

      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos y servicios</h1>
          <p className="text-sm text-gray-500">{products.length} registros</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Nuevo producto
        </button>
      </div>

      {/* Buscador */}
      <input
        type="text"
        placeholder="Buscar por nombre o código..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Cargando...</p>
        ) : products.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No hay productos registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Código</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Precio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">IVA</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Stock</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-500">{p.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-900">
                    ${Number(p.price).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {TAX_LABELS[p.ivaRate] ?? `IVA ${p.ivaRate}%`}
                  </td>
                  <td className="px-4 py-3">
                    {p.trackInventory ? (
                      <span className={Number(p.stock) <= Number(p.minStock)
                        ? 'text-red-600 font-medium'
                        : 'text-gray-900'
                      }>
                        {Number(p.stock).toFixed(0)} {p.unit ?? ''}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.isService
                      ? 'bg-purple-100 text-purple-700'
                      : 'bg-blue-100 text-blue-700'
                      }`}>
                      {p.isService ? 'Servicio' : 'Producto'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                      }`}>
                      {p.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setEditing(p); setShowForm(true) }}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <ProductForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          onSubmit={(dto) => {
            if (editing) {
              updateMutation.mutate({ id: editing.id, dto })
            } else {
              createMutation.mutate(dto)
            }
          }}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

// Convierte ivaRate (número) al código SRI para el select
const ivaRateToCode: Record<number, string> = { 0: '0', 5: '5', 8: '8', 15: '4' }
// Convierte código SRI al valor numérico de ivaRate
const codeToIvaRate: Record<string, number> = { '0': 0, '5': 5, '8': 8, '4': 15 }

// ─── Formulario ───────────────────────────────────────────────────────────────
function ProductForm({
  initial, onCancel, onSubmit, loading,
}: {
  initial: Product | null
  onCancel: () => void
  onSubmit: (dto: unknown) => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    mainCode: initial?.code ?? '',
    auxiliaryCode: initial?.auxiliaryCode ?? '',
    name: initial?.name ?? '',
    price: initial?.price ?? 0,
    cost: (initial as (typeof initial & { cost?: number }))?.cost ?? 0,
    taxCode: initial ? (ivaRateToCode[initial.ivaRate] ?? '4') : '4',
    unit: initial?.unit ?? '',
    isService: initial?.isService ?? false,
    tracksInventory: initial?.trackInventory ?? true,
    minStock: initial?.minStock ?? 0,
  })

  const { data: unitsData } = useQuery({
    queryKey: ['units'],
    queryFn: () => unitsApi.findAll(),
  })
  const units: { id: string; name: string; abbreviation: string }[] =
    Array.isArray(unitsData) ? unitsData : []

  const set = (field: string, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      code: form.mainCode,
      auxiliaryCode: form.auxiliaryCode || undefined,
      name: form.name,
      price: Number(form.price),
      cost: Number(form.cost) || undefined,
      ivaRate: codeToIvaRate[form.taxCode] ?? 15,
      unit: form.unit || undefined,
      isService: form.isService,
      trackInventory: form.tracksInventory,
      minStock: Number(form.minStock),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900">
          {initial ? 'Editar producto' : 'Nuevo producto'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* Códigos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">
                Código principal <span className="text-red-500">*</span>
              </label>
              <input
                required
                value={form.mainCode}
                onChange={e => set('mainCode', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
                placeholder="PROD-001"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Código de barras
                <span className="text-gray-400 font-normal ml-1">(opcional)</span>
              </label>
              <input
                value={form.auxiliaryCode}
                onChange={e => set('auxiliaryCode', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                placeholder="7501234567890"
              />
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="text-xs font-medium text-gray-600">
              Nombre / Descripción <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="Nombre del producto o servicio"
            />
          </div>

          {/* Precio, Costo e IVA */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">
                Precio venta <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={e => set('price', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Costo compra
                <span className="text-gray-400 font-normal ml-1">(opt.)</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={form.cost}
                  onChange={e => set('cost', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">IVA</label>
              <select
                value={form.taxCode}
                onChange={e => set('taxCode', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              >
                <option value="4">IVA 15%</option>
                <option value="0">IVA 0%</option>
              </select>
            </div>
          </div>

          {/* Unidad */}
          <div>
            <label className="text-xs font-medium text-gray-600">
              Unidad de medida <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.unit}
              onChange={e => set('unit', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            >
              <option value="">Selecciona una unidad...</option>
              {units.map(u => (
                <option key={u.id} value={u.abbreviation}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
          </div>

          {/* Checkboxes */}
          <div className="flex gap-4 pt-1">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isService}
                onChange={e => {
                  set('isService', e.target.checked)
                  if (e.target.checked) set('tracksInventory', false)
                }}
                className="rounded"
              />
              Es servicio
            </label>
            {!form.isService && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.tracksInventory}
                  onChange={e => set('tracksInventory', e.target.checked)}
                  className="rounded"
                />
                Controla stock
              </label>
            )}
          </div>

          {/* Stock mínimo */}
          {form.tracksInventory && !form.isService && (
            <div>
              <label className="text-xs font-medium text-gray-600">
                Stock mínimo para alerta
              </label>
              <input
                type="number"
                min="0"
                value={form.minStock}
                onChange={e => set('minStock', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}