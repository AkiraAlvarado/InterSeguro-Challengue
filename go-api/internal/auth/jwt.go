// Package auth valida JWT HS256 compartidos para las rutas protegidas de Go.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

type claims struct {
	Subject string `json:"sub"`
	Expires int64  `json:"exp"`
}

// Middleware acepta JWT por cookie HttpOnly o por Bearer para llamadas de servicio.
// Si autentica con cookie, exige el origen esperado como defensa adicional ante CSRF.
func Middleware(secret, trustedOrigin string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if secret == "" {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "JWT_SECRET no está configurado"})
		}
		token := ""
		usedCookie := false
		parts := strings.Fields(c.Get(fiber.HeaderAuthorization))
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			token = parts[1]
		} else {
			token = c.Cookies("matrixlab_token")
			usedCookie = token != ""
		}
		if usedCookie && (trustedOrigin == "" || c.Get(fiber.HeaderOrigin) != trustedOrigin) {
			return unauthorized(c)
		}
		if !ValidToken(token, secret, time.Now()) {
			return unauthorized(c)
		}
		return c.Next()
	}
}

// ValidToken verifica la estructura, firma HS256, sujeto y vencimiento del token.
func ValidToken(token, secret string, now time.Time) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 3 || secret == "" {
		return false
	}
	var header struct {
		Algorithm string `json:"alg"`
	}
	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || json.Unmarshal(headerBytes, &header) != nil || header.Algorithm != "HS256" {
		return false
	}
	providedSignature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(providedSignature, mac.Sum(nil)) {
		return false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return false
	}
	var tokenClaims claims
	if json.Unmarshal(payload, &tokenClaims) != nil {
		return false
	}
	return tokenClaims.Subject != "" && tokenClaims.Expires > now.Unix()
}

func unauthorized(c *fiber.Ctx) error {
	return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "se requiere una cookie de sesión o JWT Bearer válido"})
}
