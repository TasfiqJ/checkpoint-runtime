.PHONY: build test lint up down proto-gen clean fmt

# ─── Build ────────────────────────────────────────────────────────
build: build-rust build-python build-frontend

build-rust:
	cd rust-dataplane && cargo build --release

build-python:
	cd python-controlplane && pip install -e ".[dev]"

build-frontend:
	cd frontend && npm install && npm run build

# ─── Test ─────────────────────────────────────────────────────────
test: test-rust test-python test-frontend

test-rust:
	cd rust-dataplane && cargo test

test-python:
	cd python-controlplane && python -m pytest tests/ -v

test-frontend:
	cd frontend && npm run typecheck

# ─── Lint ─────────────────────────────────────────────────────────
lint: lint-rust lint-python lint-frontend

lint-rust:
	cd rust-dataplane && cargo fmt --check && cargo clippy -- -D warnings

lint-python:
	cd python-controlplane && ruff check src/ tests/ && mypy src/

lint-frontend:
	cd frontend && npx eslint src/ --ext .ts,.tsx

# ─── Format ───────────────────────────────────────────────────────
fmt:
	cd rust-dataplane && cargo fmt
	cd python-controlplane && ruff format src/ tests/

# ─── Docker ───────────────────────────────────────────────────────
up:
	docker compose up --build -d

down:
	docker compose down -v

logs:
	docker compose logs -f

# ─── Proto ────────────────────────────────────────────────────────
proto-gen:
	@echo "Rust protos are generated at build time via build.rs"
	@echo "Python protos: run grpc_tools.protoc manually if needed"

# ─── Clean ────────────────────────────────────────────────────────
clean:
	cd rust-dataplane && cargo clean
	rm -rf frontend/dist frontend/node_modules
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
