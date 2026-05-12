package app

import (
	"errors"
	"path/filepath"
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

func seedPendingAuthState(t *testing.T, pendingPath string) {
	t.Helper()
	initial := loginPendingState{
		LoginStatusFile: LoginStatusFile{
			Success:          true,
			Status:           "pending_code",
			Email:            "alice@example.com",
			ProfileDir:       filepath.Dir(pendingPath),
			PendingStatePath: pendingPath,
			StorageStatePath: filepath.Join(filepath.Dir(pendingPath), "storage.json"),
			ProbePath:        filepath.Join(filepath.Dir(pendingPath), "probe.json"),
			ClientVersion:    "client-v1",
		},
		LoginOptionsToken: "login-options-token",
		CSRFState:         "csrf-state",
		DeviceID:          "device-id",
	}
	if err := writeLoginPendingState(pendingPath, initial); err != nil {
		t.Fatalf("seed pending state failed: %v", err)
	}
}

func TestWriteSessionArtifacts_PreservesPendingAuthFields(t *testing.T) {
	tmp := t.TempDir()
	account := NotionAccount{
		Email:            "alice@example.com",
		ProfileDir:       filepath.Join(tmp, "profile"),
		PendingStatePath: filepath.Join(tmp, "pending.json"),
		StorageStatePath: filepath.Join(tmp, "storage.json"),
		ProbeJSON:        filepath.Join(tmp, "probe.json"),
	}
	seedPendingAuthState(t, account.PendingStatePath)

	err := writeSessionArtifacts(account, SessionInfo{
		UserEmail:     account.Email,
		ClientVersion: "client-v2",
		UserID:        "user-1",
		UserName:      "alice",
		SpaceID:       "space-1",
		SpaceViewID:   "space-view-1",
		SpaceName:     "workspace",
		Cookies: []ProbeCookie{{
			Name:  "token_v2",
			Value: "cookie-value",
		}},
	})
	if err != nil {
		t.Fatalf("writeSessionArtifacts failed: %v", err)
	}

	got, err := readLoginPendingState(account.PendingStatePath)
	if err != nil {
		t.Fatalf("read pending state failed: %v", err)
	}
	if got.LoginOptionsToken != "login-options-token" {
		t.Fatalf("login_options_token lost: got %q", got.LoginOptionsToken)
	}
	if got.CSRFState != "csrf-state" {
		t.Fatalf("csrf_state lost: got %q", got.CSRFState)
	}
	if got.DeviceID != "device-id" {
		t.Fatalf("device_id lost: got %q", got.DeviceID)
	}
}

func TestWriteSessionRefreshFailure_PreservesPendingAuthFields(t *testing.T) {
	tmp := t.TempDir()
	account := NotionAccount{
		Email:            "alice@example.com",
		ProfileDir:       filepath.Join(tmp, "profile"),
		PendingStatePath: filepath.Join(tmp, "pending.json"),
		StorageStatePath: filepath.Join(tmp, "storage.json"),
		ProbeJSON:        filepath.Join(tmp, "probe.json"),
		UserID:           "user-1",
		UserName:         "alice",
		SpaceID:          "space-1",
		SpaceViewID:      "space-view-1",
		SpaceName:        "workspace",
		ClientVersion:    "client-v2",
		LastLoginAt:      "2026-05-13T10:00:00Z",
	}
	seedPendingAuthState(t, account.PendingStatePath)

	writeSessionRefreshFailure(account, errors.New("refresh failed"))

	got, err := readLoginPendingState(account.PendingStatePath)
	if err != nil {
		t.Fatalf("read pending state failed: %v", err)
	}
	if got.LoginOptionsToken != "login-options-token" {
		t.Fatalf("login_options_token lost: got %q", got.LoginOptionsToken)
	}
	if got.CSRFState != "csrf-state" {
		t.Fatalf("csrf_state lost: got %q", got.CSRFState)
	}
	if got.DeviceID != "device-id" {
		t.Fatalf("device_id lost: got %q", got.DeviceID)
	}
}
