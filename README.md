# Stock Market — Lead Qualification Portal

Production-ready, mobile-first lead qualification interface for **Stock Market**.

## Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Hosting & Serverless**: Vercel (Edge / Serverless Node.js Functions)
- **Database**: Neon PostgreSQL (`@neondatabase/serverless`)
- **Tracking**: Meta Pixel + Conversions API (CAPI) (Scheduled for Phase 3)

## Project Architecture
```
Alpha-LandingP-Meraj/
├── api/
│   ├── track-step.js     # Progressive step saving (Steps 1-5)
│   └── submit-lead.js    # Final lead completion & atomic verification (Step 5)
├── assets/
│   ├── css/
│   │   └── style.css     # Premium fintech styling & responsive design
│   └── js/
│       └── app.js        # State management, validation & progressive API hooks
├── database/
│   └── schema.sql        # Neon PostgreSQL leads table schema & indexes
├── lib/
│   ├── db.js             # Neon PostgreSQL client wrapper
│   ├── helpers.js        # Lead reference, IP extraction, response helpers
│   └── validation.js     # Server-side input sanitization & validation
├── .env.example          # Template for environment variables
├── .gitignore            # Security exclusions (credentials, node_modules)
├── index.html            # Primary static frontend entry point
├── package.json          # Node.js dependencies & scripts
├── server.js             # Local development server with API routing
├── vercel.json           # Vercel deployment configuration
└── README.md
```

## Phase 2 Features (Completed & Verified)
- [x] Progressive step saving across all 5 steps (Step 1 INSERT, Steps 2-5 UPDATE same record)
- [x] Permanent session integrity (completed session IDs locked against alteration)
- [x] Full questionnaire validation before completion (rejects partial completion attempts)
- [x] Abandoned/partial user persistence (`status = 'partial'`)
- [x] One session = One database record (`session_id` UNIQUE constraint)
- [x] Human-readable persistent `lead_reference`
- [x] Back-navigation protection (`current_step = GREATEST(...)`)
- [x] UTM attribution persistence (`COALESCE` without overwriting)
- [x] Server-side validation for challenges, phones, segments, capitals, and states
- [x] Safe input handling (resilient to malformed payloads and non-string types)
- [x] Network error handling & retry UI on frontend
- [x] Double-click and duplicate submission protection
- [x] Accessible Privacy Notice dialog modal
- [x] Zero PHP and zero MySQL dependencies
- [x] 100% Vercel & Neon PostgreSQL native

## Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template:
   ```bash
   cp .env.example .env
   ```
   Add your Neon PostgreSQL connection string to `DATABASE_URL`.
3. Start the local server:
   ```bash
   npm start
   ```
   Open `http://localhost:3000`.

4. Run automated test suite:
   ```bash
   npm test
   ```

## Vercel Deployment
1. Push repository to GitHub.
2. Import project in Vercel.
3. Add Environment Variable:
   - `DATABASE_URL`: Your Neon PostgreSQL connection string.
4. Deploy!
