import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { productsApi, unitsApi, productBatchesApi } from '../../services/api'
import Pagination from '../../components/ui/Pagination'
import { AlertTriangle } from 'lucide-react'

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
  managesBatches?: boolean
  stock: number
  minStock: number
  isActive: boolean
}

interface ProductBatch {
  id: string
  productId: string
  batchNumber: string
  expirationDate: string
  quantity: number
  remainingQuantity: number
  receivedAt?: string
  unitCost?: number
  notes?: string
  isActive: boolean
  createdAt: string
}

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmColor?: 'red' | 'green'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}


const TAX_LABELS: Record<number, string> = {
  0: 'IVA 0%',
  15: 'IVA 15%',
  5: 'IVA 5%',
  8: 'IVA 8%',
}


function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function batchStatus(expirationDate: string): {
  label: string
  className: string
} {
  const today = new Date()
  const exp = new Date(expirationDate)
  const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { label: 'Caducado', className: 'bg-red-100 text-red-700' }
  if (diffDays <= 30) return { label: `Caduca en ${diffDays}d`, className: 'bg-rose-100 text-rose-700' }
  if (diffDays <= 90) return { label: `Caduca en ${diffDays}d`, className: 'bg-amber-100 text-amber-700' }
  return { label: 'Vigente', className: 'bg-emerald-100 text-emerald-700' }
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('es-EC', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const PAGE_SIZE = 50

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [ivaFilter, setIvaFilter] = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [viewingBatchesProduct, setViewingBatchesProduct] = useState<Product | null>(null)
  const [confirmProduct, setConfirmProduct] = useState<Product | null>(null)


  const params = {
    ...(search ? { search } : {}),
    status: statusFilter || 'active',
    ...(ivaFilter ? { ivaRate: ivaFilter } : {}),
    ...(stockFilter ? { stockFilter } : {}),
    page,
    limit: PAGE_SIZE,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['products', params],
    queryFn: () => productsApi.findAll(params).then(r => r.data),
    gcTime: 0,
  })

  const products: Product[] = data?.data ?? []
  const totalItems: number = data?.total ?? 0
  const totalPages: number = data?.totalPages ?? 1

  useEffect(() => { setPage(1) }, [search, statusFilter, ivaFilter, stockFilter])

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

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive
        ? productsApi.deactivate(id)
        : productsApi.update(id, { isActive: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  })

  return (
    <div className="space-y-6">

      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos y servicios</h1>
          <p className="text-sm text-gray-500">{totalItems} registros</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Nuevo producto
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Buscar por nombre, código o barras..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
        <select
          value={ivaFilter}
          onChange={e => setIvaFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los IVA</option>
          <option value="0">IVA 0%</option>
          <option value="15">IVA 15%</option>
          <option value="5">IVA 5%</option>
          <option value="8">IVA 8%</option>
        </select>
        <select
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todo stock</option>
          <option value="low">Stock bajo</option>
          <option value="out">Agotados</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
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
            {isLoading ? (
              [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">
                  No hay productos que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              products.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-gray-500">
                    <div>{p.code}</div>
                    {p.auxiliaryCode && (
                      <div className="text-xs text-gray-400">{p.auxiliaryCode}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {p.name}
                    {p.managesBatches && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700">
                        Lotes
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    ${Number(p.price).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {TAX_LABELS[p.ivaRate] ?? `IVA ${p.ivaRate}%`}
                  </td>
                  <td className="px-4 py-3">
                    {p.trackInventory ? (
                      <span className={
                        Number(p.stock) <= 0
                          ? 'text-red-600 font-medium'
                          : Number(p.stock) <= Number(p.minStock)
                            ? 'text-amber-600 font-medium'
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
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {p.managesBatches && (
                        <button
                          onClick={() => setViewingBatchesProduct(p)}
                          className="text-violet-600 hover:text-violet-800 hover:underline text-xs font-medium"
                        >
                          Ver lotes
                        </button>
                      )}
                      <button
                        onClick={() => { setEditing(p); setShowForm(true) }}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setConfirmProduct(p)}
                        className={`text-xs hover:underline ${p.isActive
                          ? 'text-gray-400 hover:text-red-500'
                          : 'text-emerald-600 hover:text-emerald-800'
                          }`}
                      >
                        {p.isActive ? 'Desactivar' : 'Reactivar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={!!confirmProduct}
        title={
          confirmProduct?.isActive
            ? 'Desactivar producto'
            : 'Reactivar producto'
        }
        message={
          confirmProduct
            ? confirmProduct.isActive
              ? `¿Estás seguro de que deseas desactivar "${confirmProduct.name}"? El producto dejará de estar disponible para su uso, pero podrás reactivarlo más adelante.`
              : `¿Estás seguro de que deseas reactivar "${confirmProduct.name}"?`
            : ''
        }
        confirmText={
          confirmProduct?.isActive ? 'Sí, desactivar' : 'Sí, reactivar'
        }
        confirmColor={confirmProduct?.isActive ? 'red' : 'green'}
        loading={toggleStatusMutation.isPending}
        onCancel={() => setConfirmProduct(null)}
        onConfirm={() => {
          if (!confirmProduct) return

          toggleStatusMutation.mutate(
            {
              id: confirmProduct.id,
              isActive: confirmProduct.isActive,
            },
            {
              onSuccess: () => {
                setConfirmProduct(null)
              },
            }
          )
        }}
      />

      {/* Paginación */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={PAGE_SIZE}
        onPageChange={setPage}
      />

      {/* Modal de edición */}
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

      {/* Modal de lotes */}
      {viewingBatchesProduct && (
        <BatchesModal
          product={viewingBatchesProduct}
          onClose={() => setViewingBatchesProduct(null)}
        />
      )}


    </div>
  )
}

// ─── Modal de confirmacion ───────────────────────────────────────────────────────────
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Aceptar',
  cancelText = 'Cancelar',
  confirmColor = 'red',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl animate-in fade-in zoom-in-95">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-3">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>

            <div>
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-gray-600">{message}</p>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              {cancelText}
            </button>

            <button
              onClick={onConfirm}
              disabled={loading}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition
                ${confirmColor === 'red'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
                }
                disabled:opacity-50`}
            >
              {loading ? 'Procesando...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal de lotes ───────────────────────────────────────────────────────────

function BatchesModal({ product, onClose }: {
  product: Product
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingBatch, setEditingBatch] = useState<ProductBatch | null>(null)

  const { data: batches = [], isLoading } = useQuery<ProductBatch[]>({
    queryKey: ['product-batches', product.id],
    queryFn: () => productBatchesApi.findByProduct(product.id).then(r => r.data as ProductBatch[]),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => productBatchesApi.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-batches', product.id] })
    },
  })

  const activeBatches = batches.filter(b => b.isActive)
  const inactiveBatches = batches.filter(b => !b.isActive)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">{product.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {activeBatches.length} lote{activeBatches.length !== 1 ? 's' : ''} activo{activeBatches.length !== 1 ? 's' : ''}
              {' · '}Stock total: <span className="font-semibold text-gray-700">{Number(product.stock).toFixed(0)} {product.unit ?? ''}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowAddForm(true); setEditingBatch(null) }}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg"
            >
              + Agregar lote
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none px-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">

          {/* Formulario agregar / editar lote */}
          {(showAddForm || editingBatch) && (
            <BatchForm
              productId={product.id}
              productUnit={product.unit}
              initial={editingBatch}
              onCancel={() => { setShowAddForm(false); setEditingBatch(null) }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['product-batches', product.id] })
                queryClient.invalidateQueries({ queryKey: ['products'] })
                setShowAddForm(false)
                setEditingBatch(null)
              }}
            />
          )}

          {/* Lista de lotes activos */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : activeBatches.length === 0 && !showAddForm ? (
            <div className="text-center py-10">
              <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-sm text-gray-500 font-medium">Sin lotes registrados</p>
              <p className="text-xs text-gray-400 mt-1">Agrega el primer lote con el botón de arriba</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeBatches.map(batch => {
                const status = batchStatus(batch.expirationDate)
                return (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900 font-mono">
                          {batch.batchNumber}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                        <span>Caduca: <span className="text-gray-600">{formatDate(batch.expirationDate)}</span></span>
                        <span>·</span>
                        <span>
                          Restante: <span className={`font-semibold ${Number(batch.remainingQuantity) <= 0 ? 'text-red-500' : 'text-gray-700'}`}>
                            {Number(batch.remainingQuantity).toFixed(0)}
                          </span>
                          {' / '}
                          {Number(batch.quantity).toFixed(0)} {product.unit ?? ''}
                        </span>
                        {batch.unitCost && (
                          <>
                            <span>·</span>
                            <span>Costo: <span className="text-gray-600">${Number(batch.unitCost).toFixed(4)}</span></span>
                          </>
                        )}
                        {batch.receivedAt && (
                          <>
                            <span>·</span>
                            <span>Recibido: <span className="text-gray-600">{formatDate(batch.receivedAt)}</span></span>
                          </>
                        )}
                      </div>
                      {batch.notes && (
                        <p className="text-xs text-gray-400 mt-0.5 italic">{batch.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4 shrink-0">
                      <button
                        onClick={() => { setEditingBatch(batch); setShowAddForm(false) }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`¿Desactivar el lote ${batch.batchNumber}? Esta acción no se puede deshacer.`)) {
                            deactivateMutation.mutate(batch.id)
                          }
                        }}
                        disabled={deactivateMutation.isPending}
                        className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40"
                      >
                        Desactivar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Lotes inactivos (colapsables) */}
          {inactiveBatches.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 select-none">
                {inactiveBatches.length} lote{inactiveBatches.length !== 1 ? 's' : ''} inactivo{inactiveBatches.length !== 1 ? 's' : ''} (histórico)
              </summary>
              <div className="mt-2 space-y-1.5">
                {inactiveBatches.map(batch => (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-2.5 opacity-50"
                  >
                    <div>
                      <span className="text-xs font-mono text-gray-600">{batch.batchNumber}</span>
                      <span className="ml-2 text-xs text-gray-400">Caduca: {formatDate(batch.expirationDate)}</span>
                    </div>
                    <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactivo</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Formulario de lote (agregar / editar) ────────────────────────────────────

function BatchForm({ productId, productUnit, initial, onCancel, onSuccess }: {
  productId: string
  productUnit?: string
  initial: ProductBatch | null
  onCancel: () => void
  onSuccess: () => void
}) {
  const [batchNumber, setBatchNumber] = useState(initial?.batchNumber ?? '')
  const [expirationDate, setExpirationDate] = useState(
    initial?.expirationDate ? initial.expirationDate.slice(0, 10) : ''
  )
  const [quantity, setQuantity] = useState(
    initial ? String(initial.quantity) : ''
  )
  const [remainingQuantity, setRemainingQuantity] = useState(
    initial ? String(initial.remainingQuantity) : ''
  )
  const [unitCost, setUnitCost] = useState(initial?.unitCost ? String(initial.unitCost) : '')
  const [receivedAt, setReceivedAt] = useState(
    initial?.receivedAt ? initial.receivedAt.slice(0, 10) : ''
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isEditing = !!initial

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!batchNumber.trim()) { setError('El número de lote es requerido'); return }
    if (!expirationDate) { setError('La fecha de caducidad es requerida'); return }
    if (!quantity || Number(quantity) <= 0) { setError('La cantidad debe ser mayor a 0'); return }
    if (isEditing && Number(remainingQuantity) > Number(quantity)) {
      setError('La cantidad restante no puede ser mayor a la cantidad original'); return
    }

    setSaving(true)
    try {
      if (isEditing) {
        await productBatchesApi.update(initial.id, {
          batchNumber: batchNumber.trim(),
          expirationDate,
          remainingQuantity: Number(remainingQuantity),
          unitCost: unitCost ? Number(unitCost) : undefined,
          notes: notes || undefined,
        })
      } else {
        await productBatchesApi.create({
          productId,
          batchNumber: batchNumber.trim(),
          expirationDate,
          quantity: Number(quantity),
          receivedAt: receivedAt || undefined,
          unitCost: unitCost ? Number(unitCost) : undefined,
          notes: notes || undefined,
        })
      }
      onSuccess()
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Error al guardar el lote')
      setSaving(false)
    }
  }

  return (
    <div className="border border-violet-200 bg-violet-50/40 rounded-xl p-4 space-y-3">
      <p className="text-xs font-semibold text-violet-700">
        {isEditing ? `Editando lote: ${initial.batchNumber}` : 'Nuevo lote'}
      </p>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">
              N° de lote <span className="text-red-500">*</span>
            </label>
            <input
              value={batchNumber}
              onChange={e => setBatchNumber(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 font-mono"
              placeholder="Ej: L2026-045"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">
              Fecha de caducidad <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={expirationDate}
              onChange={e => setExpirationDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">
              Cantidad recibida <span className="text-red-500">*</span>
              {productUnit && <span className="text-gray-400 font-normal"> ({productUnit})</span>}
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onChange={e => {
                setQuantity(e.target.value)
                if (!isEditing) setRemainingQuantity(e.target.value)
              }}
              disabled={isEditing}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 disabled:bg-gray-50 disabled:text-gray-400"
              placeholder="0"
            />
            {isEditing && (
              <p className="text-[11px] text-gray-400 mt-0.5">No modificable al editar</p>
            )}
          </div>
          {isEditing && (
            <div>
              <label className="text-xs font-medium text-gray-600">
                Cantidad restante
                {productUnit && <span className="text-gray-400 font-normal"> ({productUnit})</span>}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                max={quantity}
                value={remainingQuantity}
                onChange={e => setRemainingQuantity(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">
              Costo unitario
              <span className="text-gray-400 font-normal ml-1">(opcional)</span>
            </label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={unitCost}
                onChange={e => setUnitCost(e.target.value)}
                className="w-full border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-sm"
                placeholder="0.0000"
              />
            </div>
          </div>
          {!isEditing && (
            <div>
              <label className="text-xs font-medium text-gray-600">
                Fecha de recepción
                <span className="text-gray-400 font-normal ml-1">(opcional)</span>
              </label>
              <input
                type="date"
                value={receivedAt}
                onChange={e => setReceivedAt(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">
            Notas
            <span className="text-gray-400 font-normal ml-1">(opcional)</span>
          </label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            placeholder="Proveedor, número de factura de compra, observaciones..."
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-gray-200 rounded-lg py-2 text-xs text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-violet-600 hover:bg-violet-700 text-white rounded-lg py-2 text-xs font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Agregar lote'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Conversores IVA ──────────────────────────────────────────────────────────
const ivaRateToCode: Record<number, string> = { 0: '0', 5: '5', 8: '8', 15: '4' }
const codeToIvaRate: Record<string, number> = { '0': 0, '5': 5, '8': 8, '4': 15 }

// ─── Formulario producto ──────────────────────────────────────────────────────
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
    managesBatches: initial?.managesBatches ?? false,
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
      ...(form.mainCode ? { code: form.mainCode } : {}),
      auxiliaryCode: form.auxiliaryCode || undefined,
      name: form.name,
      price: Number(form.price),
      cost: Number(form.cost) || undefined,
      ivaRate: codeToIvaRate[form.taxCode] ?? 15,
      unit: form.unit || undefined,
      isService: form.isService,
      trackInventory: form.tracksInventory,
      minStock: Number(form.minStock),
      managesBatches: form.managesBatches,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold text-gray-900">
          {initial ? 'Editar producto' : 'Nuevo producto'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Código principal</label>
              <input
                readOnly
                value={form.mainCode}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 bg-gray-50 text-gray-500 cursor-not-allowed"
                placeholder={initial ? '' : 'Se generará automáticamente'}
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

          <div>
            <label className="text-xs font-medium text-gray-600">
              Nombre / Descripción <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value.toUpperCase())}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="Nombre del producto o servicio"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">
                Precio venta <span className="text-red-500">*</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                <input
                  required type="number" step="0.01" min="0"
                  value={form.price}
                  onChange={e => set('price', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg pl-6 pr-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Costo <span className="text-gray-400 font-normal">(opt.)</span>
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                <input
                  type="number" step="0.0001" min="0"
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

          <div>
            <label className="text-xs font-medium text-gray-600">
              Unidad de medida <span className="text-red-500">*</span>
            </label>
            <select
              required value={form.unit}
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

          <div className="flex gap-4 pt-1 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox" checked={form.isService}
                onChange={e => {
                  set('isService', e.target.checked)
                  if (e.target.checked) {
                    set('tracksInventory', false)
                    set('managesBatches', false)
                  }
                }}
                className="rounded"
              />
              Es servicio
            </label>
            {!form.isService && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox" checked={form.tracksInventory}
                  onChange={e => {
                    set('tracksInventory', e.target.checked)
                    if (!e.target.checked) set('managesBatches', false)
                  }}
                  className="rounded"
                />
                Controla stock
              </label>
            )}
            {!form.isService && form.tracksInventory && (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox" checked={form.managesBatches}
                  onChange={e => set('managesBatches', e.target.checked)}
                  className="rounded"
                />
                Maneja lotes / caducidad
              </label>
            )}
          </div>

          {form.managesBatches && (
            <p className="text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
              Los lotes se registran desde el botón "Ver lotes" en la tabla de productos.
            </p>
          )}

          {form.tracksInventory && !form.isService && (
            <div>
              <label className="text-xs font-medium text-gray-600">Stock mínimo para alerta</label>
              <input
                type="number" min="0" value={form.minStock}
                onChange={e => set('minStock', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onCancel}
              className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={loading}
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