# Define custom function directory
ARG FUNCTION_DIR="/function"

# -----------------------------------------------------------------------------------------

FROM node:18-bullseye as build-image

# Custom path where playwright stores browser binaries
ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"

# Include global arg in this stage of the build
ARG FUNCTION_DIR

RUN apt-get update && \
    apt-get install -y \
    g++ \
    make \
    cmake \
    unzip \
    libcurl4-openssl-dev

WORKDIR ${FUNCTION_DIR}

# Install the runtime interface client at FUNCTION_DIR for aws lambda
RUN npm install aws-lambda-ric

COPY package.json package-lock.json /app/
RUN cd /app && npm install
COPY *.ts tsconfig.json /app/
RUN cd /app && npm run build && cp dist/* ${FUNCTION_DIR}/

# -----------------------------------------------------------------------------------------

FROM node:18-bullseye-slim

# Required for Node runtimes which use npm@8.6.0+ because
# by default npm writes logs under /home/.npm and Lambda fs is read-only
ENV NPM_CONFIG_CACHE=/tmp/.npm
ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"

# Include global arg in this stage of the build
ARG FUNCTION_DIR

WORKDIR ${FUNCTION_DIR}
COPY --from=build-image $PLAYWRIGHT_BROWSERS_PATH $PLAYWRIGHT_BROWSERS_PATH
RUN npx playwright install-deps chromium
COPY --from=build-image ${FUNCTION_DIR}/ ${FUNCTION_DIR}/

# Set runtime interface client as default command for the container runtime
ENTRYPOINT ["/usr/local/bin/npx", "aws-lambda-ric"]

# Pass the name of the function handler as an argument to the runtime
CMD ["index.handler"]

# -----------------------------------------------------------------------------------------

# Ref: 
# https://playwright.dev/docs/browsers#install-system-dependencies
# https://docs.aws.amazon.com/lambda/latest/dg/nodejs-image.html#nodejs-image-clients