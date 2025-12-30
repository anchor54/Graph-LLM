# Graph LLM Workspace

An interactive workspace application that combines LLM chat capabilities with node-based graph visualization, built with Next.js 16.

## Features

- **AI Chat Interface**: Interact with Google's Gemini LLM.
- **Graph Visualization**: Visual representation of nodes and relationships using ReactFlow and Dagre layout engine.
- **Workspace Organization**: Folder and file tree structure for organizing content.
- **Persistent Storage**: Data persistence using PostgreSQL (via Supabase) and Prisma ORM.
- **Modern UI**: Clean interface built with Tailwind CSS v4, Radix UI, and Lucide icons.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase), Prisma ORM
- **AI Integration**: Google Generative AI (Gemini)
- **Visualization**: ReactFlow, Dagre
- **Styling**: Tailwind CSS, PostCSS
- **Components**: Radix UI, React Resizable Panels

## Prerequisites

Before you begin, ensure you have the following:

- Node.js (v18+ recommended)
- A Google Cloud project with Gemini API access
- A Supabase account (or any PostgreSQL database)

## Environment Variables

Create a `.env` file in the root directory and add the following variables:

```env
# Database connection string (e.g. from Supabase Transaction Pooler)
DATABASE_URL="postgresql://user:password@host:port/database"

# Google Gemini API Key
GEMINI_API_KEY="your-gemini-api-key"
```

## Getting Started

1. **Clone the repository:**

   ```bash
   git clone <repository-url>
   cd graph-llm-workspace
   ```

2. **Install dependencies:**

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. **Set up the database:**

   Push the Prisma schema to your database:

   ```bash
   npx prisma migrate dev
   ```

   (Optional) If you need to reset the database during development:
   ```bash
   npm run db:reset
   ```

4. **Run the development server:**

   ```bash
   npm run dev
   ```

5. **Open the application:**
   Visit [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `src/app`: Next.js App Router pages and API routes.
- `src/components`: Reusable UI components (Workspace, UI kit, etc.).
- `src/context`: React Context providers (e.g., WorkspaceContext).
- `src/lib`: Utility functions and configuration (Gemini, Prisma).
- `prisma`: Database schema and migrations.

## License

[MIT](LICENSE)
