import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '../../services/api'
import Pagination from '../../components/ui/Pagination'

interface Customer {
  id: string
  identificationType: string
  identification: string
  name: string
  email: string | null
  phone: string | null
  isActive: boolean
}

const ID_LABELS: Record<string, string> = {
  '05': 'Cédula',
  '04': 'RUC',
  '06': 'Pasaporte',
  '07': 'Consumidor Final',
}

const PAGE_SIZE = 50

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="animate-pulse">
      {[...Array(cols)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

export default function ClientsPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

  useEffect(() => { setPage(1) }, [search])

  // ─── Cargar clientes ──────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page],
    queryFn: () => clientsApi.findAll(search, page, PAGE_SIZE).then(r => r.data),
  })

  const customers: Customer[] = data?.data ?? []
  const totalItems: number = data?.total ?? 0
  const totalPages: number = data?.totalPages ?? 1

  // ─── Mutaciones ───────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (dto: unknown) => clientsApi.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: unknown }) =>
      clientsApi.update(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setEditing(null)
      setShowForm(false)
    },
  })

  const handleEdit = (c: Customer) => {
    setEditing(c)
    setShowForm(true)
  }

  return (
    <div className="space-y-6">

      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500">{totalItems} registros</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Nuevo cliente
        </button>
      </div>

      {/* Buscador */}
      <input
        type="text"
        placeholder="Buscar por nombre o identificación..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Identificación</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              [...Array(5)].map((_, i) => <SkeletonRow key={i} cols={6} />)
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  No hay clientes registrados.
                </td>
              </tr>
            ) : (
              customers.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-400">{ID_LABELS[c.identificationType] ?? c.identificationType}</span>
                    <br />
                    <span className="font-mono">{c.identification}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-500">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {c.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleEdit(c)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          itemsPerPage={PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>

      {/* Modal formulario */}
      {showForm && (
        <CustomerForm
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

// ─── Formulario ───────────────────────────────────────────────────────────────
function CustomerForm({
  initial, onCancel, onSubmit, loading,
}: {
  initial: Customer | null
  onCancel: () => void
  onSubmit: (dto: unknown) => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    identificationType: initial?.identificationType ?? '05',
    identification: initial?.identification ?? '',
    name: initial?.name ?? '',
    email: initial?.email ?? '',
    phone: initial?.phone ?? '',
    address: '',
  })

  const set = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          {initial ? 'Editar cliente' : 'Nuevo cliente'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Tipo de identificación</label>
            <select
              value={form.identificationType}
              onChange={e => set('identificationType', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            >
              <option value="05">Cédula</option>
              <option value="04">RUC</option>
              <option value="06">Pasaporte</option>
              <option value="07">Consumidor Final</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Identificación</label>
            <input
              required
              value={form.identification}
              onChange={e => set('identification', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="0912345678"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Nombre completo / Razón social</label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="Juan Pérez"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="juan@email.com"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Teléfono</label>
            <input
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="0991234567"
            />
          </div>

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