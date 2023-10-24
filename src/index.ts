import { Hono } from 'hono'
import { checkHash, checkThreshold, validateWork } from 'nanocurrency'

import { Bindings } from './types'
import { errorHandler } from './middlewares'
import { SEND_DIFFICULTY } from './constants'
import Workestrator, { Worker } from './workestrator'

const app = new Hono<{ Bindings: Bindings }>()

interface WorkRecord {
	work: string
	workerId: number
	threshold: string
	startedAt: number
	took: number
}

interface WorkRecordWithHash extends WorkRecord {
	hash: string
}

export interface WorkResponse extends WorkRecordWithHash {
	hash: string
	workerName: string
	cached: boolean
}

export class DurableWorkestrator extends Workestrator implements DurableObject {
	app = new Hono<{ Bindings: Bindings }>().onError(errorHandler)
	storage: DurableObjectStorage
	db: D1Database

	constructor(state: DurableObjectState, env: Bindings) {
		super()

		this.storage = state.storage

		this.db = env.DB

		state.blockConcurrencyWhile(async () => {
			await this.init()
		})

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

			const cached = await this.storage.get<WorkRecord>(hash)

			if (cached) {
				const isValidWork = validateWork({
					work: cached.work,
					blockHash: hash,
					threshold,
				})
				if (isValidWork) {
					const workerName =
						this.workers.find(worker => worker.id === cached.workerId)?.name ||
						'noname'
					return c.json<WorkResponse>({
						...cached,
						workerName,
						hash,
						cached: true,
					})
				}
			}

			const startedAt = Date.now()

			const {
				threshold: realThreshold,
				work,
				worker,
			} = await this.generate(hash, threshold)

			const took = Date.now() - startedAt

			this.storeWork({
				hash,
				work,
				threshold: realThreshold,
				workerId: worker.id,
				startedAt,
				took,
			})

			return c.json<WorkResponse>({
				hash,
				work,
				workerId: worker.id,
				threshold: realThreshold,
				workerName: worker.name,
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
			const list: Map<string, WorkRecord> = await this.storage.list({
				limit: endIndex,
				reverse: true,
			})
			const values = Array.from(list.values())
			const result = values.slice(startIndex, endIndex)
			return c.json(result)
		})

		this.app.get('/workers', async c => {
			const { results } = await this.db.prepare(`SELECT * FROM workers`).all()
			return c.json(results)
		})

		this.app.put('/workers', async c => {
			const { name, url } = await c.req.json<Omit<Worker, 'id'>>()
			if (typeof name !== 'string' || name.length < 2 || name.length > 64) {
				throw new Error('Invalid name')
			}
			if (!/^https?:\/\//i.test(url)) {
				throw new Error('Invalid URL')
			}
			const id = await this.db
				.prepare('INSERT INTO workers (name, url) values(?1, ?2) RETURNING id')
				.bind(name, url)
				.first<number>('id')
			await this.storage.put<Worker[]>('workers', [
				...this.workers,
				{
					id,
					name,
					url,
				},
			])
			this.addWorker({ name, url, id })
			return c.json({ success: true, id })
		})

		this.app.delete('/workers/:id', async c => {
			const id = Number(c.req.param('id'))
			if (isNaN(id)) throw new Error('Invalid ID')
			const worker = this.workers.find(worker => worker.id === id)
			if (!worker) return c.json({ error: 'Not Found' }, 404)
			await this.db.exec(`DELETE FROM workers WHERE id = ${id}`)
			const workers = this.workers.filter(worker => worker.id !== id)
			await this.storage.put<Worker[]>('workers', workers)
			this.removeWorker(worker.id)
			return c.json({ success: true })
		})
	}

	async init() {
		let workers = await this.storage.get<Worker[]>('workers')
		if (!workers) {
			const { results } = await this.db
				.prepare('SELECT * FROM workers')
				.all<Worker>()
			workers = results || []
		}
		workers.forEach(worker => this.addWorker(worker))
	}

	async storeWork({
		hash,
		work,
		threshold,
		workerId,
		startedAt,
		took,
	}: WorkRecordWithHash) {
		await this.storage.put<WorkRecord>(hash, {
			work,
			threshold,
			workerId,
			startedAt,
			took,
		})

		await this.db
			.prepare(
				`INSERT INTO works (hash, work, threshold, worker, took) VALUES(?1, ?2, ?3, ?4, ?5)`,
			)
			.bind(hash, work, threshold, workerId, took)
	}

	fetch(request: Request) {
		return this.app.fetch(request)
	}
}

app.get('/', c => {
	return c.json({ message: 'Nano Workestrator' })
})

app.use('*', async c => {
	const id = c.env.DURABLE_OBJECT.idFromName('nano-workestrator-001')
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
