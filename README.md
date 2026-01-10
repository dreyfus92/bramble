# Bramble 

A Discord bot for managing book club activities with polls, nominations, and discussions.

## Features

- **Two-Phase Monthly Poll System** - Monthly book selection through nominations → Phase 1 (multi-vote) → Phase 2 (single-vote) → Winner tracking
- **Book Nominations** - Monthly book nomination system with author tracking (format: "Title by Author")
- **Question Submission** - Submit discussion questions for books with chaining support (add multiple questions in one session)
- **Book Lookup** - Quick book information lookup using Open Library API (description, rating, cover, genres)
- **Book Management** - Create and manage book entries with meeting dates

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
│   ├── commands/            # Modular command handlers
│   │   ├── utility.ts      # ping, help
│   │   ├── questions.ts    # Question submission flow
│   │   ├── books.ts        # Book lookup & management
│   │   ├── polls.ts        # Two-phase poll system
│   │   └── index.ts        # Barrel export
│   ├── core/                # Core services
│   │   ├── db-client.ts     # Database client
│   │   ├── db-schema.ts     # Drizzle schema
│   │   ├── discord-*.ts     # Discord gateway/REST
│   │   ├── groq.ts          # LLM integration
│   │   ├── effect-cache.ts  # Caching service
│   │   └── event-bus.ts     # Internal events
│   ├── services/            # Bot services
│   ├── static/              # Environment config
│   └── utils/               # Utilities (embed builder, helpers)
├── drizzle.config.ts        # Database config
├── Dockerfile               # Docker container configuration
├── .dockerignore            # Docker build exclusions
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

### Docker Deployment

The bot includes a Dockerfile for containerized deployment. Build and run with Docker:

```bash
# Build the image
docker build -t bramble:latest .

# Run the container
docker run --env-file .env bramble:latest
```

The Dockerfile uses a multi-stage build for optimized image size and can be deployed to platforms like Dokploy or any Docker-compatible hosting service. Ensure all required environment variables are set in your deployment platform.

## Commands

### Utility Commands

| Command | Description |
|---------|-------------|
| `/ping` | Check if bot is running |
| `/help` | List all available commands |

### Book Commands

| Command | Description |
|---------|-------------|
| `/quickcheck [book] [author?]` | Look up a book's description and rating from Open Library |
| `/createbook [title]` | Add a new book to the club list |
| `/getbook` | Browse and manage existing books |

### Question Commands

| Command | Description |
|---------|-------------|
| `/submitquestion [book] [question]` | Submit a discussion question (supports chaining with "Add Another" button) |
| `/listquestions [book]` | View all submitted questions for a book (with plain text copy option) |

### Poll System Commands

| Command | Description |
|---------|-------------|
| `/nominatebook [title] [author]` | Nominate a book for the monthly book club selection |
| `/listnominations [month?]` | View all book nominations for a month (defaults to current month) |
| `/pollstatus` | View current poll standings |
| `/pastwinners` | View past monthly winners |

### Admin-Only Poll Commands

| Command | Description |
|---------|-------------|
| `/startpoll [month?]` | Start Phase 1 multi-vote poll from nominations |
| `/closepoll` | Close the active poll and display final results |
| `/startfinalpoll` | Start Phase 2 single-vote poll with top 3 books from Phase 1 |
| `/clearnominations [month?]` | Clear all nominations for a month |

## License

MIT
