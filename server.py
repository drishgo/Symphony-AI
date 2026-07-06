from fastapi import FastAPI, HTTPException, UploadFile, File, Form
import tempfile
import os
import shutil
from typing import Optional, List
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent.core import Agent
import uvicorn
import logging
from utils.file_parser import docxParser, pdfParser
from app.database import engine, get_db
from app import models, schemas, crud
from app.auth import create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES, verify_password
from sqlalchemy.orm import Session
from fastapi import Depends
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta

# Create tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Servix AI API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the agent
try:
    agent = Agent()
    logging.info("Agent initialized successfully.")
except Exception as e:
    logging.error(f"Failed to initialize agent: {e}")
    agent = None

class ChatResponse(BaseModel):
    response: str

# ─── Chat ─────────────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse)
async def chat(
    request_Message: str = Form(...),
    request_file: Optional[UploadFile] = File(None),
    user_email: Optional[str] = Form(None),
    current_user: str = Depends(get_current_user)
):
    if not agent:
        raise HTTPException(status_code=500, detail="Agent not initialized")

    # Build user context from DB
    user_context = ""
    if user_email:
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            profile = crud.get_profile(db, user_email)
            memory = crud.get_memory(db, user_email)
            if profile:
                parts = []
                if profile.name: parts.append(f"Name: {profile.name}")
                if profile.occupation: parts.append(f"Occupation: {profile.occupation}")
                if profile.company: parts.append(f"Company: {profile.company}")
                if parts:
                    user_context += "User Profile:\n" + "\n".join(parts) + "\n\n"
            if memory and memory.memory_text:
                user_context += f"User Memory (key facts):\n{memory.memory_text}\n\n"
        finally:
            db.close()

    temp_path = None
    try:
        context = ""
        attachments = []

        if request_file:
            file_content = await request_file.read()

            # ── Parse text context so the agent can reason about the file ──
            if request_file.filename.endswith(".txt"):
                context = file_content.decode("utf-8")
            elif request_file.filename.endswith(".html") or request_file.filename.endswith(".htm"):
                context = file_content.decode("utf-8", errors="ignore")
            elif request_file.filename.endswith(".docx"):
                context = docxParser(file_content)
            elif request_file.filename.endswith(".pdf"):
                context = pdfParser(file_content)

            # ── Also save bytes to a temp file so the email tool can attach it ──
            suffix = os.path.splitext(request_file.filename)[1] or ""
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(file_content)
                temp_path = tmp.name
            # Rename so the attachment filename shown in the email matches the original
            named_path = os.path.join(os.path.dirname(temp_path),
                                      request_file.filename)
            shutil.move(temp_path, named_path)
            temp_path = named_path
            attachments = [temp_path]

            message = f"<user_input> User Message: {request_Message}\n\nDocument Context: {context} </user_input>"
        else:
            message = f"<user_input>\n{request_Message}\n</user_input>"

        if user_context:
            message = f"<user_context>\n{user_context}</user_context>\n{message}"

        result = agent.run(message, attachments=attachments if attachments else None)
        return ChatResponse(response=result)
    except Exception as e:
        logging.error(f"Error during agent execution: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up the temp file regardless of success or failure
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

# ─── Auth ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    return {"status": "healthy", "agent_loaded": agent is not None}

@app.post("/register", response_model=schemas.UserOut)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    return crud.create_user(db=db, user=user)

@app.post("/login", response_model=schemas.Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_user_by_email(db, form_data.username)
    if not user or not user.hashed_password or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password", headers={"WWW-Authenticate": "Bearer"})
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": access_token, "token_type": "bearer"}

# Social OAuth users: exchange email for a JWT so frontend can use the same auth flow
@app.post("/auth/social-token", response_model=schemas.Token)
def social_token(email: str = Form(...), name: Optional[str] = Form(None), db: Session = Depends(get_db)):
    user = crud.get_or_create_user(db, email=email)
    # If we have a name, upsert a minimal profile
    if name:
        existing_profile = crud.get_profile(db, user.email)
        if not existing_profile:
            crud.upsert_profile(db, schemas.ProfileCreate(user_email=user.email, name=name))
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

# ─── Profile ──────────────────────────────────────────────────────────────────

@app.post("/profile", response_model=schemas.ProfileOut)
def save_profile(profile: schemas.ProfileCreate, db: Session = Depends(get_db)):
    crud.get_or_create_user(db, profile.user_email)
    return crud.upsert_profile(db, profile)

@app.get("/profile/{user_email}", response_model=Optional[schemas.ProfileOut])
def get_profile(user_email: str, db: Session = Depends(get_db)):
    return crud.get_profile(db, user_email)

# ─── Conversations ────────────────────────────────────────────────────────────

@app.get("/conversations/{user_email}", response_model=List[schemas.ConversationOut])
def list_conversations(user_email: str, db: Session = Depends(get_db)):
    return crud.get_conversations(db, user_email)

@app.post("/conversations", response_model=schemas.ConversationOut)
def create_conversation(conv: schemas.ConversationCreate, db: Session = Depends(get_db)):
    crud.get_or_create_user(db, conv.user_email)
    return crud.create_conversation(db, conv)

@app.put("/conversations/{conversation_id}/title", response_model=schemas.ConversationOut)
def update_title(conversation_id: int, body: schemas.ConversationTitleUpdate, db: Session = Depends(get_db)):
    conv = crud.update_conversation_title(db, conversation_id, body.title)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv

@app.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    crud.delete_conversation(db, conversation_id)
    return {"ok": True}

# ─── Messages ─────────────────────────────────────────────────────────────────

@app.get("/conversations/{conversation_id}/messages", response_model=List[schemas.MessageOut])
def get_messages(conversation_id: int, db: Session = Depends(get_db)):
    return crud.get_messages(db, conversation_id)

@app.post("/conversations/{conversation_id}/messages", response_model=schemas.MessageOut)
def add_message(conversation_id: int, message: schemas.MessageCreate, db: Session = Depends(get_db)):
    return crud.add_message(db, conversation_id, message)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
