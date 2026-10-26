# syntax=docker/dockerfile:1
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
# Optional build secret `pip_ca`: an extra CA bundle for builds behind a TLS-intercepting proxy.
# Normal builds (e.g. on the PSPK server) don't pass it.
RUN --mount=type=secret,id=pip_ca,required=false \
    if [ -s /run/secrets/pip_ca ]; then export PIP_CERT=/run/secrets/pip_ca; fi; \
    pip install --no-cache-dir -r requirements.txt

COPY app ./app

RUN useradd --system --uid 1000 pspk && mkdir -p /data/storage && chown pspk /data/storage
USER pspk

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
