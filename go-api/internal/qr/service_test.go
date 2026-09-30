package qr

import (
	"math"
	"testing"
)

func TestFactorizeReconstructsMatrix(t *testing.T) {
	input := [][]float64{{12, -51, 4}, {6, 167, -68}, {-4, 24, -41}}
	result, err := Factorize(input)
	if err != nil {
		t.Fatalf("Factorize() error = %v", err)
	}

	for i := range input {
		for j := range input[0] {
			reconstructed := 0.0
			for k := range result.R {
				reconstructed += result.Q[i][k] * result.R[k][j]
			}
			if math.Abs(reconstructed-input[i][j]) > 1e-9 {
				t.Errorf("Q*R at (%d,%d) = %g, want %g", i, j, reconstructed, input[i][j])
			}
		}
	}
	for i := range result.Q[0] {
		for j := range result.Q[0] {
			dotProduct := 0.0
			for row := range result.Q {
				dotProduct += result.Q[row][i] * result.Q[row][j]
			}
			want := 0.0
			if i == j {
				want = 1
			}
			if math.Abs(dotProduct-want) > 1e-9 {
				t.Errorf("Q columns %d and %d dot product = %g, want %g", i, j, dotProduct, want)
			}
		}
	}
	for i := 1; i < len(result.R); i++ {
		for j := 0; j < i; j++ {
			if math.Abs(result.R[i][j]) > 1e-9 {
				t.Errorf("R[%d][%d] = %g, want zero below the diagonal", i, j, result.R[i][j])
			}
		}
	}
}

func TestFactorizeRectangularMatrix(t *testing.T) {
	result, err := Factorize([][]float64{{1, 2}, {3, 4}, {5, 6}})
	if err != nil {
		t.Fatalf("Factorize() error = %v", err)
	}
	if len(result.Q) != 3 || len(result.Q[0]) != 2 || len(result.R) != 2 || len(result.R[0]) != 2 {
		t.Fatalf("unexpected thin QR dimensions: Q=%dx%d R=%dx%d", len(result.Q), len(result.Q[0]), len(result.R), len(result.R[0]))
	}
}

func TestRotateClockwiseRectangularMatrix(t *testing.T) {
	got := RotateClockwise([][]float64{{1, 2, 3}, {4, 5, 6}})
	want := [][]float64{{4, 1}, {5, 2}, {6, 3}}
	if len(got) != len(want) {
		t.Fatalf("rotated rows = %d, want %d", len(got), len(want))
	}
	for row := range want {
		for column := range want[row] {
			if got[row][column] != want[row][column] {
				t.Errorf("rotated[%d][%d] = %g, want %g", row, column, got[row][column], want[row][column])
			}
		}
	}
}

func TestRotateClockwiseEmptyMatrix(t *testing.T) {
	if got := RotateClockwise(nil); got != nil {
		t.Fatalf("RotateClockwise(nil) = %v, want nil", got)
	}
}

func TestValidateMatrixRejectsInvalidShapes(t *testing.T) {
	tests := []struct {
		name   string
		matrix [][]float64
	}{
		{name: "empty", matrix: [][]float64{}},
		{name: "ragged", matrix: [][]float64{{1, 2}, {3}}},
		{name: "wide", matrix: [][]float64{{1, 2, 3}, {4, 5, 6}}},
		{name: "non-finite", matrix: [][]float64{{math.NaN()}}},
	}
	tooTall := make([][]float64, maxMatrixDimension+1)
	for row := range tooTall {
		tooTall[row] = []float64{1}
	}
	tests = append(tests, struct {
		name   string
		matrix [][]float64
	}{name: "dimension-limit", matrix: tooTall})
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := ValidateMatrix(test.matrix); err == nil {
				t.Fatal("ValidateMatrix() expected an error")
			}
		})
	}
}
