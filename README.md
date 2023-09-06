# Nanocurrency Workestrator

Nanocurrency Proof of Work RPC Gateway

## About

The objective of this project is provide a robust gateway of the Nano Proof of Work, to give more performance, redundancy and consistency for Nanocurrency implementations.

This is done by allowing distribution of PoW between different workers concurrently, handling errors and caching works.

## Stack

This project is made with Typescript and was designed to run on EDGE. It implements:

- [Cloudflare Workers](https://developers.cloudflare.com/workers/): a low cost, fast and scalable serverless environment
- [Durable Objects](https://developers.cloudflare.com/durable-objects/): allow us to cache Proof of Work with low latency in-memory.
- [Hono](https://hono.dev/): A small, simple, and ultrafast web framework for the Edges

## Running locally

First, copy the `example.dev.vars` to `.dev.vars` and edit the WORKER_URLS with your own workers list separated with comma. Example:

```
RPC_URLS = "https://pow-rpc.com,http://127.0.0.1:7076"
```

Install dependencies:

```
pnpm install
```

Run:

```
npm run dev
```

## Usage

To generate a proof of work, we use the JSON HTTP POST requests just like [Nano Node RPC Protocol](https://docs.nano.org/commands/rpc-protocol/#work_generate)

```bash
curl --request POST \
  --url "http://127.0.0.1:7090" \
  --header "Content-Type: application/json" \
  --data '{
	"action": "work_generate",
	"hash": "DA112538B6566B5555725F724B281E013D7C5DE42498C71D9A1CD44B8AA0CD3A",
	"threshold": "fffffff800000000"
}'
```

**Threshold is optional**. When omitted, we use the SEND / CHANGE threshold by default.

JSON Response:

```json
{
	"worker": "http://127.0.0.1:7076",
	"work": "000020c3204e1b6a",
	"hash": "DA112538B6566B5555725F724B281E013D7C5DE42498C71D9A1CD44B8AA0CD3A",
	"threshold": "fffffff800000000",
	"startedAt": 1693983379659,
	"took": 1076,
	"cached": false
}
```

## Deploying

Fist, you will need a Cloudflare account with [Workers Paid plan](https://www.cloudflare.com/plans/developer-platform-pricing/) enabled. Currently costs 5 USD / month

Then login to your Cloudflare account:

```
pnpm wrangler login
```

Add the environments to your Cloudfler Worker:

```
pnpm wrangler secret put WORKER_URLS
```

Finally, deploy:

```
pnpm run deploy
```

## Donate Ӿ

If you find this project useful and want to support its development please consider donating:
**nano_3dqh8z8ncswmf7151gryu7mqpwbw4f68hi7d8g433omtuabfi438etyyp9ik**

<kbd><img src="https://i.ibb.co/Gs6yhv2/nano-wallet-js-qr-code.png" width="200px" height="200px" /></kbd>
