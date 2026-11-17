import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'state-colors',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('a subagent loop does not change the main badge', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub-1' })

  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /READY/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /RUNNING|THINKING/ })).toBeFalsy()
  await ui.unmount()
})

test('a subagent row shows its status and name', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({
    plugin: 'state-colors',
    component: 'AgentRow',
    surface: 'terminal',
    requestId: 'sub-1',
    props: {
      id: 'sub-1',
      description: 'Fix baseline',
      type: 'general-purpose',
      status: 'running',
      hasRow: true,
      rowIds: ['sub-1'],
      isHidden: false,
    },
  } as never)

  expect(await ui.find({ type: 'Text', text: /running/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Fix baseline/ })).toBeTruthy()
  await ui.unmount()
})

test('viewing a subagent shows its own state, main stays READY', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'sub-1' })

  const main = await $.ui.mount(BAND)
  expect(await main.find({ type: 'Text', text: /READY/ })).toBeTruthy()
  await main.unmount()

  const sub = await $.ui.mount({ ...BAND, props: { ...BAND.props, view: { agentId: 'sub-1' } } })
  expect(await sub.find({ type: 'Text', text: /THINKING/ })).toBeTruthy()
  expect(await sub.find({ type: 'Text', text: /READY/ })).toBeFalsy()
  await sub.unmount()
})
