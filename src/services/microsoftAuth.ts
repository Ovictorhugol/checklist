import type { PublicClientApplication } from '@azure/msal-browser'

export const microsoftAuthEnabled = import.meta.env?.VITE_AUTH_PROVIDER === 'microsoft'
let clientPromise: Promise<PublicClientApplication> | undefined
let interactionInProgress = false

function isPendingLoginError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'errorCode' in error ? error.errorCode : undefined
  return code === 'interaction_in_progress' || code === 'timed_out'
}

export async function runMicrosoftInteraction<T>(action: () => Promise<T>): Promise<T> {
  if (interactionInProgress) throw new Error('Aguarde a tentativa de login ou saída em andamento terminar.')
  interactionInProgress = true
  try {
    return await action()
  } finally {
    interactionInProgress = false
  }
}

async function getClient(): Promise<PublicClientApplication> {
  if (!clientPromise) {
    const tenantId = import.meta.env?.VITE_ENTRA_TENANT_ID
    const clientId = import.meta.env?.VITE_ENTRA_CLIENT_ID
    const apiClientId = import.meta.env?.VITE_ENTRA_API_CLIENT_ID
    const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (![tenantId, clientId, apiClientId].every((value) => guid.test(value || ''))) {
      throw new Error('O login Microsoft ainda não foi configurado. Informe os IDs do Entra ID no ambiente do site.')
    }
    clientPromise = import('@azure/msal-browser').then(async ({ PublicClientApplication }) => {
      const redirectUri = new URL('/redirect.html', window.location.origin).href
      const client = new PublicClientApplication({
        auth: {
          clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
          redirectUri,
          postLogoutRedirectUri: redirectUri,
        },
        cache: { cacheLocation: 'sessionStorage' },
      })
      await client.initialize()
      return client
    }).catch((error) => { clientPromise = undefined; throw error })
  }
  return clientPromise
}

function scopes() {
  return [`api://${import.meta.env?.VITE_ENTRA_API_CLIENT_ID}/access_as_user`]
}

export async function performMicrosoftPopupLogin(
  client: Pick<PublicClientApplication, 'loginPopup' | 'setActiveAccount'>,
  requestedScopes: string[],
): Promise<void> {
  const request = { scopes: requestedScopes, prompt: 'select_account' }
  try {
    let result
    try {
      result = await client.loginPopup(request)
    } catch (error) {
      if (!isPendingLoginError(error)) throw error
      // One recovery per click, under the shared interaction lock.
      // The user requested automatic recovery of interrupted popup attempts.
      result = await client.loginPopup({ ...request, overrideInteractionInProgress: true })
    }
    if (!result.account) throw new Error('A Microsoft não retornou uma conta.')
    client.setActiveAccount(result.account)
  } catch (error) {
    if (isPendingLoginError(error)) throw new Error('Não foi possível concluir o login Microsoft. Tente novamente.')
    const code = error && typeof error === 'object' && 'errorCode' in error ? error.errorCode : undefined
    if (code === 'user_cancelled') throw new Error('Login cancelado. Clique em Entrar com Microsoft para tentar novamente.')
    throw error
  }
}

export async function loginMicrosoft(): Promise<void> {
  return runMicrosoftInteraction(async () => {
    const client = await getClient()
    await performMicrosoftPopupLogin(client, scopes())
  })
}

export async function getMicrosoftAccessToken(): Promise<string> {
  const client = await getClient()
  const account = client.getActiveAccount()
  if (!account) throw new Error('Entre novamente com sua conta Microsoft.')
  try {
    const result = await client.acquireTokenSilent({ account, scopes: scopes() })
    return result.accessToken
  } catch {
    throw new Error('Sua sessão Microsoft precisa ser renovada. Entre novamente.')
  }
}

export async function logoutMicrosoft(): Promise<void> {
  return runMicrosoftInteraction(async () => {
    const client = await getClient()
    const account = client.getActiveAccount()
    try {
      await client.logoutPopup({ account, mainWindowRedirectUri: window.location.href })
    } finally {
      await client.clearCache()
      client.setActiveAccount(null)
    }
  })
}
