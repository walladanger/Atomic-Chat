/**
 * Migration v3 - renaming the product inside saved assistant instructions.
 *
 * This runs against a user's real assistant files, so the behaviour that
 * matters is not "does it rename" but what it leaves ALONE. Migrations v1 and
 * v2 replaced the whole instruction field, which was safe only while that text
 * was still the shipped default. By now a user may have written their own, and
 * overwriting it would destroy work with no way back.
 */
import { describe, expect, it } from 'vitest'

import { renameProductInInstructions } from './index'

describe('renameProductInInstructions', () => {
  it('renames the product where it appears', () => {
    expect(
      renameProductInInstructions('You are Atomic Chat, a helpful AI assistant.')
    ).toBe('You are Radium Chat, a helpful AI assistant.')
  })

  it('renames every occurrence, not just the first', () => {
    const before =
      'You are Atomic Chat. Atomic Chat is trained by Atomic Chat (https://atomic.chat).'
    const after =
      'You are Radium Chat. Radium Chat is trained by Radium Chat (https://atomic.chat).'

    expect(renameProductInInstructions(before)).toBe(after)
  })

  it('preserves the user\'s own wording around the name', () => {
    const before = [
      'Always answer in French.',
      'You are Atomic Chat, my personal assistant.',
      'Never use bullet points. Signed, Warwick.',
    ].join('\n')

    const result = renameProductInInstructions(before) as string

    // Only the eleven characters of the name may differ.
    expect(result).toBe(before.replace('Atomic Chat', 'Radium Chat'))
    expect(result).toContain('Always answer in French.')
    expect(result).toContain('Never use bullet points. Signed, Warwick.')
    expect(result.split('\n')).toHaveLength(3)
  })

  it('leaves the domain alone, which was not renamed', () => {
    const result = renameProductInInstructions(
      'Atomic Chat lives at https://atomic.chat'
    )

    expect(result).toBe('Radium Chat lives at https://atomic.chat')
  })

  it('returns instructions with no mention completely untouched', () => {
    const custom = 'You are a terse assistant. Answer in one sentence.'

    // The caller uses `===` to decide whether to write the file at all, and JS
    // compares primitive strings by value, so an unchanged instruction never
    // triggers a rewrite. (Deliberately not asserting reference identity: that
    // is not a thing JS strings have, and a mutation dropping the early-return
    // guard is genuinely equivalent rather than a bug this could catch.)
    expect(renameProductInInstructions(custom)).toBe(custom)
  })

  it('handles an assistant with no instructions at all', () => {
    expect(renameProductInInstructions(undefined)).toBeUndefined()
    expect(renameProductInInstructions('')).toBe('')
  })

  it('does not touch the old name embedded in a longer word', () => {
    // "Atomic Chatbot" is not the product; only the exact name is replaced,
    // and the trailing text must survive.
    expect(renameProductInInstructions('Use the Atomic Chatbot API')).toBe(
      'Use the Radium Chatbot API'
    )
  })
})
