"""E2E test configuration.

Register custom markers so pytest doesn't warn about unknown markers
when running from the repo root.
"""


def pytest_configure(config):
    config.addinivalue_line("markers", "e2e: end-to-end test requiring full Docker Compose stack")
