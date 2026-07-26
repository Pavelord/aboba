import { mkdir } from 'node:fs/promises'
import cjs from '@rollup/plugin-commonjs'
import nodeResolve from '@rollup/plugin-node-resolve'
import swc from '@swc/core'
import { rollup } from 'rollup'
import esbuild from 'rollup-plugin-esbuild'

const plugin = 'UsbAudioRouteV4'
const manifest = await Bun.file(`./plugins/${plugin}/manifest.json`).json()
const hasher = new Bun.CryptoHasher('sha256')

await mkdir(`./dist/${plugin}`, { recursive: true })

const bundle = await rollup({
  input: `./plugins/${plugin}/${manifest.main}`,
  external: id => /^@(revenge-mod|vendetta)/.test(id) || id === 'react' || id === 'react-native',
  plugins: [
    nodeResolve(),
    cjs(),
    {
      name: 'swc',
      async transform(code, id) {
        if (!/\.(m?[jt]sx?|cts|mts)$/.test(id)) return null
        const ts = /\.(tsx?|cts|mts)$/.test(id)
        const result = await swc.transform(code, {
          filename: id,
          jsc: {
            externalHelpers: false,
            parser: {
              syntax: ts ? 'typescript' : 'ecmascript',
              tsx: id.endsWith('.tsx'),
              jsx: id.endsWith('.jsx'),
            },
          },
          env: {
            targets: 'fully supports es6',
            include: [
              'transform-block-scoping',
              'transform-classes',
              'transform-async-to-generator',
              'transform-async-generator-functions',
            ],
            exclude: [
              'transform-parameters',
              'transform-template-literals',
              'transform-nullish-coalescing-operator',
              'transform-object-rest-spread',
              'transform-optional-chaining',
              'transform-logical-assignment-operators',
            ],
          },
        })
        return result.code
      },
    },
    esbuild({ minifySyntax: true, minifyWhitespace: true }),
  ],
})

const result = await bundle.write({
  file: `./dist/${plugin}/index.js`,
  globals(id) {
    if (id === 'react') return 'React'
    if (id === 'react-native') return 'ReactNative'
    const dot = (value: string) => value.replaceAll('/', '.')
    if (id.startsWith('@vendetta')) return dot(id.substring(1))
    if (id.startsWith('@revenge-mod')) return `bunny${dot(id.substring(12))}`
    throw new Error(`Unable to resolve global for ${id}`)
  },
  format: 'iife',
  compact: true,
  exports: 'named',
})

const code = result.output[0].code
await bundle.close()
manifest.main = 'index.js'
manifest.hash = hasher.update(code).digest('hex')
await Bun.write(`./dist/${plugin}/manifest.json`, JSON.stringify(manifest))
console.log(`Built ${manifest.name}`)
