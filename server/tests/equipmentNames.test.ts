import { test } from 'node:test'
import assert from 'node:assert/strict'
import { equipmentCatalog, getEquipmentName } from '../src/domain/inspection/equipment.js'
import { isInspectionEquipment } from '../src/domain/inspection/inspection.js'
import { Delivery } from '../src/models/Delivery.js'
import { Reservation } from '../src/models/Reservation.js'

test('catálogo contém apenas categorias genéricas; novos cadastros não aceitam sufixos de modelo', () => {
  assert.deepEqual(equipmentCatalog.map(item => item.name), ['Notebook', 'Desktop', 'Celular', 'Monitor'])
  for (const item of equipmentCatalog) {
    assert.ok(isInspectionEquipment(item.name))
    assert.ok(!isInspectionEquipment(`${item.name} Marca de exemplo Modelo de exemplo`))
    assert.equal(getEquipmentName(`${item.name} Marca de exemplo Modelo de exemplo`), item.name)
  }
  assert.equal(getEquipmentName('Computador Marca de exemplo'), 'Desktop')
  assert.equal(getEquipmentName('notebook Marca de exemplo'), 'Notebook')
  assert.equal(getEquipmentName('Equipamento desconhecido'), 'Equipamento desconhecido')
})

test('histórico é exibido com categoria genérica sem alterar os dados originais assinados', () => {
  const oldLabel = 'Notebook Marca de exemplo Modelo de exemplo'
  for (const Model of [Delivery, Reservation]) {
    const record = new Model({ equipment: oldLabel })
    assert.equal(record.toJSON().equipment, 'Notebook')
    assert.equal(record.toObject().equipment, oldLabel)
  }
})
