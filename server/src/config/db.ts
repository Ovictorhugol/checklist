import mongoose from 'mongoose'

export async function connectDB() {
  const uri = process.env.MONGO_URI

  if (!uri || uri.includes('SUA_SENHA_AQUI')) {
    console.warn('\n⚠️  ATENÇÃO: A variável MONGO_URI no arquivo .env ainda não foi configurada com as suas credenciais reais do MongoDB.')
    console.warn('👉 Por favor, siga as instruções para configurar o seu Cluster no MongoDB Atlas e atualize server/.env com a sua string de conexão.\n')
  }

  try {
    if (!uri) {
      throw new Error('MONGO_URI não informada no arquivo .env')
    }

    const conn = await mongoose.connect(uri)
    console.log(`✅ MongoDB conectado com sucesso: ${conn.connection.host} / ${conn.connection.name}`)
  } catch {
    throw new Error('Falha ao conectar no MongoDB. Verifique a configuração e a disponibilidade do banco.')
  }
}
