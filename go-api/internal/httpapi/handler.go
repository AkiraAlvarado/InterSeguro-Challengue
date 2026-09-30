// Package httpapi expone QR por HTTP y coordina el cálculo de estadísticas.
package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"

	"matrix-qr/go-api/internal/qr"
)

type qrRequest struct {
	Matrix [][]float64 `json:"matrix"`
}

type statisticsRequest struct {
	Q [][]float64 `json:"q"`
	R [][]float64 `json:"r"`
}

// NewQRHandler crea el handler que rota y factoriza la entrada, y reenvía Q y R a Node.
func NewQRHandler(statisticsURL string, client *http.Client) fiber.Handler {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	return func(c *fiber.Ctx) error {
		var input qrRequest
		if err := c.BodyParser(&input); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cuerpo de solicitud JSON inválido"})
		}

		result, err := qr.Factorize(input.Matrix)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
		}

		authorization := c.Get(fiber.HeaderAuthorization)
		if authorization == "" {
			if token := c.Cookies("matrixlab_token"); token != "" {
				// Node solo acepta Bearer entre servicios; el navegador conserva el JWT en cookie HttpOnly.
				authorization = "Bearer " + token
			}
		}
		statistics, err := requestStatistics(c.UserContext(), client, statisticsURL, authorization, statisticsRequest{Q: result.Q, R: result.R})
		if err != nil {
			log.Printf("falló la llamada al servicio de estadísticas: %v", err)
			return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": "servicio de estadísticas no disponible"})
		}

		return c.JSON(fiber.Map{"rotated": qr.RotateClockwise(input.Matrix), "q": result.Q, "r": result.R, "statistics": statistics})
	}
}

func requestStatistics(parent context.Context, client *http.Client, baseURL, authorization string, payload statisticsRequest) (json.RawMessage, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode statistics request: %w", err)
	}
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/api/statistics", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create statistics request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(fiber.HeaderAuthorization, authorization)

	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("call statistics service: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("statistics service returned status %d", response.StatusCode)
	}

	var result json.RawMessage
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode statistics response: %w", err)
	}
	return result, nil
}
