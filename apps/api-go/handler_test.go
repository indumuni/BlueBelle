package apigo

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRoutes(t *testing.T) {
	tests := []struct {
		name     string
		method   string
		path     string
		wantCode int
		wantBody string
	}{
		{"health ok", http.MethodGet, "/health", http.StatusOK, `{"status":"ok"}`},
		{"health wrong method", http.MethodPost, "/health", http.StatusMethodNotAllowed, ""},
		{"not found", http.MethodGet, "/nope", http.StatusNotFound, ""},
	}
	mux := NewMux()
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			mux.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, nil))
			if rec.Code != tc.wantCode {
				t.Fatalf("code = %d, want %d", rec.Code, tc.wantCode)
			}
			if tc.wantBody != "" && strings.TrimSpace(rec.Body.String()) != tc.wantBody {
				t.Fatalf("body = %q, want %q", rec.Body.String(), tc.wantBody)
			}
		})
	}
}
