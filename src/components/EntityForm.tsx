import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Fields, ErrorNotice, Modal, useToast } from './ui'
import type { FieldDef } from './ui'
import { useRefresh } from '../lib/data'
import { parseAmount, syncRate } from '../lib/finance'
// Links a quantity, a "1 unit = X TL" rate and a TL total so filling any two fills the third.
export function useRateSync(keys: { quantity: string; rate: string; total: string }) {
  const anchor = useRef<'rate' | 'total'>('rate')
  return (name: string, values: Record<string, string>) => {
    const changed =
      name === keys.quantity
        ? 'quantity'
        : name === keys.rate
          ? 'rate'
          : name === keys.total
            ? 'total'
            : null
    if (!changed) return
    if (changed !== 'quantity') anchor.current = changed
    const result = syncRate(
      changed,
      {
        quantity: values[keys.quantity] || '',
        rate: values[keys.rate] || '',
        total: values[keys.total] || '',
      },
      anchor.current,
    )
    return {
      ...(result.rate !== undefined ? { [keys.rate]: result.rate } : {}),
      ...(result.total !== undefined ? { [keys.total]: result.total } : {}),
    }
  }
}
export function EntityForm({
  title,
  fields,
  initial = {},
  onSave,
  onClose,
  onFieldChange,
  children,
}: {
  title: string
  fields: FieldDef[]
  initial?: Record<string, string>
  onSave: (values: Record<string, string>) => Promise<unknown>
  onClose: () => void
  onFieldChange?: (name: string, values: Record<string, string>) => Record<string, string> | void
  children?: React.ReactNode
}) {
  const schema = z.object(
      Object.fromEntries(
        fields.map((f) => {
          let rule = f.required ? z.string().trim().min(1, 'Bu alan boş bırakılamaz.') : z.string()
          if (f.numeric)
            rule = rule.superRefine((v, ctx) => {
              if (!v.trim()) return
              try {
                parseAmount(v)
              } catch (e) {
                ctx.addIssue({ code: 'custom', message: (e as Error).message })
              }
            })
          return [f.name, rule]
        }),
      ),
    ),
    form = useForm<Record<string, string>>({
      defaultValues: Object.fromEntries(
        fields.map((f) => [f.name, initial[f.name] ?? f.defaultValue ?? '']),
      ),
      resolver: zodResolver(schema),
      mode: 'onTouched',
    })
  const [error, setError] = useState<unknown>(null),
    refresh = useRefresh(),
    { notify } = useToast()
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          setError(null)
          try {
            await onSave(values)
            await refresh()
            notify('Kayıt başarıyla kaydedildi.')
            onClose()
          } catch (e) {
            setError(e)
          }
        })}
      >
        <Fields
          fields={fields}
          register={(name) =>
            form.register(name, {
              onChange: () => {
                const updates = onFieldChange?.(name, form.getValues())
                for (const [key, value] of Object.entries(updates || {}))
                  form.setValue(key, value, { shouldValidate: form.formState.touchedFields[key] })
              },
            })
          }
          errors={form.formState.errors}
        />
        {children}
        <ErrorNotice error={error} />
        <div className="form-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Vazgeç
          </Button>
          <Button disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
