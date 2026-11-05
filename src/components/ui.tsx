import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode, ButtonHTMLAttributes } from 'react'
import { AlertCircle, ArrowUpRight, Check, Inbox, Info, LoaderCircle, X } from 'lucide-react'
import { friendlyError } from '../lib/auth'
import { dateLabel, periodRange } from '../lib/finance'
import type { Period } from '../lib/finance'
export function Button({
  children,
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
}) {
  return (
    <button className={'button ' + variant} {...props}>
      {children}
    </button>
  )
}
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={'badge ' + tone}>{children}</span>
}
export function Empty({
  title = 'Henüz kayıt bulunmuyor.',
  description = 'İlk kaydınızı ekleyerek stüdyonuzun finansal görünümünü oluşturun.',
  action,
}: {
  title?: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={24} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} /> Veriler yükleniyor…
    </div>
  )
}
export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div role="alert" className="notice error">
      <AlertCircle size={18} />
      <span>{friendlyError(error)}</span>
    </div>
  ) : null
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <AlertCircle size={17} />
      <span>{children}</span>
    </div>
  )
}
export function Truncated({ show }: { show?: boolean }) {
  return show ? (
    <Notice>
      Bu görünümün kayıt sınırına ulaşıldı. Daha dar bir tarih aralığı seçin. Eksik sonuçları toplam
      olarak kullanmayın.
    </Notice>
  ) : null
}
export function PageHeading({
  eyebrow = 'STÜDYO FİNANS',
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  )
}
export function Panel({
  title,
  description,
  children,
  action,
  className = '',
}: {
  title?: string
  description?: string
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <section className={'panel ' + className}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}
export function Stat({
  label,
  value,
  detail,
  icon,
  tone = '',
}: {
  label: string
  value: string
  detail: string
  icon: ReactNode
  tone?: string
}) {
  return (
    <div className={'stat ' + tone}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="stat-detail">
        <ArrowUpRight size={13} />
        {detail}
      </div>
    </div>
  )
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const bodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    el.current?.focus()
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Tab') {
        const nodes = el.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input,select,textarea,a[href]',
        )
        if (!nodes?.length) return
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el.current)
        ) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('keydown', key)
      document.body.style.overflow = bodyOverflow
      prev?.focus()
    }
  }, [onClose])
  return (
    <div className="modal-backdrop">
      <div
        ref={el}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={'modal ' + (wide ? 'wide' : '')}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <Button variant="ghost" aria-label="Kapat" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}
export type FieldDef = {
  name: string
  label: string
  type?: string
  options?: { value: string; label: string }[]
  required?: boolean
  help?: string
  example?: string
  numeric?: boolean
  disabled?: boolean
  defaultValue?: string
  full?: boolean
}
function FieldItem({
  field: f,
  register,
  error,
}: {
  field: FieldDef
  register: (name: string) => object
  error?: string
}) {
  const [open, setOpen] = useState(false),
    id = useId(),
    placeholder = f.example ? 'Örn. ' + f.example : undefined
  return (
    <div className={'field ' + (f.full ? 'full' : '')}>
      <span className="field-label">
        <label htmlFor={id}>
          {f.label}
          {f.required && <b> *</b>}
        </label>
        {f.help && (
          <button
            type="button"
            className={'field-info ' + (open ? 'open' : '')}
            aria-label="Açıklamayı göster"
            aria-expanded={open}
            title={f.help}
            onClick={() => setOpen(!open)}
          >
            <Info size={13} />
          </button>
        )}
      </span>
      {f.options ? (
        <select id={id} {...register(f.name)} disabled={f.disabled}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.type === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          placeholder={placeholder}
          {...register(f.name)}
          disabled={f.disabled}
        />
      ) : (
        <input
          id={id}
          type={f.type || 'text'}
          inputMode={f.numeric ? 'decimal' : undefined}
          step={f.type === 'number' ? 'any' : undefined}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          {...register(f.name)}
          disabled={f.disabled}
        />
      )}
      {open && f.help && <small className="field-help">{f.help}</small>}
      {error && (
        <small role="alert" className="field-error">
          {error}
          {f.example && !error.includes('Örnek') ? ' Örnek: ' + f.example : ''}
        </small>
      )}
    </div>
  )
}
export function Fields({
  fields,
  register,
  errors,
}: {
  fields: FieldDef[]
  register: (name: string) => object
  errors?: Record<string, unknown>
}) {
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <FieldItem
          key={f.name}
          field={f}
          register={register}
          error={(errors?.[f.name] as { message?: string } | undefined)?.message}
        />
      ))}
    </div>
  )
}
type ToastContext = { notify: (message: string, tone?: 'success' | 'error') => void }
const Toast = createContext<ToastContext>({ notify: () => {} })
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(timer)
  }, [toast])
  return (
    <Toast.Provider value={{ notify: (message, tone = 'success') => setToast({ message, tone }) }}>
      {children}
      {toast && (
        <div className={'toast ' + toast.tone} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
          <span>{toast.message}</span>
          <button aria-label="Bildirimi kapat" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </Toast.Provider>
  )
}
export const useToast = () => useContext(Toast)
export function usePeriod(initial: Period = 'month') {
  const [period, setPeriod] = useState<Period>(initial),
    [custom, setCustom] = useState(periodRange(initial))
  return {
    period,
    setPeriod,
    range: period === 'custom' ? custom : periodRange(period),
    custom,
    setCustom,
  }
}
export function PeriodFilter({ state }: { state: ReturnType<typeof usePeriod> }) {
  return (
    <div className="period-filter">
      <span className="muted">
        {dateLabel(state.range.start)} — {dateLabel(state.range.end)}
      </span>
      <select
        aria-label="Tarih aralığı"
        value={state.period}
        onChange={(e) => state.setPeriod(e.target.value as Period)}
      >
        {[
          ['today', 'Bugün'],
          ['week', 'Son 7 gün'],
          ['month', 'Bu ay'],
          ['previous', 'Geçen ay'],
          ['three', 'Son 3 ay'],
          ['six', 'Son 6 ay'],
          ['year', 'Bu yıl'],
          ['lastYear', 'Geçen yıl'],
          ['custom', 'Özel tarih aralığı'],
        ].map(([v, l]) => (
          <option value={v} key={v}>
            {l}
          </option>
        ))}
      </select>
      {state.period === 'custom' && (
        <>
          <input
            aria-label="Başlangıç tarihi"
            type="date"
            value={state.custom.start}
            onChange={(e) => state.setCustom({ ...state.custom, start: e.target.value })}
          />
          <input
            aria-label="Bitiş tarihi"
            type="date"
            min={state.custom.start}
            value={state.custom.end}
            onChange={(e) => state.setCustom({ ...state.custom, end: e.target.value })}
          />
        </>
      )}
    </div>
  )
}
