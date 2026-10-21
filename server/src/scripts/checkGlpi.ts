import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { serverRoot } from '../config/postgres.js'
import { checkGlpiConnection } from '../services/glpiClient.js'
import { glpiEnabled } from '../config/glpi.js'

dotenv.config({ path: resolve(serverRoot, '.env'), quiet: true })
void checkGlpiConnection().then(result => {
  console.log(JSON.stringify({ ...result, enabled: glpiEnabled(), authenticated: true, ticketCreated: false }, null, 2))
}).catch(error => {
  console.error(error instanceof Error ? error.message : 'Não foi possível verificar o GLPI.')
  process.exitCode = 1
})
