// Minimal ESM resolve hook: maps the `@/*` tsconfig alias to the project
// root so `node --experimental-strip-types` can run our TS smoke test.
import { pathToFileURL } from 'node:url'
import { resolve as resolvePath } from 'node:path'
import fs from 'node:fs'

const root = process.cwd()

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = resolvePath(root, specifier.slice(2))
    for (const ext of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
      if (fs.existsSync(base + ext) && fs.statSync(base + ext).isFile()) {
        return next(pathToFileURL(base + ext).href, context)
      }
    }
  }
  return next(specifier, context)
}
