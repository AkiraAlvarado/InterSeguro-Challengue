package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestQRHandlerCallsStatisticsAPI(t *testing.T) {
	statisticsServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/statistics" || r.Method != http.MethodPost {
			t.Errorf("unexpected downstream request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer integration-token" {
			t.Errorf("downstream authorization = %q, want propagated bearer token", r.Header.Get("Authorization"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"sum":42}`))
	}))
	defer statisticsServer.Close()

	app := fiber.New()
	app.Post("/api/qr", NewQRHandler(statisticsServer.URL, statisticsServer.Client()))
	request := httptest.NewRequest(http.MethodPost, "/api/qr", strings.NewReader(`{"matrix":[[1,0],[0,1]]}`))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: "matrixlab_token", Value: "integration-token"})
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
}

func TestQRHandlerRejectsInvalidMatrix(t *testing.T) {
	app := fiber.New()
	app.Post("/api/qr", NewQRHandler("http://127.0.0.1:1", nil))
	request := httptest.NewRequest(http.MethodPost, "/api/qr", strings.NewReader(`{"matrix":[[1,2],[3]]}`))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test() error = %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusBadRequest)
	}
}
