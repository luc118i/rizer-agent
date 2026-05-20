export interface OccurrencePayload {
  occurrence_id: string
  relatorios_folder_id?: string
  medidas_folder_id?: string
  advertencia?: boolean
}

export interface AIExtractedData {
  motorista_nome: string
  matricula: string
  prefixo: string
  base_operacional: string
  data_ocorrencia: string
}

export interface ResolvedResponsible {
  responsavel: string
  visibilidade: string
}

export interface OccurrenceData extends AIExtractedData, ResolvedResponsible {
  tipo_ocorrencia: string
  link_relatorio: string
  link_medida: string
  advertencia: boolean
}
