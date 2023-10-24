import { checkHash, checkWork } from 'nanocurrency'
import { blake2bFinal, blake2bInit, blake2bUpdate } from 'blakejs'

export function verifyWorkThreshold(hash: string, work: string): string {
	if (!checkHash(hash)) throw new Error('Hash is not valid')
	if (!checkWork(work)) throw new Error('Work is not valid')

	const hashBytes = hexToByteArray(hash)
	const workBytes = hexToByteArray(work).reverse()

	const context = blake2bInit(8)
	blake2bUpdate(context, workBytes)
	blake2bUpdate(context, hashBytes)
	const threshold = blake2bFinal(context).reverse()
	return byteArrayToHex(threshold)
}

export function hexToByteArray(hex: string): Uint8Array {
	if (!hex) {
		return new Uint8Array()
	}

	const a = []
	for (let i = 0; i < hex.length; i += 2) {
		a.push(parseInt(hex.substr(i, 2), 16))
	}

	return new Uint8Array(a)
}

export function byteArrayToHex(byteArray: Uint8Array): string {
	if (!byteArray) {
		return ''
	}

	let hexStr = ''
	for (let i = 0; i < byteArray.length; i++) {
		let hex = (byteArray[i] & 0xff).toString(16)
		hex = hex.length === 1 ? `0${hex}` : hex
		hexStr += hex
	}

	return hexStr.toUpperCase()
}
