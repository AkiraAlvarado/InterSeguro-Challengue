package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func integrationToken(secret string) string {
	encode := func(value string) string { return base64.RawURLEncoding.EncodeToString([]byte(value)) }
	header := encode(`{"alg":"HS256","typ":"JWT"}`)
	payload := encode(fmt.Sprintf(`{"sub":"integration-user","exp":%d}`, time.Now().Add(time.Hour).Unix()))
	message := header + "." + payload
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(message))
	return message + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func TestApplicationEndToEndWithCookieAndOriginValidation(t *testing.T) {
	const secret = "integration-test-secret"
	const frontendOrigin = "http://localhost:5173"
	token := integrationToken(secret)

	statisticsServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/statistics" {
			t.Errorf("unexpected statistics request: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer "+token {
			t.Errorf("downstream authorization = %q, want propagated token", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"combined":{"sum":42}}`))
	}))
	defer statisticsServer.Close()

	app := newApp(statisticsServer.URL, secret, frontendOrigin)

	unauthorized := httptest.NewRequest(http.MethodPost, "/api/qr", strings.NewReader(`{"matrix":[[1,0],[0,1]]}`))
	unauthorized.Header.Set("Content-Type", "application/json")
	unauthorizedResponse, err := app.Test(unauthorized)
	if err != nil {
		t.Fatal(err)
	}
	defer unauthorizedResponse.Body.Close()
	if unauthorizedResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated QR status = %d, want %d", unauthorizedResponse.StatusCode, http.StatusUnauthorized)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/qr", strings.NewReader(`{"matrix":[[1,2],[3,4],[5,6]]}`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", frontendOrigin)
	request.AddCookie(&http.Cookie{Name: "matrixlab_token", Value: token})
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("authenticated QR status = %d, want %d", response.StatusCode, http.StatusOK)
	}

	var result struct {
		Rotated    [][]float64      `json:"rotated"`
		Q          [][]float64      `json:"q"`
		R          [][]float64      `json:"r"`
		Statistics json.RawMessage `json:"statistics"`
	}
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatalf("decode QR response: %v", err)
	}
	if len(result.Rotated) != 2 || len(result.Rotated[0]) != 3 || result.Rotated[0][0] != 5 {
		t.Fatalf("unexpected rotated matrix: %v", result.Rotated)
	}
	if len(result.Q) != 3 || len(result.Q[0]) != 2 || len(result.R) != 2 || len(result.Statistics) == 0 {
		t.Fatalf("unexpected QR/statistics response: Q=%dx? R=%dx? statistics=%s", len(result.Q), len(result.R), result.Statistics)
	}

	csrfRequest := httptest.NewRequest(http.MethodGet, "/api/session", nil)
	csrfRequest.Header.Set("Origin", "https://untrusted.example")
	csrfRequest.AddCookie(&http.Cookie{Name: "matrixlab_token", Value: token})
	csrfResponse, err := app.Test(csrfRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer csrfResponse.Body.Close()
	if csrfResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("untrusted cookie origin status = %d, want %d", csrfResponse.StatusCode, http.StatusUnauthorized)
	}
}
