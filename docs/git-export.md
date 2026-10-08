# Git export (knowledge as Markdown)

DAILY AI can write everything it has learned into a git repository as plain Markdown, so you can:
- feed it to Claude Code or Codex (`AGENTS.md`, `CLAUDE.md`, context files),
- review how your playbook changed in pull requests,
- keep an offline, portable copy.

## What gets exported
| Path | Content |
|---|---|
| `README.md` | Index with counts and links |
| `playbook/AI-ENGINEERING-PLAYBOOK.md` | Latest playbook |
| `playbook/versions/vX.Y.md` | Every playbook version (changelog in a comment) |
| `knowledge/<area>/<id>-<title>.md` | Knowledge items with front matter (area, status, tags) |
| `experiments/EXP-YYYY-NNN.md` | Experiments with results tables and decisions |
| `prompts/<key>-vN.md` | Every prompt version (active one marked) |
| `digests/YYYY-MM-DD.md` | Daily digests |
| `radar.md` | Technology radar grouped by ring |

These paths are **owned by the exporter** and rewritten on every run, so edit the content in DAILY AI rather than in the export. The exporter never stages or touches any other files in the repo.

## Setup
```bash
# 1. A working copy (it is created with `git init` if it doesn't exist)
git clone git@github.com:you/ai-engineering-knowledge.git /srv/knowledge-export

# 2. Configure (.env)
GIT_EXPORT_DIR=/srv/knowledge-export
GIT_EXPORT_PUSH=true            # push after each commit (needs credentials, see below)
GIT_AUTHOR_NAME="DAILY AI"
GIT_AUTHOR_EMAIL=daily-ai@example.com
```
For **push**, the repository's own git configuration is used (remote URL, SSH key or credential helper); DAILY AI never stores or logs git credentials. Simplest option: an HTTPS remote with a fine-grained token, set once with `git -C /srv/knowledge-export remote set-url origin https://<token>@github.com/you/repo.git`, on a dedicated repo.

### Docker Compose
Uncomment the `volumes` block of the `app` service (`./knowledge-export:/export`), set `GIT_EXPORT_DIR=/export`, and make the host directory writable by the container user (`chown -R 100:101 knowledge-export`, or match the `app` uid shown by `docker compose exec app id`). For pushing from the container, use an HTTPS remote with a token, as above.

## Running
- Automatically: the last step of the daily job (`… → notify → export`). It commits only when something changed.
- Manually: **Settings → Git export → Export to Git now**, or `POST /api/jobs/export`.

The commit message is `DAILY AI export YYYY-MM-DD: N file(s) changed`.
