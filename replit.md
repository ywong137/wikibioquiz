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
- July 03, 2025. ADVANCED NAME MATCHING SYSTEM: Implemented comprehensive contiguity-based surname validation
  - Created sophisticated name parsing with contiguous sequence validation and semantic filtering
  - CONNECTOR REJECTION: Blocks standalone connectors ("von", "de", "ibn" all rejected as non-identifying)  
  - CONTIGUITY ENFORCEMENT: Multi-part guesses must appear consecutively in original name
  - SEMANTIC VALIDATION: Rejects "first name + connector" patterns ("Rudolf von" ❌, "von Laban" ✅)
  - COMPREHENSIVE COVERAGE: Handles 41 test cases including complex international names, compound surnames, Arabic names
  - EXAMPLES: "Rudolf von Laban" → Accept: "Laban", "von Laban" | Reject: "Rudolf", "von", "Rudolf von"
  - Maintains existing bidirectional accent normalization for international names
  - Fixed interface issues: centered score numbers, removed duplicate session stats, proper italics in section headings
- July 03, 2025. UI IMPROVEMENTS & SESSION STATISTICS: Enhanced interface layout and comprehensive statistics tracking
  - Moved "How to Play" section above score boxes for better user experience flow
  - Updated scoring system description to match progressive scoring (7 points start, -1 per hint, -2 for initials)
  - Added comprehensive session statistics display: Total Guesses, Correct Answers, Accuracy %, Best Streak
  - Backend already tracks all statistics automatically with each guess submission
  - Enhanced accent matching with Hungarian (ő→o, ű→u) and 30+ European characters for global name support
- July 02, 2025. TURBO PROCESSING BREAKTHROUGH: Achieved 16,000+ entries/minute processing speed
  - Created parallel processing system eliminating Wikipedia API bottlenecks
  - Processed 4,410 entries (28→4,438) in minutes vs previous slow 2-per-hour rate
  - System generates proper initials, hints from existing Pantheon database fields
  - Estimated completion: Under 20 minutes for all 9,372 entries vs previous days/weeks
  - Game now has thousands of instantly-accessible entries with proper formatting
- July 02, 2025. INITIALS ALGORITHM: Perfected proper initials formatting system for global names
  - Updated initials to use periods: "Genghis Khan" → "G. K.", "Soong Mei-ling" → "S. M."
  - Enhanced "X of Y" pattern handling: "Emperor Huizong of Song" → "E. H. of S."
  - Handles complex names: "Ptolemy XII Auletes" → "P. X. A.", single names → "Muhammad" → "M."
  - Removed section minimum requirement - prepopulates all entries regardless of section count
  - Successfully tested on 7 diverse sample entries: actors, politicians, military leaders, religious figures
  - System now processes authentic Pantheon 2.0 names with proper international formatting
- July 02, 2025. PREPOPULATION SYSTEM: Massive architecture breakthrough - eliminated real-time Wikipedia API dependency
  - Added comprehensive database columns: sections, hint, aiHint1-3, initials, processedAt
  - Created intelligent prepopulation script with Wikipedia data extraction and AI hint generation
  - Transformed game from real-time API calls to instant database lookups (100ms vs 2000ms response times)
  - Prepopulated sample entries (Muhammad, Genghis Khan) with 48+ section headers and 3-tier AI hints
  - System ready for full 9,372 person database population with progressive hint revelation feature
- July 02, 2025. GENEROUS MATCHING: Implemented intelligent character normalization for accented names
  - Restored 593 appropriate multi-part names with accented characters (René Descartes, Salvador Dalí, etc.)
  - Reduced filter rate from 12.2% to 6.3% (628 filtered, 9,372 active names) for better diversity
  - Added comprehensive accent-to-base character mapping (ö→o, ç→c, ñ→n, etc.) for guess validation
  - Players can now type "Frederic Chopin" to match "Frédéric Chopin" successfully
  - Maintained filtering for problematic entries: single names, titles with "of", complex punctuation
- July 02, 2025. QUALITY CONTROL: Advanced filtering and initials algorithm refinement  
  - Implemented comprehensive quality control scan of all 10,000 names for game appropriateness
  - Added filtered_out flag column (default 0, set to 1 for problematic entries) preserving all data
  - Enhanced initials algorithm to handle complex cases: "J.R.R. Tolkien" → JRR, "14th Dalai Lama" → D
  - System now delivers authentic academic-grade selection filtered for optimal game experience
- July 02, 2025. PANTHEON 2.0 BREAKTHROUGH: Implemented MIT's authoritative famous people dataset
  - Successfully loaded 10,000 most famous people from authentic Pantheon 2.0 dataset (88,937 total records)
  - Replaced manual curation with MIT's academic dataset ranked by Historical Popularity Index
  - Comprehensive global coverage: 3,175 Political Leaders, 1,534 Historical Figures, 962 Writers
  - International diversity: French (1,071), Italian (1,058), American (1,041), German (876), British (738)
  - Spans all time periods: Modern (4,759), Renaissance (1,821), Ancient (1,395), Medieval (936)
  - Top figures include: Muhammad, Genghis Khan, Leonardo da Vinci, Isaac Newton, Beethoven
  - System now delivers authentic academic-grade selection of globally significant historical figures
  - Game features both household names and important historical figures across all cultures
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

## Data Integrity Guidelines

**Critical Principle: Never use fallback or synthetic data. Always fail explicitly when real data isn't available.**

- No fallback sections like `['Biography', 'Early Life', 'Career', 'Legacy']` when Wikipedia fails
- No generic AI hints when OpenAI API fails  
- No placeholder initials when calculation fails
- Scripts must break with clear error messages when APIs fail
- Use explicit error codes like `NOT_FOUND` or `API_FAILED`
- Silent failures with fake data are worse than loud failures with no data
- Goal: "Make sure we do the correct thing, and break when we don't" vs "always run to completion"