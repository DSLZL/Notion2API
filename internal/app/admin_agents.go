package app

import (
	"encoding/json"
	"net/http"
	"strings"
)

type adminAgentModelUpdateRequest struct {
	ModelType string `json:"model_type"`
}

type adminAgentCreateRequest struct {
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	ModelType string `json:"model_type"`
}

func (a *App) handleAdminAgents(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		cfg, _, _ := a.State.Snapshot()
		timedRequest, cancel := cloneRequestWithTimeout(r, adminSyncRequestTimeout(cfg))
		defer cancel()
		client, err := a.notionClientForAccount(timedRequest.Context(), "")
		if err != nil {
			writeAdminUpstreamError(w, err, nil)
			return
		}
		items, err := client.listCustomAgents(timedRequest.Context())
		if err != nil {
			writeAdminUpstreamError(w, err, nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"items":   items,
		})
	case http.MethodPost:
		defer r.Body.Close()
		var req adminAgentCreateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "invalid json body"})
			return
		}
		cfg, _, _ := a.State.Snapshot()
		timedRequest, cancel := cloneRequestWithTimeout(r, adminSyncRequestTimeout(cfg))
		defer cancel()
		client, err := a.notionClientForAccount(timedRequest.Context(), "")
		if err != nil {
			writeAdminUpstreamError(w, err, nil)
			return
		}
		created, err := client.createCustomAgent(timedRequest.Context(), CustomAgentMutationRequest{
			Name:      req.Name,
			Icon:      req.Icon,
			ModelType: req.ModelType,
		})
		if err != nil {
			writeAdminUpstreamError(w, err, nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"item":    created,
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
	}
}

func (a *App) handleAdminAgentByID(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	trimmed := strings.TrimSpace(strings.TrimPrefix(r.URL.Path, "/admin/agents/"))
	if trimmed == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "agent id is required"})
		return
	}
	if strings.HasSuffix(trimmed, "/model") {
		agentID := strings.TrimSpace(strings.TrimSuffix(trimmed, "/model"))
		if agentID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "agent id is required"})
			return
		}
		if r.Method != http.MethodPatch {
			writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
			return
		}
		defer r.Body.Close()
		var req adminAgentModelUpdateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "invalid json body"})
			return
		}
		cfg, _, _ := a.State.Snapshot()
		timedRequest, cancel := cloneRequestWithTimeout(r, adminSyncRequestTimeout(cfg))
		defer cancel()
		client, err := a.notionClientForAccount(timedRequest.Context(), "")
		if err != nil {
			writeAdminUpstreamError(w, err, nil)
			return
		}
		updated, err := client.updateCustomAgentModel(timedRequest.Context(), agentID, req.ModelType)
		if err != nil {
			writeAdminUpstreamError(w, err, nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"item":    updated,
		})
		return
	}
	agentID := trimmed
	if r.Method != http.MethodDelete {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	cfg, _, _ := a.State.Snapshot()
	timedRequest, cancel := cloneRequestWithTimeout(r, adminSyncRequestTimeout(cfg))
	defer cancel()
	client, err := a.notionClientForAccount(timedRequest.Context(), "")
	if err != nil {
		writeAdminUpstreamError(w, err, nil)
		return
	}
	if err := client.softDeleteCustomAgent(timedRequest.Context(), agentID); err != nil {
		writeAdminUpstreamError(w, err, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"message": "agent deleted",
	})
}
