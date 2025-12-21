# Bramble 

A Discord bot for managing book club activities with polls, meetings, discussions, and AI-powered Q&A.

## Features

- **Custom Polls** - Create polls with button voting for book selections, discussion topics, etc.
- **Book Sessions** - Manage reading sessions with start/end dates
- **Question Submission** - Members can submit questions for book discussions
- **Meeting Scheduler** - Schedule and manage book club meetings with reminders
- **AI Q&A** - Ask questions powered by Groq LLM with rate limiting
- **Data Export** - Export poll results and session data to Google Sheets

## Tech Stack

- **Runtime**: Node.js 22+
- **Language**: TypeScript with [Effect](https://effect.website/)
- **Discord**: [dfx](https://github.com/tim-smart/dfx) (Effect-based Discord library)
- **Database**: [Turso](https://turso.tech/) (libsql) with [Drizzle ORM](https://orm.drizzle.team/)
- **LLM**: [Groq](https://groq.com/) for fast AI responses

## Project Structure

```
bramble/
├── src/
│   ├── main.ts              # Entry point
│   ├── core/                # Core services
│   │   ├── db-client.ts     # Database client
│   │   ├── db-schema.ts     # Drizzle schema
│   │   ├── discord-*.ts     # Discord gateway/REST
│   │   ├── groq.ts          # LLM integration
│   │   ├── effect-cache.ts  # Caching service
│   │   └── event-bus.ts     # Internal events
│   ├── services/            # Bot services
│   ├── static/              # Environment config
│   └── utils/               # Utilities
├── drizzle.config.ts        # Database config
├── package.json
└── tsconfig.json
```

## Setup

### Prerequisites

- Node.js 22+
- pnpm
- Turso database
- Discord bot token
- Groq API key

### Environment Variables

Create a `.env` file:

```env
# Discord
DISCORD_BOT_TOKEN=your_bot_token

# Database (Turso)
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your_auth_token

# Groq LLM
GROQ_API_KEY=your_groq_key

# Optional
DEBUG=false
HTTP_HOST=0.0.0.0
HTTP_PORT=3000
```

### Installation

```bash
pnpm install
```

### Database Setup

```bash
# Push schema to database
pnpm db:push

# Or generate and run migrations
pnpm db:generate
pnpm db:migrate
```

### Development

```bash
pnpm dev
```

### Production

```bash
pnpm build
pnpm start
```

## Commands

| Command | Description |
|---------|-------------|
| `/ping` | Check if bot is running |
| `/poll create` | Create a new poll |
| `/poll end` | End a poll and show results |
| `/question submit` | Submit a discussion question |
| `/question list` | View submitted questions |
| `/meeting schedule` | Schedule a book club meeting |
| `/meeting list` | List upcoming meetings |
| `/ask` | Ask the AI a question |
| `/export` | Export data to Google Sheets |

## License

MIT
