// Encryption for the recipe book (AES-256-GCM).
//
// The recipes ship encrypted (recipeData.ts) so they can't be read casually on
// GitHub or inside the installed app; the app decrypts them in memory at run time.
// Note: the key is part of this open-source code, so this hides the recipes from
// normal users but is NOT strong protection against a determined developer.
//
// Edit the readable copy in recipes/recipes.json (local only, git-ignored), then:
//   npm run recipes:encrypt   -> updates src/shared/ai/recipeData.ts
//   npm run recipes:decrypt   -> recreates recipes/recipes.json from the encrypted data

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const KEY = Buffer.from('e4iZN9CWxtZq57XKpot5u6hoed7UuSkhcSUVFXyw2Zg=', 'base64')

/** plaintext -> base64( iv(12) | authTag(16) | ciphertext ) */
export function encryptText(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64')
}

/** base64( iv | authTag | ciphertext ) -> plaintext (throws if the data was altered) */
export function decryptText(payload: string): string {
  const buf = Buffer.from(payload, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', KEY, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
}
