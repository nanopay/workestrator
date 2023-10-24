import { Hono } from 'hono'
import { checkHash, checkThreshold, validateWork } from 'nanocurrency'

import { Bindings } from './types'
import { errorHandler } from './middlewares'
import { SEND_DIFFICULTY } from './constants'
import Workestrator, { Worker } from './workestrator'

const app = new Hono<{ Bindings: Bindings }>()

interface WorkRecord {
	work: string
	threshold: string
	startedAt: number
	took: number
}

interface WorkResponse extends WorkRecord {
	hash: string
	cached: boolean
}

export class DurableWorkestrator extends Workestrator implements DurableObject {
	app = new Hono<{ Bindings: Bindings }>().onError(errorHandler)
	state: DurableObjectState
	db: D1Database

	constructor(state: DurableObjectState, env: Bindings) {
		super([])

		this.state = state

		this.db = env.DB

		state.blockConcurrencyWhile(this.init)

		this.app.post('/', async c => {
			// TODO: validate work request body

			const { action, hash, threshold = SEND_DIFFICULTY } = await c.req.json()

			if (action !== 'work_generate') {
				return c.json({ error: 'invalid action' }, 400)
			}

			if (!checkHash(hash)) {
				return c.json({ error: 'invalid hash' }, 400)
			}

			if (!checkThreshold(threshold)) {
				return c.json({ error: 'invalid threshold' }, 400)
			}

			const cached = await this.state.storage?.get<WorkRecord>(hash)

			if (cached) {
				const isValidWork = validateWork({
					work: cached.work,
					blockHash: hash,
					threshold,
				})
				if (isValidWork) {
					return c.json<WorkResponse>({ ...cached, hash, cached: true })
				}
			}

			const startedAt = Date.now()

			const result = await this.generate(hash, threshold)

			const took = Date.now() - startedAt

			if (!result) {
				return c.json({ error: 'No result' }, 500)
			}

			await this.state.storage?.put<WorkRecord>(hash, {
				work: result.work,
				threshold,
				startedAt,
				took,
			})

			return c.json<WorkResponse>({
				...result,
				hash,
				threshold,
				startedAt,
				took,
				cached: false,
			})
		})

		this.app.get('/history/:page', async c => {
			const page = Number(c.req.param('page'))
			if (isNaN(page)) {
				return c.json({ error: 'invalid page' }, 400)
			}
			const size = 10
			const startIndex = (page - 1) * size
			const endIndex = page * size
			const list: Map<string, WorkRecord> = await this.state.storage.list({
				limit: endIndex,
				reverse: true,
			})
			const values = Array.from(list.values())
			const result = values.slice(startIndex, endIndex)
			return c.json(result)
		})
	}

	async init() {
		let workers = await this.state.storage.get<Worker[]>('workers')
		if (!workers) {
			const { results } = await this.db
				.prepare('SELECT * FROM workers')
				.all<Worker>()
			workers = results || []
		}
		workers.forEach(this.addWorker)
	}

	fetch(request: Request) {
		return this.app.fetch(request)
	}
}

app.get('/', c => {
	return c.json({ message: 'Nano Workestrator' })
})

app.use('*', async c => {
	const id = c.env.DURABLE_OBJECT.idFromName('nano-workestrator-000')
	const obj = c.env.DURABLE_OBJECT.get(id)

	return await obj.fetch(c.req.url, {
		method: c.req.method,
		headers: c.req.headers,
		body: c.req.body,
		signal: c.req.signal,
	})
})

export default {
	fetch: app.fetch,
}
