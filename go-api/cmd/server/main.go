package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"matrix-qr/go-api/internal/auth"
	"matrix-qr/go-api/internal/httpapi"
)

func main() {
	port := envOr("PORT", "8080")
	statisticsURL := envOr("STATISTICS_API_URL", "http://node-api:3000")
	appEnvironment := envOr("APP_ENV", "development")
	jwtSecret := os.Getenv("JWT_SECRET")
	frontendOrigin := os.Getenv("FRONTEND_ORIGIN")
	if appEnvironment == "production" {
		if len([]byte(jwtSecret)) < 32 || !strings.HasPrefix(frontendOrigin, "https://") {
			log.Fatal("Configuración insegura: producción requiere JWT_SECRET de 32+ bytes y FRONTEND_ORIGIN HTTPS")
		}
	} else {
		jwtSecret = envOr("JWT_SECRET", "local-dev-secret-change-me")
		frontendOrigin = envOr("FRONTEND_ORIGIN", "http://localhost:5173")
	}

	app := newApp(statisticsURL, jwtSecret, frontendOrigin)
	log.Printf("Go API listening on :%s", port)
	log.Fatal(app.Listen(":" + port))
}

// newApp registra middleware y rutas para reutilizarlas en tests de integración.
func newApp(statisticsURL, jwtSecret, frontendOrigin string) *fiber.App {
	app := fiber.New(fiber.Config{AppName: "Matrix QR API", BodyLimit: 2 << 20})
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(limiter.New(limiter.Config{Max: 120, Expiration: time.Minute}))
	app.Use(cors.New(cors.Config{
		AllowOrigins: frontendOrigin,
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, OPTIONS",
		AllowCredentials: true,
	}))
	app.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "service": "go-api"})
	})
	app.Get("/api/session", auth.Middleware(jwtSecret, frontendOrigin), func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"authenticated": true})
	})
	app.Post("/api/qr", auth.Middleware(jwtSecret, frontendOrigin), httpapi.NewQRHandler(statisticsURL, &http.Client{Timeout: 5 * time.Second}))
	return app
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
