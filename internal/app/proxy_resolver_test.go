package app

import (
	"net/url"
	"strings"
	"testing"
)

func TestProxyResolver_ResinModeFallbackToForward_WhenInvalidMode(t *testing.T) {
	cfg := normalizeConfig(AppConfig{
		ProxyMode:        proxyModeResinForward,
		ResinEnabled:     true,
		ResinURL:         "http://127.0.0.1:2260/token-a",
		ResinPlatform:    "Default",
		ResinMode:        "invalid-mode",
		ResinAuthVersion: "V1",
	})
	r := NewProxyResolver(cfg)
	target, _ := url.Parse("https://www.notion.so/api/v3/enqueueTask")
	proxyURL, headers, err := r.ResolveProxyForRequest("u@example.com", target)
	if err != nil {
		t.Fatalf("resolve proxy failed: %v", err)
	}
	if proxyURL == nil {
		t.Fatalf("expected fallback forward proxy url, got nil")
	}
	if proxyURL.User == nil {
		t.Fatalf("expected proxy credentials in fallback forward mode")
	}
	if got := headers[defaultResinAccountHeader]; got == "" {
		t.Fatalf("expected sticky account header in fallback forward mode")
	}
}

func TestProxyResolver_StickyIdentityFromEmailWhenNoStickyOverride(t *testing.T) {
	cfg := normalizeConfig(AppConfig{
		ProxyMode:        proxyModeResinForward,
		ResinEnabled:     true,
		ResinURL:         "http://127.0.0.1:2260/token-b",
		ResinPlatform:    "Default",
		ResinMode:        "forward",
		ResinAuthVersion: "V1",
	})
	r := NewProxyResolver(cfg)
	target, _ := url.Parse("https://www.notion.so/api/v3/enqueueTask")
	_, headers, err := r.ResolveProxyForRequest("user.name+tag@example.com", target)
	if err != nil {
		t.Fatalf("resolve proxy failed: %v", err)
	}
	got := headers[defaultResinAccountHeader]
	if got == "" {
		t.Fatalf("expected sticky identity header")
	}
	if got == "account" {
		t.Fatalf("expected identity derived from email, got fallback %q", got)
	}
}

func TestProxyResolver_ResinModeSocks5_LegacyV0FallsBackToForwardHTTP(t *testing.T) {
	cfg := normalizeConfig(AppConfig{
		ProxyMode:        proxyModeResinForward,
		ResinEnabled:     true,
		ResinURL:         "http://127.0.0.1:2260/token-c",
		ResinPlatform:    "Default",
		ResinMode:        "socks5",
		ResinAuthVersion: "LEGACY_V0",
	})
	r := NewProxyResolver(cfg)
	target, _ := url.Parse("https://www.notion.so/api/v3/enqueueTask")
	proxyURL, _, err := r.ResolveProxyForRequest("u@example.com", target)
	if err != nil {
		t.Fatalf("resolve proxy failed: %v", err)
	}
	if proxyURL == nil {
		t.Fatalf("expected fallback proxy url")
	}
	if proxyURL.Scheme != "http" {
		t.Fatalf("expected forward http fallback for LEGACY_V0 socks5, got %q", proxyURL.Scheme)
	}
}

func TestProxyResolver_ResinModeSocks5_V1UsesSocks5(t *testing.T) {
	cfg := normalizeConfig(AppConfig{
		ProxyMode:        proxyModeResinForward,
		ResinEnabled:     true,
		ResinURL:         "http://127.0.0.1:2260/token-d",
		ResinPlatform:    "Default",
		ResinMode:        "socks5",
		ResinAuthVersion: "V1",
	})
	r := NewProxyResolver(cfg)
	target, _ := url.Parse("https://www.notion.so/api/v3/enqueueTask")
	proxyURL, _, err := r.ResolveProxyForRequest("u@example.com", target)
	if err != nil {
		t.Fatalf("resolve proxy failed: %v", err)
	}
	if proxyURL == nil {
		t.Fatalf("expected socks5 proxy url")
	}
	if proxyURL.Scheme != "socks5" {
		t.Fatalf("expected socks5 scheme for V1 socks5 mode, got %q", proxyURL.Scheme)
	}
}

func TestRedactProxyURL_RemovesCredentials(t *testing.T) {
	in := "http://Default.alice:secret-token@127.0.0.1:2260"
	out := redactProxyURLForLog(in)
	if strings.Contains(out, "secret-token") {
		t.Fatalf("expected token redacted")
	}
	if strings.Contains(out, "alice") {
		t.Fatalf("expected username/account redacted")
	}
}
