import type { EngineInterface, Register } from 'claude-code'

type Tier = 'haiku' | 'sonnet' | 'opus'
type Mode = Tier | 'auto' | 'off'

const MODES: readonly Mode[] = ['auto', 'off', 'haiku', 'sonnet', 'opus']
const MODE_KEY = 'mode'
const ADVISOR_FOR_OPUS = 'claude-fable-5-2'
const OPUS_CONTEXT =
  'Model router: this task was routed to Opus. Before starting, invoke the fable-playbook skill ' +
  '(listed as anthropic-skills:fable-playbook) with the Skill tool and follow its working method. ' +
  'The advisor is set to Fable for this turn.'

// Words that signal multi-step, design-level or high-stakes work.
const BIG = /\b(architect|design|refactor|migrat\w*|rewrite|from scratch|implement|build (a|an|the)|debug|root cause|race condition|security|performance|optimi[sz]e|plan|review (the|this|my)|across (the )?(codebase|repo)|whole (codebase|repo|project)|investigate|why (does|is|did))\b/i
// Words that signal a lookup, a one-liner or a mechanical edit.
const SMALL = /\b(typo|rename|format|lint|what is|what's|where is|list|show me|explain this (line|error)|translate|summari[sz]e|commit message|bump|one[- ]liner|fix the import|add a comment)\b/i

/** Cheap, local, zero-token heuristic: no model call to decide which model to call. */
export function pickTier(text: string): Tier {
  const t = text.trim()
  if (t === '') return 'sonnet'
  const words = t.split(/\s+/).length
  const lines = t.split('\n').length
  const codeBlocks = (t.match(/```/g) ?? []).length / 2
  let score = 0
  if (words > 150) score += 2
  else if (words > 50) score += 1
  if (lines > 30 || codeBlocks >= 2) score += 1
  if (BIG.test(t)) score += 2
  if (SMALL.test(t)) score -= 2
  if (score <= -1) return 'haiku'
  if (score >= 2) return 'opus'
  return 'sonnet'
}

async function readMode($: EngineInterface): Promise<Mode> {
  const v = await $.store.get(MODE_KEY)
  return MODES.includes(v as Mode) ? (v as Mode) : 'auto'
}

function chooseTier(mode: Mode, text: string, last: Tier): Tier {
  if (mode === 'auto') return text.trim() === '' ? last : pickTier(text)
  return mode === 'off' ? last : mode
}

export const register: Register = on => {
  // Module state: resets on reload, which is fine — the next turn re-picks.
  const tierByTurn = new Map<string, Tier>()
  let lastTier: Tier = 'sonnet'
  // True only while an Opus-routed turn runs: the settings.read hook below reads it.
  let isOpusTurn = false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'route',
      description: 'Model router: /route [auto|off|haiku|sonnet|opus]',
    })
    const mode = await readMode($)
    $.ui.status(mode === 'off' ? undefined : `router: ${mode}`)
    return next(e)
  })

  on('command.run', { command: 'route' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    if (want === '') {
      const mode = await readMode($)
      return { text: `Model router mode: ${mode}${mode === 'auto' ? ` (last pick: ${lastTier})` : ''}. Options: ${MODES.join(', ')}.` }
    }
    if (!MODES.includes(want as Mode)) {
      return { text: `Unknown mode "${want}". Use one of: ${MODES.join(', ')}.` }
    }
    await $.store.set(MODE_KEY, want)
    $.ui.status(want === 'off' ? undefined : `router: ${want}`)
    return { text: `Model router set to ${want}.` }
  })

  // Opus-routed prompts also get the fable-playbook skill, as context the model reads.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta || e.text.trim() === '') return next(e)
    const mode = await readMode($)
    if (mode === 'off' || chooseTier(mode, e.text, lastTier) !== 'opus') return next(e)
    return next({ ...e, context: [...(e.context ?? []), OPUS_CONTEXT] })
  }).catch(($, e, next) => next(e))

  // The advisor is Fable while an Opus-routed turn runs; otherwise settings stay as they are.
  on('settings.read', async ($, e, next) => {
    const settings = await next(e)
    return isOpusTurn ? { ...settings, advisorModel: ADVISOR_FOR_OPUS } : settings
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    // Subagents keep whatever model their definition asked for.
    if (e.agentId === undefined) {
      const mode = await readMode($)
      if (mode !== 'off') {
        const tier = chooseTier(mode, e.text, lastTier)
        tierByTurn.set(e.turnId, tier)
        lastTier = tier
        const wasOpus = isOpusTurn
        isOpusTurn = tier === 'opus'
        if (wasOpus !== isOpusTurn) void $.settings.read()
        $.ui.status(`router: ${mode === 'auto' ? `auto → ${tier}` : tier}`)
      }
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const tier = e.agentId === undefined ? tierByTurn.get(e.turnId) : undefined
    return yield* next(tier ? { ...e, model: tier } : e)
  })

  on('turn.complete', async ($, e, next) => {
    tierByTurn.delete(e.turnId)
    if (isOpusTurn) {
      isOpusTurn = false
      void $.settings.read()
    }
    return next(e)
  })
}
