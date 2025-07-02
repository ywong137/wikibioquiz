# Wikipedia Guessing Game

## Overview

This is a full-stack web application that implements a Wikipedia-based guessing game. Players are presented with information about famous people from Wikipedia and must guess who they are. The application tracks scoring, streaks, and provides an engaging game experience with modern UI components.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Build Tool**: Vite for development and production builds
- **UI Components**: Comprehensive shadcn/ui component system with Radix UI primitives

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API endpoints
- **Development Server**: Custom Vite integration for development mode
- **Build System**: esbuild for production bundling

### Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM
- **Database Provider**: Neon Database (@neondatabase/serverless)
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Development Storage**: In-memory storage implementation for development/testing
- **Session Management**: PostgreSQL-based session storage with connect-pg-simple

## Key Components

### Game Logic
- **Game Sessions**: Persistent game state tracking score, streaks, and rounds
- **Wikipedia Integration**: Fetches and processes Wikipedia data for famous people
- **Scoring System**: Points-based system with streak multipliers
- **Progress Tracking**: Comprehensive statistics including best streaks and accuracy

### Data Models
- **Users**: Basic user authentication system
- **Game Sessions**: Tracks individual game instances with comprehensive statistics
- **Wikipedia Person**: Structured data for person information including hints and sections

### UI Components
- **Game Interface**: Clean, modern game board with hints and input
- **Statistics Display**: Real-time score and streak tracking
- **Responsive Design**: Mobile-optimized interface
- **Feedback System**: Toast notifications for user interactions

## Data Flow

1. **Game Initialization**: User starts a new game session
2. **Person Fetching**: System retrieves random Wikipedia person data
3. **User Interaction**: Player submits guesses through the game interface
4. **Validation**: Server validates guesses and updates game state
5. **Feedback**: Real-time updates to UI with scoring and progress
6. **Persistence**: Game state saved to database for continuity

## External Dependencies

### Core Dependencies
- **@tanstack/react-query**: Server state management and caching
- **drizzle-orm**: Type-safe database operations
- **@neondatabase/serverless**: Serverless PostgreSQL connection
- **express**: Web server framework
- **react**: Frontend framework
- **wouter**: Lightweight routing
- **zod**: Runtime type validation

### UI Dependencies
- **@radix-ui/***: Accessible UI primitive components
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Component variant management
- **lucide-react**: Icon system

### Development Dependencies
- **vite**: Build tool and development server
- **typescript**: Type system
- **drizzle-kit**: Database schema management
- **tsx**: TypeScript execution for development

## Deployment Strategy

### Build Process
1. **Frontend Build**: Vite builds React application to `dist/public`
2. **Backend Build**: esbuild bundles server code to `dist/index.js`
3. **Database Setup**: Drizzle migrations applied via `db:push` command

### Environment Configuration
- **DATABASE_URL**: PostgreSQL connection string (required)
- **NODE_ENV**: Environment mode (development/production)
- **REPL_ID**: Replit-specific environment detection

### Production Deployment
- Single-file server bundle with external dependencies
- Static file serving for frontend assets
- Database connection via environment variables
- Session persistence with PostgreSQL store

## Changelog
- July 02, 2025. QUALITY: Increased section requirement to 6 minimum sections
  - Raised minimum from 4 to 6 sections for even higher biographical content quality
  - Ensures players receive substantial, well-documented historical figures
  - Maintains efficiency by checking section count before expensive hint generation
- July 02, 2025. PERFORMANCE: Optimized LLM hint generation efficiency
  - Moved section count validation BEFORE expensive hint generation
  - Eliminated wasted OpenAI API calls for people who would be rejected anyway
  - Improved request flow: fetch → verify person → get sections → check count → generate hints
- July 02, 2025. CRITICAL: Enhanced LLM verification for real person names only
  - Updated LLM verification to reject stage names, aliases, and band names
  - Added explicit criteria requiring birth/legal names only (not "The Kut", "infinite bisous", etc.)
  - Prevents multiple people entries (no "Dan Berk and Robert Olsen")
  - Ensures game only features actual person names that players can reasonably guess
- July 02, 2025. MAJOR: Optimized Wikipedia API efficiency
  - Successfully reduced Wikipedia API calls from 10+ to 3 per request
  - Eliminated concurrent Wikipedia fetching with global lock mechanism
  - Restored essential LLM person verification with sequential retry logic
  - Simplified strategy execution to single-attempt model
  - Added comprehensive server-side debugging and request tracking
  - Fixed duplicate session creation issues causing multiple concurrent requests
- July 02, 2025. Major improvements to person diversity and hint quality
  - Integrated OpenAI for intelligent hint generation
  - Added comprehensive Wikipedia category fetching strategies
  - Implemented person pre-loading for faster transitions
  - Expanded fallback person list to 15+ diverse individuals
  - Fixed repetition issues with only 3 people appearing
- July 01, 2025. Initial setup

## User Preferences

Preferred communication style: Simple, everyday language.