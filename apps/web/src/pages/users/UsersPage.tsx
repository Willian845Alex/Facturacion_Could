import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, branchesApi } from '../../services/api'
import Pagination from '../../components/ui/Pagination'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Branch {
  id: string
  name: string
  codigoEstablecimiento: string
  puntoEmision: string
  isActive: boolean
}

interface UserRow {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'VENDEDOR'
  branchId: string | null
  branch: Branch | null
  isActive: boolean
  createdAt: string
}

interface UserFormData {
  name: string
  email: string
  password: string
  role: 'ADMIN' | 'VENDEDOR'
  branchId: string
  isActive: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  VENDEDOR: 'Vendedor',
}

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-blue-100 text-blue-700',
  VENDEDOR: 'bg-green-100 text-green-700',
}

const ROLE_DESC: Record<string, string> = {
  ADMIN: 'Acceso completo al sistema incluyendo configuración, usuarios y reportes.',
  VENDEDOR: 'Puede facturar, gestionar clientes y manejar la caja. Sin acceso a configuración ni reportes.',
}

function branchLabel(b: Branch) {
  return `${b.codigoEstablecimiento}-${b.puntoEmision} — ${b.name}`
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function UserModal({
  user,
  onClose,
  onSave,
}: {
  user: UserRow | null
  onClose: () => void
  onSave: (data: Partial<UserFormData>) => Promise<void>
}) {
  const isEdit = !!user
  const [form, setForm] = useState<UserFormData>({
    name: user?.name ?? '',
    email: user?.email ?? '',
    password: '',
    role: user?.role ?? 'VENDEDOR',
    branchId: user?.branchId ?? '',
    isActive: user?.isActive ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.findAll().then(r => r.data as Branch[]),
    staleTime: 60000,
  })
  const branches = Array.isArray(branchesData) ? branchesData.filter(b => b.isActive) : []

  function set<K extends keyof UserFormData>(k: K, v: UserFormData[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (form.role === 'VENDEDOR' && !form.branchId) {
      setError('Selecciona el punto de emisión para el vendedor')
      return
    }

    setSaving(true)
    try {
      const payload: Partial<UserFormData> = {
        name: form.name,
        email: form.email,
        role: form.role,
        branchId: form.role === 'VENDEDOR' ? form.branchId : undefined,
      }
      if (form.password) payload.password = form.password
      if (isEdit) payload.isActive = form.isActive
      await onSave(payload)
      onClose()
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.message ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: María González"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="usuario@empresa.ec"
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Contraseña {isEdit ? '(dejar vacío para no cambiar)' : '*'}
            </label>
            <input
              type="password"
              required={!isEdit}
              minLength={8}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={isEdit ? '••••••••' : 'Mínimo 8 caracteres'}
            />
          </div>

          {/* Rol */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Rol *</label>
            <select
              value={form.role}
              onChange={e => set('role', e.target.value as 'ADMIN' | 'VENDEDOR')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="VENDEDOR">Vendedor</option>
              <option value="ADMIN">Administrador</option>
            </select>
            <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${form.role === 'ADMIN' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
              {ROLE_DESC[form.role]}
            </div>
          </div>

          {/* Punto de emisión — solo para VENDEDOR */}
          {form.role === 'VENDEDOR' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Punto de emisión *
              </label>
              {branches.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  No hay sucursales activas. Crea una en Configuración → Sucursales.
                </p>
              ) : (
                <select
                  value={form.branchId}
                  onChange={e => set('branchId', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar sucursal…</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{branchLabel(b)}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Estado (solo edición) */}
          {isEdit && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => set('isActive', !form.isActive)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  form.isActive ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  form.isActive ? 'translate-x-4.5' : 'translate-x-0.5'
                }`} />
              </button>
              <span className="text-sm text-gray-700">
                {form.isActive ? 'Usuario activo' : 'Usuario inactivo'}
              </span>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >Cancelar</button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export default function UsersPage() {
  const qc = useQueryClient()
  const [modalUser, setModalUser] = useState<UserRow | null | undefined>(undefined)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [page, setPage] = useState(1)

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: () => usersApi.findAll(page, PAGE_SIZE).then(r => r.data),
  })
  const users: UserRow[] = usersData?.data ?? []
  const totalItems: number = usersData?.total ?? 0
  const totalPages: number = usersData?.totalPages ?? 1

  const createMutation = useMutation({
    mutationFn: (data: unknown) => usersApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); showToast('Usuario creado', true) },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: unknown }) => usersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); showToast('Usuario actualizado', true) },
  })

  async function handleSave(data: Partial<UserFormData>) {
    if (modalUser) {
      await updateMutation.mutateAsync({ id: modalUser.id, data })
    } else {
      await createMutation.mutateAsync(data)
    }
  }

  async function handleToggleActive(user: UserRow) {
    try {
      await usersApi.update(user.id, { isActive: !user.isActive })
      qc.invalidateQueries({ queryKey: ['users'] })
      showToast(user.isActive ? 'Usuario desactivado' : 'Usuario activado', true)
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'Error', false)
    }
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestión de accesos al sistema</p>
        </div>
        <button
          onClick={() => setModalUser(null)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo usuario
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total usuarios', value: users.length, color: 'text-blue-600' },
          { label: 'Activos', value: users.filter(u => u.isActive).length, color: 'text-green-600' },
          { label: 'Administradores', value: users.filter(u => u.role === 'ADMIN').length, color: 'text-indigo-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 px-5 py-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Listado de usuarios</h2>
        </div>

        {isLoading ? (
          <table className="w-full text-sm">
            <tbody>
              {[...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse border-b border-gray-50">
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="px-5 py-3.5">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No hay usuarios registrados</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Punto de emisión</th>
                <th className="px-5 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Registrado</th>
                <th className="px-5 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-xs font-semibold text-gray-600">{u.name.charAt(0).toUpperCase()}</span>
                      </div>
                      <span className="font-medium text-gray-900">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 text-xs">
                    {u.branch
                      ? <span className="font-mono">{u.branch.codigoEstablecimiento}-{u.branch.puntoEmision} <span className="font-sans text-gray-400">— {u.branch.name}</span></span>
                      : <span className="text-gray-300">—</span>
                    }
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-400 text-xs">{fmtDate(u.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setModalUser(u)}
                        className="text-xs text-gray-500 hover:text-blue-600 font-medium"
                        title="Editar"
                      >Editar</button>
                      <span className="text-gray-200">|</span>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs font-medium ${u.isActive ? 'text-gray-500 hover:text-red-600' : 'text-gray-400 hover:text-green-600'}`}
                        title={u.isActive ? 'Desactivar' : 'Activar'}
                      >{u.isActive ? 'Desactivar' : 'Activar'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-5 pb-3">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      </div>

      {/* Modal */}
      {modalUser !== undefined && (
        <UserModal
          user={modalUser}
          onClose={() => setModalUser(undefined)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
