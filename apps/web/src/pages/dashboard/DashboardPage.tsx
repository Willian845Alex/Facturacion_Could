import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { dashboardApi } from '../../services/api';
import { InvoiceStatus } from '@facturacion-ec/shared';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuthStore } from '../../store/auth.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  today: {
    totalSales: number;
    invoiceCount: number;
    pendingSRI: number;
    cashSales: number;
    cardSales: number;
    transferSales: number;
  };
  myToday: {
    totalSales: number;
    invoiceCount: number;
  };
  lowStockCount: number;
  recentInvoices: {
    id: string;
    sequential: string | null;
    clientName: string;
    total: number;
    status: InvoiceStatus;
    createdAt: string;
  }[];
  lowStockProducts: {
    id: string;
    name: string;
    mainCode: string;
    stockQuantity: number;
    minStock: number;
    unit: string;
  }[];
  salesLast7Days: { date: string; total: number; count: number }[];
  openCashRegister: {
    openedAt: string;
    totalCash: number;
    totalCard: number;
    totalTransfer: number;
    totalSales: number;
  } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  [InvoiceStatus.AUTORIZADO]: 'Autorizada',
  [InvoiceStatus.PENDIENTE]: 'Pendiente',
  [InvoiceStatus.RECHAZADO]: 'Rechazada',
  [InvoiceStatus.BORRADOR]: 'Borrador',
  [InvoiceStatus.ANULADO]: 'Anulada',
};

const STATUS_CLASS: Record<string, string> = {
  [InvoiceStatus.AUTORIZADO]: 'bg-green-100 text-green-800',
  [InvoiceStatus.PENDIENTE]: 'bg-yellow-100 text-yellow-800',
  [InvoiceStatus.RECHAZADO]: 'bg-red-100 text-red-800',
  [InvoiceStatus.BORRADOR]: 'bg-gray-100 text-gray-600',
  [InvoiceStatus.ANULADO]: 'bg-gray-100 text-gray-500 line-through',
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="h-8 bg-gray-200 rounded w-2/3" />
    </div>
  );
}

// ─── Chart label formatter ────────────────────────────────────────────────────

function dayLabel(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'EEE', { locale: es });
  } catch {
    return dateStr;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const authUser = useAuthStore(s => s.user);
  const isVendedor = authUser?.role === 'VENDEDOR';

  const { data, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.getStats().then((r) => r.data),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>
        {isError && (
          <span className="text-sm text-red-500 bg-red-50 px-3 py-1 rounded-full border border-red-200">
            Error al cargar métricas
          </span>
        )}
      </div>

      {/* ── Row 1: 4 metric cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : isVendedor ? (
          <>
            <MetricCard
              label="Mis ventas hoy"
              value={`$${fmt(data?.myToday.totalSales ?? 0)}`}
              color="text-blue-600"
              hint="Solo tus facturas autorizadas"
            />
            <MetricCard
              label="Mis facturas hoy"
              value={data?.myToday.invoiceCount ?? 0}
              color="text-gray-900"
              hint="Solo tus facturas autorizadas"
            />
            <MetricCard
              label="Pendientes SRI"
              value={data?.today.pendingSRI ?? 0}
              color="text-yellow-600"
            />
            <MetricCard
              label="Productos stock bajo"
              value={data?.lowStockCount ?? 0}
              color="text-red-600"
            />
          </>
        ) : (
          <>
            <MetricCard
              label="Ventas hoy"
              value={`$${fmt(data?.today.totalSales ?? 0)}`}
              color="text-blue-600"
            />
            <MetricCard
              label="Facturas emitidas hoy"
              value={data?.today.invoiceCount ?? 0}
              color="text-gray-900"
            />
            <MetricCard
              label="Pendientes SRI"
              value={data?.today.pendingSRI ?? 0}
              color="text-yellow-600"
            />
            <MetricCard
              label="Productos stock bajo"
              value={data?.lowStockCount ?? 0}
              color="text-red-600"
            />
          </>
        )}
      </div>

      {/* ── Row 2: Cash register + chart ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Cash register */}
        <div>
          {isLoading ? (
            <div className="bg-white rounded-lg border border-gray-200 p-6 animate-pulse h-full">
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-3 bg-gray-200 rounded w-3/4 mb-3" />
              ))}
            </div>
          ) : data?.openCashRegister ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 h-full">
              <p className="text-sm font-semibold text-green-700 mb-1">Caja abierta</p>
              <p className="text-xs text-green-600 mb-4">
                Desde{' '}
                {format(new Date(data.openCashRegister.openedAt), 'HH:mm')}
              </p>
              <div className="space-y-2 text-sm">
                <CashRow label="Efectivo" amount={data.openCashRegister.totalCash} />
                <CashRow label="Tarjeta" amount={data.openCashRegister.totalCard} />
                <CashRow label="Transferencia" amount={data.openCashRegister.totalTransfer} />
                <div className="border-t border-green-300 pt-2 mt-2">
                  <CashRow
                    label="Total"
                    amount={data.openCashRegister.totalSales}
                    bold
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg p-6 h-full flex items-center justify-center">
              <p className="text-sm text-gray-400">No hay caja abierta</p>
            </div>
          )}
        </div>

        {/* Sales chart */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-700 mb-4">Ventas últimos 7 días</p>
          {isLoading ? (
            <div className="h-48 bg-gray-100 rounded animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={192}>
              <BarChart
                data={(data?.salesLast7Days ?? []).map((d) => ({
                  ...d,
                  label: dayLabel(d.date),
                }))}
                margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(v: number) => [`$${fmt(v)}`, 'Total']}
                  cursor={{ fill: '#eff6ff' }}
                />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Row 3: Recent invoices + low stock ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent invoices */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Últimas facturas del día</p>
          </div>
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (data?.recentInvoices?.length ?? 0) === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              Sin facturas hoy
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-2 text-left font-medium">Hora</th>
                  <th className="px-6 py-2 text-left font-medium">Cliente</th>
                  <th className="px-6 py-2 text-right font-medium">Total</th>
                  <th className="px-6 py-2 text-right font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.recentInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-2 text-gray-500 whitespace-nowrap">
                      {format(new Date(inv.createdAt), 'HH:mm')}
                    </td>
                    <td className="px-6 py-2 text-gray-900 truncate max-w-[140px]">
                      {inv.clientName}
                    </td>
                    <td className="px-6 py-2 text-right text-gray-900 font-medium">
                      ${fmt(inv.total)}
                    </td>
                    <td className="px-6 py-2 text-right">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}
                      >
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Low stock */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Productos con stock bajo</p>
          </div>
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (data?.lowStockProducts?.length ?? 0) === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-400">
              Sin alertas de stock
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {data?.lowStockProducts.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-6 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      Stock: {p.stockQuantity} {p.unit} / Mín: {p.minStock} {p.unit}
                    </p>
                  </div>
                  <span
                    className={`ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                      p.stockQuantity <= 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {p.stockQuantity <= 0 ? 'Agotado' : 'Bajo'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string | number;
  color: string;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function CashRow({
  label,
  amount,
  bold = false,
}: {
  label: string;
  amount: number;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold text-green-900' : 'text-green-800'}`}>
      <span>{label}</span>
      <span>${amount.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
}
