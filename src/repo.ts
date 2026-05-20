import { getSupabaseAdmin } from './supabase'

export async function getOccurrenceById(id: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('occurrences')
    .select(`
      id,
      event_date,
      vehicle_number,
      base_code,
      occurrence_name,
      rizer_registered,
      rizer_id,
      drive_file_nome,
      advertencia,
      falta_tratativa,
      occurrence_drivers (position, driver_id, registry, name, base_code)
    `)
    .eq('id', id)
    .single()

  if (error) throw error

  const o: any = data
  return {
    id: o.id,
    eventDate: o.event_date as string,
    vehicleNumber: o.vehicle_number as string,
    baseCode: o.base_code as string,
    occurrenceName: (o.occurrence_name as string | null) ?? null,
    rizerRegistered: o.rizer_registered ?? false,
    rizerId: o.rizer_id ?? null,
    driveFileNome: o.drive_file_nome ?? null,
    advertencia: o.advertencia ?? true,
    faltaTratativa: o.falta_tratativa ?? false,
    drivers: ((o.occurrence_drivers ?? []) as any[])
      .sort((a, b) => a.position - b.position)
      .map((d) => ({
        position: d.position as number,
        driverId: d.driver_id as string | null,
        registry: d.registry as string | null,
        name: d.name as string | null,
        baseCode: d.base_code as string | null,
      })),
  }
}

export async function markRizerRegistered(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('occurrences')
    .update({ rizer_registered: true })
    .eq('id', id)
  if (error) throw error
}

export async function saveRizerData(id: string, data: {
  rizerId?: string | null
  driveFileNome?: string | null
}): Promise<void> {
  const update: Record<string, unknown> = {}
  if (data.rizerId !== undefined) update.rizer_id = data.rizerId
  if (data.driveFileNome !== undefined) update.drive_file_nome = data.driveFileNome
  if (Object.keys(update).length === 0) return

  const { error } = await getSupabaseAdmin()
    .from('occurrences')
    .update(update)
    .eq('id', id)
  if (error) throw error
}

export async function markFaltaTratativa(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('occurrences')
    .update({ falta_tratativa: true })
    .eq('id', id)
  if (error) throw error
}

export async function clearFaltaTratativa(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('occurrences')
    .update({ falta_tratativa: false })
    .eq('id', id)
  if (error) throw error
}

export async function countFaltaTratativa(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from('occurrences')
    .select('*', { count: 'exact', head: true })
    .eq('falta_tratativa', true)
  if (error) throw error
  return count ?? 0
}
