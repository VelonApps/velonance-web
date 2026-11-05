import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button, Fields, ErrorNotice, Modal, useToast } from './ui'
import type { FieldDef } from './ui'
import { useRefresh } from '../lib/data'
export function EntityForm({
  title,
  fields,
  initial = {},
  onSave,
  onClose,
  children,
}: {
  title: string
  fields: FieldDef[]
  initial?: Record<string, string>
  onSave: (values: Record<string, string>) => Promise<unknown>
  onClose: () => void
  children?: React.ReactNode
}) {
  const schema = z.object(
      Object.fromEntries(
        fields.map((f) => [
          f.name,
          f.required ? z.string().trim().min(1, 'Bu alan gerekli.') : z.string(),
        ]),
      ),
    ),
    form = useForm<Record<string, string>>({
      defaultValues: Object.fromEntries(
        fields.map((f) => [f.name, initial[f.name] ?? f.defaultValue ?? '']),
      ),
      resolver: zodResolver(schema),
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
        <Fields fields={fields} register={form.register} errors={form.formState.errors} />
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
