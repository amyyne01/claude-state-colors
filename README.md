# state-colors

A Claude Code mod that puts a **colored live band above your prompt**, so you can see at a glance what Claude is doing, what its subagents are thinking, and which tools they are running.

![A 16-second loop: the badge goes ready, thinking, running; two subagents appear in the agent list with their thinking and tool calls; a toast says done](assets/demo.svg)

> The images here are drawn mock-ups of the real terminal UI, not captures of a live session.

## What you get

| Part | What it shows |
| --- | --- |
| **State badge** | Above the prompt: a filled color pill for ready, thinking, running (with the tool name), done, stopped or error. |
| **Follows your view** | Switch to a subagent in the agent list and the badge, timer and tool count become that agent's (its name appears beside them). Switch back to main and they return to the main loop's. |
| **Timer, tool count, agent count** | Seconds and tool calls for the current or last turn, and how many subagents are live. |
| **Agent rows** | Under the prompt, in Claude Code's own agent list: one block per live subagent with a status pill (running, waiting, idle, failed), its name (`#1`, `#2` when several share one), its one-line thinking and its last tool calls, colored by kind. |
| **Tool row bar** | A colored `▎` at the left of every tool call in the transcript. |
| **Long-turn toast** | A toast such as `✓ done after 47s` when a turn takes 30 s or more. |

![Badge states and tool bar colors](assets/states.svg)

## Install

At the prompt of a terminal session:

```
/plugin install state-colors --marketplace amyyne01/claude-state-colors
```

From a shell:

```
claude plugin install state-colors --marketplace amyyne01/claude-state-colors
```

Answer `y` to add the marketplace, then pick a scope. The mod is active in that session straight away and in every later one.

## How it works

It is a single hooks module (`hooks/register.tsx`) with no dependencies:

- `turn.start`, `tool.call` and `turn.complete` keep the current state in `$.state`.
- A `ui.render` hook on `AbovePrompt` draws the badge row from that state.
- A `ui.render` hook on `AgentRow` replaces the body of each subagent's row in the agent list under the prompt.
- A `ui.render` hook on `ToolUse` adds the colored bar to each tool row.
- A `turn.step` stream hook reads each subagent's thinking, and `$.agent.list()` supplies the chips. Both are buffered and flushed once a second so streaming never redraws on every token.

## Customize

Everything lives in `hooks/register.tsx`:

- `LOOK` sets the badge colors, icons and labels.
- `TOOL_COLOR` maps tool names to bar colors.
- The `secs >= 30` check in `turn.complete` sets the toast threshold.

Colors are the terminal's named colors (`green`, `magenta`, `cyan`, ...), so they follow your terminal theme.

## Limits

- **Terminal only.** `$.theme.set` themes paint in the desktop and mobile apps, not the terminal, so this mod colors only the elements a terminal mod can reach.
- **Tool bar is one character.** The terminal's `Box` has no left-only border, so on multi-line tool output only the first line carries the bar.
- **No colored status line.** The engine draws a mod's status line in plain warning style, so the colors live in the band instead.
- **Subagents only.** Background shell tasks are not tracked, because the API lists agents, not shell jobs.
- **Each loop keeps its own state.** A subagent never changes the main badge; the badge shows whichever loop you are viewing.
- **The `● main` row is the engine's.** A mod can restyle subagent rows but not the main one.

## Test

```
claude plugin test .
```

`hooks/state.test.tsx` checks that a subagent's tool call leaves the main badge alone.

## License

MIT
