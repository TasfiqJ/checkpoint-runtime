"""OpenTelemetry instrumentation for the checkpoint runtime control plane.

Sets up:
- **Traces**: Distributed tracing with OTLP exporter.
- **Metrics**: Runtime metrics (run counts, checkpoint durations, etc.).

Environment variables:
    OTEL_EXPORTER_OTLP_ENDPOINT  — OTLP collector endpoint (default http://localhost:4317).
    OTEL_SERVICE_NAME             — Service name (default checkpoint-controlplane).
    OTEL_ENABLED                  — Set to "false" to disable telemetry.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_OTEL_ENABLED = os.environ.get("OTEL_ENABLED", "true").lower() != "false"
_SERVICE_NAME = os.environ.get("OTEL_SERVICE_NAME", "checkpoint-controlplane")
_OTLP_ENDPOINT = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")


class TelemetryManager:
    """Manages the lifecycle of OpenTelemetry providers."""

    def __init__(
        self,
        service_name: str = _SERVICE_NAME,
        otlp_endpoint: str = _OTLP_ENDPOINT,
        enabled: bool = _OTEL_ENABLED,
    ) -> None:
        self.service_name = service_name
        self.otlp_endpoint = otlp_endpoint
        self.enabled = enabled
        self._tracer_provider: Any = None
        self._meter_provider: Any = None
        self._tracer: Any = None
        self._meter: Any = None
        self.run_created_counter: Any = None
        self.checkpoint_duration_histogram: Any = None
        self.active_runs_gauge: Any = None
        self.checkpoint_bytes_counter: Any = None

    def setup(self) -> None:
        """Initialise OpenTelemetry providers and instruments."""
        if not self.enabled:
            logger.info("OpenTelemetry is disabled (OTEL_ENABLED=false)")
            self._setup_noop()
            return

        try:
            self._setup_real()
            logger.info(
                "OpenTelemetry initialised: service=%s endpoint=%s",
                self.service_name,
                self.otlp_endpoint,
            )
        except Exception:
            logger.warning(
                "Failed to initialise OpenTelemetry — falling back to no-op",
                exc_info=True,
            )
            self._setup_noop()

    def shutdown(self) -> None:
        """Flush and shut down all providers."""
        if self._tracer_provider is not None:
            try:
                self._tracer_provider.shutdown()
            except Exception:
                logger.debug("Tracer provider shutdown error", exc_info=True)
        if self._meter_provider is not None:
            try:
                self._meter_provider.shutdown()
            except Exception:
                logger.debug("Meter provider shutdown error", exc_info=True)

    def get_tracer(self, name: str = "controlplane") -> Any:
        if self._tracer_provider is None:
            self.setup()
        return self._tracer_provider.get_tracer(name)

    def get_meter(self, name: str = "controlplane") -> Any:
        if self._meter_provider is None:
            self.setup()
        return self._meter_provider.get_meter(name)

    def _setup_real(self) -> None:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create({"service.name": self.service_name})

        tracer_provider = TracerProvider(resource=resource)
        span_exporter = OTLPSpanExporter(endpoint=self.otlp_endpoint, insecure=True)
        tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))
        trace.set_tracer_provider(tracer_provider)
        self._tracer_provider = tracer_provider
        self._tracer = tracer_provider.get_tracer("controlplane")

        try:
            from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
            from opentelemetry.sdk.metrics import MeterProvider
            from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader

            metric_exporter = OTLPMetricExporter(endpoint=self.otlp_endpoint, insecure=True)
            reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=10_000)
            meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
            self._meter_provider = meter_provider
            self._meter = meter_provider.get_meter("controlplane")
        except ImportError:
            logger.warning("Metrics exporter not available — using no-op meter")
            self._setup_noop_metrics()
            return

        self._create_instruments()

    def _setup_noop(self) -> None:
        try:
            from opentelemetry.sdk.resources import Resource
            from opentelemetry.sdk.trace import TracerProvider
            from opentelemetry.sdk.metrics import MeterProvider

            resource = Resource.create({"service.name": self.service_name})
            self._tracer_provider = TracerProvider(resource=resource)
            self._meter_provider = MeterProvider(resource=resource)
        except ImportError:
            self._tracer_provider = _NoOpProvider()
            self._meter_provider = _NoOpProvider()

        self._setup_noop_metrics()

    def _setup_noop_metrics(self) -> None:
        self.run_created_counter = _NoOpCounter()
        self.checkpoint_duration_histogram = _NoOpHistogram()
        self.active_runs_gauge = _NoOpGauge()
        self.checkpoint_bytes_counter = _NoOpCounter()

    def _create_instruments(self) -> None:
        if self._meter is None:
            self._setup_noop_metrics()
            return

        self.run_created_counter = self._meter.create_counter(
            name="checkpoint_runtime.runs_created",
            description="Total number of training runs created",
            unit="1",
        )
        self.checkpoint_duration_histogram = self._meter.create_histogram(
            name="checkpoint_runtime.checkpoint_duration_ms",
            description="Time taken to complete a checkpoint",
            unit="ms",
        )
        self.active_runs_gauge = self._meter.create_up_down_counter(
            name="checkpoint_runtime.active_runs",
            description="Number of currently active training runs",
            unit="1",
        )
        self.checkpoint_bytes_counter = self._meter.create_counter(
            name="checkpoint_runtime.checkpoint_bytes_total",
            description="Total bytes written across all checkpoints",
            unit="By",
        )


class _NoOpProvider:
    def get_tracer(self, name: str = "") -> _NoOpTracer:
        return _NoOpTracer()

    def get_meter(self, name: str = "") -> _NoOpMeter:
        return _NoOpMeter()

    def shutdown(self) -> None:
        pass


class _NoOpTracer:
    def start_as_current_span(self, name: str, **kwargs: Any) -> Any:
        from contextlib import nullcontext
        return nullcontext()


class _NoOpMeter:
    def create_counter(self, **kwargs: Any) -> _NoOpCounter:
        return _NoOpCounter()

    def create_histogram(self, **kwargs: Any) -> _NoOpHistogram:
        return _NoOpHistogram()

    def create_up_down_counter(self, **kwargs: Any) -> _NoOpGauge:
        return _NoOpGauge()


class _NoOpCounter:
    def add(self, value: int = 1, **kwargs: Any) -> None:
        pass


class _NoOpHistogram:
    def record(self, value: float, **kwargs: Any) -> None:
        pass


class _NoOpGauge:
    def add(self, value: int = 1, **kwargs: Any) -> None:
        pass


_default_manager: TelemetryManager | None = None


def get_telemetry_manager() -> TelemetryManager:
    global _default_manager
    if _default_manager is None:
        _default_manager = TelemetryManager()
    return _default_manager


def setup_telemetry(
    service_name: str | None = None,
    otlp_endpoint: str | None = None,
    enabled: bool | None = None,
) -> TelemetryManager:
    global _default_manager
    kwargs: dict[str, Any] = {}
    if service_name is not None:
        kwargs["service_name"] = service_name
    if otlp_endpoint is not None:
        kwargs["otlp_endpoint"] = otlp_endpoint
    if enabled is not None:
        kwargs["enabled"] = enabled

    _default_manager = TelemetryManager(**kwargs)
    _default_manager.setup()
    return _default_manager
