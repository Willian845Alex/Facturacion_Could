import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { invoicesApi } from '../../services/api'
import TicketPrint, { type TicketData } from '../../features/invoices/TicketPrint'

export default function TicketPage() {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => invoicesApi.getTicketData(id!).then(r => r.data as TicketData),
    enabled: !!id,
    retry: 1,
  })

  // Auto-print after data + QR code render (500ms gives qrcode time to generate)
  useEffect(() => {
    if (!data) return
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [data])

  if (isLoading) {
    return (
      <div style={{ padding: 24, fontFamily: 'Courier New, monospace', fontSize: 13, textAlign: 'center' }}>
        Preparando tirilla...
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div style={{ padding: 24, fontFamily: 'Courier New, monospace', fontSize: 13, color: '#c00' }}>
        No se pudo cargar la factura. Cierre esta ventana e intente de nuevo.
      </div>
    )
  }

  return (
    <>
      {/* Toolbar visible en pantalla, oculto al imprimir */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 8, padding: '8px 12px',
        background: '#f5f5f5', borderBottom: '1px solid #ddd',
      }} className="no-print">
        <button
          onClick={() => window.print()}
          style={{ padding: '6px 14px', cursor: 'pointer', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13 }}
        >
          🖨️ Imprimir
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: '6px 14px', cursor: 'pointer', background: '#fff', border: '1px solid #ccc', borderRadius: 6, fontSize: 13 }}
        >
          ✕ Cerrar
        </button>
      </div>

      {/* Contenedor centrado en pantalla */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        padding: '12px 0 24px',
        background: '#e5e7eb',
        minHeight: 'calc(100vh - 45px)',
      }} className="ticket-screen-wrapper">
        <div style={{
          background: '#fff',
          boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
          borderRadius: 4,
        }}>
          <TicketPrint data={data} />
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .ticket-screen-wrapper {
            padding: 0 !important;
            background: white !important;
            box-shadow: none !important;
            min-height: unset !important;
          }
          .ticket-screen-wrapper > div {
            box-shadow: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>
    </>
  )
}
