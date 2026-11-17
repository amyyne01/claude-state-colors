export type Phase = 'idle' | 'thinking' | 'tool' | 'done' | 'aborted' | 'error'
export type Live = { phase: Phase; detail: string; startedAt: number; seconds: number; tools: number }
export type Chip = { id: string; type: string; description: string; status: string }
export type Trace = { thought: string; tools: string[] }

declare module 'claude-code' {
  interface PluginState {
    'state-colors': { live: Live; agents: Chip[]; trace: Record<string, Trace> }
  }
}
