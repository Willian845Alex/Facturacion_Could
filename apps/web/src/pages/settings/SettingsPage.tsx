import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, branchesApi, unitsApi } from '../../services/api'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Settings {
  ruc: string
  razonSocial: string
  nombreComercial: string
  dirMatriz: string
  telefono?: string
  email?: string
  ambiente: number
  logoBase64?: string
  certificadoP12Encrypted?: string
  certificadoVencimiento?: string
}

interface Branch {
  id: string
  name: string
  address: string
  codigoEstablecimiento: string
  puntoEmision: string
  phone?: string
  isActive: boolean
}

interface Unit {
  id: string
  name: string
  abbreviation: string
  isActive: boolean
}

type Tab = 'empresa' | 'sucursales' | 'unidades' | 'certificado'

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('empresa')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'empresa',     label: 'Datos de la empresa' },
    { key: 'sucursales',  label: 'Sucursales' },
    { key: 'unidades',    label: 'Unidades de medida' },
    { key: 'certificado', label: 'Certificado electrónico' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500">Parámetros del sistema de facturación</p>
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

      {/* Content */}
      <div>
        {activeTab === 'empresa'     && <EmpresaTab />}
        {activeTab === 'sucursales'  && <SucursalesTab />}
        {activeTab === 'unidades'    && <UnidadesTab />}
        {activeTab === 'certificado' && <CertificadoTab />}
      </div>
    </div>
  )
}

// ─── Tab 1: Empresa ───────────────────────────────────────────────────────────
function EmpresaTab() {
  const queryClient = useQueryClient()

  const { data: raw, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get().then(r => r.data as Settings).catch(() => null),
  })

  const [form, setForm] = useState({
    ruc:            '',
    razonSocial:    '',
    nombreComercial:'',
    dirMatriz:      '',
    telefono:       '',
    email:          '',
  })
  const [logoPreview, setLogoPreview] = useState<string>('')
  const [logoBase64,  setLogoBase64]  = useState<string>('')
  const [saved,  setSaved]  = useState(false)
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!raw) return
    setForm({
      ruc:             raw.ruc             ?? '',
      razonSocial:     raw.razonSocial     ?? '',
      nombreComercial: raw.nombreComercial ?? '',
      dirMatriz:       raw.dirMatriz       ?? '',
      telefono:        raw.telefono        ?? '',
      email:           raw.email           ?? '',
    })
    if (raw.logoBase64) {
      setLogoPreview(raw.logoBase64)
      setLogoBase64(raw.logoBase64)
    }
  }, [raw])

  const saveMutation = useMutation({
    mutationFn: (dto: unknown) => settingsApi.update(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
    onError: () => setErrMsg('Error al guardar. Verifique los datos e intente nuevamente.'),
  })

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setLogoPreview(result)
      setLogoBase64(result)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrMsg('')
    saveMutation.mutate({ ...form, logoBase64: logoBase64 || undefined })
  }

  if (isLoading) return <p className="text-sm text-gray-500">Cargando...</p>

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">

      {/* Fila: RUC + Teléfono */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-600">
            RUC <span className="text-red-500">*</span>
          </label>
          <input
            required
            pattern="[0-9]{13}"
            maxLength={13}
            value={form.ruc}
            onChange={e => setForm(p => ({ ...p, ruc: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 font-mono"
            placeholder="1234567890001"
          />
          <p className="text-xs text-gray-400 mt-0.5">13 dígitos</p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Teléfono</label>
          <input
            value={form.telefono}
            onChange={e => setForm(p => ({ ...p, telefono: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
            placeholder="02-2345678"
          />
        </div>
      </div>

      {/* Razón social */}
      <div>
        <label className="text-xs font-medium text-gray-600">
          Razón social <span className="text-red-500">*</span>
        </label>
        <input
          required
          value={form.razonSocial}
          onChange={e => setForm(p => ({ ...p, razonSocial: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 uppercase"
          placeholder="MI EMPRESA S.A."
        />
      </div>

      {/* Nombre comercial */}
      <div>
        <label className="text-xs font-medium text-gray-600">Nombre comercial</label>
        <input
          value={form.nombreComercial}
          onChange={e => setForm(p => ({ ...p, nombreComercial: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
          placeholder="Mi Empresa"
        />
      </div>

      {/* Dirección */}
      <div>
        <label className="text-xs font-medium text-gray-600">
          Dirección <span className="text-red-500">*</span>
        </label>
        <input
          required
          value={form.dirMatriz}
          onChange={e => setForm(p => ({ ...p, dirMatriz: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
          placeholder="Av. Principal 123 y Secundaria, Ciudad"
        />
      </div>

      {/* Email */}
      <div>
        <label className="text-xs font-medium text-gray-600">Email</label>
        <input
          type="email"
          value={form.email}
          onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
          placeholder="info@empresa.com"
        />
      </div>

      {/* Logo */}
      <div>
        <label className="text-xs font-medium text-gray-600">Logo</label>
        <div className="mt-1 flex items-center gap-4">
          {logoPreview && (
            <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
              <img
                src={logoPreview}
                alt="Logo"
                className="h-14 w-auto object-contain"
              />
            </div>
          )}
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleLogo}
              className="text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-gray-400 mt-1">PNG, JPG. Se mostrará en el RIDE.</p>
          </div>
        </div>
        {logoPreview && (
          <button
            type="button"
            onClick={() => { setLogoPreview(''); setLogoBase64('') }}
            className="text-xs text-red-500 hover:underline mt-1"
          >
            Quitar logo
          </button>
        )}
      </div>

      {errMsg && <p className="text-sm text-red-600">{errMsg}</p>}

      <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {saved && (
          <span className="text-sm text-green-600 font-medium">Guardado correctamente</span>
        )}
      </div>
    </form>
  )
}

// ─── Tab 2: Sucursales ────────────────────────────────────────────────────────
function SucursalesTab() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.findAll().then(r => r.data),
  })
  const branches: Branch[] = Array.isArray(raw) ? raw : []

  const createMutation = useMutation({
    mutationFn: (dto: unknown) => branchesApi.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: unknown }) =>
      branchesApi.update(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] })
      setEditing(null)
      setShowForm(false)
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {branches.length} / 3 sucursales registradas
        </p>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          disabled={branches.length >= 3}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Agregar sucursal
        </button>
      </div>

      {branches.length >= 3 && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Límite alcanzado: el sistema permite un máximo de 3 sucursales.
        </p>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Cargando...</p>
        ) : branches.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No hay sucursales registradas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Establecimiento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Pto. emisión</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Dirección</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {branches.map(b => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">
                    {b.codigoEstablecimiento}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500">
                    {b.puntoEmision}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{b.name}</td>
                  <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{b.address}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      b.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {b.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => { setEditing(b); setShowForm(true) }}
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

      {showForm && (
        <BranchForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          onSubmit={dto => {
            if (editing) updateMutation.mutate({ id: editing.id, dto })
            else createMutation.mutate(dto)
          }}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

function BranchForm({
  initial, onCancel, onSubmit, loading,
}: {
  initial: Branch | null
  onCancel: () => void
  onSubmit: (dto: unknown) => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    codigoEstablecimiento: initial?.codigoEstablecimiento ?? '',
    puntoEmision:          initial?.puntoEmision          ?? '',
    name:                  initial?.name                  ?? '',
    address:               initial?.address               ?? '',
    phone:                 initial?.phone                 ?? '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ ...form, phone: form.phone || undefined })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          {initial ? 'Editar sucursal' : 'Nueva sucursal'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">
                Código establecimiento <span className="text-red-500">*</span>
              </label>
              <input
                required
                pattern="[0-9]{3}"
                maxLength={3}
                value={form.codigoEstablecimiento}
                onChange={e => setForm(p => ({ ...p, codigoEstablecimiento: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                placeholder="001"
              />
              <p className="text-xs text-gray-400 mt-0.5">3 dígitos</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">
                Punto de emisión <span className="text-red-500">*</span>
              </label>
              <input
                required
                pattern="[0-9]{3}"
                maxLength={3}
                value={form.puntoEmision}
                onChange={e => setForm(p => ({ ...p, puntoEmision: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 font-mono"
                placeholder="001"
              />
              <p className="text-xs text-gray-400 mt-0.5">3 dígitos</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="Sucursal Principal"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">
              Dirección <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="Av. Principal 123"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">Teléfono</label>
            <input
              value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="02-2345678"
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

// ─── Tab 3: Unidades ──────────────────────────────────────────────────────────
function UnidadesTab() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Unit | null>(null)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['units'],
    queryFn: () => unitsApi.findAll(),
  })
  const units: Unit[] = Array.isArray(raw) ? raw : []

  const createMutation = useMutation({
    mutationFn: (dto: unknown) => unitsApi.create(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setShowForm(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: unknown }) =>
      unitsApi.update(id, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] })
      setEditing(null)
      setShowForm(false)
    },
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => unitsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['units'] }),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{units.length} unidades registradas</p>
        <button
          onClick={() => { setEditing(null); setShowForm(true) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          + Agregar unidad
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Cargando...</p>
        ) : units.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">No hay unidades registradas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Abreviación</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900">{u.name}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-xs">
                      {u.abbreviation}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {u.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      onClick={() => { setEditing(u); setShowForm(true) }}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la unidad "${u.name}"?`)) {
                          removeMutation.mutate(u.id)
                        }
                      }}
                      disabled={removeMutation.isPending}
                      className="text-red-500 hover:underline text-xs disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <UnitForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null) }}
          onSubmit={dto => {
            if (editing) updateMutation.mutate({ id: editing.id, dto })
            else createMutation.mutate(dto)
          }}
          loading={createMutation.isPending || updateMutation.isPending}
        />
      )}
    </div>
  )
}

function UnitForm({
  initial, onCancel, onSubmit, loading,
}: {
  initial: Unit | null
  onCancel: () => void
  onSubmit: (dto: unknown) => void
  loading: boolean
}) {
  const [form, setForm] = useState({
    name:         initial?.name         ?? '',
    abbreviation: initial?.abbreviation ?? '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(form)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">
          {initial ? 'Editar unidad' : 'Nueva unidad de medida'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600">
              Nombre <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value.toUpperCase() }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 uppercase"
              placeholder="KILOGRAMO"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">
              Abreviación <span className="text-red-500">*</span>
            </label>
            <input
              required
              maxLength={10}
              value={form.abbreviation}
              onChange={e => setForm(p => ({ ...p, abbreviation: e.target.value.toUpperCase() }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1 font-mono uppercase"
              placeholder="KG"
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

// ─── Tab 4: Certificado ───────────────────────────────────────────────────────
function CertificadoTab() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: raw, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get().then(r => r.data as Settings).catch(() => null),
  })

  const [p12File,      setP12File]      = useState<File | null>(null)
  const [certPassword, setCertPassword] = useState('')
  const [certSaved,    setCertSaved]    = useState(false)
  const [certErr,      setCertErr]      = useState('')
  const [ambiente,     setAmbiente]     = useState<number>(1)
  const [ambSaved,     setAmbSaved]     = useState(false)

  useEffect(() => {
    if (raw) setAmbiente(raw.ambiente ?? 1)
  }, [raw])

  const uploadMutation = useMutation({
    mutationFn: ({ file, password }: { file: File; password: string }) =>
      settingsApi.uploadCertificado(file, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setCertSaved(true)
      setCertPassword('')
      setP12File(null)
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(() => setCertSaved(false), 4000)
    },
    onError: (e: any) => {
      setCertErr(e?.response?.data?.message ?? 'Error al subir el certificado. Verifique la contraseña.')
    },
  })

  const ambienteMutation = useMutation({
    mutationFn: (amb: number) => settingsApi.update({ ambiente: amb }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setAmbSaved(true)
      setTimeout(() => setAmbSaved(false), 3000)
    },
  })

  const handleCertSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setCertErr('')
    if (!p12File) return
    uploadMutation.mutate({ file: p12File, password: certPassword })
  }

  const hasCert      = !!raw?.certificadoP12Encrypted
  const vencimiento  = raw?.certificadoVencimiento

  if (isLoading) return <p className="text-sm text-gray-500">Cargando...</p>

  return (
    <div className="max-w-2xl space-y-8">

      {/* Estado del certificado */}
      <div className={`rounded-lg border p-4 flex items-start gap-3 ${
        hasCert ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
      }`}>
        <div className={`w-3 h-3 rounded-full mt-0.5 shrink-0 ${hasCert ? 'bg-green-500' : 'bg-amber-400'}`} />
        <div>
          <p className={`text-sm font-medium ${hasCert ? 'text-green-800' : 'text-amber-800'}`}>
            {hasCert ? 'Certificado electrónico cargado' : 'Sin certificado electrónico'}
          </p>
          {hasCert && vencimiento && (
            <p className="text-xs text-green-700 mt-0.5">
              Vence el{' '}
              {new Date(vencimiento).toLocaleDateString('es-EC', {
                day: '2-digit', month: 'long', year: 'numeric',
              })}
            </p>
          )}
          {!hasCert && (
            <p className="text-xs text-amber-700 mt-0.5">
              El certificado .p12 emitido por el BCE es requerido para firmar
              electrónicamente los documentos y enviarlos al SRI.
            </p>
          )}
        </div>
      </div>

      {/* Subir certificado */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">
          {hasCert ? 'Actualizar certificado .p12' : 'Subir certificado .p12'}
        </h3>

        <form onSubmit={handleCertSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600">
              Archivo .p12 <span className="text-red-500">*</span>
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".p12,.pfx"
              required
              onChange={e => { setP12File(e.target.files?.[0] ?? null); setCertErr('') }}
              className="block w-full mt-1 text-sm text-gray-600 border border-gray-200 rounded-lg
                file:mr-3 file:py-2 file:px-4 file:border-0 file:rounded-l-lg
                file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {p12File && (
              <p className="text-xs text-gray-500 mt-1">
                {p12File.name} — {(p12File.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">
              Contraseña del certificado <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={certPassword}
              onChange={e => setCertPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1"
              placeholder="Contraseña del .p12"
            />
          </div>

          {certErr && <p className="text-sm text-red-600">{certErr}</p>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={uploadMutation.isPending || !p12File}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {uploadMutation.isPending ? 'Subiendo...' : 'Subir certificado'}
            </button>
            {certSaved && (
              <span className="text-sm text-green-600 font-medium">
                Certificado cargado correctamente
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Ambiente SRI */}
      <div className="space-y-4 border-t border-gray-100 pt-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Ambiente SRI</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Selecciona el ambiente en el que opera tu empresa.
          </p>
        </div>

        <div className="space-y-2">
          {[
            {
              value: 1,
              label: 'Pruebas',
              desc: 'Para desarrollo y validación. Las facturas no tienen validez fiscal.',
              badge: 'Desarrollo',
            },
            {
              value: 2,
              label: 'Producción',
              desc: 'Facturas con validez fiscal ante el SRI. Asegúrese de tener el certificado correcto.',
              badge: 'Real',
            },
          ].map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                ambiente === opt.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="ambiente"
                value={opt.value}
                checked={ambiente === opt.value}
                onChange={() => setAmbiente(opt.value)}
                className="mt-0.5 accent-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium ${ambiente === opt.value ? 'text-blue-700' : 'text-gray-900'}`}>
                    {opt.label}
                  </p>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    opt.value === 2
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {opt.badge}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => ambienteMutation.mutate(ambiente)}
            disabled={ambienteMutation.isPending}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {ambienteMutation.isPending ? 'Guardando...' : 'Guardar ambiente'}
          </button>
          {ambSaved && (
            <span className="text-sm text-green-600 font-medium">Guardado correctamente</span>
          )}
        </div>
      </div>
    </div>
  )
}
