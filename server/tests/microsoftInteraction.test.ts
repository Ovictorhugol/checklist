import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runMicrosoftInteraction, performMicrosoftPopupLogin } from '../../src/features/auth/services/microsoftAuth.js'
import type { AuthenticationResult, AccountInfo, PopupRequest } from '@azure/msal-browser'

test('Microsoft: não inicia um segundo login ou saída enquanto a primeira interação está pendente', async () => {
  let finish!: () => void
  const pending = new Promise<void>((resolve) => { finish = resolve })
  const first = runMicrosoftInteraction(() => pending)
  let secondStarted = false
  try {
    await assert.rejects(runMicrosoftInteraction(async () => { secondStarted = true }), /Aguarde/)
    assert.equal(secondStarted, false)
  } finally {
    finish()
    await first
  }
  assert.equal(await runMicrosoftInteraction(async () => 'nova tentativa'), 'nova tentativa')
})

test('Microsoft: falha na interação libera a próxima tentativa', async () => {
  await assert.rejects(runMicrosoftInteraction(async () => { throw new Error('popup interrompido') }), /popup interrompido/)
  assert.equal(await runMicrosoftInteraction(async () => 'recuperado'), 'recuperado')
})

test('Microsoft: recupera automaticamente uma interação pendente ou timeout sem novo clique', async () => {
  for (const errorCode of ['interaction_in_progress', 'timed_out']) {
    const requests: PopupRequest[] = []
    const account = { homeAccountId: 'test-account' } as AccountInfo
    let activeAccount: AccountInfo | null = null
    const client = {
      loginPopup: async (request: PopupRequest): Promise<AuthenticationResult> => {
        requests.push(request)
        if (requests.length === 1) throw { errorCode }
        return { account } as AuthenticationResult
      },
      setActiveAccount: (value: AccountInfo | null) => { activeAccount = value },
    }
    await performMicrosoftPopupLogin(client, ['api://test/access_as_user'])
    assert.equal(requests.length, 2)
    assert.equal(requests[0].overrideInteractionInProgress, undefined)
    assert.equal(requests[1].overrideInteractionInProgress, true)
    assert.deepEqual(requests[1].scopes, requests[0].scopes)
    assert.equal(activeAccount, account)
  }
})

test('Microsoft: recuperação para após a segunda falha e não repete cancelamentos ou erros de configuração', async () => {
  for (const errorCode of ['interaction_in_progress', 'timed_out', 'user_cancelled', 'invalid_client', 'popup_window_error']) {
    let attempts = 0
    let accountSet = false
    const client = {
      loginPopup: async (): Promise<AuthenticationResult> => { attempts++; throw { errorCode } },
      setActiveAccount: () => { accountSet = true },
    }
    await assert.rejects(performMicrosoftPopupLogin(client, ['api://test/access_as_user']))
    assert.equal(attempts, ['interaction_in_progress', 'timed_out'].includes(errorCode) ? 2 : 1)
    assert.equal(accountSet, false)
  }
})
