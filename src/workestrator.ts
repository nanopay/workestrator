import { checkWork, validateWork } from 'nanocurrency'

interface WorkResponse {
	work: string
}

export interface WorkResult extends WorkResponse {
	worker: string
}

export class RequestError extends Error {
	status: number
	statusText: string

	constructor(message: string, status: number, statusText: string) {
		super(message)
		this.status = status
		this.statusText = statusText
	}
}

export default class Workestrator {
	workers: string[]
	timeout: number
	private processes: Record<string, AbortController> = {}

	constructor(workers: string[], timeout: number = 30000) {
		this.workers = workers
		this.timeout = timeout
	}

	async generate(hash: string, threshold: string): Promise<WorkResult> {
		/*
            - Call all workers to solve the PoW concurrently
            - If any worker resolves, abort all other workers
            - If any worker rejects before a resolve, just handle the error
            - If all workers reject, throw an error
        */

		this.processes[hash] = new AbortController()

		const timeoutId = setTimeout(
			() => this.processes[hash].abort(),
			this.timeout,
		)

		const promises = this.workers.map(
			worker =>
				new Promise(resolve => {
					this.request(worker, hash, threshold, this.processes[hash].signal)
						.then(work => {
							console.info(`SUCCESS | Worker: ${worker} | Hash: ${hash}`)
							resolve({
								worker,
								work,
							})
						})
						.catch(error => {
							if (
								error instanceof DOMException &&
								error.message === 'The operation was aborted'
							)
								return
							if (error instanceof RequestError) {
								console.error(
									`ERROR | Worker: ${worker} | Message: ${error.message} | Status: ${error.status} (${error.statusText})`,
								)
							} else if (error instanceof Error) {
								console.error(`ERROR | Worker: ${worker} | ${error.message}`)
							} else {
								console.error(`ERROR | Worker: ${worker} |`, error)
							}
						})
				}),
		)

		const resolvedResult = Promise.race(promises)
		const settledResults = new Promise((undefined, reject) =>
			Promise.allSettled(promises).then(reject),
		)

		return Promise.race([resolvedResult, settledResults])
			.then(result => {
				const { work, worker } = result as WorkResult
				return {
					worker,
					work,
				}
			})
			.catch(() => {
				throw new Error('all workers failed')
			})
			.finally(() => {
				clearTimeout(timeoutId)
				this.processes[hash].abort()
			})
	}

	cancel(hash: string) {
		return this.processes[hash].abort()
	}

	private async request(
		worker: string,
		hash: string,
		threshold: string,
		signal: AbortSignal,
	): Promise<string> {
		const response = await fetch(worker, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				action: 'work_generate',
				hash,
				threshold,
			}),
			signal,
		})

		if (response.ok) {
			return await this.parseWorkerResponse(response, hash, threshold)
		} else {
			const message = await this.getErrorMessage(response)
			throw new RequestError(message, response.status, response.statusText)
		}
	}

	private async parseWorkerResponse(
		response: Response,
		hash: string,
		threshold: string,
	) {
		const result = await response.json<WorkResponse>()
		if (
			!(result instanceof Object) ||
			result === null ||
			result instanceof Array
		) {
			throw new Error('invalid response')
		}
		if ('error' in result && result.error) {
			throw new Error(
				typeof result.error === 'string'
					? result.error
					: JSON.stringify(result.error),
			)
		}
		if (!('work' in result)) {
			throw new Error('work not found')
		}
		if (typeof result.work !== 'string' || !checkWork(result.work)) {
			throw new Error('invalid work')
		}
		const isValidWork = validateWork({
			work: result.work,
			blockHash: hash,
			threshold: threshold,
		})
		if (!isValidWork) {
			throw new Error('invalid work')
		}
		return result.work
	}

	private async getErrorMessage(response: Response): Promise<string> {
		try {
			const body = await response.json()
			if (body instanceof Object && body !== null && !(body instanceof Array)) {
				if ('error' in body && typeof body.error === 'string') {
					return body.error
				} else if ('message' in body && typeof body.message === 'string') {
					return body.message
				}
			}
		} catch (error) {}
		return 'unknown error'
	}
}
