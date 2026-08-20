# ⚙️ Symphony AI — Autonomous AI Agent

**Symphony** is a full-stack, production-grade AI Agent built from scratch in Python — no LangChain, no LlamaIndex. It features a complete authentication system, persistent chat history, user profile memory, and a stunning Neo-Brutalist web interface.

> Built to demystify Agentic AI while delivering professional backend engineering patterns.

---

## ✨ What's New (v2.0)

| Feature | Description |
|---|---|
| 🔐 JWT Authentication | Secure email/password login with `bcrypt` + `python-jose` |
| 🐙 OAuth (GitHub + Google) | Social login via `NextAuth.js` — exchanges for a backend JWT |
| 👤 User Profiles | Name, occupation, company — injected into every agent request |
| 💬 Chat History | Full conversation persistence, ChatGPT-style sidebar with search |
| 🧠 Agent Memory | User profile context auto-injected into the AI's system prompt |
| 🗄️ SQLite + SQLAlchemy | Production-ready ORM — swap to PostgreSQL with one line |

---

## 🏗️ Architecture

Symphony runs an improvised **ReAct (Reason + Act)** loop — entirely hand-coded orchestration with no framework abstractions.

```
User Request
     │
     ▼
FastAPI Server (server.py)
     │  ← injects user profile + memory context
     ▼
Agent Core (agent/core.py)   — ReAct orchestration loop
     │
     ├─► LLM Client (agent/llm.py)   — Llama-3.3-70B via HuggingFace
     ├─► Prompt Builder               — dynamically builds system + tool prompt
     └─► Tool Executor                — safely runs tools, injects results
              │
              ├── Web Search (Tavily)
              ├── Web Scraper
              ├── Weather
              ├── Calculator
              ├── Date & Time
              └── Send Email
```

---

## 🛠️ File Structure

```text
BasicAIAgent/
├── agent/
│   ├── core.py               # ReAct orchestrator loop
│   ├── llm.py                # HuggingFace Inference API client
│   ├── prompt_builder.py     # Dynamic system prompt + tool injection
│   └── tool_executor.py      # Safe tool dispatcher
├── app/
│   ├── auth.py               # JWT creation, verification, bcrypt hashing
│   ├── crud.py               # All database operations
│   ├── database.py           # SQLAlchemy engine + session
│   ├── models.py             # User, Profile, Memory, Conversation, Message
│   └── schemas.py            # Pydantic request/response models
├── tools/
│   ├── registry.py           # Centralized tool registry
│   ├── webSearch.py          # Tavily search integration
│   ├── webExtract.py         # Web page scraping
│   ├── weather.py            # Live weather fetching
│   ├── calculator.py         # Safe expression evaluator
│   ├── dateAndTime.py        # System clock
│   └── sendEmail.py          # SMTP email sender
├── utils/
│   └── file_parser.py        # .pdf and .docx text extraction
├── frontend-agent/           # Next.js 15 — Neo-Brutalist Chat UI
│   └── src/
│       ├── app/
│       │   ├── chat/         # Protected chat interface with history sidebar
│       │   ├── login/        # Sign In (email + GitHub + Google)
│       │   ├── register/     # Sign Up
│       │   ├── profile-setup/# First-time profile collection
│       │   └── api/auth/     # NextAuth.js OAuth routes
│       └── lib/auth.ts       # JWT + social session utilities
├── server.py                 # FastAPI entry point
├── requirements.txt          # Python dependencies
└── .env                      # API keys and secrets
```

---

## 🚀 Getting Started

### Prerequisites
- Python 3.10+
- Node.js 18+
- A [Hugging Face](https://huggingface.co) API Token

---

### 1. Backend Setup

**Clone and create a virtual environment:**
```bash
git clone https://github.com/drishgo/Servix.git
cd Servix
python -m venv .venv
.venv\Scripts\activate      # Windows
source .venv/bin/activate   # macOS / Linux
```

**Install Python dependencies:**
```bash
pip install -r requirements.txt
```

**Configure `.env`** in the project root:
```env
HF_TK=your_huggingface_api_token
TAVILY_API_KEY=your_tavily_api_key

SECRET_KEY=your-random-jwt-secret        # generate: openssl rand -hex 32
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

AGENT_SYSTEM_PROMPT="You are Servix, an intelligent AI agent..."
```

**Start the backend:**
```bash
.venv\Scripts\python server.py
```
The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

---

### 2. Frontend Setup

```bash
cd frontend-agent
npm install
```

**Configure `frontend-agent/.env.local`:**
```env
NEXTAUTH_SECRET=your-random-secret        # generate: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# GitHub OAuth — https://github.com/settings/developers
# Callback URL: http://localhost:3000/api/auth/callback/github
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Google OAuth — https://console.cloud.google.com
# Callback URL: http://localhost:3000/api/auth/callback/google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

**Start the frontend:**
```bash
npm run dev
```
The interface will be available at `http://localhost:3000`.

---

## 🔐 Authentication Flow

```
Email/Password login
  → POST /login → JWT token → stored in localStorage

Social Login (GitHub / Google)
  → NextAuth OAuth → session cookie
  → POST /auth/social-token → backend JWT → stored in localStorage
  → /profile-setup (first time only)
  → /chat

All /chat requests
  → Authorization: Bearer <token>
  → get_current_user validates JWT
  → user profile + memory injected into agent
```

---

## 🗄️ Database Schema

| Table | Purpose |
|---|---|
| `users` | Core identity (email, hashed password) |
| `user_profiles` | Name, occupation, company |
| `user_memory` | Agent-readable key facts about the user |
| `conversations` | Chat sessions with title and timestamps |
| `messages` | Individual user/agent messages |

> SQLite in development. Swap to PostgreSQL in one line by changing `DATABASE_URL` in `app/database.py`.

---

## 🎓 Educational Value

By examining this codebase you will learn:
- How to hand-code a **ReAct agent loop** without frameworks
- How to enforce **parseable JSON tool calls** via system prompt engineering
- **JWT authentication** with bcrypt password hashing
- **OAuth provider integration** (GitHub, Google) via NextAuth.js
- **SQLAlchemy ORM** patterns portable to any SQL database
- Injecting **user-specific memory into LLM context** at request time

---

*Built with 🖤 to demystify Agentic AI.*
