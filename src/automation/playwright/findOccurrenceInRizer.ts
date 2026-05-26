import type { Page } from 'playwright'
import { searchOccurrenceInListing } from './occurrenceFilter'

export async function findRizerOccurrenceId(page: Page, params: {
  matricula: string
  tipoOcorrencia: string
  motoristaNome?: string
  eventDate?: string
}): Promise<string> {
  const { matricula, tipoOcorrencia, eventDate } = params

  const id = await searchOccurrenceInListing(page, { matricula, tipoOcorrencia, dataOcorrencia: eventDate })
  if (id) return id

  throw new Error(
    `Ocorrência não encontrada no RIZER: matrícula "${matricula}", tipo "${tipoOcorrencia}"`,
  )
}
