import { useEffect, useState, useCallback, useRef } from 'react'
import type { DeliveryRecord, NewDelivery, ReturnInspectionRecord } from '../domain/deliveryTypes'
import { apiGetDeliveries, apiCreateDelivery, apiSaveReturnInspection, apiDeleteDelivery } from '../services/api'

export function useDeliveries(userEmail: string | null) {
  const currentOwner = useRef(userEmail)
  const [state, setState] = useState<{ owner: string | null; records: DeliveryRecord[]; error: string }>({ owner: null, records: [], error: '' })
  const refresh = useCallback(async () => {
    if (!userEmail) return
    try {
      const records = await apiGetDeliveries()
      if (currentOwner.current === userEmail) setState({ owner: userEmail, records, error: '' })
    } catch (error) {
      if (currentOwner.current === userEmail) setState((current) => ({ owner: userEmail, records: current.owner === userEmail ? current.records : [], error: (error as Error).message }))
    }
  }, [userEmail])

  useEffect(() => {
    currentOwner.current = userEmail
    if (!userEmail) return
    let active = true
    void apiGetDeliveries().then(
      (records) => { if (active) setState({ owner: userEmail, records, error: '' }) },
      (error: Error) => { if (active) setState({ owner: userEmail, records: [], error: error.message }) }
    )
    return () => { active = false }
  }, [userEmail])

  const addDelivery = async (details: NewDelivery) => {
    const saved = await apiCreateDelivery(details)
    if (currentOwner.current === userEmail) setState((current) => ({ owner: userEmail, records: [saved, ...(current.owner === userEmail ? current.records : [])], error: '' }))
    return saved
  }
  const saveReturnInspection = async (id: string, inspection: ReturnInspectionRecord) => {
    const updated = await apiSaveReturnInspection(id, inspection)
    if (currentOwner.current === userEmail) setState((current) => ({ ...current, records: current.records.map((item) => item.id === id ? updated : item) }))
    return updated
  }
  const deleteDelivery = async (id: string) => {
    await apiDeleteDelivery(id)
    if (currentOwner.current === userEmail) setState((current) => ({ ...current, records: current.records.filter((item) => item.id !== id) }))
  }
  const visible = state.owner === userEmail
  return { deliveries: visible ? state.records : [], loadError: visible ? state.error : '', loading: !!userEmail && !visible, addDelivery, saveReturnInspection, deleteDelivery, refresh }
}
