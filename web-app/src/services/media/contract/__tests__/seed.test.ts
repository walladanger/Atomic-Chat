/**
 * Decision D8 - who resolves a blank seed.
 *
 * Until now an absent seed meant "the provider picks one", and the ComfyUI
 * adapter duly randomised it inside buildGraph. That number was then
 * unrecoverable, so provenance could not answer "how did I make this?" and a
 * library "re-run" would quietly produce a different image.
 *
 * The user settled D8 on 2026-09-10: the CALLER resolves the seed, so the app
 * always knows the number it sent. That keeps the contract unchanged - a seed
 * is just a param with a value - and makes provenance truthful for every
 * provider at once rather than one adapter at a time.
 *
 * These tests are red until `resolveSeeds` exists.
 */
import { describe, expect, it } from 'vitest'

import { resolveSeeds } from '../params'
import type { MediaParamSpec } from '../params'

const SEED_SPEC: MediaParamSpec = {
  id: 'seed',
  type: 'seed',
  group: 'sampling',
  label: 'Seed',
  order: 1,
}

const STEPS_SPEC: MediaParamSpec = {
  id: 'steps',
  type: 'int',
  group: 'sampling',
  label: 'Steps',
  min: 1,
  max: 50,
  order: 0,
}

describe('resolveSeeds', () => {
  it('fills a blank seed with a number the caller can record', () => {
    const resolved = resolveSeeds([SEED_SPEC], { prompt: 'a cat' }, () => 0.5)

    expect(typeof resolved.seed).toBe('number')
    expect(Number.isInteger(resolved.seed)).toBe(true)
  })

  it('leaves a seed the user chose exactly as it was', () => {
    const resolved = resolveSeeds([SEED_SPEC], { seed: 1234 }, () => 0.5)

    expect(resolved.seed).toBe(1234)
  })

  it('does not invent a seed when the model declares none', () => {
    const resolved = resolveSeeds([STEPS_SPEC], { steps: 20 }, () => 0.5)

    expect(resolved).not.toHaveProperty('seed')
  })

  it('respects the declared bounds so the provider never rejects it', () => {
    const bounded: MediaParamSpec = { ...SEED_SPEC, min: 10, max: 20 }

    // Both ends of the random range, since an off-by-one here submits a value
    // the provider refuses - and only for users who left the seed blank.
    const low = resolveSeeds([bounded], {}, () => 0)
    const high = resolveSeeds([bounded], {}, () => 0.999999)

    expect(low.seed).toBe(10)
    expect(high.seed).toBeLessThanOrEqual(20)
    expect(high.seed).toBeGreaterThanOrEqual(10)
  })

  it('resolves whatever the model calls its seed, not a hardcoded "seed" key', () => {
    const named: MediaParamSpec = { ...SEED_SPEC, id: 'noise_seed' }

    const resolved = resolveSeeds([named], {}, () => 0.5)

    expect(typeof resolved.noise_seed).toBe('number')
  })

  it('does not mutate the params it was given', () => {
    const original: Record<string, unknown> = { prompt: 'a cat' }

    resolveSeeds([SEED_SPEC], original, () => 0.5)

    expect(original).not.toHaveProperty('seed')
  })

  it('produces different seeds across submissions, so a re-run varies when asked', () => {
    let call = 0
    const random = () => [0.1, 0.9][call++] ?? 0

    const first = resolveSeeds([SEED_SPEC], {}, random)
    const second = resolveSeeds([SEED_SPEC], {}, random)

    expect(first.seed).not.toBe(second.seed)
  })
})
