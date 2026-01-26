FROM ghcr.io/poco-ai/sandbox:latest

# Install uv via Gitee mirror
RUN curl -LsSf https://gitee.com/wangnov/uv-custom/releases/download/latest/uv-installer-custom.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/ \
    && mv /root/.local/bin/uvx /usr/local/bin/

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
