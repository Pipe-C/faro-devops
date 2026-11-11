# syntax=docker/dockerfile:1

# ---- Etapa 1: instalar dependencias en un entorno virtual aislado ----
FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
COPY requirements.txt .
RUN /opt/venv/bin/pip install -r requirements.txt

# ---- Etapa 2: imagen final sin compiladores ni pip de build ----
FROM python:3.12-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY sentinel ./sentinel
# Usuario sin privilegios y sin shell de login.
RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin sentinel
USER sentinel
EXPOSE 9100
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:9100/healthz', timeout=2).status == 200 else 1)"
CMD ["uvicorn", "sentinel.main:create_app_from_env", "--factory", "--host", "0.0.0.0", "--port", "9100", "--no-access-log"]
