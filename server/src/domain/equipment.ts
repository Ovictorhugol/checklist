export type InspectionStatus = 'pending' | 'ok' | 'damaged'

export type EquipmentPart = {
  id: string
  label: string
  detail: string
  status: InspectionStatus
  note: string
}

export type EquipmentId = 'notebook' | 'desktop' | 'phone' | 'monitor'

type EquipmentDefinition = {
  id: EquipmentId
  name: string
  parts: Omit<EquipmentPart, 'status' | 'note'>[]
}

export const equipmentCatalog: EquipmentDefinition[] = [
  {
    id: 'notebook',
    name: 'Notebook',
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
    parts: [
      { id: 'display', label: 'Tela', detail: 'Painel, pixels e superfície' },
      { id: 'bezel', label: 'Moldura e gabinete', detail: 'Bordas e estrutura traseira' },
      { id: 'stand', label: 'Base e suporte', detail: 'Coluna, ajuste e estabilidade' },
      { id: 'buttons', label: 'Controles', detail: 'Botões físicos e energia' },
      { id: 'ports', label: 'Conexões', detail: 'Vídeo, USB e alimentação' },
    ],
  },
]

/** Display historic category labels without their old fixed brand/model suffix. */
export function getEquipmentName(value: string): string {
  const category = /^(notebook|desktop|computador|celular|monitor)(?:\s|$)/i.exec(value.trim())?.[1].toLowerCase()
  if (category === 'computador' || category === 'desktop') return 'Desktop'
  return equipmentCatalog.find(item => item.name.toLowerCase() === category)?.name ?? value
}

export function getInitialParts(equipmentId: EquipmentId): EquipmentPart[] {
  const equipment = equipmentCatalog.find((item) => item.id === equipmentId) ?? equipmentCatalog[0]
  return equipment.parts.map((part) => ({ ...part, status: 'pending', note: '' }))
}

export const statusText: Record<InspectionStatus, string> = {
  pending: 'Pendente',
  ok: 'Sem danos',
  damaged: 'Danificado',
}
