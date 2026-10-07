# Installation

## Requirements
- Node.js ≥ 20.9 (22 LTS recommended), npm 10
- PostgreSQL 16 (14+ works)
- Docker + Docker Compose v2 (production)

## Local development
```bash
git clone https://github.com/siwapanD/Daily-AI.git && cd Daily-AI
npm install
cp .env.example .env
# Database: use an existing PostgreSQL, or:
docker run -d --name dailyai-db -p 5432:5432 -e POSTGRES_USER=dailyai -e POSTGRES_PASSWORD=dailyai -e POSTGRES_DB=dailyai postgres:16-alpine
npm run db:migrate && npm run db:seed
npm run dev
```
Open http://localhost:3000 and click **Fetch Now**, then **Analyze Now**.

## Running tests
Unit tests need nothing else. The integration test needs a disposable database. It **drops and recreates** the `public` schema of `TEST_DATABASE_URL` (default `postgres://dailyai:dailyai@localhost:5432/dailyai_test`) and is skipped if that database is unreachable.
```bash
createdb -O dailyai dailyai_test   # once
npm test
npm run check                      # lint + typecheck + tests + build
```

## Production
See [deployment.md](deployment.md).
