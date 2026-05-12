package app

import "testing"

func TestResolveProxyPolicy_ResinModeDefaultsToForward(t *testing.T) {
	cfg := normalizeConfig(AppConfig{
		ProxyMode:        "resin_forward",
		ResinEnabled:     true,
		ResinURL:         "http://127.0.0.1:2260/token",
		ResinPlatform:    "Default",
		ResinAuthVersion: "V1",
	})
	p := cfg.ResolveProxyPolicy()
	if p.Resin.Mode != "forward" {
		t.Fatalf("expected default forward mode, got %q", p.Resin.Mode)
	}
}

func TestResolveProxyPolicy_AccountOverrideAuthFields(t *testing.T) {
	cfg := normalizeConfig(AppConfig{
		ProxyMode:        "resin_forward",
		ResinEnabled:     true,
		ResinURL:         "http://127.0.0.1:2260/global-token",
		ResinAuthVersion: "V1",
		Accounts: []NotionAccount{
			{
				Email:            "a@example.com",
				ProxyMode:        "resin_forward",
				ResinEnabled:     true,
				ResinURL:         "http://127.0.0.1:2260/account-token",
				ResinAuthVersion: "LEGACY_V0",
				ResinProxyToken:  "explicit-token",
			},
		},
	})
	p := cfg.ResolveProxyPolicyForAccount("a@example.com")
	if p.Resin.AuthVersion != "LEGACY_V0" {
		t.Fatalf("expected LEGACY_V0, got %q", p.Resin.AuthVersion)
	}
	if p.Resin.ProxyToken != "explicit-token" {
		t.Fatalf("expected explicit token override")
	}
}
