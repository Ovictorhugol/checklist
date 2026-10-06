import { useEffect, useState, useCallback, useRef } from 'react'
import type { DeliveryRecord, NewDelivery, ReturnInspectionRecord } from '../domain/deliveryTypes'
import { apiGetDeliveries, apiGetMyDeliveries, apiCreateDelivery, apiSaveReturnInspection, apiDeleteDelivery } from '../services/api'

export function useDeliveries(userEmail: string | null, personal = false) {
  const owner = userEmail ? `${personal ? 'mine' : 'all'}:${userEmail}` : null
  const currentOwner = useRef(owner)
  const getDeliveries = personal ? apiGetMyDeliveries : apiGetDeliveries
  const [state, setState] = useState<{ owner: string | null; records: DeliveryRecord[]; error: string }>({ owner: null, records: [], error: '' })
  const refresh = useCallback(async () => {
    if (!owner) return
    try {
      const records = await getDeliveries()
      if (currentOwner.current === owner) setState({ owner, records, error: '' })
    } catch (error) {
      if (currentOwner.current === owner) setState((current) => ({ owner, records: current.owner === owner ? current.records : [], error: (error as Error).message }))
    }
  }, [owner, getDeliveries])

  useEffect(() => {
    currentOwner.current = owner
    if (!owner) return
    let active = true
    void getDeliveries().then(
      (records) => { if (active) setState({ owner, records, error: '' }) },
      (error: Error) => { if (active) setState({ owner, records: [], error: error.message }) }
    )
    return () => { active = false }
  }, [owner, getDeliveries])

  const addDelivery = async (details: NewDelivery) => {
    const saved = await apiCreateDelivery(details)
    if (currentOwner.current === owner) setState((current) => ({ owner, records: [saved, ...(current.owner === owner ? current.records : [])], error: '' }))
    return saved
  }
  const saveReturnInspection = async (id: string, inspection: ReturnInspectionRecord) => {
    const updated = await apiSaveReturnInspection(id, inspection)
    if (currentOwner.current === owner) setState((current) => ({ ...current, records: current.records.map((item) => item.id === id ? updated : item) }))
    return updated
  }
  const deleteDelivery = async (id: string) => {
    await apiDeleteDelivery(id)
    if (currentOwner.current === owner) setState((current) => ({ ...current, records: current.records.filter((item) => item.id !== id) }))
  }
  const visible = state.owner === owner
  return { deliveries: visible ? state.records : [], loadError: visible ? state.error : '', loading: !!userEmail && !visible, addDelivery, saveReturnInspection, deleteDelivery, refresh }
}
