import smtplib
import os
import mimetypes
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email.mime.text import MIMEText
from email import encoders


# Map file extensions to explicit MIME types so mail clients handle them correctly.
_MIME_MAP = {
    ".pdf":  ("application", "pdf"),
    ".docx": ("application", "vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".doc":  ("application", "msword"),
    ".html": ("text", "html"),
    ".htm":  ("text", "html"),
    ".txt":  ("text", "plain"),
}


def send_email(Subject: str, To: str, content: str, attachments=None) -> str:
    """
    Sends an email via Gmail SMTP.
    Called by tool_executor with kwargs from the LLM's arguments object:
      { "Subject": "...", "To": "recipient@example.com", "content": "...", "attachments": [...] }
    attachments — list of absolute file-system paths written by server.py into a temp dir.
    """
    sender   = os.getenv("SMTP_EMAIL")
    password = os.getenv("GMAIL_APP_PASSWORD")

    if not sender or not password:
        return "Cannot send email: SMTP_EMAIL or GMAIL_APP_PASSWORD not set in environment."

    # ── Build the message container ──────────────────────────────────────────
    msg = MIMEMultipart("mixed")
    msg["To"]      = To
    msg["Subject"] = Subject
    msg["From"]    = sender

    # Plain-text body
    msg.attach(MIMEText(content, "plain"))

    # ── Attach files if provided ─────────────────────────────────────────────
    if attachments:
        for file_path in attachments:
            if not os.path.isfile(file_path):
                print(f"Attachment not found on disk, skipping: {file_path}")
                continue

            ext = os.path.splitext(file_path)[1].lower()
            maintype, subtype = _MIME_MAP.get(ext, ("application", "octet-stream"))

            with open(file_path, "rb") as fh:
                payload = fh.read()

            part = MIMEBase(maintype, subtype)
            part.set_payload(payload)
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                "attachment",
                filename=os.path.basename(file_path),
            )
            msg.attach(part)

    # ── Send ─────────────────────────────────────────────────────────────────
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender, password)
            server.send_message(msg)
        print(f"Email sent to {To} with subject '{Subject}'")
        return f"Email sent to {To} successfully!"
    except smtplib.SMTPException as e:
        print(f"SMTP error: {e}")
        return f"Failed to send email: {e}"
