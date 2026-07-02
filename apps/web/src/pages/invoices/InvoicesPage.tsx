import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi, productsApi, branchesApi, invoicesApi, cashRegisterApi, creditNotesApi, openBlob, type InvoiceSriEvent } from '../../services/api'
import Pagination from '../../components/ui/Pagination'
import { useAuthStore } from '../../store/auth.store'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Client {
  id: string; name: string; identification: string
  identificationType?: string; email?: string
}
interface Product {
  id: string; code: string; name: string; price: number
  ivaRate: number; unit?: string; isActive: boolean
  stockQuantity?: number; auxiliaryCode?: string
}
interface Branch {
  id: string; name: string; codigoEstablecimiento: string
  puntoEmision: string; isActive: boolean
}
interface FormItem {
  _key: string; productId?: string; code: string; description: string
  quantity: number; unitPrice: number; discount: number; ivaRate: number
  stockQuantity?: number; unit?: string
}
interface HistorialInvoice {
  id: string; secuencial: string; status: string; fechaEmision: string
  importeTotal: number; subtotal0: number; subtotalGravado: number; totalIva: number
  client: { id: string; name: string; identification: string; identificationType?: string } | null
  branch: { codigoEstablecimiento: string; puntoEmision: string } | null
  user: { name: string } | null
}
interface CreatedInvoice {
  id: string; secuencial: string; importeTotal: number; status: string
  branch?: { codigoEstablecimiento: string; puntoEmision: string }
  client?: { name: string }
}
interface DraftInvoice {
  id: string; createdAt: string; importeTotal: number; formaPago: string; branchId: string
  client: { id: string; name: string; identification: string; identificationType?: string; email?: string } | null
  items: Array<{ productId: string; code: string; description: string; quantity: number; unitPrice: number; discount: number; ivaRate: number }>
}

// ─── Constants & helpers ────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = [
  {
    code: '01', label: 'Efectivo',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    code: '19', label: 'Tarjeta',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    code: '17', label: 'Transferencia',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
]

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: 'Borrador', PENDIENTE: 'Pendiente', AUTORIZADO: 'Autorizada',
  RECHAZADO: 'Rechazada', ANULADO: 'Anulada',
}
const STATUS_COLORS: Record<string, string> = {
  BORRADOR: 'bg-gray-100 text-gray-500', PENDIENTE: 'bg-amber-100 text-amber-700',
  AUTORIZADO: 'bg-green-100 text-green-700', RECHAZADO: 'bg-red-100 text-red-700',
  ANULADO: 'bg-gray-200 text-gray-700',
}

function printTicket(invoiceId: string) {
  window.open(`/ticket/${invoiceId}`, '_blank', 'width=380,height=720,scrollbars=yes,resizable=yes')
}

function newKey() { return Math.random().toString(36).slice(2) }
function today() { return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().split('T')[0] }

function calcTotals(items: FormItem[]) {
  let subtotal0 = 0, subtotalGravado = 0, totalDescuento = 0
  const ivaByRate: Record<number, number> = {}
  for (const it of items) {
    const base = it.quantity * it.unitPrice
    const discountAmt = base * (it.discount || 0) / 100
    const net = base - discountAmt
    totalDescuento += discountAmt
    if (it.ivaRate === 0) {
      subtotal0 += net
    } else {
      subtotalGravado += net
      ivaByRate[it.ivaRate] = (ivaByRate[it.ivaRate] ?? 0) + net * it.ivaRate / 100
    }
  }
  const totalIva = Object.values(ivaByRate).reduce((a, b) => a + b, 0)
  return { subtotal0, subtotalGravado, totalDescuento, totalIva, ivaByRate, importeTotal: subtotal0 + subtotalGravado + totalIva }
}

function invoiceNum(inv: HistorialInvoice | CreatedInvoice) {
  const b = inv.branch
  if (!b) return (inv as HistorialInvoice).secuencial ?? '—'
  return `${b.codigoEstablecimiento}-${b.puntoEmision}-${inv.secuencial}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── ProductSearchBar ───────────────────────────────────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// BLOQUE 1 — Reemplaza ProductSearchBar y ClientSearchBar completos
// ════════════════════════════════════════════════════════════════════════════

// ─── ProductSearchBar ───────────────────────────────────────────────────────────

function ProductSearchBar({ onSelect }: { onSelect: (p: Product) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [barcode, setBarcode] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const barcodeRef = useRef<HTMLInputElement>(null)

  const { data } = useQuery({
    queryKey: ['prod-search', q],
    queryFn: () => productsApi.findAll({ search: q }).then(r => ((r.data as any)?.data ?? r.data) as Product[]),
    enabled: q.length >= 1,
    staleTime: 5000,
  })
  const results: Product[] = Array.isArray(data) ? data.filter(p => p.isActive) : []

  const select = (p: Product) => {
    onSelect(p)
    setQ('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleBarcode = async (code: string) => {
    if (!code.trim()) return
    try {
      const res = await productsApi.findAll({ search: code.trim() })
      const list = (((res.data as any)?.data ?? res.data) as Product[]).filter(p => p.isActive)
      if (list.length === 1) {
        onSelect(list[0])
        setBarcode('')
        barcodeRef.current?.focus()
      }
    } catch {
      // silencioso
    }
  }

  return (
    <div className="flex gap-3">
      <div className="relative flex-[2]">
        <svg className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => q.length >= 1 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={e => {
            if (e.key === 'Enter' && results.length > 0) select(results[0])
            if (e.key === 'Escape') { setQ(''); setOpen(false) }
          }}
          placeholder="Buscar producto por nombre o código…"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition-all"
        />
        <kbd className="absolute right-3 top-2.5 hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-medium text-slate-400 shadow-sm">
          ↵
        </kbd>

        {open && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/60 z-50 max-h-72 overflow-auto mt-1.5 p-1.5">
            {results.slice(0, 10).map((p, i) => (
              <button
                key={p.id}
                onMouseDown={() => select(p)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg hover:bg-indigo-50 text-left transition-colors ${i === 0 ? 'bg-indigo-50/60' : ''}`}
              >
                <div className="min-w-0 mr-3 flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 13a3 3 0 11-4.243-4.243l4-4a3 3 0 114.243 4.243l-4 4zM5 11a3 3 0 104.243 4.243l4-4A3 3 0 109 7l-4 4z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{p.code}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-slate-900 tabular-nums">${Number(p.price).toFixed(2)}</p>
                  <p className="text-[11px] text-slate-400">IVA {p.ivaRate}%</p>
                </div>
              </button>
            ))}
            {results.length > 10 && (
              <p className="px-3.5 py-2 text-xs text-slate-400 text-center border-t border-slate-100 mt-1">
                {results.length - 10} más — refina la búsqueda
              </p>
            )}
          </div>
        )}
      </div>

      <div className="relative flex-1">
        <svg className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 22V12h6v10" />
        </svg>
        <input
          ref={barcodeRef}
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleBarcode(barcode)
          }}
          placeholder="Código de barras…"
          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition-all"
        />
      </div>
    </div>
  )
}

// ─── QuickCreateClientModal ──────────────────────────────────────────────────────
// (sin cambios de lógica — solo estilo de inputs/botones para consistencia)

const ID_TYPE_OPTIONS = [
  { value: '05', label: 'Cédula' },
  { value: '04', label: 'RUC' },
  { value: '06', label: 'Pasaporte' },
]

function QuickCreateClientModal({ initialSearch, onClose, onCreated }: {
  initialSearch: string
  onClose: () => void
  onCreated: (c: Client) => void
}) {
  const [idType, setIdType] = useState('05')
  const [identification, setIdentification] = useState('')
  const [name, setName] = useState(initialSearch)
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!identification.trim()) {
      errs.identification = 'El número de identificación es requerido'
    } else if (idType === '05' && identification.trim().length !== 10) {
      errs.identification = 'La cédula debe tener exactamente 10 dígitos'
    } else if (idType === '04' && identification.trim().length !== 13) {
      errs.identification = 'El RUC debe tener exactamente 13 dígitos'
    }
    if (!name.trim()) errs.name = 'El nombre es requerido'
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const res = await clientsApi.create({
        identificationType: idType,
        identification: identification.trim(),
        name: name.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      })
      onCreated(res.data as Client)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message
      setErrors({ general: Array.isArray(msg) ? (msg as string[]).join(', ') : ((msg as string) ?? 'Error al crear el cliente') })
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Crear cliente rápido</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {errors.general && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{errors.general}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tipo de identificación</label>
              <select
                value={idType}
                onChange={e => { setIdType(e.target.value); setErrors(prev => ({ ...prev, identification: '' })) }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 bg-white"
              >
                {ID_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Número de identificación *</label>
              <input
                value={identification}
                onChange={e => { setIdentification(e.target.value); setErrors(prev => ({ ...prev, identification: '' })) }}
                placeholder={idType === '05' ? '10 dígitos' : idType === '04' ? '13 dígitos' : 'Pasaporte'}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white ${errors.identification ? 'border-rose-400' : 'border-slate-200'}`}
              />
              {errors.identification && <p className="text-xs text-rose-500 mt-1">{errors.identification}</p>}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nombre completo / Razón social *</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setErrors(prev => ({ ...prev, name: '' })) }}
              placeholder="Nombre o razón social"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white ${errors.name ? 'border-rose-400' : 'border-slate-200'}`}
            />
            {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
              <input
                value={email}
                onChange={e => setEmail(e.target.value)}
                type="email"
                placeholder="opcional"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Teléfono</label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="opcional"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 bg-white"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white hover:bg-slate-50 text-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Crear y seleccionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── ClientSearchBar ────────────────────────────────────────────────────────────

function ClientSearchBar({ client, onSelect }: {
  client: Client | null
  onSelect: (c: Client | null) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const { data: consumidorFinal, isLoading: loadingCF } = useQuery({
    queryKey: ['consumidor-final'],
    queryFn: () => clientsApi.findAll('9999999999999').then(r => {
      const list = ((r.data as any)?.data ?? r.data) as Client[]
      return Array.isArray(list) ? (list[0] ?? null) : null
    }),
    staleTime: Infinity,
  })

  const { data, isFetched } = useQuery({
    queryKey: ['cli-search', q],
    queryFn: () => clientsApi.findAll(q).then(r => ((r.data as any)?.data ?? r.data) as Client[]),
    enabled: q.length >= 2,
    staleTime: 5000,
  })
  const results: Client[] = Array.isArray(data) ? data : []
  const showNoResults = open && q.length >= 2 && isFetched && results.length === 0

  const handleConsumidorFinal = () => {
    if (consumidorFinal) onSelect(consumidorFinal)
  }

  if (client) {
    return (
      <div className="flex items-center gap-2.5 flex-1 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
        <span className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{client.name}</p>
          <p className="text-xs text-slate-500">{client.identification}</p>
        </div>
        <button onClick={() => onSelect(null)} className="text-slate-400 hover:text-rose-500 text-xl leading-none px-1">×</button>
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-2.5 flex-1">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setOpen(true) }}
            onFocus={() => q.length >= 2 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={e => {
              if (e.key === 'Enter' && results.length > 0) { onSelect(results[0]); setQ(''); setOpen(false) }
            }}
            placeholder="Buscar cliente (nombre, cédula, RUC)…"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 focus:bg-white transition-all"
          />
          {open && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl shadow-slate-200/60 z-50 max-h-48 overflow-auto mt-1.5 p-1.5">
              {results.map(c => (
                <button
                  key={c.id}
                  onMouseDown={() => { onSelect(c); setQ(''); setOpen(false) }}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg hover:bg-indigo-50 text-left transition-colors"
                >
                  <span className="text-sm font-medium text-slate-800">{c.name}</span>
                  <span className="text-xs text-slate-400 font-mono">{c.identification}</span>
                </button>
              ))}
            </div>
          )}
          {showNoResults && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 mt-1.5 px-4 py-3">
              <p className="text-sm text-slate-500 mb-2">Cliente no encontrado — ¿Crear nuevo?</p>
              <button
                onMouseDown={() => { setOpen(false); setShowCreateModal(true) }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Crear cliente
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleConsumidorFinal}
          disabled={loadingCF}
          className="px-3.5 py-2 text-xs font-semibold border border-slate-200 rounded-xl bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 whitespace-nowrap disabled:opacity-50 transition-colors"
        >
          {loadingCF ? '…' : 'Consumidor Final'}
        </button>
      </div>
      {showCreateModal && (
        <QuickCreateClientModal
          initialSearch={q}
          onClose={() => setShowCreateModal(false)}
          onCreated={c => { onSelect(c); setQ(''); setShowCreateModal(false) }}
        />
      )}
    </>
  )
}

// ─── ItemsTable ─────────────────────────────────────────────────────────────────


function ItemsTable({ items, onChange }: {
  items: FormItem[]
  onChange: (items: FormItem[]) => void
}) {
  const [editingQty, setEditingQty] = useState<string | null>(null)
  const [qtyInput, setQtyInput] = useState('')

  const update = (key: string, field: keyof FormItem, val: unknown) =>
    onChange(items.map(it => it._key === key ? { ...it, [field]: val } : it))

  const remove = (key: string) => onChange(items.filter(it => it._key !== key))

  const commitQty = (key: string) => {
    const val = parseFloat(qtyInput)
    if (!isNaN(val) && val > 0) update(key, 'quantity', val)
    setEditingQty(null)
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-500">Carrito vacío</p>
        <p className="text-xs mt-1 text-slate-400">Busca y selecciona productos arriba</p>
      </div>
    )
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200">
          <th className="text-left pb-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Producto</th>
          <th className="text-center pb-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-32">Cant.</th>
          <th className="text-right pb-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-24">Precio</th>
          <th className="text-center pb-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-20">Desc.</th>
          <th className="text-right pb-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider w-24">Total</th>
          <th className="pb-2.5 w-8"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-50">
        {items.map(it => {
          const base = it.quantity * it.unitPrice
          const discountAmt = base * (it.discount || 0) / 100
          const net = base - discountAmt
          const stockOver = it.stockQuantity != null && it.quantity > it.stockQuantity
          return (
            <tr key={it._key} className="hover:bg-slate-50/80 group transition-colors">
              <td className="py-3 pr-3">
                <p className="font-medium text-slate-900">{it.description}</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{it.code} · IVA {it.ivaRate}%</p>
                {it.stockQuantity != null && (
                  <p className={`text-xs mt-0.5 font-medium ${stockOver ? 'text-rose-500' : 'text-slate-400'}`}>
                    {stockOver
                      ? `⚠ Stock insuficiente: ${it.stockQuantity} disp.`
                      : `Stock: ${it.stockQuantity}${it.unit ? ' ' + it.unit : ''}`}
                  </p>
                )}
              </td>
              <td className="py-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  <button
                    onClick={() => it.quantity > 0.01 && update(it._key, 'quantity', Math.max(1, it.quantity - 1))}
                    className="w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 flex items-center justify-center text-base leading-none transition-colors"
                  >−</button>
                  {editingQty === it._key ? (
                    <input
                      autoFocus
                      value={qtyInput}
                      onChange={e => setQtyInput(e.target.value)}
                      onBlur={() => commitQty(it._key)}
                      onKeyDown={e => { if (e.key === 'Enter') commitQty(it._key); if (e.key === 'Escape') setEditingQty(null) }}
                      className="w-12 text-center border-b-2 border-indigo-500 bg-transparent text-sm font-semibold outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => { setEditingQty(it._key); setQtyInput(String(it.quantity)) }}
                      className="w-10 text-center text-sm font-bold text-slate-800 hover:text-indigo-600 cursor-text tabular-nums"
                    >
                      {it.quantity % 1 === 0 ? it.quantity : it.quantity.toFixed(2)}
                    </button>
                  )}
                  <button
                    onClick={() => update(it._key, 'quantity', it.quantity + 1)}
                    className="w-6 h-6 rounded-md border border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 flex items-center justify-center text-base leading-none transition-colors"
                  >+</button>
                </div>
              </td>
              <td className="py-3 text-right font-mono text-slate-500 text-sm tabular-nums">
                ${Number(it.unitPrice).toFixed(2)}
              </td>
              <td className="py-3 text-center">
                <div className="flex items-center justify-center gap-0.5">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={it.discount || 0}
                    onChange={e => {
                      const v = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                      update(it._key, 'discount', v)
                    }}
                    className="w-14 text-center border border-slate-200 rounded-md text-xs py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              </td>
              <td className="py-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                ${net.toFixed(2)}
              </td>
              <td className="py-3 pl-2">
                <button
                  onClick={() => remove(it._key)}
                  className="w-6 h-6 rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center text-lg leading-none opacity-0 group-hover:opacity-100 transition-all"
                >×</button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── CreditNoteModal ────────────────────────────────────────────────────────────

const MOTIVOS = [
  'Devolución de mercadería',
  'Anulación de factura',
  'Descuento comercial',
  'Ajuste de precio',
  'Otro',
]

function CreditNoteModal({
  invoice,
  onClose,
  onSuccess,
}: {
  invoice: HistorialInvoice
  onClose: () => void
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [motive, setMotive] = useState(MOTIVOS[0])
  const [customMotive, setCustomMotive] = useState('')
  const [type, setType] = useState<'TOTAL' | 'PARCIAL'>('TOTAL')
  const [amount, setAmount] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      creditNotesApi.create(invoice.id, {
        motive: motive === 'Otro' ? customMotive.trim() : motive,
        type,
        amount: type === 'PARCIAL' ? Number(amount) : undefined,
      }),
    onSuccess: () => {
      setSent(true)
      queryClient.invalidateQueries({ queryKey: ['invoices-historial'] })
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? 'Error al emitir la nota de crédito')
    },
  })

  const effectiveMotive = motive === 'Otro' ? customMotive.trim() : motive
  const canSubmit =
    effectiveMotive.length > 0 &&
    (type === 'TOTAL' || (Number(amount) > 0 && Number(amount) <= invoice.importeTotal))

  if (sent) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Nota de crédito enviada</h2>
          <p className="text-sm text-gray-500 mb-6">
            La nota de crédito fue enviada al SRI y está siendo procesada.
            La factura se marcará como <strong>Anulada</strong> una vez autorizada.
          </p>
          <button
            onClick={() => { onSuccess(); onClose() }}
            className="w-full bg-blue-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-blue-700"
          >
            Aceptar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Emitir nota de crédito</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Datos de la factura */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Factura</span>
              <span className="font-mono font-medium text-gray-900">{invoiceNum(invoice)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-gray-500">Cliente</span>
              <span className="text-gray-900">{invoice.client?.name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total</span>
              <span className="font-semibold text-gray-900">${Number(invoice.importeTotal).toFixed(2)}</span>
            </div>
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <select
              value={motive}
              onChange={e => setMotive(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {motive === 'Otro' && (
              <input
                value={customMotive}
                onChange={e => setCustomMotive(e.target.value)}
                placeholder="Especifique el motivo…"
                className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>

          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de nota de crédito</label>
            <div className="grid grid-cols-2 gap-2">
              {(['TOTAL', 'PARCIAL'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${type === t
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                    }`}
                >
                  {t === 'TOTAL' ? 'Total' : 'Parcial'}
                </button>
              ))}
            </div>
          </div>

          {/* Monto parcial */}
          {type === 'PARCIAL' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monto a anular (máx. ${Number(invoice.importeTotal).toFixed(2)})
              </label>
              <input
                type="number"
                min="0.01"
                max={invoice.importeTotal}
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Advertencia */}
          <div className="flex gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>Esta acción enviará una nota de crédito al SRI y no puede revertirse.</span>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 text-gray-700 rounded-xl py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit || mutation.isPending}
            className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? 'Enviando…' : 'Emitir nota de crédito'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── HistorialModal ─────────────────────────────────────────────────────────────

const HIST_PAGE_SIZE = 50

function HistorialModal({ onClose, onRetry }: {
  onClose: () => void
  onRetry: (data: any) => void
}) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [anularInvoice, setAnularInvoice] = useState<HistorialInvoice | null>(null)
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)


  useEffect(() => { setPage(1) }, [search, statusFilter, dateFrom, dateTo])

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  async function handleRetryInvoice(inv: HistorialInvoice) {
    setRetryingId(inv.id)
    try {
      const res = await invoicesApi.getRetryData(inv.id)
      const data = res.data
      onClose()           // cerrar el historial
      onRetry(data)       // precargar el POS con los datos
    } catch (e: any) {
      showToast(e?.response?.data?.message ?? 'No se pudo cargar la factura', false)
    } finally {
      setRetryingId(null)
    }
  }

  async function handleViewNC(invoiceId: string) {
    try {
      const res = await creditNotesApi.getByInvoice(invoiceId)
      const notes: any[] = res.data
      const authorized = notes.find((n: any) => n.status === 'AUTORIZADO')
      if (authorized) {
        const pdf = await creditNotesApi.getRide(authorized.id)
        openBlob(pdf.data, `NC-RIDE-${authorized.sequential ?? authorized.id}.pdf`)
      } else {
        showToast('La nota de crédito aún no está autorizada', false)
      }
    } catch {
      showToast('No se pudo obtener la nota de crédito', false)
    }
  }

  async function handleSendEmail(id: string) {
    setSendingEmail(id)
    try {
      await invoicesApi.sendEmail(id)
      showToast('Email enviado correctamente', true)
    } catch (e: any) {
      const detail = e?.response?.data?.message ?? e?.message ?? 'Error desconocido'
      showToast(`No se pudo enviar: ${detail}`, false)
    } finally {
      setSendingEmail(null)
    }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['invoices-historial', page, search, statusFilter, dateFrom, dateTo],
    queryFn: () => invoicesApi.findAll({
      page,
      limit: HIST_PAGE_SIZE,
      search: search || undefined,
      status: statusFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }).then(r => r.data as { data: HistorialInvoice[]; total: number; totalPages: number }),
    staleTime: 10000,
    gcTime: 0,
  })

  const paginated: HistorialInvoice[] = data?.data ?? []
  const totalItems = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Facturas anteriores</h2>
            <p className="text-sm text-gray-500 mt-0.5">{totalItems} registros</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 text-xl">×</button>
        </div>

        {/* Toast */}
        {toast && (
          <div className={`mx-6 mt-3 px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 ${toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
            <span>{toast.ok ? '✓' : '✕'}</span>
            <span>{toast.msg}</span>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 flex gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Buscar cliente, RUC o número..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="BORRADOR">Borrador</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="AUTORIZADO">Autorizada</option>
            <option value="RECHAZADO">Rechazada</option>
            <option value="ANULADO">Anulada</option>
          </select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <table className="w-full text-sm">
              <tbody>
                {[...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse border-b border-gray-100">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 rounded" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : paginated.length === 0 ? (
            <p className="p-8 text-sm text-gray-400 text-center">No hay facturas que coincidan.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Número</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Vendedor</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                  <th className="px-4 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginated.map(inv => (
                  <tr
                    key={inv.id}
                    className={`hover:bg-gray-50 ${inv.status === 'ANULADO' ? 'opacity-60' : ''}`}
                  >
                    <td className={`px-4 py-3 font-mono text-gray-700 text-xs ${inv.status === 'ANULADO' ? 'line-through' : ''}`}>
                      {invoiceNum(inv)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(inv.fechaEmision)}</td>
                    <td className="px-4 py-3">
                      <p className={`font-medium text-gray-900 ${inv.status === 'ANULADO' ? 'line-through' : ''}`}>
                        {inv.client?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-400">{inv.client?.identification}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {inv.user?.name ?? '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold text-gray-900 ${inv.status === 'ANULADO' ? 'line-through' : ''}`}>
                      ${Number(inv.importeTotal).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {inv.status === 'AUTORIZADO' && (
                          <>
                            <button
                              onClick={() => printTicket(inv.id)}
                              className="text-gray-600 hover:text-gray-900 text-xs font-medium"
                              title="Imprimir tirilla térmica"
                            >🖨️</button>
                            <button
                              onClick={() => handleSendEmail(inv.id)}
                              disabled={sendingEmail === inv.id}
                              className="text-gray-600 hover:text-blue-600 text-xs font-medium disabled:opacity-40"
                              title="Reenviar email al cliente"
                            >
                              {sendingEmail === inv.id ? '…' : '✉️'}
                            </button>
                            <button
                              onClick={() => invoicesApi.getRide(inv.id).then(r => openBlob(r.data, `FACTURA-${invoiceNum(inv)}.pdf`))}
                              className="text-blue-600 hover:underline text-xs font-medium"
                            >PDF</button>
                            <button
                              onClick={() => invoicesApi.getXml(inv.id).then(r => openBlob(r.data, `FACTURA-${invoiceNum(inv)}.xml`, true))}
                              className="text-blue-600 hover:underline text-xs font-medium"
                            >XML</button>
                            {inv.client?.identificationType !== '07' &&
                              inv.client?.identification !== '9999999999999' && (
                                <button
                                  onClick={() => setAnularInvoice(inv)}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50"
                                  title="Emitir nota de crédito / anular"
                                >
                                  Anular
                                </button>
                              )}
                          </>
                        )}
                        {inv.status === 'PENDIENTE' && (
                          <span className="text-xs text-amber-600 italic">Procesando…</span>
                        )}
                        {inv.status === 'BORRADOR' && (
                          <span className="text-xs text-gray-400 italic">Borrador</span>
                        )}
                        {inv.status === 'ANULADO' && (
                          <button
                            onClick={() => handleViewNC(inv.id)}
                            className="text-red-600 hover:underline text-xs font-medium"
                            title="Ver RIDE de la nota de crédito"
                          >Ver NC</button>
                        )}
                        {inv.status === 'RECHAZADO' && (
                          <button
                            onClick={() => handleRetryInvoice(inv)}
                            disabled={retryingId === inv.id}
                            className="text-orange-600 hover:text-orange-800 text-xs font-medium border border-orange-200 rounded px-1.5 py-0.5 hover:bg-orange-50 disabled:opacity-40"
                            title="Repetir factura con los mismos datos"
                          >
                            {retryingId === inv.id ? '…' : 'Repetir'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="px-6 border-t border-gray-100">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={HIST_PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      </div>

      {anularInvoice && (
        <CreditNoteModal
          invoice={anularInvoice}
          onClose={() => setAnularInvoice(null)}
          onSuccess={() => setAnularInvoice(null)}
        />
      )}
    </div>
  )
}

// ─── DraftsModal ────────────────────────────────────────────────────────────────

function DraftsModal({ branchId, onClose, onLoad }: {
  branchId: string
  onClose: () => void
  onLoad: (draft: DraftInvoice) => void
}) {
  const todayStr = today()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['drafts', branchId],
    queryFn: () => invoicesApi.findByStatus('BORRADOR', branchId).then(r => {
      const all = ((r.data as any)?.data ?? r.data) as DraftInvoice[]
      return all.filter(d => {
        const ecDate = new Date(new Date(d.createdAt).getTime() - 5 * 60 * 60 * 1000)
        return ecDate.toISOString().slice(0, 10) === todayStr
      })
    }),
    gcTime: 0,
  })
  const drafts: DraftInvoice[] = data ?? []

  const handleLoad = async (draft: DraftInvoice) => {
    setLoadingId(draft.id)
    setErr('')
    try {
      const res = await invoicesApi.findById(draft.id)
      const full = res.data?.data ?? res.data
      await invoicesApi.deleteDraft(draft.id)
      onLoad(full)
    } catch {
      setErr('No se pudo cargar el borrador')
      setLoadingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setErr('')
    try {
      await invoicesApi.deleteDraft(id)
      refetch()
    } catch {
      setErr('No se pudo eliminar el borrador')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Borradores de hoy</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {drafts.length} {drafts.length === 1 ? 'borrador' : 'borradores'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500 text-xl">×</button>
        </div>

        {err && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-lg text-sm text-red-800 bg-red-50 border border-red-200">{err}</div>
        )}

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <p className="p-8 text-sm text-gray-500 text-center">Cargando...</p>
          ) : drafts.length === 0 ? (
            <p className="p-8 text-sm text-gray-400 text-center">No hay borradores guardados hoy.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Hora</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Items</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  <th className="px-4 py-3 w-36"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {drafts.map(draft => (
                  <tr key={draft.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(draft.createdAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{draft.client?.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{draft.client?.identification}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {draft.items?.length ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                      ${Number(draft.importeTotal).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleLoad(draft)}
                          disabled={!!loadingId || !!deletingId}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {loadingId === draft.id ? 'Cargando…' : 'Cargar'}
                        </button>
                        <button
                          onClick={() => handleDelete(draft.id)}
                          disabled={!!loadingId || !!deletingId}
                          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg border border-red-200 disabled:opacity-50 transition-colors"
                        >
                          {deletingId === draft.id ? '…' : 'Eliminar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SuccessModal ───────────────────────────────────────────────────────────────

type SriStatus = 'sending' | 'authorized' | 'rejected' | 'timeout'

function SuccessModal({ invoice, isDraft, sriStatus, sriEvent, onClose, onRetry }: {
  invoice: CreatedInvoice
  isDraft: boolean
  sriStatus: SriStatus | null
  sriEvent: InvoiceSriEvent | null
  onClose: () => void
  onRetry: () => void
}) {
  // const [elapsed, setElapsed] = useState(0)
  // useEffect(() => {
  //   if (sriStatus !== 'sending') return
  //   setElapsed(0)
  //   const t = setInterval(() => setElapsed(s => s + 1), 1000)
  //   return () => clearInterval(t)
  // }, [sriStatus])
  if (isDraft) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Borrador guardado</h2>
          <p className="text-3xl font-bold text-blue-600 mb-4">${Number(invoice.importeTotal).toFixed(2)}</p>
          <button onClick={onClose} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm">
            Nueva factura
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 text-center">

        {/* SENDING */}
        {sriStatus === 'sending' && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-1">Factura guardada</h2>
            <p className="text-sm text-gray-500 mb-1">
              No. <span className="font-mono font-semibold text-gray-800">{invoiceNum(invoice)}</span>
            </p>
            <p className="text-3xl font-bold text-blue-600 mb-4">${Number(invoice.importeTotal).toFixed(2)}</p>
            <div className="space-y-2 mb-4">
              <button
                onClick={() => printTicket(invoice.id)}
                className="w-full flex items-center justify-center gap-2 bg-gray-800 text-white font-medium py-2.5 rounded-xl text-sm hover:bg-gray-900"
              >
                🖨️ Imprimir tirilla
              </button>
              <button onClick={onClose} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm">
                Nueva venta
              </button>
            </div>
            <div className="flex items-center gap-2 justify-center text-xs text-gray-400">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Enviando al SRI en segundo plano...
            </div>
          </>
        )}

        {/* AUTHORIZED */}
        {sriStatus === 'authorized' && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-700 mb-1">¡Factura Autorizada!</h2>
            <p className="text-sm text-gray-500 mb-1">
              No. <span className="font-mono font-semibold text-gray-800">{invoiceNum(invoice)}</span>
            </p>
            <p className="text-3xl font-bold text-blue-600 mb-3">${Number(invoice.importeTotal).toFixed(2)}</p>
            {sriEvent?.numeroAutorizacion && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4 text-left">
                <p className="text-xs text-green-600 font-medium mb-0.5">Número de Autorización SRI</p>
                <p className="text-xs font-mono text-green-800 break-all">{sriEvent.numeroAutorizacion}</p>
              </div>
            )}
            <div className="space-y-2">
              <button
                onClick={() => printTicket(invoice.id)}
                className="w-full flex items-center justify-center gap-2 bg-gray-800 text-white font-medium py-2.5 rounded-xl text-sm hover:bg-gray-900"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Imprimir tirilla
              </button>
              <button
                onClick={() => invoicesApi.getRide(invoice.id).then(r => openBlob(r.data, `FACTURA-RIDE-${invoice.id}.pdf`))}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-medium py-2.5 rounded-xl text-sm hover:bg-blue-700"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Descargar PDF RIDE
              </button>
              <button onClick={onClose} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm">
                Nueva factura
              </button>
              <button onClick={onClose} className="w-full text-gray-500 hover:text-gray-700 text-sm py-1">
                Cerrar
              </button>
            </div>
          </>
        )}

        {/* REJECTED */}
        {(sriStatus === 'rejected' || sriStatus === 'timeout') && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-9 h-9 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-red-700 mb-1">
              {sriStatus === 'timeout' ? 'Sin respuesta del SRI' : 'Factura Rechazada'}
            </h2>
            <p className="text-sm text-gray-500 mb-3">
              No. <span className="font-mono font-semibold">{invoiceNum(invoice)}</span>
            </p>
            {sriEvent?.errors && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 text-left max-h-28 overflow-auto">
                <p className="text-xs font-medium text-red-600 mb-0.5">Detalle del error</p>
                <p className="text-xs text-red-800 font-mono whitespace-pre-wrap">{sriEvent.errors}</p>
              </div>
            )}
            {sriStatus === 'timeout' && (
              <p className="text-xs text-gray-400 mb-4">
                La factura se guardó como <strong>PENDIENTE</strong>. El sistema reintentará automáticamente.
              </p>
            )}
            <div className="space-y-2">
              <button
                onClick={onRetry}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm"
              >
                Reintentar envío
              </button>
              <button onClick={onClose} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl text-sm">
                Nueva factura
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ─── Cash Register Types ────────────────────────────────────────────────────────

interface CashRegister {
  id: string
  userName: string
  branchId: string
  status: 'ABIERTA' | 'CERRADA'
  openedAt: string
  initialAmount: number
  totalSales: number
  totalInvoices: number
  totalCash: number
  totalCard: number
  totalTransfer: number
}

// ─── OpenCashModal ───────────────────────────────────────────────────────────────

function OpenCashModal({ branches, onOpened }: {
  branches: Branch[]
  onOpened: () => void
}) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '')
  const [initialAmount, setInitialAmount] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const openMutation = useMutation({
    mutationFn: (data: { initialAmount: number; branchId: string }) =>
      cashRegisterApi.open(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-current'] })
      onOpened()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg ?? 'Error al abrir la caja'))
    },
  })

  const handleOpen = () => {
    setError('')
    if (!branchId) { setError('Selecciona una sucursal'); return }
    const amount = parseFloat(initialAmount)
    if (isNaN(amount) || amount < 0) { setError('Ingresa un monto inicial válido'); return }
    openMutation.mutate({ initialAmount: amount, branchId })
  }

  return (
    <div className="absolute inset-0 bg-gray-900/70 backdrop-blur-sm flex items-center justify-center z-40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Icon */}
        <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 text-center mb-1">Apertura de Caja</h2>
        <p className="text-sm text-gray-500 text-center mb-6">Debes abrir la caja para comenzar a facturar</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Sucursal
            </label>
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar…</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.codigoEstablecimiento}-{b.puntoEmision} {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Fondo inicial de caja
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-400 text-sm font-medium">$</span>
              <input
                type="number" step="0.01" min="0"
                value={initialAmount}
                onChange={e => setInitialAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={e => e.key === 'Enter' && handleOpen()}
                autoFocus
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Efectivo disponible al inicio del turno</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <button
          onClick={handleOpen}
          disabled={openMutation.isPending}
          className="mt-6 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-colors"
        >
          {openMutation.isPending ? 'Abriendo…' : 'Abrir caja'}
        </button>
      </div>
    </div>
  )
}

// ─── CloseCashModal ───────────────────────────────────────────────────────────────

function CloseCashModal({ cashRegister, onClosed, onCancel }: {
  cashRegister: CashRegister
  onClosed: () => void
  onCancel: () => void
}) {
  const [actualAmount, setActualAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const queryClient = useQueryClient()

  const closeMutation = useMutation({
    mutationFn: (data: { actualAmount: number; notes?: string }) =>
      cashRegisterApi.close(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-current'] })
      queryClient.invalidateQueries({ queryKey: ['cash-history'] })
      onClosed()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg ?? 'Error al cerrar la caja'))
    },
  })

  const actual = parseFloat(actualAmount)
  const totalExpected = Number(cashRegister.initialAmount) + Number(cashRegister.totalCash)
  const difference = !isNaN(actual) ? actual - totalExpected : null
  const diffOk = difference == null || difference >= 0

  const handleClose = () => {
    setError('')
    if (isNaN(actual) || actual < 0) { setError('Ingresa un monto válido'); return }
    closeMutation.mutate({ actualAmount: actual, notes: notes.trim() || undefined })
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Cierre de Caja</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Session summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resumen del turno</p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Apertura</span>
              <span className="font-medium text-gray-800">{fmtTime(cashRegister.openedAt)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Facturas emitidas</span>
              <span className="font-semibold text-gray-900">{cashRegister.totalInvoices}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Total ventas</span>
              <span className="font-semibold text-blue-700">${Number(cashRegister.totalSales).toFixed(2)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 space-y-1.5">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Efectivo</span>
                <span>${Number(cashRegister.totalCash).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Tarjeta</span>
                <span>${Number(cashRegister.totalCard).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Transferencia</span>
                <span>${Number(cashRegister.totalTransfer).toFixed(2)}</span>
              </div>
            </div>
            <div className="border-t border-gray-200 pt-2 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Fondo inicial</span>
                <span className="font-medium">${Number(cashRegister.initialAmount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-gray-700">Total esperado en caja</span>
                <span className="text-gray-900">${totalExpected.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Actual amount */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Efectivo contado físicamente
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-gray-400 text-sm font-medium">$</span>
              <input
                type="number" step="0.01" min="0"
                value={actualAmount}
                onChange={e => setActualAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>

          {/* Difference */}
          {difference !== null && (
            <div className={`rounded-xl p-3.5 border ${diffOk ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${diffOk ? 'text-green-700' : 'text-red-700'}`}>
                  {diffOk ? (difference === 0 ? '✓ Caja cuadrada' : '✓ Sobrante') : '⚠ Faltante en caja'}
                </span>
                <span className={`text-xl font-black tabular-nums ${diffOk ? 'text-green-700' : 'text-red-700'}`}>
                  {difference >= 0 ? '+' : ''}${difference.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
              Observaciones (opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ej: Se encontró billete falso, cajero X entregó turno a Y..."
              rows={2}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="px-6 pb-6 space-y-2.5">
          <button
            onClick={handleClose}
            disabled={closeMutation.isPending}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 rounded-xl text-sm disabled:opacity-50 transition-colors"
          >
            {closeMutation.isPending ? 'Cerrando caja…' : 'Cerrar caja'}
          </button>
          <button
            onClick={onCancel}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2.5 rounded-xl text-sm transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main POS ───────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const authUser = useAuthStore(s => s.user)
  const isVendedor = authUser?.role === 'VENDEDOR'

  const [items, setItems] = useState<FormItem[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [branchId, setBranchId] = useState(isVendedor ? (authUser?.branchId ?? '') : '')
  const [fechaEmision, setFechaEmision] = useState(today())
  const [formaPago, setFormaPago] = useState('01')
  const [montoRecibido, setMontoRecibido] = useState('')
  const [showHistorial, setShowHistorial] = useState(false)
  const [showDrafts, setShowDrafts] = useState(false)
  const [showCloseCash, setShowCloseCash] = useState(false)
  const [successState, setSuccessState] = useState<{ invoice: CreatedInvoice; isDraft: boolean } | null>(null)
  const [sriStatus, setSriStatus] = useState<SriStatus | null>(null)
  const [sriEvent, setSriEvent] = useState<InvoiceSriEvent | null>(null)
  const [error, setError] = useState('')
  const pollAbortRef = useRef(false)

  const queryClient = useQueryClient()

  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: () => branchesApi.findAll().then(r => r.data as Branch[]),
    staleTime: 60000,
  })
  const branches: Branch[] = Array.isArray(branchesData) ? branchesData.filter(b => b.isActive) : []

  // Sucursal del vendedor — objeto completo para mostrar info
  const vendedorBranch = isVendedor
    ? branches.find(b => b.id === authUser?.branchId) ?? null
    : null

  // ── Cash register ────────────────────────────────────────────────────────────
  const { data: cashRegister, isLoading: cashLoading } = useQuery({
    queryKey: ['cash-current', branchId],
    queryFn: () => cashRegisterApi.current(branchId || undefined).then(r => r.data as CashRegister | null),
    refetchInterval: 30000, // refresh every 30s for live totals
    enabled: !!branchId,
  })

  const cashIsOpen = cashRegister?.status === 'ABIERTA'

  // Admin auto-selects first branch; vendedor already has branchId fixed
  useEffect(() => {
    if (!isVendedor && branches.length > 0 && !branchId) setBranchId(branches[0].id)
  }, [branches, branchId, isVendedor])

  const addProduct = (p: Product) => {
    const existing = items.find(it => it.productId === p.id)
    if (existing) {
      setItems(items.map(it => it._key === existing._key
        ? { ...it, quantity: it.quantity + 1 } : it))
    } else {
      setItems([...items, {
        _key: newKey(),
        productId: p.id,
        code: p.code,
        description: p.name,
        quantity: 1,
        unitPrice: Number(p.price),
        discount: 0,
        ivaRate: Number(p.ivaRate),
        stockQuantity: p.stockQuantity,
        unit: p.unit,
      }])
    }
  }

  const totals = calcTotals(items)
  const vuelto = formaPago === '01' && montoRecibido !== ''
    ? parseFloat(montoRecibido) - totals.importeTotal
    : null

  const createMutation = useMutation({
    mutationFn: (payload: unknown) => invoicesApi.create(payload),
    onSuccess: (res, variables) => {
      const inv = res.data as CreatedInvoice
      const draft = (variables as { draft?: boolean }).draft ?? false
      setSuccessState({ invoice: inv, isDraft: draft })
      queryClient.invalidateQueries({ queryKey: ['invoices-historial'] })

      if (!draft) {
        setSriStatus('sending')
        startPolling(inv.id)
      }
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg ?? 'Error al crear la factura'))
    },
  })

  const handleSubmit = (draft: boolean) => {
    setError('')
    if (!branchId) { setError('Selecciona una sucursal'); return }
    if (!client) { setError('Selecciona un cliente o usa Consumidor Final'); return }
    if (items.length === 0) { setError('Agrega al menos un producto'); return }
    if (!draft) {
      const sinStock = items.filter(it => it.stockQuantity != null && it.quantity > it.stockQuantity)
      if (sinStock.length > 0) {
        setError(`Stock insuficiente: ${sinStock.map(it => `"${it.description}" (disp. ${it.stockQuantity})`).join(', ')}`)
        return
      }
    }
    createMutation.mutate({
      clientId: client.id,
      branchId,
      fechaEmision,
      items: items.map(it => ({
        productId: it.productId,
        code: it.code,
        description: it.description,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discount: it.discount,
        ivaRate: it.ivaRate,
      })),
      formaPago,
      draft,
    })
  }

  const resetForm = () => {
    pollAbortRef.current = true
    setItems([])
    setClient(null)
    setMontoRecibido('')
    setFormaPago('01')
    setSuccessState(null)
    setSriStatus(null)
    setSriEvent(null)
    setError('')
  }

  const startPolling = async (invoiceId: string) => {
    pollAbortRef.current = false
    // 5s inicial (SRI tarda mínimo ese tiempo) + 2s entre intentos → ~60s total
    const maxAttempts = 28
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, i === 0 ? 5000 : 2000))
      if (pollAbortRef.current) return
      try {
        const res = await invoicesApi.findById(invoiceId)
        const inv = res.data?.data ?? res.data
        const status = inv?.status
        const numeroAutorizacion = inv?.numeroAutorizacion
        console.log(`[Polling #${i + 1}]`, { status, numeroAutorizacion, inv })
        if (status === 'AUTORIZADO') {
          setSriStatus('authorized')
          setSriEvent({
            event: 'authorized',
            invoiceId,
            secuencial: inv.secuencial ?? '',
            numeroAutorizacion: numeroAutorizacion ?? '',
            fechaAutorizacion: inv.fechaAutorizacion ?? '',
            importeTotal: Number(inv.importeTotal),
            status: inv.status,
          })
          return
        } else if (status === 'RECHAZADO') {
          setSriStatus('rejected')
          setSriEvent({
            event: 'rejected',
            invoiceId,
            secuencial: inv.secuencial ?? '',
            status: inv.status,
            errors: inv.mensajesRespuesta ?? 'Rechazada por el SRI',
          })
          return
        }
      } catch {
        // continue polling on network error
      }
    }
    setSriStatus('timeout')
  }

  const handleRetry = () => {
    if (!successState) return
    setSriStatus('sending')
    setSriEvent(null)
    startPolling(successState.invoice.id)
  }

  const loadDraft = (draft: DraftInvoice) => {
    setClient(draft.client ? {
      id: draft.client.id,
      name: draft.client.name,
      identification: draft.client.identification,
      identificationType: draft.client.identificationType,
      email: draft.client.email,
    } : null)
    setFormaPago(draft.formaPago ?? '01')
    setItems((draft.items as DraftInvoice['items']).map(item => ({
      _key: newKey(),
      productId: item.productId ?? undefined,
      code: item.code,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discount: Number(item.discount),
      ivaRate: Number(item.ivaRate),
    })))
    setShowDrafts(false)
  }

  const loadRetry = (data: any) => {
    setClient(data.client)
    setFormaPago(data.formaPago ?? '01')
    // setBranchId(data.branchId)
    setItems(data.items.map((it: any) => ({
      _key: newKey(),
      productId: it.productId,
      code: it.code,
      description: it.description,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      discount: Number(it.discount),
      ivaRate: Number(it.ivaRate),
    })))
    setShowHistorial(false)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-100 relative">

      {/* ─── Cash register status bar ─── */}
      {!cashLoading && (
        <div className={`shrink-0 px-4 py-2 flex items-center justify-between text-xs ${cashIsOpen ? 'bg-green-600 text-white' : 'bg-amber-500 text-white'
          }`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${cashIsOpen ? 'bg-white/70 animate-pulse' : 'bg-white/70'}`} />
            {cashIsOpen
              ? `Caja abierta desde ${new Date(cashRegister!.openedAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })} — ${cashRegister!.totalInvoices} facturas · $${Number(cashRegister!.totalSales).toFixed(2)} en ventas`
              : 'Caja cerrada — Abre la caja para facturar'
            }
          </div>
          {cashIsOpen && (
            <button
              onClick={() => setShowCloseCash(true)}
              className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-colors"
            >
              Cerrar caja
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ─── Left column 60% ─── */}
        <div className="flex flex-col bg-white" style={{ width: '60%' }}>

          {/* Search bars */}
          <div className="p-4 border-b border-gray-200 space-y-3 shrink-0">
            <ClientSearchBar client={client} onSelect={setClient} />
            <ProductSearchBar onSelect={addProduct} />
          </div>

          {/* Items table — scrollable */}
          <div className="flex-1 overflow-auto px-4 py-3">
            <ItemsTable items={items} onChange={setItems} />
          </div>

          {/* Payment method */}
          <div className="border-t border-gray-200 p-4 bg-gray-50 shrink-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Método de pago</p>
            <div className="flex gap-2">
              {PAYMENT_OPTIONS.map(opt => (
                <button
                  key={opt.code}
                  onClick={() => setFormaPago(opt.code)}
                  className={`flex-1 py-3 rounded-xl text-sm font-semibold border-2 transition-all ${formaPago === opt.code
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                    }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {formaPago === '01' && (
              <div className="mt-3 flex items-end gap-4">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">Monto recibido</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-400 text-sm font-medium">$</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={montoRecibido}
                      onChange={e => setMontoRecibido(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
                {vuelto !== null && parseFloat(montoRecibido) > 0 && (
                  <div className="text-center pb-0.5">
                    {vuelto >= 0 ? (
                      <>
                        <p className="text-xs text-gray-500 mb-0.5">Vuelto</p>
                        <p className="text-2xl font-bold tabular-nums text-green-600">${vuelto.toFixed(2)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-500 mb-0.5">Falta</p>
                        <p className="text-2xl font-bold tabular-nums text-red-500">${Math.abs(vuelto).toFixed(2)}</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Divider ─── */}
        <div className="w-px bg-gray-200 shrink-0" />

        {/* ─── Right column 40% ─── */}
        <div className="flex flex-col bg-white" style={{ width: '40%' }}>

          {/* Emission data */}
          <div className="px-5 py-4 border-b border-gray-200 grid grid-cols-2 gap-3 shrink-0">
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">
                Punto de emisión
              </label>
              {isVendedor ? (
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-2.5 py-2 text-sm text-gray-700">
                  {vendedorBranch
                    ? <span><span className="font-mono font-semibold text-gray-900">{vendedorBranch.codigoEstablecimiento}-{vendedorBranch.puntoEmision}</span> — {vendedorBranch.name}</span>
                    : <span className="text-gray-400 italic">Cargando…</span>
                  }
                </div>
              ) : (
                <select
                  value={branchId}
                  onChange={e => setBranchId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar…</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.codigoEstablecimiento}-{b.puntoEmision} {b.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide block mb-1.5">Fecha</label>
              <input
                type="date" value={fechaEmision}
                onChange={e => setFechaEmision(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Totals summary */}
          <div className="flex-1 overflow-auto px-5 py-4">
            {items.length > 0 && (
              <div className="space-y-1 mb-4">
                {items.map(it => {
                  const net = it.quantity * it.unitPrice * (1 - (it.discount || 0) / 100)
                  return (
                    <div key={it._key} className="flex justify-between text-sm">
                      <span className="text-gray-500 truncate mr-3 min-w-0">
                        {it.quantity > 1 && <span className="font-medium text-gray-700">{it.quantity}×&nbsp;</span>}
                        {it.description}
                      </span>
                      <span className="text-gray-800 font-mono shrink-0">${net.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 space-y-2">
              {totals.subtotal0 > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal 0%</span>
                  <span className="font-mono">${totals.subtotal0.toFixed(2)}</span>
                </div>
              )}
              {totals.subtotalGravado > 0 && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal gravado</span>
                  <span className="font-mono">${totals.subtotalGravado.toFixed(2)}</span>
                </div>
              )}
              {totals.totalDescuento > 0 && (
                <div className="flex justify-between text-sm text-red-500">
                  <span>Descuento</span>
                  <span className="font-mono">-${totals.totalDescuento.toFixed(2)}</span>
                </div>
              )}
              {Object.entries(totals.ivaByRate)
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([rate, amount]) => (
                  <div key={rate} className="flex justify-between text-sm text-gray-500">
                    <span>IVA {rate}%</span>
                    <span className="font-mono">${amount.toFixed(2)}</span>
                  </div>
                ))}
            </div>

            <div className="border-t-2 border-blue-100 mt-3 pt-3">
              <div className="flex justify-between items-baseline">
                <span className="text-base font-bold text-gray-700 uppercase tracking-wide">Total</span>
                <span className="text-4xl font-black text-blue-600 tabular-nums">
                  ${totals.importeTotal.toFixed(2)}
                </span>
              </div>
              <p className="text-right text-xs text-gray-400 mt-0.5">
                {items.length} {items.length === 1 ? 'producto' : 'productos'}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-5 py-4 border-t border-gray-200 space-y-2.5 shrink-0">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              onClick={() => handleSubmit(false)}
              disabled={createMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-black py-4 rounded-2xl text-lg disabled:opacity-50 transition-colors shadow-lg shadow-green-200"
            >
              {createMutation.isPending ? 'Procesando…' : 'EMITIR FACTURA'}
            </button>
            <button
              onClick={() => handleSubmit(true)}
              disabled={createMutation.isPending}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2.5 rounded-xl text-sm disabled:opacity-50 transition-colors"
            >
              Guardar borrador
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setShowHistorial(true)}
                className="flex-1 border-2 border-blue-200 text-blue-600 font-medium py-2.5 rounded-xl text-sm hover:bg-blue-50 transition-colors"
              >
                Ver facturas
              </button>
              <button
                onClick={() => setShowDrafts(true)}
                className="flex-1 border-2 border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Borradores
              </button>
            </div>
          </div>
        </div>

        {/* ─── Modals ─── */}
        {showHistorial && (
          <HistorialModal
            onClose={() => setShowHistorial(false)}
            onRetry={loadRetry}
          />
        )}
        {showDrafts && (
          <DraftsModal
            branchId={branchId}
            onClose={() => setShowDrafts(false)}
            onLoad={loadDraft}
          />
        )}
        {successState && (
          <SuccessModal
            invoice={successState.invoice}
            isDraft={successState.isDraft}
            sriStatus={sriStatus}
            sriEvent={sriEvent}
            onClose={resetForm}
            onRetry={handleRetry}
          />
        )}
      </div>{/* end flex flex-1 */}

      {/* ─── Open cash overlay (blocks POS) ─── */}
      {!cashLoading && !cashIsOpen && branches.length > 0 && (
        <OpenCashModal
          branches={branches}
          onOpened={() => queryClient.invalidateQueries({ queryKey: ['cash-current'] })}
        />
      )}

      {/* ─── Close cash modal ─── */}
      {showCloseCash && cashRegister && (
        <CloseCashModal
          cashRegister={cashRegister}
          onClosed={() => setShowCloseCash(false)}
          onCancel={() => setShowCloseCash(false)}
        />
      )}
    </div>
  )
}
