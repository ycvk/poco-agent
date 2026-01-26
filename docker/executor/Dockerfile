FROM ghcr.io/poco-ai/sandbox:latest

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN mkdir -p /app && chown -R ubuntu:ubuntu /app
WORKDIR /app

COPY --chown=ubuntu:ubuntu executor/pyproject.toml /app/pyproject.toml

USER ubuntu
RUN uv sync --no-dev
USER root

COPY --chown=ubuntu:ubuntu executor/app /app/app

COPY --chown=ubuntu:ubuntu docker/executor/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 8000 8080

ENTRYPOINT []
CMD ["/app/start.sh"]
