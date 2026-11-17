# Image for running LLM-written analysis code. It holds only Python, pandas and numpy: no project code,
# no credentials, no database drivers. The container is started with no network and a read-only filesystem.
FROM python:3.12-slim
RUN pip install --no-cache-dir pandas==2.2.3 numpy==2.1.3 && useradd --no-create-home --uid 10001 runner
COPY runner.py /opt/runner.py
USER 10001
WORKDIR /tmp
ENTRYPOINT ["python", "-I", "/opt/runner.py"]
