import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Chip, Live, Phase, Trace } from '../types'

const live = atom(
  { plugin: 'state-colors', key: 'live' } as const,
  { phase: 'idle', detail: '', startedAt: 0, seconds: 0, tools: 0 } as Live,
)

const agents = atom({ plugin: 'state-colors', key: 'agents' } as const, [] as Chip[])

const trace = atom({ plugin: 'state-colors', key: 'trace' } as const, {} as Record<string, Trace>)

// Live per-agent buffer, flushed to the atom once a second so streaming doesn't redraw on every token.
const buf: Record<string, Trace> = {}
const slot = (id: string): Trace => (buf[id] ??= { thought: '', tools: [] })
const one = (t: string, n: number): string => t.replace(/\s+/g, ' ').trim().slice(-n)
const arg = (e: Record<string, unknown>): string => one(String(e.command ?? e.file_path ?? e.pattern ?? e.path ?? e.description ?? e.prompt ?? ''), 36)

// Main-loop tool calls still running (parallel calls finish out of order).
let inflight = 0
const cut = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1)}…` : t)

const AGENT_COLOR: Record<string, string> = { running: 'magenta', waiting: 'yellow', idle: 'blue', pending: 'cyan', failed: 'red', killed: 'red', completed: 'green' }

// Badge colour per state; label text is black on a filled background so it reads on any theme.
const LOOK: Record<Phase, { bg: string; icon: string; label: string }> = {
  idle: { bg: 'green', icon: '●', label: 'READY' },
  thinking: { bg: 'magenta', icon: '◆', label: 'THINKING' },
  tool: { bg: 'cyan', icon: '▶', label: 'RUNNING' },
  done: { bg: 'green', icon: '✓', label: 'DONE' },
  aborted: { bg: 'yellow', icon: '■', label: 'STOPPED' },
  error: { bg: 'red', icon: '!', label: 'ERROR' },
}


// Colour of a tool row's gutter bar, by what the tool does.
const TOOL_COLOR = (tool: string): string =>
  /^(Read|Grep|Glob|LS|NotebookRead)$/.test(tool) ? 'blue'
  : /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool) ? 'yellow'
  : /^(Bash|PowerShell)$/.test(tool) ? 'cyan'
  : /^(Agent|Task|Workflow)$/.test(tool) ? 'magenta'
  : /^(Web|mcp__)/.test(tool) ? 'green'
  : 'white'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(1000, async () => {
      const now: Chip[] = (await $.agent.list()).map(a => ({ id: a.id, type: a.type, description: a.description, status: a.status }))
      if (JSON.stringify(await read($, agents)) !== JSON.stringify(now)) await update($, agents, () => now)
      for (const id of Object.keys(buf)) if (!now.some(a => a.id === id)) delete buf[id]
      const snap: Record<string, Trace> = JSON.parse(JSON.stringify(buf))
      if (JSON.stringify(await read($, trace)) !== JSON.stringify(snap)) await update($, trace, () => snap)
      $.ui.status(undefined)
    })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const id = e.agentId
    const stream = next(e)
    for await (const c of stream) {
      if (id !== undefined && (c.kind === 'thinking' || c.kind === 'text')) {
        const t = slot(id)
        t.thought = one(t.thought + c.text, 140)
      }
      yield c
    }
    return await stream.result
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    inflight = 0
    const now = await $.clock.now()
    await update($, live, () => ({ phase: 'thinking' as Phase, detail: '', startedAt: now, seconds: 0, tools: 0 }))
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const t = slot(e.agentId)
      t.tools = [...t.tools, `${e.tool} ${arg(e as unknown as Record<string, unknown>)}`].slice(-3)
      return next(e)
    }
    inflight += 1
    await update($, live, s => ({ ...s, phase: 'tool' as Phase, detail: e.tool, tools: s.tools + 1 }))
    const ran = await next(e)
    inflight = Math.max(0, inflight - 1)
    const isOk = ran.deny === undefined && ran.isError !== true
    const phase: Phase = inflight > 0 ? 'tool' : isOk ? 'thinking' : 'error'
    await update($, live, s => ({ ...s, phase }))
    return ran
  }).catch((_$, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    inflight = 0
    const now = await $.clock.now()
    const phase: Phase = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'aborted' : 'error'
    await update($, live, s => ({ ...s, phase, detail: '', seconds: Math.round((now - s.startedAt) / 1000) }))
    const secs = Math.round((now - (await read($, live)).startedAt) / 1000)
    if (secs >= 30) $.ui.toast(`${LOOK[phase].icon} ${LOOK[phase].label.toLowerCase()} after ${secs}s`)
    return next(e)
  })

  // State stays above the prompt: the badge, timer, tool count and a one-word agent summary.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, live)
    const l = LOOK[s.phase]
    const all = (await read($, agents)).filter(a => a.status !== 'completed' && a.status !== 'killed')
    const stats = s.startedAt === 0 ? '' : `${s.seconds > 0 ? `${s.seconds}s  ` : ''}${s.tools} tool${s.tools === 1 ? '' : 's'}`

    return (
      <Box>
        <Text backgroundColor={l.bg} color="black">{` ${l.icon} ${l.label} `}</Text>
        {s.detail !== '' && <Text color={l.bg}>{`  ${s.detail}`}</Text>}
        {stats !== '' && <Text color={l.bg} dimColor>{`  ${stats}`}</Text>}
        {all.length > 0 && <Text color="magenta" dimColor>{`  ⚑ ${all.length} agent${all.length === 1 ? '' : 's'}`}</Text>}
      </Box>
    )
  })

  // Each subagent's block lives in the engine's own agent list under the prompt, in place of its row body.
  on('ui.render', { component: 'AgentRow' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const a = e.props
    const W = Math.max(30, a.columns ?? 80)
    const t = (await read($, trace))[a.id]
    const list = await read($, agents)
    const base = a.description !== '' ? a.description : a.type
    const same = list.filter(o => (o.description !== '' ? o.description : o.type) === base)
    const name = cut(same.length > 1 ? `${base} #${same.findIndex(o => o.id === a.id) + 1}` : base, 28)
    const color = AGENT_COLOR[a.status] ?? 'white'
    const budget = W - 6
    const tools: string[] = []
    let used = 0
    for (const x of t?.tools ?? []) {
      const seg = `▎${cut(x, 24)}`
      if (used + seg.length + 2 > budget) break
      tools.push(seg)
      used += seg.length + 2
    }

    return (
      <Box flexDirection="column">
        <Box>
          <Text backgroundColor={color} color="black">{` ${a.status} `}</Text>
          <Text bold>{` ${name}`}</Text>
          {a.description !== '' && <Text dimColor>{`  ${cut(a.type, 18)}`}</Text>}
        </Box>
        {t !== undefined && t.thought !== '' && (
          <Text dimColor>{`  ◇ ${t.thought.length > budget ? `…${t.thought.slice(-(budget - 1))}` : t.thought}`}</Text>
        )}
        {tools.length > 0 && (
          <Box>
            <Text>{'  '}</Text>
            {tools.map((x, k) => (
              <Text key={`k${k}`} color={TOOL_COLOR(x.slice(1).split(' ')[0] ?? '')}>{`${x}  `}</Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const { Box, Text } = $.ui.resolve(e)
    const color = e.props.isErrored ? 'red' : e.props.isInterrupted ? 'yellow' : TOOL_COLOR(e.props.tool)
    const row = await next(e)

    return (
      <Box>
        <Text color={color} bold>{'▎'}</Text>
        {row}
      </Box>
    )
  })
}
