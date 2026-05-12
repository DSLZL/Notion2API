package app

import (
	"strings"
	"testing"
)

func TestNormalizeConfig_ResinAuthDefaults(t *testing.T) {
	cfg := normalizeConfig(AppConfig{
		ProxyMode:     "resin_forward",
		ResinEnabled:  true,
		ResinURL:      "http://127.0.0.1:2260/legacy-token",
		ResinMode:     "forward",
		ResinPlatform: "Default",
	})
	if got := strings.TrimSpace(cfg.ResinAuthVersion); got != "V1" {
		t.Fatalf("expected default V1 auth version, got %q", got)
	}
	if got := strings.TrimSpace(cfg.ResinProxyToken); got != "" {
		t.Fatalf("expected explicit token empty by default, got %q", got)
	}
}

func TestNormalizeConfig_ResinAuthVersion_InvalidFallsBackToV1(t *testing.T) {
	cfg := normalizeConfig(AppConfig{
		ProxyMode:        "resin_forward",
		ResinEnabled:     true,
		ResinURL:         "http://127.0.0.1:2260/legacy-token",
		ResinMode:        "forward",
		ResinAuthVersion: "bad-value",
		ResinProxyToken:  "token-x",
		ResinPlatform:    "Default",
	})
	if got := strings.TrimSpace(cfg.ResinAuthVersion); got != "V1" {
		t.Fatalf("expected invalid auth version fallback to V1, got %q", got)
	}
}
