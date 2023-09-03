import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

export const errorHandler = (err: Error, c: Context) => {
	if (err instanceof HTTPException) {
		return err.getResponse()
	} else if (err instanceof Error) {
		return c.json({ error: err.message }, 500)
	}
	return c.json({ error: 'Unknown error' }, 500)
}
