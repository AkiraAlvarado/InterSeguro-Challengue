FROM cgr.dev/chainguard/go:latest AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /tmp/go-api ./cmd/server

FROM cgr.dev/chainguard/static:latest
COPY --from=build /tmp/go-api /usr/local/bin/go-api
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/go-api"]
