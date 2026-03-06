FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system deps for grpcio + Docker CLI for demo kill-worker
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Copy project definition and source together (needed for pip install)
COPY python-controlplane/pyproject.toml ./
COPY python-controlplane/src/ ./src/

# Copy proto files
COPY proto/ /app/proto/

# Install the package (non-editable for Docker)
RUN pip install --no-cache-dir .

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

EXPOSE 8000 50052

CMD ["uvicorn", "controlplane.api.rest:app", "--host", "0.0.0.0", "--port", "8000"]
