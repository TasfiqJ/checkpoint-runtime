#!/usr/bin/env python3
"""Generate Python gRPC stubs from .proto definitions.

Reads all ``*.proto`` files from ``../proto/`` (relative to this script) and
outputs the generated ``*_pb2.py`` and ``*_pb2_grpc.py`` files into
``src/controlplane/generated/``.

Usage:
    python generate_proto.py

Requirements:
    pip install grpcio-tools
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    # Resolve paths relative to this script
    script_dir = Path(__file__).resolve().parent
    proto_dir = (script_dir.parent / "proto").resolve()
    output_dir = (script_dir / "src" / "controlplane" / "generated").resolve()

    if not proto_dir.is_dir():
        print(f"ERROR: Proto directory not found: {proto_dir}", file=sys.stderr)
        sys.exit(1)

    # Ensure output directory exists
    output_dir.mkdir(parents=True, exist_ok=True)

    # Collect all .proto files
    proto_files = sorted(proto_dir.glob("*.proto"))
    if not proto_files:
        print(f"ERROR: No .proto files found in {proto_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Proto directory : {proto_dir}")
    print(f"Output directory: {output_dir}")
    print(f"Proto files     : {[p.name for p in proto_files]}")

    try:
        from grpc_tools import protoc  # type: ignore[import-untyped]
    except ImportError:
        print(
            "ERROR: grpcio-tools is not installed. Install with:\n"
            "  pip install grpcio-tools",
            file=sys.stderr,
        )
        sys.exit(1)

    # Build the protoc command arguments
    proto_include = str(proto_dir)
    args = [
        "grpc_tools.protoc",
        f"--proto_path={proto_include}",
        f"--python_out={output_dir}",
        f"--grpc_python_out={output_dir}",
        f"--pyi_out={output_dir}",
    ] + [str(p) for p in proto_files]

    print(f"\nRunning: {' '.join(args)}\n")
    result = protoc.main(args)

    if result != 0:
        print(f"ERROR: protoc exited with code {result}", file=sys.stderr)
        sys.exit(result)

    # List generated files
    generated = sorted(output_dir.glob("*_pb2*"))
    print(f"Generated {len(generated)} files:")
    for f in generated:
        print(f"  {f.name}")

    print("\nDone.")


if __name__ == "__main__":
    main()
