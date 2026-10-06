export type InspectionStatus = 'pending' | 'ok' | 'damaged'

export type EquipmentPart = {
  id: string
  label: string
  detail: string
  status: InspectionStatus
  note: string
}

export type EquipmentId = 'notebook' | 'desktop' | 'phone' | 'monitor'

export type EquipmentDefinition = {
  id: EquipmentId
  name: string
  apiName: string
  modelLabel: string
  parts: Omit<EquipmentPart, 'status' | 'note'>[]
}

export const equipmentCatalog: EquipmentDefinition[] = [
  {
    id: 'notebook',
    name: 'Notebook',
    apiName: 'Notebook Dell Latitude 5440',
    modelLabel: 'DELL LATITUDE 5440',
    parts: [
      { id: 'display', label: 'Tela e moldura', detail: 'Painel, vidro e dobradiças' },
      { id: 'keyboard', label: 'Teclado', detail: 'Teclas e iluminação' },
      { id: 'touchpad', label: 'Touchpad', detail: 'Superfície e clique' },
      { id: 'case', label: 'Carcaça', detail: 'Tampa, base e cantos' },
      { id: 'ports', label: 'Portas e conexões', detail: 'USB-C, USB-A, rede Ethernet (RJ-45) e áudio' },
    ],
  },
  {
    id: 'desktop',
    name: 'Desktop',
    apiName: 'Computador Dell OptiPlex 3000',
    modelLabel: 'DELL OPTIPLEX 3000',
    parts: [
      { id: 'case', label: 'Gabinete', detail: 'Tampa, estrutura e ventilação' },
      { id: 'front-panel', label: 'Painel frontal', detail: 'Botão liga/desliga e indicadores' },
      { id: 'ports', label: 'Portas frontais', detail: 'USB e conexões de áudio' },
      { id: 'rear-ports', label: 'Conexões traseiras', detail: 'Vídeo, rede e alimentação' },
    ],
  },
  {
    id: 'phone',
    name: 'Celular',
    apiName: 'Celular Samsung Galaxy A36',
    modelLabel: 'GALAXY A36',
    parts: [
      { id: 'display', label: 'Tela', detail: 'Vidro, painel e toque' },
      { id: 'case', label: 'Carcaça', detail: 'Tampa traseira e laterais' },
      { id: 'cameras', label: 'Câmeras', detail: 'Lentes e conjunto traseiro' },
      { id: 'buttons', label: 'Botões', detail: 'Lateral e volume' },
      { id: 'ports', label: 'Conector e áudio', detail: 'USB-C, microfone e alto-falantes' },
    ],
  },
  {
    id: 'monitor',
    name: 'Monitor',
    apiName: 'Monitor Dell P2222H',
    modelLabel: 'DELL P2222H',
    parts: [
      { id: 'display', label: 'Tela', detail: 'Painel, pixels e superfície' },
      { id: 'bezel', label: 'Moldura e gabinete', detail: 'Bordas e estrutura traseira' },
      { id: 'stand', label: 'Base e suporte', detail: 'Coluna, ajuste e estabilidade' },
      { id: 'buttons', label: 'Controles', detail: 'Botões físicos e energia' },
      { id: 'ports', label: 'Conexões', detail: 'Vídeo, USB e alimentação' },
    ],
  },
]

export function getInitialParts(equipmentId: EquipmentId): EquipmentPart[] {
  const equipment = equipmentCatalog.find((item) => item.id === equipmentId) ?? equipmentCatalog[0]
  return equipment.parts.map((part) => ({ ...part, status: 'pending', note: '' }))
}

export const initialParts = getInitialParts('notebook')

export const statusText: Record<InspectionStatus, string> = {
  pending: 'Pendente',
  ok: 'Sem danos',
  damaged: 'Danificado',
}
