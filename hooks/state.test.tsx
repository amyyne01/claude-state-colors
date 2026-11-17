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
