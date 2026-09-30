package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"net/http/httptest"
)

func signedToken(secret string, expiry int64) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(`{"sub":"demo","exp":%d}`, expiry)))
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(header + "." + payload))
	return header + "." + payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestValidToken(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	if !ValidToken(signedToken("test-secret", now.Add(time.Hour).Unix()), "test-secret", now) {
		t.Fatal("expected valid signed token to pass")
	}
	if ValidToken(signedToken("test-secret", now.Add(-time.Second).Unix()), "test-secret", now) {
		t.Fatal("expected expired token to fail")
	}
	if ValidToken(signedToken("other-secret", now.Add(time.Hour).Unix()), "test-secret", now) {
		t.Fatal("expected token signed with another secret to fail")
	}
}

func TestMiddlewareProtectsRoute(t *testing.T) {
	app := fiber.New()
	app.Get("/protected", Middleware("test-secret", "http://localhost:5173"), func(c *fiber.Ctx) error {
		return c.SendStatus(fiber.StatusOK)
	})

	unauthorized, err := app.Test(httptest.NewRequest("GET", "/protected", nil))
	if err != nil {
		t.Fatal(err)
	}
	if unauthorized.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want %d", unauthorized.StatusCode, fiber.StatusUnauthorized)
	}

	now := time.Now()
	request := httptest.NewRequest("GET", "/protected", nil)
	request.Header.Set("Authorization", "Bearer "+signedToken("test-secret", now.Add(time.Hour).Unix()))
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != fiber.StatusOK {
		t.Fatalf("authenticated status = %d, want %d", response.StatusCode, fiber.StatusOK)
	}

	cookieRequest := httptest.NewRequest("GET", "/protected", nil)
	cookieRequest.AddCookie(&http.Cookie{Name: "matrixlab_token", Value: signedToken("test-secret", now.Add(time.Hour).Unix())})
	cookieRequest.Header.Set(fiber.HeaderOrigin, "http://localhost:5173")
	cookieResponse, err := app.Test(cookieRequest)
	if err != nil {
		t.Fatal(err)
	}
	if cookieResponse.StatusCode != fiber.StatusOK {
		t.Fatalf("cookie-authenticated status = %d, want %d", cookieResponse.StatusCode, fiber.StatusOK)
	}

	csrfRequest := httptest.NewRequest("GET", "/protected", nil)
	csrfRequest.AddCookie(&http.Cookie{Name: "matrixlab_token", Value: signedToken("test-secret", now.Add(time.Hour).Unix())})
	csrfRequest.Header.Set(fiber.HeaderOrigin, "https://attacker.example")
	csrfResponse, err := app.Test(csrfRequest)
	if err != nil {
		t.Fatal(err)
	}
	if csrfResponse.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("untrusted cookie origin status = %d, want %d", csrfResponse.StatusCode, fiber.StatusUnauthorized)
	}
}
