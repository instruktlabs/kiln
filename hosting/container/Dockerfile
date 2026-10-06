# Private per-job CPU image. Build only the four-file context in README.md.
FROM node:22.23.3-trixie-slim@sha256:154ba2f4d6fec323d28e4f4bb86bba4677f1223391a1979cf521304e03a98dfa
RUN npm install --global npm@12.2.0 --ignore-scripts --no-audit --no-fund
WORKDIR /opt/kiln
COPY candidate.tgz candidate.sha256 ./
RUN sha256sum -c candidate.sha256 \
    && npm init -y \
    && npm install ./candidate.tgz --omit=dev --include=optional --ignore-scripts --no-audit --no-fund \
    && dpkg-query -W > os-packages.txt \
    && node --version > node-version.txt
COPY evaluate.mjs ./
# User IDs are defense in depth only; Cloudflare's durable_object scheduling
# grants processes root capabilities. The fresh offline microVM is the boundary.
USER node
CMD ["/usr/bin/sleep", "infinity"]
