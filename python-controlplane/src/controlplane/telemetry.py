"""OpenTelemetry instrumentation setup for the control plane.

Provides helpers for initialising tracing, metrics, and logging exporters
that ship data to an OTLP-compatible backend (e.g. Jaeger, Grafana Tempo).

This is a placeholder; the real setup will configure resource attributes,
span processors, and metric readers.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class TelemetryConfig:
    """Configuration for the telemetry subsystem."""

    service_name: str = "checkpoint-controlplane"
    otlp_endpoint: str = "http://localhost:4317"
    enable_tracing: bool = True
    enable_metrics: bool = True
    enable_logging: bool = True
    sample_rate: float = 1.0  # 0.0 - 1.0


class TelemetryManager:
    """Bootstrap and manage OpenTelemetry providers.

    Usage::

        mgr = TelemetryManager(TelemetryConfig())
        mgr.setup()
        # ... application runs ...
        mgr.shutdown()
    """

    def __init__(self, config: TelemetryConfig | None = None) -> None:
        self._config = config or TelemetryConfig()
        self._tracer_provider = None
        self._meter_provider = None
        self._initialized = False

    # -- setup / teardown -----------------------------------------------------

    def setup(self) -> None:
        """Initialise OTel providers and exporters.

        TODO: Wire up real providers:
        - TracerProvider with BatchSpanProcessor + OTLPSpanExporter
        - MeterProvider with PeriodicExportingMetricReader + OTLPMetricExporter
        - LoggerProvider with BatchLogRecordProcessor + OTLPLogExporter
        """
        if self._initialized:
            logger.warning("Telemetry already initialised; skipping")
            return

        logger.info(
            "Initialising telemetry: service=%s endpoint=%s",
            self._config.service_name,
            self._config.otlp_endpoint,
        )

        if self._config.enable_tracing:
            self._setup_tracing()

        if self._config.enable_metrics:
            self._setup_metrics()

        if self._config.enable_logging:
            self._setup_logging()

        self._initialized = True
        logger.info("Telemetry initialised successfully")

    def shutdown(self) -> None:
        """Flush pending spans / metrics and shut down providers."""
        if not self._initialized:
            return
        logger.info("Shutting down telemetry providers")
        # Placeholder: flush and shutdown providers
        self._initialized = False

    # -- internal helpers -----------------------------------------------------

    def _setup_tracing(self) -> None:
        """Configure the TracerProvider (placeholder)."""
        logger.debug("Setting up tracing with sample_rate=%.2f", self._config.sample_rate)
        # from opentelemetry.sdk.trace import TracerProvider
        # from opentelemetry.sdk.trace.export import BatchSpanProcessor
        # from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        #
        # resource = Resource.create({"service.name": self._config.service_name})
        # provider = TracerProvider(resource=resource)
        # exporter = OTLPSpanExporter(endpoint=self._config.otlp_endpoint)
        # provider.add_span_processor(BatchSpanProcessor(exporter))
        # trace.set_tracer_provider(provider)
        # self._tracer_provider = provider

    def _setup_metrics(self) -> None:
        """Configure the MeterProvider (placeholder)."""
        logger.debug("Setting up metrics export")
        # from opentelemetry.sdk.metrics import MeterProvider
        # from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        # from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
        #
        # exporter = OTLPMetricExporter(endpoint=self._config.otlp_endpoint)
        # reader = PeriodicExportingMetricReader(exporter)
        # provider = MeterProvider(metric_readers=[reader])
        # metrics.set_meter_provider(provider)
        # self._meter_provider = provider

    def _setup_logging(self) -> None:
        """Configure OTel log export (placeholder)."""
        logger.debug("Setting up OTel log export")
        # Placeholder: wire LoggerProvider with OTLPLogExporter


def get_tracer(name: str = "controlplane"):
    """Return an OTel tracer for the given instrumentation scope.

    TODO: Return a real tracer once the provider is wired.
    """
    logger.debug("Requested tracer: %s (returning no-op)", name)
    return None


def get_meter(name: str = "controlplane"):
    """Return an OTel meter for the given instrumentation scope.

    TODO: Return a real meter once the provider is wired.
    """
    logger.debug("Requested meter: %s (returning no-op)", name)
    return None
