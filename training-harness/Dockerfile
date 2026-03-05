FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only for demo
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# Install the SDK from the controlplane package
COPY python-controlplane/pyproject.toml /tmp/controlplane/pyproject.toml
COPY python-controlplane/src/ /tmp/controlplane/src/
RUN pip install --no-cache-dir /tmp/controlplane

COPY training-harness/ ./

ENV PYTHONUNBUFFERED=1

CMD ["python", "train.py"]
