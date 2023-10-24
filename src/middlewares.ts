import { Context, Next } from 'hono'
import { HTTPException } from 'hono/http-exception'

export const errorHandler = (err: Error, c: Context) => {
	if (err instanceof HTTPException) {
		return err.getResponse()
	} else if (err instanceof Error) {
		return c.json({ error: err.message }, 500)
	}
	return c.json({ error: 'Unknown error' }, 500)
}

/*
	Allows auth using 2 different strategies
	- Header: "Authorization": "Bearer xxxxx"
	- URL Query: ?authKey=xxxxx
*/
export const authGate = async (c: Context, next: Next) => {
	if (c.env.AUTH_KEY) {
		const authKey = c.req.query('authKey')
		const bearer = c.req.header('Authorization')?.split('Bearer ')[1]

		if (!authKey && !bearer) {
			return c.json({ error: 'Unauthorized' }, 401)
		}

		if (authKey !== c.env.AUTH_KEY && bearer !== c.env.AUTH_KEY) {
			return c.json({ error: 'Unauthorized' }, 401)
		}
	}
	await next()
}
