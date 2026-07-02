import axios from 'axios';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // envía la cookie httpOnly del refresh token
});

// Adjunta el access token desde el store en cada request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Flag para evitar loops de refresh infinitos
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    // Solo intentar refresh en 401 y si no es el propio endpoint de refresh/login
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      if (isRefreshing) {
        // Encolar requests mientras se refresca
        return new Promise((resolve) => {
          subscribeTokenRefresh((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api.request(original));
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );
        const newToken: string = data.accessToken;
        useAuthStore.getState().setSession(newToken, data.user);
        onTokenRefreshed(newToken);
        original.headers.Authorization = `Bearer ${newToken}`;
        return api.request(original);
      } catch {
        useAuthStore.getState().clearSession();
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// ─── API services ─────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ accessToken: string; user: { id: string; email: string; name: string; role: string; branchId: string | null } }>(
      '/auth/login',
      { email, password },
    ),
  refresh: () => api.post('/auth/refresh', {}),
  logout: () => api.post('/auth/logout', {}),
};

export const invoicesApi = {
  findAll: (params?: { branchId?: string; page?: number; limit?: number; search?: string; status?: string; dateFrom?: string; dateTo?: string }) =>
    api.get('/invoices', { params }),
  findByStatus: (status: string, branchId?: string) =>
    api.get('/invoices', { params: { status, limit: 200, ...(branchId ? { branchId } : {}) } }),
  findById: (id: string) => api.get(`/invoices/${id}`),
  create: (data: unknown) => api.post('/invoices', data),
  deleteDraft: (id: string) => api.delete(`/invoices/${id}`),
  getRide: (id: string) =>
    api.get(`/invoices/${id}/ride`, { responseType: 'blob' }),
  getXml: (id: string) =>
    api.get(`/invoices/${id}/xml`, { responseType: 'blob' }),
  getTicketData: (id: string) => api.get(`/invoices/${id}/ticket`),
  sendEmail: (id: string) => api.post(`/invoices/${id}/send-email`),
  getRetryData: (id: string) => api.get(`/invoices/${id}/retry-data`),
  getTicket: (id: string) => api.get(`/invoices/${id}/ticket`),

};

export const clientsApi = {
  findAll: (search?: string, page?: number, limit?: number) =>
    api.get('/clients', { params: { ...(search ? { search } : {}), ...(page ? { page } : {}), ...(limit ? { limit } : {}) } }),
  findById: (id: string) => api.get(`/clients/${id}`),
  create: (data: unknown) => api.post('/clients', data),
  update: (id: string, data: unknown) => api.patch(`/clients/${id}`, data),
  deactivate: (id: string) => api.delete(`/clients/${id}`),
};

export const productsApi = {
  findAll: (params?: { search?: string; status?: string; ivaRate?: string; stockFilter?: string; page?: string | number; limit?: string | number }) =>
    api.get('/products', { params }),
  findById: (id: string) => api.get(`/products/${id}`),
  create: (data: unknown) => api.post('/products', data),
  update: (id: string, data: unknown) => api.patch(`/products/${id}`, data),
  deactivate: (id: string) => api.delete(`/products/${id}`),
};

export const branchesApi = {
  findAll: () => api.get('/branches'),
  create: (data: unknown) => api.post('/branches', data),
  update: (id: string, data: unknown) => api.patch(`/branches/${id}`, data),
};

export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data: unknown) => api.patch('/settings', data),
  uploadCertificado: (file: File, password: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('password', password);
    return api.post('/settings/certificado', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const unitsApi = {
  findAll: () => api.get('/units').then((r) => r.data),
  create: (data: unknown) => api.post('/units', data),
  update: (id: string, data: unknown) => api.patch(`/units/${id}`, data),
  remove: (id: string) => api.delete(`/units/${id}`),
};

export const inventoryApi = {
  getMovements: (params?: { type?: string; productId?: string; from?: string; to?: string; search?: string; page?: number; limit?: number }) =>
    api.get('/inventory/movements', { params }),
  createEntry: (data: unknown) => api.post('/inventory/movements/entry', data),
  createExit: (data: unknown) => api.post('/inventory/movements/exit', data),
  getKardex: (productId: string, from?: string, to?: string) =>
    api.get(`/inventory/kardex/${productId}`, { params: { from, to } }),
  createAdjustment: (data: unknown) =>
    api.post('/inventory/movements/adjustment', data),
  getSummary: () => api.get('/inventory/summary'),
  kardexExport: () =>
    api.get('/inventory/kardex/export', { responseType: 'blob' }),
};

export const cashRegisterApi = {
  open: (data: { initialAmount: number; branchId: string }) =>
    api.post('/cash-register/open', data),
  current: (branchId?: string) =>
    api.get('/cash-register/current', { params: branchId ? { branchId } : {} }),
  close: (data: { actualAmount: number; notes?: string }) =>
    api.post('/cash-register/close', data),
  history: (page = 1, limit = 20) =>
    api.get('/cash-register/history', { params: { page, limit } }),
  report: (id: string) => api.get(`/cash-register/${id}/report`),
};

export const creditNotesApi = {
  create: (invoiceId: string, data: { motive: string; type: 'TOTAL' | 'PARCIAL'; amount?: number }) =>
    api.post(`/invoices/${invoiceId}/credit-note`, data),
  getByInvoice: (invoiceId: string) =>
    api.get(`/invoices/${invoiceId}/credit-notes`),
  getRide: (creditNoteId: string) =>
    api.get(`/credit-notes/${creditNoteId}/ride`, { responseType: 'blob' }),
};

/** Abre un blob (PDF/XML) en nueva pestaña o lo descarga */
export function openBlob(blob: Blob, filename: string, forceDownload = false): void {
  const url = URL.createObjectURL(blob);
  if (forceDownload) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const usersApi = {
  findAll: (page?: number, limit?: number) => api.get('/users', { params: { ...(page ? { page } : {}), ...(limit ? { limit } : {}) } }),
  create: (data: unknown) => api.post('/users', data),
  update: (id: string, data: unknown) => api.patch('/users/' + id, data),
  remove: (id: string) => api.delete('/users/' + id),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};

export const reportsApi = {
  // Sales
  getSales: (params: { from: string; to: string; branchId?: string; userId?: string }) =>
    api.get('/reports/sales', { params }),
  exportSales: (params: { from: string; to: string; branchId?: string; userId?: string }) =>
    api.get('/reports/sales/export', { params, responseType: 'blob' }),
  // ATS
  getAtsPreview: (params: { year: number; month: number }) =>
    api.get('/reports/ats/preview', { params }),
  downloadAts: (params: { year: number; month: number }) =>
    api.get('/reports/ats', { params, responseType: 'blob' }),
  // Inventory
  getInventory: () => api.get('/reports/inventory'),
  exportInventory: () => api.get('/reports/inventory/export', { responseType: 'blob' }),
  // Kardex
  getKardex: (params?: { productId?: string; from?: string; to?: string }) =>
    api.get('/reports/kardex', { params }),
  exportKardex: (params?: { productId?: string; from?: string; to?: string }) =>
    api.get('/reports/kardex/export', { params, responseType: 'blob' }),
  // Legacy
  ventas: (desde: string, hasta: string, branchId?: string) =>
    api.get('/reports/ventas', { params: { desde, hasta, branchId } }),
  anexoTransaccional: (anio: number, mes: number, branchId?: string) =>
    api.get('/reports/anexo-transaccional', { params: { anio, mes, branchId } }),
};

// ─── WebSocket ─────────────────────────────────────────────────────────────────

export const invoiceSocket = io(window.location.origin, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  path: '/socket.io',
});

export function listenForInvoice(
  invoiceId: string,
  onAuthorized: (data: InvoiceSriEvent) => void,
  onRejected: (data: InvoiceSriEvent) => void,
  timeoutMs = 60000,
): () => void {
  const eventName = `invoice:${invoiceId}`;

  if (!invoiceSocket.connected) invoiceSocket.connect();

  const handler = (data: InvoiceSriEvent) => {
    if (data.event === 'authorized') onAuthorized(data);
    else if (data.event === 'rejected') onRejected(data);
  };

  invoiceSocket.on(eventName, handler);

  const timer = setTimeout(() => {
    invoiceSocket.off(eventName, handler);
  }, timeoutMs);

  return () => {
    clearTimeout(timer);
    invoiceSocket.off(eventName, handler);
  };
}

export interface InvoiceSriEvent {
  event: 'authorized' | 'rejected';
  invoiceId: string;
  secuencial: string;
  status: string;
  // authorized
  numeroAutorizacion?: string;
  fechaAutorizacion?: string;
  importeTotal?: number;
  // rejected
  errors?: string;
}

export const productBatchesApi = {
  findByProduct: (productId: string) => api.get(`/product-batches/product/${productId}`),
  create: (data: unknown) => api.post('/product-batches', data),
  update: (id: string, data: unknown) => api.patch(`/product-batches/${id}`, data),
  deactivate: (id: string) => api.delete(`/product-batches/${id}`),
  expiringSoon: (days?: number) => api.get('/product-batches/expiring-soon', { params: days ? { days } : {} }),
  expired: () => api.get('/product-batches/expired'),
  getTicket: (id: string) => api.get(`/invoices/${id}/ticket`),

};