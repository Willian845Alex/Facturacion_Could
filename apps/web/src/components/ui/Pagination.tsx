interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: PaginationProps) {
  if (totalItems === 0 || totalPages <= 1) return null

  const start = (currentPage - 1) * itemsPerPage + 1
  const end = Math.min(currentPage * itemsPerPage, totalItems)

  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (currentPage > 3) pages.push('...')
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i)
    }
    if (currentPage < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  const btnBase = 'px-2.5 py-1.5 text-xs border rounded-lg transition-colors'
  const btnNormal = `${btnBase} border-gray-200 hover:bg-gray-50 text-gray-700`
  const btnActive = `${btnBase} bg-blue-600 text-white border-blue-600`
  const btnDisabled = `${btnBase} border-gray-200 text-gray-400 cursor-not-allowed opacity-40`

  return (
    <div className="flex items-center justify-between px-1 py-3 flex-wrap gap-2">
      <p className="text-sm text-gray-500">
        Mostrando {start}–{end} de {totalItems} registros
      </p>
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className={currentPage === 1 ? btnDisabled : btnNormal}
        >
          « Primera
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className={currentPage === 1 ? btnDisabled : btnNormal}
        >
          ‹ Anterior
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1.5 py-1.5 text-xs text-gray-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={p === currentPage ? btnActive : btnNormal}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className={currentPage === totalPages ? btnDisabled : btnNormal}
        >
          Siguiente ›
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className={currentPage === totalPages ? btnDisabled : btnNormal}
        >
          Última »
        </button>
      </div>
    </div>
  )
}
