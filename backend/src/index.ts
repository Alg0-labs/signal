import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { router } from './routes/index.js'
import { scheduleIngest } from './copilot/rag/ingest.js'
import dotenv from 'dotenv'
dotenv.config()

const app = express()
const PORT = Number(process.env.PORT) || 3001

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:5174',
].filter(Boolean) as string[]

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Railway health checks, Postman etc.)
      if (!origin) return callback(null, true)
      if (
        allowedOrigins.includes(origin) ||
        /\.vercel\.app$/.test(origin)
      ) {
        callback(null, true)
      } else {
        callback(new Error(`CORS blocked: ${origin}`))
      }
    },
    credentials: true,
  })
)

// Limit request bodies to 64 KB — prevents DoS via oversized payloads
app.use(express.json({ limit: '64kb' }))
app.use('/api', router)

// Catch unhandled rejections so the server doesn't crash on unexpected async errors
process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled promise rejection:', reason)
})

// Railway / Vercel health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'SIGNAL backend' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📡 SIGNAL backend running on port ${PORT}`)
  console.log(`   Anthropic: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗ missing'}`)
  console.log(`   Moralis:   ${process.env.MORALIS_API_KEY ? '✓' : '✗ missing'}`)
  console.log(`   Database:  ${process.env.DATABASE_URL ? '✓' : '✗ missing'}`)
  console.log(`   RAG:       ${process.env.PINECONE_API_KEY && (process.env.GEMINI_API_KEY || process.env.VOYAGE_API_KEY) ? `✓ (${process.env.GEMINI_API_KEY ? 'Gemini' : 'Voyage'}+Pinecone)` : '✗ not configured'}`)
  console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`)
  console.log()

  // Keep the news corpus fresh for RAG (no-op if VOYAGE/PINECONE keys absent).
  scheduleIngest()
})