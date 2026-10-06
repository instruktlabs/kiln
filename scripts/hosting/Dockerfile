# Qualification image only. Supply a minimal context as described in README.md.
# Pin the Node 22.23.3 multi-platform image index; build specifically for linux/amd64.
# Bookworm Mesa 22.3 lacks shaderUniform*ArrayDynamicIndexing required by Dawn.
FROM node:22.23.3-trixie-slim@sha256:154ba2f4d6fec323d28e4f4bb86bba4677f1223391a1979cf521304e03a98dfa
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
    && set -- /usr/share/vulkan/icd.d/lvp_icd*.json \
    && test "$#" -eq 1 && test -f "$1" \
    && ln -s "$1" /probe/lvp-icd.json
ENV VK_ICD_FILENAMES=/probe/lvp-icd.json
ENV KILN_RENDER=cpu
USER node
CMD ["node", "/probe/hosting/run-native-qualification.mjs", "/app/node_modules/@instruktlabs/kiln", "/tmp/qualification", "/probe/candidate.tgz"]
