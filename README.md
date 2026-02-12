# cc_manage

[中文文档](README.zh-CN.md)

`ccm` is an interactive full-screen TUI for managing multiple Claude provider/model/key profiles and syncing the active one to Claude settings.

### Goals

- Provide a single-command (`ccm`) workflow to create, edit, delete, and switch Claude profiles
- Rewrite `env` in `~/.claude/settings.json` whenever a profile is activated

### Features

- Full-screen TUI with modal prompts and quick back navigation (`Esc` / `←`)
- Profile list and active profile detail views
- Create, edit, delete, activate profiles, and resync settings.json
- One-time import from existing `~/.claude/settings.json`

### Capabilities

- Custom provider name, base URL, and API key
- Model modes: `none` / `sonnet_only` / `all_same` / `split_three`
- Extra environment variables via `extraEnv`
- Atomic writes to profile storage and settings.json

### Usage

```bash
npm install
npm run build
node dist/cli.js
```

Optional: link locally for the `ccm` command:

```bash
npm link
ccm
```

Common menu actions:

- View profile list (active badge)
- Add / edit / delete profiles
- Activate a profile
- View active profile details / resync settings.json

### Data files

- Profile store: `~/.claude/cc-profiles.json`
- Claude settings sync target: `~/.claude/settings.json`
