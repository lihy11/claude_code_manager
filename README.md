# cc_manage

`ccm` is an interactive full-screen TUI for managing multiple Claude provider/model/key profiles.
It includes a dashboard-style header, boxed pages, highlighted cursor selection, and centered input modals.
At each menu level, press `Esc` or `←` to return to the previous menu.

## Quick start

```bash
npm install
npm run build
node dist/cli.js
```

Optional: install globally in this repo for direct `ccm` command:

```bash
npm link
ccm
```

## Data files

- Profiles store: `~/.claude/cc-profiles.json`
- Claude settings synced target: `~/.claude/settings.json`
