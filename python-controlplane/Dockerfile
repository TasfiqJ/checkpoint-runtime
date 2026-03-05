FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system deps for grpcio
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy project definition
COPY python-controlplane/pyproject.toml ./

# Install dependencies
RUN pip install --no-cache-dir -e ".[dev]" 2>/dev/null || pip install --no-cache-dir .

# Copy source
COPY python-controlplane/src/ ./src/
COPY proto/ /app/proto/

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

EXPOSE 8000 50052

CMD ["uvicorn", "controlplane.api.rest:app", "--host", "0.0.0.0", "--port", "8000"]
