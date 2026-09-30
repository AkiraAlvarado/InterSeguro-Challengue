// Package qr valida matrices y calcula su factorización QR delgada.
package qr

import (
	"fmt"
	"math"

	"gonum.org/v1/gonum/mat"
)

const maxMatrixDimension = 256

// Result contiene Q y R, donde A = Q*R y las columnas de Q son ortonormales.
type Result struct {
	Q [][]float64 `json:"q"`
	R [][]float64 `json:"r"`
}

// RotateClockwise gira 90 grados en sentido horario una matriz rectangular.
func RotateClockwise(values [][]float64) [][]float64 {
	if len(values) == 0 || len(values[0]) == 0 {
		return nil
	}
	columns := len(values[0])
	for _, row := range values {
		if len(row) != columns {
			return nil
		}
	}
	rotated := make([][]float64, columns)
	for column := range rotated {
		rotated[column] = make([]float64, len(values))
		for row := range values {
			rotated[column][len(values)-1-row] = values[row][column]
		}
	}
	return rotated
}

// ValidateMatrix comprueba que la entrada no esté vacía, sea rectangular y m >= n.
func ValidateMatrix(values [][]float64) error {
	if len(values) == 0 || len(values[0]) == 0 {
		return fmt.Errorf("la matriz no puede estar vacía")
	}
	columns := len(values[0])
	if len(values) > maxMatrixDimension || columns > maxMatrixDimension {
		return fmt.Errorf("cada dimensión de la matriz debe ser como máximo %d", maxMatrixDimension)
	}
	if len(values) < columns {
		return fmt.Errorf("la matriz debe tener al menos tantas filas como columnas para QR delgada (m >= n)")
	}
	for rowIndex, row := range values {
		if len(row) != columns {
			return fmt.Errorf("la matriz debe ser rectangular: la fila %d tiene %d columnas; se esperaban %d", rowIndex, len(row), columns)
		}
		for columnIndex, value := range row {
			if math.IsNaN(value) || math.IsInf(value, 0) {
				return fmt.Errorf("el valor de la fila %d, columna %d debe ser finito", rowIndex, columnIndex)
			}
		}
	}
	return nil
}

// Factorize calcula QR delgada con las reflexiones de Householder de Gonum.
func Factorize(values [][]float64) (Result, error) {
	if err := ValidateMatrix(values); err != nil {
		return Result{}, err
	}

	rows, columns := len(values), len(values[0])
	flat := make([]float64, 0, rows*columns)
	for _, row := range values {
		flat = append(flat, row...)
	}

	var decomposition mat.QR
	decomposition.Factorize(mat.NewDense(rows, columns, flat))

	fullQ := mat.NewDense(rows, rows, nil)
	decomposition.QTo(fullQ)
	// Gonum requiere que RTo reciba una matriz m×n; la parte triangular
	// útil ocupa las primeras n filas, que se copian al resultado delgado.
	rDense := mat.NewDense(rows, columns, nil)
	decomposition.RTo(rDense)

	qValues := make([][]float64, rows)
	rValues := make([][]float64, columns)
	for i := range qValues {
		qValues[i] = make([]float64, columns)
		for j := range qValues[i] {
			qValues[i][j] = fullQ.At(i, j)
		}
	}
	for i := range rValues {
		rValues[i] = make([]float64, columns)
		for j := range rValues[i] {
			rValues[i][j] = rDense.At(i, j)
		}
	}

	return Result{Q: qValues, R: rValues}, nil
}
