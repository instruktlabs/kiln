# Qualification image only. Supply a minimal context as described in README.md.
# Pin the Node 22.23.3 multi-platform image index; build specifically for linux/amd64.
FROM node:22.23.3-bookworm-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
RUN apt-get update && apt-get install -y --no-install-recommends \
    bubblewrap util-linux mesa-vulkan-drivers libvulkan1 ca-certificates \
    && chmod u-s,g-s /usr/bin/bwrap \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global npm@12.2.0 --no-audit --no-fund
WORKDIR /app
COPY candidate.tgz candidate.sha256 /probe/
RUN cd /probe && sha256sum -c candidate.sha256
RUN npm init -y && npm install /probe/candidate.tgz --omit=dev --include=optional \
    --ignore-scripts --no-audit --no-fund
COPY native-qualification.mjs run-native-qualification.mjs /probe/hosting/
COPY smoke-renderer.mjs /probe/
# Retain the OS dependency inventory next to the exact npm lock in the image.
RUN dpkg-query -W > /probe/os-packages.txt \
    && node --version > /probe/node-version.txt \
    && test -f /usr/share/vulkan/icd.d/lvp_icd.x86_64.json
ENV VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.x86_64.json
ENV KILN_RENDER=cpu
USER node
CMD ["node", "/probe/hosting/run-native-qualification.mjs", "/app/node_modules/@instruktlabs/kiln", "/tmp/qualification", "/probe/candidate.tgz"]
