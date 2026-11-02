from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict, Any
from datetime import date
from uuid import UUID
import os
import re
import asyncio
import base64
import json
from email.message import EmailMessage
import smtplib
import urllib.request
import urllib.error

from .. import crud, schemas, models
from ..database import get_db
from ..auth import get_current_user

router = APIRouter()

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def _build_html_email(req: schemas.SendReportEmailRequest) -> str:
    highlights_html = ""
    if req.summary_highlights:
        items = "".join(f"<li style='margin-bottom: 6px;'>{h}</li>" for h in req.summary_highlights)
        highlights_html = f"""
        <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
            <h4 style="margin: 0 0 8px 0; color: #1e293b; font-size: 14px;">Destacados del Resumen:</h4>
            <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 13px;">
                {items}
            </ul>
        </div>
        """
    subtitle_html = (
        f"<p style='color: #64748b; font-size: 14px; margin-top: 4px;'>{req.report_subtitle}</p>"
        if req.report_subtitle
        else ""
    )

    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; padding: 24px; margin: 0;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
        <div style="display: flex; align-items: center; margin-bottom: 24px;">
            <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700;">GastosApp</h2>
        </div>
        <h1 style="color: #1e293b; font-size: 18px; margin: 0 0 4px 0;">{req.report_title}</h1>
        {subtitle_html}
        <p style="color: #334155; font-size: 14px; line-height: 1.5; margin-top: 16px;">
            Hola, adjunto encontrarás el archivo <strong>{req.filename}</strong> con los detalles solicitados de tu reporte financiero en GastosApp.
        </p>
        {highlights_html}
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 12px;">
            Generado automáticamente por GastosApp. Por favor no respondas a este correo.
        </div>
    </div>
</body>
</html>
"""


def _send_via_smtp(
    host: str,
    port: int,
    user: str,
    password: str,
    recipient: str,
    subject: str,
    html_body: str,
    filename: str,
    mime_type: str,
    file_base64: str,
):
    cleaned_user = user.strip()
    cleaned_password = password.strip().replace(" ", "") if "gmail" in host.lower() else password.strip()
    file_bytes = base64.b64decode(file_base64)
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"GastosApp <{cleaned_user}>"
    msg["To"] = recipient.strip()
    msg.set_content("Por favor revisa el archivo adjunto para ver tu reporte de GastosApp.")
    msg.add_alternative(html_body, subtype="html")

    maintype, _, subtype = mime_type.partition("/")
    msg.add_attachment(
        file_bytes,
        maintype=maintype or "application",
        subtype=subtype or "octet-stream",
        filename=filename,
    )

    if port == 587:
        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(cleaned_user, cleaned_password)
            server.send_message(msg)
    else:
        with smtplib.SMTP_SSL(host, port) as server:
            server.login(cleaned_user, cleaned_password)
            server.send_message(msg)


def _send_via_resend(
    api_key: str,
    from_email: str,
    recipient: str,
    subject: str,
    html_body: str,
    filename: str,
    file_base64: str,
):
    url = "https://api.resend.com/emails"
    payload = {
        "from": from_email or "GastosApp <onboarding@resend.dev>",
        "to": [recipient],
        "subject": subject,
        "html": html_body,
        "attachments": [
            {
                "filename": filename,
                "content": file_base64,
            }
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    http_req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "GastosApp/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(http_req) as resp:
        if resp.status >= 400:
            raise RuntimeError(f"Resend error: status {resp.status}")


@router.get("/analysis", response_model=schemas.PeriodComparisonResponse)
async def read_analysis(
    date_from_a: date,
    date_to_a: date,
    date_from_b: Optional[date] = None,
    date_to_b: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: UUID = Depends(get_current_user),
):
    if hasattr(date_from_b, "default"):
        date_from_b = date_from_b.default
    if hasattr(date_to_b, "default"):
        date_to_b = date_to_b.default
    # Validaciones de Periodo A
    if date_from_a > date_to_a or (date_to_a - date_from_a).days > 366:
        raise HTTPException(
            status_code=400,
            detail="El rango del Periodo A debe ser válido y no superar 366 días.",
        )

    # Validaciones de Periodo B si aplica
    if (date_from_b is not None and date_to_b is None) or (date_from_b is None and date_to_b is not None):
        raise HTTPException(
            status_code=400,
            detail="Debes proporcionar ambas fechas (date_from_b y date_to_b) para comparar con el Periodo B.",
        )

    if date_from_b is not None and date_to_b is not None:
        if date_from_b > date_to_b or (date_to_b - date_from_b).days > 366:
            raise HTTPException(
                status_code=400,
                detail="El rango del Periodo B debe ser válido y no superar 366 días.",
            )

    try:
        return await crud.get_report_comparison(
            db=db,
            user_id=current_user,
            date_from_a=date_from_a,
            date_to_a=date_to_a,
            date_from_b=date_from_b,
            date_to_b=date_to_b,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


async def _run_in_thread(func, *args):
    try:
        asyncio.get_running_loop()
        return await asyncio.to_thread(func, *args)
    except RuntimeError:
        return func(*args)


@router.post("/send-email")
async def send_report_email(
    req: schemas.SendReportEmailRequest,
    current_user: UUID = Depends(get_current_user),
):
    if not req.recipient_email or not EMAIL_REGEX.match(req.recipient_email.strip()):
        raise HTTPException(status_code=400, detail="Correo electrónico de destinatario inválido.")

    if len(req.file_base64) > 14_000_000:
        raise HTTPException(
            status_code=400,
            detail="El archivo adjunto excede el límite permitido de 10 MB.",
        )

    html_body = _build_html_email(req)

    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    resend_api_key = os.getenv("RESEND_API_KEY")

    if smtp_user and smtp_password:
        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "465"))
        try:
            await _run_in_thread(
                _send_via_smtp,
                smtp_host,
                smtp_port,
                smtp_user,
                smtp_password,
                req.recipient_email.strip(),
                req.subject,
                html_body,
                req.filename,
                req.mime_type,
                req.file_base64,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error enviando correo SMTP: {str(e)}")
    elif resend_api_key:
        resend_from = os.environ.get("RESEND_FROM_EMAIL", "GastosApp <onboarding@resend.dev>")
        try:
            await _run_in_thread(
                _send_via_resend,
                resend_api_key,
                resend_from,
                req.recipient_email.strip(),
                req.subject,
                html_body,
                req.filename,
                req.file_base64,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error enviando correo Resend: {str(e)}")
    else:
        raise HTTPException(
            status_code=503,
            detail="El servicio de correo no está configurado en el servidor (configura SMTP_USER y SMTP_PASSWORD en el archivo .env).",
        )

    return {"status": "success", "message": "Reporte enviado exitosamente por correo"}
