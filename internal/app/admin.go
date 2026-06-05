package app

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const (
	adminLoginMaxFailures = 5
	adminLoginLockWindow  = 15 * time.Minute
)

var (
	adminSyncRequestTimeoutCap = 50 * time.Second
	adminSyncRequestTimeoutMin = 10 * time.Second
)

type AdminLoginAttempt struct {
	Failures    int
	LastFailure time.Time
	LockedUntil time.Time
}

func resolveStaticAdminDir(preferred string) string {
	preferred = strings.TrimSpace(preferred)
	if preferred == "" {
		preferred = "frontend/dist/admin"
	}
	candidates := []string{
		preferred,
		"frontend/dist/admin",
	}
	if override := strings.TrimSpace(os.Getenv("NOTION2API_STATIC_ADMIN_DIR")); override != "" {
		candidates = append([]string{override}, candidates...)
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, preferred))
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, preferred),
			filepath.Join(filepath.Dir(exeDir), preferred),
		)
	}
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		candidate = filepath.Clean(candidate)
		if candidate == "" {
			continue
		}
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		if stat, err := os.Stat(candidate); err == nil && stat.IsDir() {
			return candidate
		}
	}
	return filepath.Clean(preferred)
}

func requestedAdminDispatchMode(payload map[string]any) string {
	mode := strings.TrimSpace(strings.ToLower(stringValue(payload["dispatch_mode"])))
	switch mode {
	case "active", "pinned", "pin":
		return "active"
	case "pool", "auto", "":
		if boolValue(payload["pin_active_account"]) {
			return "active"
		}
		return "pool"
	default:
		if boolValue(payload["pin_active_account"]) {
			return "active"
		}
		return "pool"
	}
}

func adminSyncRequestTimeout(cfg AppConfig) time.Duration {
	base := time.Duration(maxInt(cfg.TimeoutSec, 1)) * time.Second
	timeout := base
	if timeout < adminSyncRequestTimeoutMin {
		timeout = adminSyncRequestTimeoutMin
	}
	// Agent mutations may perform multiple upstream fanout calls with retries.
	// Keep admin endpoints responsive for small global timeouts while allowing
	// enough headroom to complete the create/update/delete chain.
	if timeout < 20*time.Second {
		timeout = 20 * time.Second
	}
	if adminSyncRequestTimeoutCap > 0 && timeout > adminSyncRequestTimeoutCap {
		timeout = adminSyncRequestTimeoutCap
	}
	return timeout
}

func cloneRequestWithTimeout(r *http.Request, timeout time.Duration) (*http.Request, context.CancelFunc) {
	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	return r.Clone(ctx), cancel
}

func isTimeoutError(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(lower, "context deadline exceeded") || strings.Contains(lower, "timeout")
}

func writeAdminUpstreamError(w http.ResponseWriter, err error, extras map[string]any) {
	status := http.StatusBadGateway
	if isTimeoutError(err) {
		status = http.StatusGatewayTimeout
	}
	payload := map[string]any{
		"detail": err.Error(),
	}
	for key, value := range extras {
		payload[key] = value
	}
	writeJSON(w, status, payload)
}

func (a *App) serveIndex(w http.ResponseWriter) {
	w.Header().Set("Location", "/admin")
	w.WriteHeader(http.StatusFound)
}

func adminClientIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			if ip := strings.TrimSpace(parts[0]); ip != "" {
				return ip
			}
		}
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func securePasswordEqual(expected string, candidate string) bool {
	expectedBytes := []byte(expected)
	candidateBytes := []byte(candidate)
	return subtle.ConstantTimeCompare(expectedBytes, candidateBytes) == 1
}

func shouldUseSecureCookie(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https") {
		return true
	}
	return false
}

func adminMutatingMethod(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodPatch:
		return true
	default:
		return false
	}
}

func adminRequestHost(r *http.Request) string {
	if forwardedHost := strings.TrimSpace(r.Header.Get("X-Forwarded-Host")); forwardedHost != "" {
		parts := strings.Split(forwardedHost, ",")
		if len(parts) > 0 {
			if host := strings.TrimSpace(parts[0]); host != "" {
				return host
			}
		}
	}
	return strings.TrimSpace(r.Host)
}

func adminExpectedOrigin(r *http.Request) string {
	host := strings.ToLower(strings.TrimSpace(adminRequestHost(r)))
	if host == "" {
		return ""
	}
	scheme := "http"
	if shouldUseSecureCookie(r) {
		scheme = "https"
	}
	return scheme + "://" + host
}

func parseRequestOrigin(raw string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("missing scheme or host")
	}
	return strings.ToLower(parsed.Scheme) + "://" + strings.ToLower(parsed.Host), nil
}

func writeAdminOriginError(w http.ResponseWriter, detail string) bool {
	writeJSON(w, http.StatusForbidden, map[string]any{"detail": detail})
	return false
}

func (a *App) adminSameOriginOK(w http.ResponseWriter, r *http.Request) bool {
	if !adminMutatingMethod(r.Method) {
		return true
	}
	expected := adminExpectedOrigin(r)
	if expected == "" {
		return writeAdminOriginError(w, "unable to resolve admin origin")
	}
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	referer := strings.TrimSpace(r.Header.Get("Referer"))
	if origin == "" && referer == "" {
		return writeAdminOriginError(w, "origin or referer required for admin write requests")
	}
	if origin != "" {
		actual, err := parseRequestOrigin(origin)
		if err != nil {
			return writeAdminOriginError(w, "invalid origin header")
		}
		if actual != expected {
			return writeAdminOriginError(w, fmt.Sprintf("origin mismatch: expected %s", expected))
		}
	}
	if referer != "" {
		actual, err := parseRequestOrigin(referer)
		if err != nil {
			return writeAdminOriginError(w, "invalid referer header")
		}
		if actual != expected {
			return writeAdminOriginError(w, fmt.Sprintf("referer mismatch: expected %s", expected))
		}
	}
	return true
}

func (a *App) cleanupAdminLoginAttemptsLocked(now time.Time) {
	for key, attempt := range a.State.AdminLoginAttempts {
		if attempt.Failures <= 0 && attempt.LockedUntil.IsZero() {
			delete(a.State.AdminLoginAttempts, key)
			continue
		}
		if !attempt.LockedUntil.IsZero() && now.After(attempt.LockedUntil) && now.Sub(attempt.LastFailure) > adminLoginLockWindow {
			delete(a.State.AdminLoginAttempts, key)
		}
	}
}

func (a *App) adminLoginLocked(clientIP string) (time.Time, bool) {
	now := time.Now()
	a.State.mu.Lock()
	defer a.State.mu.Unlock()
	a.cleanupAdminLoginAttemptsLocked(now)
	attempt, ok := a.State.AdminLoginAttempts[clientIP]
	if !ok || attempt.LockedUntil.IsZero() || now.After(attempt.LockedUntil) {
		return time.Time{}, false
	}
	return attempt.LockedUntil, true
}

func (a *App) recordAdminLoginFailure(clientIP string) (time.Time, bool) {
	now := time.Now()
	a.State.mu.Lock()
	defer a.State.mu.Unlock()
	a.cleanupAdminLoginAttemptsLocked(now)
	attempt := a.State.AdminLoginAttempts[clientIP]
	attempt.Failures++
	attempt.LastFailure = now
	if attempt.Failures >= adminLoginMaxFailures {
		attempt.LockedUntil = now.Add(adminLoginLockWindow)
	}
	a.State.AdminLoginAttempts[clientIP] = attempt
	if attempt.LockedUntil.IsZero() {
		return time.Time{}, false
	}
	return attempt.LockedUntil, true
}

func (a *App) clearAdminLoginFailures(clientIP string) {
	a.State.mu.Lock()
	defer a.State.mu.Unlock()
	delete(a.State.AdminLoginAttempts, clientIP)
}

func (a *App) issueAdminToken() string {
	token := strings.ReplaceAll(randomUUID(), "-", "")
	cfg, _, _ := a.State.Snapshot()
	expiresAt := time.Now().Add(time.Duration(maxInt(cfg.Admin.TokenTTLHours, 1)) * time.Hour)
	a.State.mu.Lock()
	defer a.State.mu.Unlock()
	a.State.AdminTokens[token] = expiresAt
	for key, deadline := range a.State.AdminTokens {
		if time.Now().After(deadline) {
			delete(a.State.AdminTokens, key)
		}
	}
	return token
}

func (a *App) revokeAdminToken(token string) {
	token = strings.TrimSpace(token)
	if token == "" {
		return
	}
	a.State.mu.Lock()
	defer a.State.mu.Unlock()
	delete(a.State.AdminTokens, token)
}

func (a *App) adminTokenValid(token string) bool {
	token = strings.TrimSpace(token)
	if token == "" {
		return false
	}
	now := time.Now()
	a.State.mu.Lock()
	defer a.State.mu.Unlock()
	deadline, ok := a.State.AdminTokens[token]
	if !ok {
		return false
	}
	if now.After(deadline) {
		delete(a.State.AdminTokens, token)
		return false
	}
	return true
}

func adminTokenFromRequest(r *http.Request) string {
	if token := strings.TrimSpace(r.Header.Get("X-Admin-Token")); token != "" {
		return token
	}
	if auth := strings.TrimSpace(r.Header.Get("Authorization")); strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	}
	if cookie, err := r.Cookie("notion2api_admin"); err == nil {
		return strings.TrimSpace(cookie.Value)
	}
	return ""
}

func (a *App) adminAuthOK(w http.ResponseWriter, r *http.Request) bool {
	cfg, _, _ := a.State.Snapshot()
	if !cfg.Admin.Enabled {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "admin disabled"})
		return false
	}
	password := strings.TrimSpace(cfg.Admin.Password)
	if password == "" {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "admin password is not configured"})
		return false
	}
	if !a.adminSameOriginOK(w, r) {
		return false
	}
	if a.adminTokenValid(adminTokenFromRequest(r)) {
		return true
	}
	writeJSON(w, http.StatusUnauthorized, map[string]any{"detail": "admin authentication required"})
	return false
}

func redactConfigSecrets(cfg AppConfig) AppConfig {
	cfg.APIKey = ""
	cfg.Admin.Password = ""
	return cfg
}

func adminSecretsPayload(cfg AppConfig) map[string]any {
	return map[string]any{
		"api_key_set":           strings.TrimSpace(cfg.APIKey) != "",
		"admin_password_set":    strings.TrimSpace(cfg.Admin.Password) != "",
		"resin_proxy_token_set": strings.TrimSpace(cfg.ResinProxyToken) != "",
	}
}

func adminSessionPayload(session SessionInfo) map[string]any {
	return map[string]any{
		"probe_path":     session.ProbePath,
		"client_version": session.ClientVersion,
		"user_id":        session.UserID,
		"user_email":     session.UserEmail,
		"user_name":      session.UserName,
		"space_id":       session.SpaceID,
		"space_name":     session.SpaceName,
		"cookie_count":   len(session.Cookies),
	}
}

func (a *App) adminSessionRuntime() (bool, string, string) {
	a.State.mu.RLock()
	defer a.State.mu.RUnlock()
	return a.State.Client != nil, formatTimeOrEmpty(a.State.LastSessionRefresh), a.State.LastSessionRefreshError
}

func writeNoStore(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store, must-revalidate")
}

func (a *App) getConfigPayload() map[string]any {
	cfg, session, registry := a.State.Snapshot()
	sessionReady, lastRefreshAt, lastRefreshError := a.adminSessionRuntime()
	safeConfig := redactConfigSecrets(cfg)
	return map[string]any{
		"success":        true,
		"config":         safeConfig,
		"config_path":    cfg.ConfigPath,
		"active_account": cfg.ActiveAccount,
		"secrets":        adminSecretsPayload(cfg),
		"session_ready":  sessionReady,
		"session":        adminSessionPayload(session),
		"session_refresh_runtime": map[string]any{
			"last_refresh_at": lastRefreshAt,
			"last_error":      lastRefreshError,
		},
		"models":        registry.Entries,
		"default_model": cfg.DefaultPublicModel(),
	}
}

func (a *App) getSettingsPayload() map[string]any {
	cfg, session, registry := a.State.Snapshot()
	sessionReady, lastRefreshAt, lastRefreshError := a.adminSessionRuntime()
	safeConfig := redactConfigSecrets(cfg)
	return map[string]any{
		"success": true,
		"config":  safeConfig,
		"admin": map[string]any{
			"enabled":         cfg.Admin.Enabled,
			"has_password":    strings.TrimSpace(cfg.Admin.Password) != "",
			"token_ttl_hours": cfg.Admin.TokenTTLHours,
			"static_dir":      cfg.Admin.StaticDir,
		},
		"secrets": adminSecretsPayload(cfg),
		"runtime": map[string]any{
			"timeout_sec":        cfg.TimeoutSec,
			"poll_interval_sec":  cfg.PollIntervalSec,
			"poll_max_rounds":    cfg.PollMaxRounds,
			"stream_chunk_runes": cfg.StreamChunkRunes,
		},
		"responses":       cfg.Responses,
		"features":        cfg.Features,
		"session_refresh": cfg.ResolveSessionRefresh(),
		"default_model":   cfg.DefaultPublicModel(),
		"model_aliases":   cfg.ModelAliases,
		"models":          registry.Entries,
		"active_account":  cfg.ActiveAccount,
		"session_ready":   sessionReady,
		"session": map[string]any{
			"user_email": session.UserEmail,
			"space_id":   session.SpaceID,
			"space_name": session.SpaceName,
		},
		"session_refresh_runtime": map[string]any{
			"last_refresh_at": lastRefreshAt,
			"last_error":      lastRefreshError,
		},
	}
}

func (a *App) mergeConfigFromBody(r *http.Request) (AppConfig, error) {
	current, _, _ := a.State.Snapshot()
	defer r.Body.Close()
	var raw map[string]any
	if err := json.NewDecoder(r.Body).Decode(&raw); err != nil {
		return current, fmt.Errorf("invalid json")
	}
	if nested, ok := raw["config"].(map[string]any); ok {
		raw = nested
	}
	body, err := json.Marshal(raw)
	if err != nil {
		return current, err
	}
	cfg := current
	if err := json.Unmarshal(body, &cfg); err != nil {
		return current, err
	}
	cfg.ConfigPath = current.ConfigPath
	return normalizeConfig(cfg), nil
}

func (a *App) handleAdminLogin(w http.ResponseWriter, r *http.Request) {
	cfg, _, _ := a.State.Snapshot()
	if !cfg.Admin.Enabled {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "admin disabled"})
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	if !a.adminSameOriginOK(w, r) {
		return
	}
	password := cfg.Admin.Password
	if strings.TrimSpace(password) == "" {
		writeJSON(w, http.StatusForbidden, map[string]any{"detail": "admin password is not configured"})
		return
	}
	clientIP := adminClientIP(r)
	if lockedUntil, locked := a.adminLoginLocked(clientIP); locked {
		writeJSON(w, http.StatusTooManyRequests, map[string]any{
			"detail":       "too many failed login attempts",
			"locked_until": lockedUntil.Format(time.RFC3339),
		})
		return
	}
	payload, err := a.decodeBody(w, r)
	if err != nil {
		writeInvalidBodyError(w, err)
		return
	}
	if !securePasswordEqual(password, stringValue(payload["password"])) {
		lockedUntil, locked := a.recordAdminLoginFailure(clientIP)
		body := map[string]any{"detail": "wrong password"}
		if locked {
			body["locked_until"] = lockedUntil.Format(time.RFC3339)
		}
		writeJSON(w, http.StatusUnauthorized, body)
		return
	}
	a.clearAdminLoginFailures(clientIP)
	token := a.issueAdminToken()
	http.SetCookie(w, &http.Cookie{
		Name:     "notion2api_admin",
		Value:    token,
		HttpOnly: true,
		Path:     "/",
		Secure:   shouldUseSecureCookie(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   maxInt(cfg.Admin.TokenTTLHours, 1) * 3600,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"success":           true,
		"password_required": true,
	})
}

func (a *App) handleAdminVerify(w http.ResponseWriter, r *http.Request) {
	cfg, _, _ := a.State.Snapshot()
	passwordRequired := true
	passwordConfigured := strings.TrimSpace(cfg.Admin.Password) != ""
	authenticated := passwordConfigured && a.adminTokenValid(adminTokenFromRequest(r))
	writeJSON(w, http.StatusOK, map[string]any{
		"success":             true,
		"authenticated":       authenticated,
		"password_required":   passwordRequired,
		"password_configured": passwordConfigured,
		"admin_enabled":       cfg.Admin.Enabled,
	})
}

func (a *App) handleAdminLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	if !a.adminSameOriginOK(w, r) {
		return
	}
	token := adminTokenFromRequest(r)
	a.revokeAdminToken(token)
	http.SetCookie(w, &http.Cookie{
		Name:     "notion2api_admin",
		Value:    "",
		HttpOnly: true,
		Path:     "/",
		Secure:   shouldUseSecureCookie(r),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
	})
}

func (a *App) handleAdminConfig(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, a.getConfigPayload())
	case http.MethodPost:
		cfg, err := a.mergeConfigFromBody(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		if err := a.State.SaveAndApply(cfg); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "message": "config updated", "persisted": strings.TrimSpace(cfg.ConfigPath) != ""})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
	}
}

func configSnapshotDir(cfg AppConfig) string {
	if strings.TrimSpace(cfg.ConfigPath) != "" {
		return filepath.Join(filepath.Dir(cfg.ConfigPath), "config_snapshots")
	}
	return filepath.Clean("config_snapshots")
}

func (a *App) handleAdminConfigExport(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	cfg, _, _ := a.State.Snapshot()
	writeJSON(w, http.StatusOK, map[string]any{
		"success":     true,
		"exported_at": time.Now().Format(time.RFC3339),
		"config":      normalizeConfig(cfg),
	})
}

func (a *App) handleAdminConfigImport(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	cfg, err := a.mergeConfigFromBody(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
		return
	}
	if err := a.State.SaveAndApply(cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "message": "config imported"})
}

func (a *App) handleAdminConfigSnapshot(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		cfg, _, _ := a.State.Snapshot()
		dir := configSnapshotDir(cfg)
		entries, err := os.ReadDir(dir)
		if err != nil && !os.IsNotExist(err) {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		items := make([]map[string]any, 0, len(entries))
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
				continue
			}
			fullPath := filepath.Join(dir, entry.Name())
			info, err := entry.Info()
			if err != nil {
				continue
			}
			items = append(items, map[string]any{
				"name":        entry.Name(),
				"path":        fullPath,
				"size_bytes":  info.Size(),
				"modified_at": info.ModTime().Format(time.RFC3339),
			})
		}
		sort.Slice(items, func(i, j int) bool {
			return stringValue(items[i]["modified_at"]) > stringValue(items[j]["modified_at"])
		})
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"dir":     dir,
			"items":   items,
		})
	case http.MethodPost:
		cfg, _, _ := a.State.Snapshot()
		dir := configSnapshotDir(cfg)
		if err := os.MkdirAll(dir, 0o755); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		name := fmt.Sprintf("notion2api_%s.json", time.Now().Format("20060102_150405"))
		fullPath := filepath.Join(dir, name)
		exported := normalizeConfig(cfg)
		exported.ConfigPath = ""
		if err := writePrettyJSONFile(fullPath, exported); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"success":    true,
			"snapshot":   fullPath,
			"created_at": time.Now().Format(time.RFC3339),
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
	}
}

func (a *App) handleAdminSettings(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, a.getSettingsPayload())
	case http.MethodPut, http.MethodPost:
		cfg, err := a.mergeConfigFromBody(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		if err := a.State.SaveAndApply(cfg); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"success": true, "message": "settings updated"})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
	}
}

func (a *App) handleAdminVersion(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	cfg, session, registry := a.State.Snapshot()
	writeJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"name":          "notion2api",
		"version":       "2026.03.21-local-go",
		"checked_at":    time.Now().UTC().Format(time.RFC3339),
		"default_model": cfg.DefaultPublicModel(),
		"model_count":   len(registry.Entries),
		"user_email":    session.UserEmail,
		"space_id":      session.SpaceID,
		"features":      cfg.Features,
		"responses":     cfg.Responses,
	})
}

func (a *App) handleAdminTest(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	payload, err := a.decodeBody(w, r)
	if err != nil {
		writeInvalidBodyError(w, err)
		return
	}
	cfg, _, registry := a.State.Snapshot()
	prompt := strings.TrimSpace(stringValue(payload["prompt"]))
	attachments, err := extractAttachmentsFromAny(payload["attachments"])
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
		return
	}
	if prompt == "" && len(attachments) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "prompt or attachments required"})
		return
	}
	entry, err := registry.Resolve(requestedModel(payload, cfg.DefaultPublicModel()), cfg.DefaultPublicModel())
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
		return
	}
	stream := boolValue(payload["stream"])
	showThoughts := parseOptionalBoolField(payload["show_thoughts"])
	preferredConversationID := requestedConversationID(r, payload)
	freshThreadMode := forceFreshThreadPerRequest(cfg)
	if freshThreadMode {
		preferredConversationID = ""
	}
	request := PromptRunRequest{
		Prompt:                            prompt,
		LatestUserPrompt:                  prompt,
		PublicModel:                       entry.ID,
		NotionModel:                       entry.NotionModel,
		UseWebSearch:                      requestedWebSearch(payload, cfg.Features.UseWebSearch),
		Attachments:                       attachments,
		SuppressUpstreamThreadPersistence: strings.TrimSpace(preferredConversationID) == "",
	}
	request.SuppressReasoningOutput, request.StreamReasoningWarmup = resolveReasoningPreference(showThoughts, stream, cfg.Features)
	request.PinnedAccountEmail = requestedAccountEmail(r, payload)
	if request.PinnedAccountEmail == "" && requestedAdminDispatchMode(payload) == "active" {
		if account, _, ok := cfg.ResolveActiveAccount(); ok {
			request.PinnedAccountEmail = account.Email
		}
	}
	conversation := ConversationEntry{}
	if preferredConversationID != "" && !freshThreadMode {
		if matched, ok := a.resolveContinuationConversation(r, payload, "", "", nil); ok {
			conversation = matched.Conversation
			request.PinnedAccountEmail = firstNonEmpty(strings.TrimSpace(conversation.AccountEmail), request.PinnedAccountEmail)
			request.UpstreamThreadID = strings.TrimSpace(conversation.ThreadID)
			request.continuationDraft = buildContinuationDraft(matched.Session)
		}
	}
	request.ConversationID = firstNonEmpty(strings.TrimSpace(conversation.ID), preferredConversationID)
	conversationID := a.startConversationTurn(conversation.ID, preferredConversationID, "admin_tester", "admin_test", prompt, request)
	timedRequest, cancel := cloneRequestWithTimeout(r, adminSyncRequestTimeout(cfg))
	defer cancel()
	if stream {
		a.handleAdminTestStream(w, timedRequest, request, conversationID, entry.ID)
		return
	}
	result, err := a.runPrompt(timedRequest, request)
	if err != nil {
		a.failConversation(conversationID, err)
		writeAdminUpstreamError(w, err, nil)
		return
	}
	a.completeConversation(conversationID, result)
	a.persistConversationSession(conversationID, request, result)
	writeJSON(w, http.StatusOK, map[string]any{
		"success":         true,
		"conversation_id": conversationID,
		"result":          buildChatCompletion(result, entry.ID, true),
		"text":            sanitizeAssistantVisibleText(result.Text),
	})
}

func (a *App) handleAdminTestStream(w http.ResponseWriter, r *http.Request, request PromptRunRequest, conversationID string, publicModel string) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "streaming is not supported by this response writer"})
		return
	}
	applyCORSHeaders(w)
	w.Header().Set("X-Notion2API", "1")
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	sequence := 0
	writeEvent := func(eventType string, payload map[string]any) error {
		if payload == nil {
			payload = map[string]any{}
		}
		payload["sequence_number"] = sequence
		sequence++
		return writeSSEEvent(w, flusher, eventType, payload)
	}

	if err := writeEvent("admin_test.start", map[string]any{
		"conversation_id": conversationID,
		"model":           publicModel,
	}); err != nil {
		return
	}

	result, err := a.runPromptStreamWithSink(r, request, InferenceStreamSink{
		Text: func(delta string) error {
			if strings.TrimSpace(delta) == "" {
				return nil
			}
			a.pushConversationDelta(conversationID, delta)
			return writeEvent("admin_test.text.delta", map[string]any{"delta": delta})
		},
		Reasoning: func(delta string) error {
			if strings.TrimSpace(delta) == "" || request.SuppressReasoningOutput {
				return nil
			}
			return writeEvent("admin_test.reasoning.delta", map[string]any{"delta": delta})
		},
		ReasoningWarmup: func() error {
			if request.SuppressReasoningOutput || !request.StreamReasoningWarmup {
				return nil
			}
			return writeEvent("admin_test.reasoning.warmup", map[string]any{"delta": "\u200b"})
		},
		KeepAlive: func() error {
			return writeSSEComment(w, flusher, "admin-test-keepalive")
		},
	})
	if err != nil {
		a.failConversation(conversationID, err)
		_ = writeEvent("admin_test.error", map[string]any{
			"detail": err.Error(),
		})
		writeSSEDone(w, flusher)
		return
	}

	result = applyInferenceResultOutputPolicy(result, request)
	a.completeConversation(conversationID, result)
	a.persistConversationSession(conversationID, request, result)
	_ = writeEvent("admin_test.completed", map[string]any{
		"conversation_id": conversationID,
		"text":            sanitizeAssistantVisibleText(result.Text),
		"reasoning":       sanitizeAssistantVisibleText(result.Reasoning),
		"result":          buildChatCompletion(result, publicModel, true),
	})
	writeSSEDone(w, flusher)
}

func parseOptionalBoolField(raw any) *bool {
	value, ok := parseBoolField(raw)
	if !ok {
		return nil
	}
	copyValue := value
	return &copyValue
}

func (a *App) serveAdminStatic(w http.ResponseWriter, r *http.Request) {
	cfg, _, _ := a.State.Snapshot()
	staticDir := resolveStaticAdminDir(cfg.Admin.StaticDir)
	if stat, err := os.Stat(staticDir); err != nil || !stat.IsDir() {
		http.Error(w, "WebUI not found. Expected static files under frontend/dist/admin.", http.StatusNotFound)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/admin")
	path = strings.TrimPrefix(path, "/")
	if path != "" && strings.Contains(path, ".") {
		full := filepath.Join(staticDir, filepath.Clean(path))
		if !strings.HasPrefix(full, staticDir) {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat(full); err == nil {
			if strings.HasPrefix(path, "assets/") {
				w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			} else {
				writeNoStore(w)
			}
			http.ServeFile(w, r, full)
			return
		}
		http.NotFound(w, r)
		return
	}
	index := filepath.Join(staticDir, "index.html")
	if _, err := os.Stat(index); err != nil {
		http.Error(w, "index.html not found", http.StatusNotFound)
		return
	}
	writeNoStore(w)
	http.ServeFile(w, r, index)
}

func (a *App) handleAdmin(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.URL.Path == "/admin/login":
		a.handleAdminLogin(w, r)
	case r.URL.Path == "/admin/logout":
		a.handleAdminLogout(w, r)
	case r.URL.Path == "/admin/verify":
		a.handleAdminVerify(w, r)
	case r.URL.Path == "/admin/config":
		a.handleAdminConfig(w, r)
	case r.URL.Path == "/admin/config/export":
		a.handleAdminConfigExport(w, r)
	case r.URL.Path == "/admin/config/import":
		a.handleAdminConfigImport(w, r)
	case r.URL.Path == "/admin/config/snapshot":
		a.handleAdminConfigSnapshot(w, r)
	case r.URL.Path == "/admin/settings":
		a.handleAdminSettings(w, r)
	case r.URL.Path == "/admin/version":
		a.handleAdminVersion(w, r)
	case r.URL.Path == "/admin/test":
		a.handleAdminTest(w, r)
	case r.URL.Path == "/admin/events":
		a.handleAdminEvents(w, r)
	case r.URL.Path == "/admin/conversations":
		a.handleAdminConversations(w, r)
	case r.URL.Path == "/admin/conversations/batch-delete":
		a.handleAdminConversationBatchDelete(w, r)
	case strings.HasPrefix(r.URL.Path, "/admin/conversations/"):
		a.handleAdminConversationByID(w, r)
	case r.URL.Path == "/admin/agents":
		a.handleAdminAgents(w, r)
	case strings.HasPrefix(r.URL.Path, "/admin/agents/"):
		a.handleAdminAgentByID(w, r)
	case r.URL.Path == "/admin/accounts":
		a.handleAdminAccounts(w, r)
	case r.URL.Path == "/admin/accounts/batch-update":
		a.handleAdminAccountBatchUpdate(w, r)
	case r.URL.Path == "/admin/accounts/activate":
		a.handleAdminAccountsActivate(w, r)
	case r.URL.Path == "/admin/accounts/test":
		a.handleAdminAccountsTest(w, r)
	case r.URL.Path == "/admin/accounts/login/start":
		a.handleAdminAccountLoginStart(w, r)
	case r.URL.Path == "/admin/accounts/login/verify":
		a.handleAdminAccountLoginVerify(w, r)
	case r.URL.Path == "/admin/accounts/manual":
		a.handleAdminAccountManualImport(w, r)
	case r.URL.Path == "/admin/accounts/login/status":
		a.handleAdminAccountLoginStatus(w, r)
	case r.URL.Path == "/admin/accounts/rotate-sticky":
		a.handleAdminAccountRotateSticky(w, r)
	case strings.HasPrefix(r.URL.Path, "/admin/accounts/"):
		a.handleAdminAccountDelete(w, r)
	default:
		if r.Method != http.MethodGet {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "admin route not found"})
			return
		}
		a.serveAdminStatic(w, r)
	}
}
