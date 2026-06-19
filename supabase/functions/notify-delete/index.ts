// supabase/functions/notify-delete/index.ts
// =====================================================
// Edge Function: notifica por correo al admin cuando alguien
// elimina (soft-delete) un equipo del inventario.
// =====================================================
//
// SETUP (una sola vez):
//   1. Crear cuenta en https://resend.com (gratis, 100 emails/día)
//   2. Generar API Key en Resend Dashboard
//   3. Instalar Supabase CLI: `npm i -g supabase`
//   4. Login: `supabase login`
//   5. Linkear proyecto: `supabase link --project-ref <tu-ref>`
//   6. Configurar secrets:
//        supabase secrets set RESEND_API_KEY=re_xxxxx
//        supabase secrets set ADMIN_EMAIL=bavf.1995@gmail.com
//        supabase secrets set APP_URL=https://tu-app.vercel.app
//   7. Deploy:
//        supabase functions deploy notify-delete --no-verify-jwt
//
// LLAMADO DESDE EL CLIENTE:
//   supabase.functions.invoke('notify-delete', {
//     body: { record: <fila equipo eliminada> }
//   })
//
// Si la función no está deployada o falla, el soft delete sigue
// funcionando en la DB (la app es tolerante a fallos aquí).
// =====================================================

// @ts-ignore - Deno runtime
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? 'bavf.1995@gmail.com'
const APP_URL = Deno.env.get('APP_URL') ?? ''

interface EquipoEliminado {
  id: string
  correlativo: number | null
  bodega: string
  tipo_equipo?: string | null
  numero_interno: string
  marca: string
  modelo: string
  estado_operacional?: string | null
  responsable?: string | null
  deleted_at?: string | null
}

interface Payload {
  record?: EquipoEliminado
}

function escapeHtml(str: string | null | undefined): string {
  if (str == null) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return new Date().toLocaleString('es-CL')
  try {
    return new Date(iso).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function renderHtml(record: EquipoEliminado): string {
  const restoreUrl = APP_URL
    ? `${APP_URL}/?restore=${record.id}`
    : APP_URL

  const fields: Array<[string, string]> = [
    ['Correlativo', record.correlativo ? `#${String(record.correlativo).padStart(4, '0')}` : '—'],
    ['Bodega', record.bodega],
    ['Tipo de equipo', record.tipo_equipo ?? '—'],
    ['N° interno', record.numero_interno],
    ['Marca', record.marca],
    ['Modelo', record.modelo],
    ['Estado', record.estado_operacional ?? '—'],
    ['Responsable del registro', record.responsable ?? '—'],
    ['Eliminado', formatearFecha(record.deleted_at)],
  ]

  const rowsHtml = fields
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:6px 12px 6px 0;color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
            ${escapeHtml(label)}
          </td>
          <td style="padding:6px 0;color:#0f172a;font-size:15px;font-weight:600;">
            ${escapeHtml(value)}
          </td>
        </tr>`,
    )
    .join('')

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;">
      <div style="background:#fff;border-radius:14px;padding:24px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="background:#fee2e2;color:#991b1b;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;">
            🗑️
          </div>
          <div>
            <h1 style="margin:0;color:#0f172a;font-size:20px;font-weight:800;">
              Equipo eliminado
            </h1>
            <p style="margin:4px 0 0 0;color:#64748b;font-size:13px;">
              Inventario Licman · Aviso automático
            </p>
          </div>
        </div>

        <p style="color:#334155;font-size:15px;line-height:1.5;margin:0 0 16px 0;">
          Alguien eliminó un equipo del inventario. Si fue un error,
          podés restaurarlo desde la papelera de la app o haciendo
          click en el botón de abajo.
        </p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f1f5f9;border-radius:10px;padding:12px 16px;">
          ${rowsHtml}
        </table>

        ${
          restoreUrl
            ? `
          <div style="text-align:center;margin:20px 0 8px 0;">
            <a href="${escapeHtml(restoreUrl)}"
               style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;font-size:14px;">
              Abrir papelera y restaurar
            </a>
          </div>
          <p style="text-align:center;color:#94a3b8;font-size:12px;margin:8px 0 0 0;">
            Si el botón no funciona, abrí la app y andá a la pestaña "🗑️ Papelera".
          </p>`
            : `
          <p style="color:#64748b;font-size:13px;margin:12px 0 0 0;">
            Abrí la app y andá a la pestaña <strong>🗑️ Papelera</strong> para restaurar.
          </p>`
        }
      </div>

      <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:16px;">
        Este es un aviso automático del sistema de inventario. No responder.
      </p>
    </div>
  `
}

async function enviarConResend(record: EquipoEliminado): Promise<{ ok: boolean; detail?: string }> {
  if (!RESEND_API_KEY) {
    return { ok: false, detail: 'RESEND_API_KEY no configurada en secrets' }
  }
  const subject = `🗑️ Equipo eliminado: ${record.marca} ${record.modelo} (${record.numero_interno})`
  const html = renderHtml(record)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Inventario Licman <onboarding@resend.dev>',
      to: [ADMIN_EMAIL],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    return { ok: false, detail: `Resend ${res.status}: ${detail}` }
  }
  return { ok: true }
}

serve(async (req) => {
  // Solo POST.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const record = payload.record
  if (!record?.id) {
    return new Response(JSON.stringify({ error: 'Falta record.id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await enviarConResend(record)

  // Si falla, devolvemos 200 igual con `ok: false` en el body.
  // La app loggea el warning pero no rompe el flujo (el soft delete
  // ya se hizo en la DB).
  return new Response(
    JSON.stringify({
      ok: result.ok,
      detail: result.detail ?? null,
      record_id: record.id,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})