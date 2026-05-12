package app

import (
	"fmt"
	"net/url"
	"strings"
)

type ProxyResolver struct {
	cfg AppConfig
}

func NewProxyResolver(cfg AppConfig) *ProxyResolver {
	return &ProxyResolver{cfg: normalizeConfig(cfg)}
}

func (r *ProxyResolver) ResolveProxyForRequest(accountEmail string, target *url.URL) (*url.URL, map[string]string, error) {
	if r == nil {
		return nil, nil, nil
	}
	if target == nil {
		return nil, nil, nil
	}
	policy := r.cfg.ResolveProxyPolicyForAccount(accountEmail)
	mode := normalizeProxyMode(policy.Mode)
	if mode == "" {
		mode = proxyModeOff
	}
	headers := map[string]string{}
	switch mode {
	case proxyModeOff:
		return nil, nil, nil
	case proxyModeEnv, proxyModeHTTP, proxyModeHTTPS, proxyModeSOCKS5:
		raw := policy.proxyURLForScheme(target.Scheme)
		if strings.TrimSpace(raw) == "" {
			return nil, nil, nil
		}
		parsed, err := parseProxyURL(raw)
		if err != nil {
			return nil, nil, err
		}
		return parsed, nil, nil
	case proxyModeResinForward:
		proxyURL, stickyAccount, err := resolveResinProxyURL(policy, accountEmail, r.cfg)
		if err != nil {
			return nil, nil, err
		}
		if stickyAccount != "" {
			headers[policy.Resin.AccountHeader] = stickyAccount
		}
		if len(headers) == 0 {
			return proxyURL, nil, nil
		}
		return proxyURL, headers, nil
	default:
		return nil, nil, nil
	}
}

func parseProxyURL(raw string) (*url.URL, error) {
	clean := strings.TrimSpace(raw)
	if clean == "" {
		return nil, nil
	}
	parsed, err := url.Parse(clean)
	if err != nil {
		return nil, fmt.Errorf("parse proxy url %q: %w", clean, err)
	}
	scheme := strings.ToLower(strings.TrimSpace(parsed.Scheme))
	switch scheme {
	case "http", "https", "socks5", "socks5h":
		return parsed, nil
	default:
		return nil, fmt.Errorf("unsupported proxy scheme %q", parsed.Scheme)
	}
}

func redactProxyURLForLog(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed == nil {
		return "<invalid-proxy-url>"
	}
	parsed.User = url.User("redacted")
	return parsed.String()
}

func resolveResinProxyURL(policy ProxyPolicy, email string, cfg AppConfig) (*url.URL, string, error) {
	requestedMode := normalizeResinMode(policy.Resin.Mode)
	switch requestedMode {
	case resinModeForward:
		return resolveResinForwardProxyURL(policy, email, cfg)
	case "reverse":
		// Strong compatibility: current client still expects proxy URL semantics.
		return resolveResinForwardProxyURL(policy, email, cfg)
	case "connect":
		// Strong compatibility: use HTTP forward endpoint for CONNECT-capable clients.
		return resolveResinForwardProxyURL(policy, email, cfg)
	case "socks5":
		if normalizeResinAuthVersion(policy.Resin.AuthVersion) != "V1" {
			return resolveResinForwardProxyURL(policy, email, cfg)
		}
		return resolveResinSOCKS5ProxyURL(policy, email, cfg)
	default:
		return resolveResinForwardProxyURL(policy, email, cfg)
	}
}

func resolveResinForwardProxyURL(policy ProxyPolicy, email string, cfg AppConfig) (*url.URL, string, error) {
	if !policy.Resin.Enabled {
		return nil, "", nil
	}
	baseURL, token, err := splitResinURL(policy.Resin.URL)
	if err != nil {
		return nil, "", err
	}
	platform := strings.TrimSpace(policy.Resin.Platform)
	if platform == "" {
		platform = "Default"
	}
	stickyAccount := resinStickyAccountForEmail(cfg, email)
	if stickyAccount == "" {
		stickyAccount = "account"
	}
	proxyURL := *baseURL
	token = firstNonEmpty(strings.TrimSpace(policy.Resin.ProxyToken), strings.TrimSpace(token))
	if username, password := buildResinProxyCredentials(policy.Resin.AuthVersion, platform, stickyAccount, token); username != "" || password != "" {
		proxyURL.User = url.UserPassword(username, password)
	}
	return &proxyURL, stickyAccount, nil
}

func resolveResinSOCKS5ProxyURL(policy ProxyPolicy, email string, cfg AppConfig) (*url.URL, string, error) {
	proxyURL, stickyAccount, err := resolveResinForwardProxyURL(policy, email, cfg)
	if err != nil || proxyURL == nil {
		return proxyURL, stickyAccount, err
	}
	asSOCKS5 := *proxyURL
	asSOCKS5.Scheme = "socks5"
	return &asSOCKS5, stickyAccount, nil
}

func buildResinProxyCredentials(authVersion, platform, account, token string) (username string, password string) {
	cleanVersion := normalizeResinAuthVersion(authVersion)
	cleanPlatform := strings.TrimSpace(platform)
	if cleanPlatform == "" {
		cleanPlatform = "Default"
	}
	cleanAccount := strings.TrimSpace(account)
	cleanToken := strings.TrimSpace(token)
	switch cleanVersion {
	case "LEGACY_V0":
		return cleanToken, fmt.Sprintf("%s:%s", cleanPlatform, cleanAccount)
	default:
		return fmt.Sprintf("%s.%s", cleanPlatform, cleanAccount), cleanToken
	}
}

func splitResinURL(raw string) (*url.URL, string, error) {
	parsed, err := parseProxyURL(raw)
	if err != nil {
		return nil, "", err
	}
	token := strings.Trim(strings.TrimSpace(parsed.Path), "/")
	if token == "" && parsed.User != nil {
		token, _ = parsed.User.Password()
	}
	baseURL := *parsed
	baseURL.Path = ""
	baseURL.RawPath = ""
	baseURL.User = nil
	baseURL.RawQuery = ""
	baseURL.Fragment = ""
	return &baseURL, token, nil
}

func resinStickyAccountForEmail(cfg AppConfig, email string) string {
	if account, _, ok := cfg.FindAccount(email); ok {
		if value := strings.TrimSpace(account.StickyProxyAccount); value != "" {
			return value
		}
		if value := accountPathSlug(account.Email); value != "" {
			return value
		}
	}
	return accountPathSlug(email)
}
