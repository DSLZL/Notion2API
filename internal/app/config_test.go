package app

import (
	"context"
	"errors"
	"os"
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

func TestDefaultConfig_AdminStaticDirDefaultsToFrontendDist(t *testing.T) {
	cfg := defaultConfig()
	if got := strings.TrimSpace(cfg.Admin.StaticDir); got != "frontend/dist/admin" {
		t.Fatalf("expected default admin static dir frontend/dist/admin, got %q", got)
	}
}

func TestResolveStaticAdminDirUsesFrontendDistWhenPresent(t *testing.T) {
	tmp := t.TempDir()
	frontendDir := filepath.Join(tmp, "frontend", "dist", "admin")
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd failed: %v", err)
	}
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir tmp failed: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Chdir(wd)
	})

	got := resolveStaticAdminDir("")
	if got != filepath.Clean("frontend/dist/admin") {
		t.Fatalf("expected default admin static dir %q, got %q", filepath.Clean("frontend/dist/admin"), got)
	}

	if err := os.MkdirAll(frontendDir, 0o755); err != nil {
		t.Fatalf("create frontend dist dir failed: %v", err)
	}
	got = resolveStaticAdminDir("")
	if got != filepath.Clean("frontend/dist/admin") {
		t.Fatalf("expected frontend dist dir %q, got %q", filepath.Clean("frontend/dist/admin"), got)
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

func TestRotateAccountStickyProxyAccount_UsesExistingBase(t *testing.T) {
	oldSuffix := stickyRotationSuffix
	stickyRotationSuffix = func() string { return "next" }
	t.Cleanup(func() {
		stickyRotationSuffix = oldSuffix
	})

	cfg := normalizeConfig(AppConfig{
		Accounts: []NotionAccount{{
			Email:              "alice@example.com",
			StickyProxyAccount: "alice",
		}},
	})

	updated, account, rotatedTo, err := rotateAccountStickyProxyAccount(cfg, "alice@example.com")
	if err != nil {
		t.Fatalf("rotateAccountStickyProxyAccount failed: %v", err)
	}
	if rotatedTo != "alice-next" {
		t.Fatalf("expected rotated sticky account alice-next, got %q", rotatedTo)
	}
	if account.StickyProxyAccount != "alice-next" {
		t.Fatalf("expected updated account sticky_proxy_account alice-next, got %q", account.StickyProxyAccount)
	}
	reloaded, _, ok := updated.FindAccount("alice@example.com")
	if !ok {
		t.Fatalf("expected rotated account to remain in config")
	}
	if reloaded.StickyProxyAccount != "alice-next" {
		t.Fatalf("expected persisted sticky_proxy_account alice-next, got %q", reloaded.StickyProxyAccount)
	}
}

func TestStartEmailLoginWithStickyRetry_RotatesResinStickyAfterNetworkFailure(t *testing.T) {
	oldAttempt := startEmailLoginAttempt
	oldSuffix := stickyRotationSuffix
	startEmailLoginAttempt = func(_ context.Context, cfg AppConfig, req LoginStartRequest) (LoginStatusFile, error) {
		account, _, ok := cfg.FindAccount(req.AccountEmail)
		if !ok {
			t.Fatalf("expected account %q in config", req.AccountEmail)
		}
		switch account.StickyProxyAccount {
		case "alice":
			return LoginStatusFile{}, errors.New("fetch login bootstrap: surf: HTTP/2 request failed: uTLS.HandshakeContext() error: context deadline exceeded | UPSTREAM_REQUEST_FAILED connect_no_ingress_traffic")
		case "alice-next":
			return LoginStatusFile{Success: true, Status: "pending_code", Email: req.Email}, nil
		default:
			t.Fatalf("unexpected sticky proxy account %q", account.StickyProxyAccount)
			return LoginStatusFile{}, nil
		}
	}
	stickyRotationSuffix = func() string { return "next" }
	t.Cleanup(func() {
		startEmailLoginAttempt = oldAttempt
		stickyRotationSuffix = oldSuffix
	})

	cfg := normalizeConfig(AppConfig{
		ProxyMode:       "resin_forward",
		ResinEnabled:    true,
		ResinURL:        "http://127.0.0.1:2260/test-token",
		ResinPlatform:   "Default",
		ResinMode:       "forward",
		ResinAuthVersion:"V1",
		Accounts: []NotionAccount{{
			Email:              "alice@example.com",
			ProxyMode:          "resin_forward",
			ResinEnabled:       true,
			ResinURL:           "http://127.0.0.1:2260/test-token",
			ResinPlatform:      "Default",
			ResinMode:          "forward",
			ResinAuthVersion:   "V1",
			StickyProxyAccount: "alice",
		}},
	})

	status, updatedCfg, rotated, err := StartEmailLoginWithStickyRetry(context.Background(), cfg, LoginStartRequest{
		Email:        "alice@example.com",
		AccountEmail: "alice@example.com",
	})
	if err != nil {
		t.Fatalf("StartEmailLoginWithStickyRetry returned error: %v", err)
	}
	if !rotated {
		t.Fatalf("expected sticky account rotation after retryable Resin failure")
	}
	if !status.Success || status.Status != "pending_code" {
		t.Fatalf("expected successful pending_code status after retry, got %+v", status)
	}
	account, _, ok := updatedCfg.FindAccount("alice@example.com")
	if !ok {
		t.Fatalf("expected rotated account in updated config")
	}
	if account.StickyProxyAccount != "alice-next" {
		t.Fatalf("expected sticky proxy account alice-next after retry, got %q", account.StickyProxyAccount)
	}
}
