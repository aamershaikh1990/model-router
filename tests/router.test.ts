import { expect, test } from 'claude-code/testing'
import { pickTier } from '../hooks/register'

test('small jobs go to haiku', () => {
  expect(pickTier('fix the typo in README')).toBe('haiku')
  expect(pickTier('what is a closure?')).toBe('haiku')
  expect(pickTier('write a commit message for this')).toBe('haiku')
})

test('ordinary work goes to sonnet', () => {
  expect(pickTier('add a parent dashboard page showing weekly quest stats')).toBe('sonnet')
  expect(pickTier('')).toBe('sonnet')
})

test('big jobs go to opus', () => {
  expect(pickTier('refactor the auth module and migrate sessions to JWT across the codebase')).toBe('opus')
  expect(pickTier('debug why the leaderboard has a race condition when two kids finish at once')).toBe('opus')
})

test('an opus prompt gets the fable-playbook context, other prompts do not', async ($, on) => {
  const seen: (readonly string[] | undefined)[] = []
  on('store.get', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    seen.push(e.context)
    return { text: e.text }
  })
  await $.prompt.submit({ text: 'refactor the auth module and migrate sessions across the codebase', wait: false, origin: { kind: 'composer' } })
  expect(seen[0]?.some(c => c.includes('fable-playbook'))).toBe(true)

  await $.prompt.submit({ text: 'fix the typo in README', wait: false, origin: { kind: 'composer' } })
  expect(seen[1]).toBe(undefined)
})
