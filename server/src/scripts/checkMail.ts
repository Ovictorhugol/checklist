import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { serverRoot } from '../config/postgres.js'
import { getMailConfig, mailEnabled } from '../config/mail.js'
import { getGraphMailToken } from '../services/graphMail.js'

dotenv.config({ path: resolve(serverRoot, '.env'), quiet: true })
void (async () => {
  const config = getMailConfig()
  await getGraphMailToken()
  console.log(JSON.stringify({ sender: config.sender, enabled: mailEnabled(), authentication: 'ok', message: 'Token obtido. Nenhum e-mail foi enviado por esta verificação.' }, null, 2))
})().catch(error => { console.error(error instanceof Error ? error.message : 'Falha ao verificar a autenticação de e-mail.'); process.exitCode = 1 })
