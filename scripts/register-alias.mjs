// Registers the `@/*` alias resolve hook for `node --import`.
import { register } from 'node:module'
register('./alias-loader.mjs', import.meta.url)
