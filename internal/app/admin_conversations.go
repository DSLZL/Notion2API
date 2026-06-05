package app

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	notionThreadConversationPrefix     = "notion_thread:"
	adminConversationDefaultListLimit  = 20
	adminConversationMaxListLimit      = 100
	adminConversationBatchDeleteMaxIDs = 100
)

type adminConversationBatchDeleteRequest struct {
	IDs []string `json:"ids"`
}

type adminConversationListParams struct {
	Page   int
	Limit  int
	Status string
	Origin string
	Query  string
}

func notionThreadConversationID(threadID string) string {
	threadID = strings.TrimSpace(threadID)
	if threadID == "" {
		return ""
	}
	return notionThreadConversationPrefix + threadID
}

func parseNotionThreadConversationID(conversationID string) (string, bool) {
	conversationID = strings.TrimSpace(conversationID)
	if !strings.HasPrefix(conversationID, notionThreadConversationPrefix) {
		return "", false
	}
	threadID := strings.TrimSpace(strings.TrimPrefix(conversationID, notionThreadConversationPrefix))
	if threadID == "" {
		return "", false
	}
	return threadID, true
}

func adminConversationTimeValue(item ConversationSummary) time.Time {
	if !item.UpdatedAt.IsZero() {
		return item.UpdatedAt.UTC()
	}
	return item.CreatedAt.UTC()
}

func mergeConversationTimes(current time.Time, candidate time.Time, preferLatest bool) time.Time {
	if current.IsZero() {
		return candidate.UTC()
	}
	if candidate.IsZero() {
		return current.UTC()
	}
	if preferLatest {
		if candidate.After(current) {
			return candidate.UTC()
		}
		return current.UTC()
	}
	if candidate.Before(current) {
		return candidate.UTC()
	}
	return current.UTC()
}

func remoteConversationSummary(item InferenceTranscriptSummary) ConversationSummary {
	title := strings.TrimSpace(item.Title)
	if title == "" {
		title = "Untitled conversation"
	}
	return ConversationSummary{
		ID:               notionThreadConversationID(item.ThreadID),
		Title:            title,
		Origin:           "notion",
		RemoteOnly:       true,
		Source:           "notion",
		Transport:        firstNonEmpty(strings.TrimSpace(item.TranscriptType), "transcript_sync"),
		Status:           "completed",
		CreatedAt:        item.CreatedAt,
		UpdatedAt:        item.UpdatedAt,
		ThreadID:         strings.TrimSpace(item.ThreadID),
		CreatedByDisplay: item.CreatedByDisplay,
	}
}

func mergeConversationSummary(local ConversationSummary, remote ConversationSummary) ConversationSummary {
	out := local
	out.Origin = "merged"
	out.RemoteOnly = false
	if title := strings.TrimSpace(remote.Title); title != "" {
		out.Title = title
	}
	out.ThreadID = firstNonEmpty(strings.TrimSpace(out.ThreadID), strings.TrimSpace(remote.ThreadID))
	out.CreatedAt = mergeConversationTimes(out.CreatedAt, remote.CreatedAt, false)
	out.UpdatedAt = mergeConversationTimes(out.UpdatedAt, remote.UpdatedAt, true)
	out.CreatedByDisplay = firstNonEmpty(strings.TrimSpace(remote.CreatedByDisplay), strings.TrimSpace(out.CreatedByDisplay))
	if strings.TrimSpace(out.Status) == "" {
		out.Status = firstNonEmpty(strings.TrimSpace(remote.Status), "completed")
	}
	return out
}

func mergeConversationEntry(local ConversationEntry, remote ConversationEntry) ConversationEntry {
	out := local
	out.Origin = "merged"
	out.RemoteOnly = false
	if title := strings.TrimSpace(remote.Title); title != "" {
		out.Title = title
	}
	out.ThreadID = firstNonEmpty(strings.TrimSpace(out.ThreadID), strings.TrimSpace(remote.ThreadID))
	out.Source = firstNonEmpty(strings.TrimSpace(out.Source), strings.TrimSpace(remote.Source))
	out.Transport = firstNonEmpty(strings.TrimSpace(out.Transport), strings.TrimSpace(remote.Transport))
	out.Status = firstNonEmpty(strings.TrimSpace(out.Status), strings.TrimSpace(remote.Status))
	out.CreatedAt = mergeConversationTimes(out.CreatedAt, remote.CreatedAt, false)
	out.UpdatedAt = mergeConversationTimes(out.UpdatedAt, remote.UpdatedAt, true)
	out.CreatedByDisplay = firstNonEmpty(strings.TrimSpace(remote.CreatedByDisplay), strings.TrimSpace(out.CreatedByDisplay))
	if len(remote.Messages) > 0 {
		out.Messages = remote.Messages
	}
	return out
}

func mergeAdminConversationSummaries(localItems []ConversationSummary, remoteItems []InferenceTranscriptSummary) []ConversationSummary {
	merged := make([]ConversationSummary, 0, len(localItems)+len(remoteItems))
	threadIndex := make(map[string]int, len(localItems))
	for _, item := range localItems {
		if strings.TrimSpace(item.Origin) == "" {
			item.Origin = "local"
		}
		item.RemoteOnly = false
		merged = append(merged, item)
		if threadID := strings.TrimSpace(item.ThreadID); threadID != "" {
			threadIndex[threadID] = len(merged) - 1
		}
	}
	for _, raw := range remoteItems {
		item := remoteConversationSummary(raw)
		if idx, ok := threadIndex[strings.TrimSpace(item.ThreadID)]; ok {
			merged[idx] = mergeConversationSummary(merged[idx], item)
			continue
		}
		merged = append(merged, item)
	}
	sort.SliceStable(merged, func(i, j int) bool {
		return adminConversationTimeValue(merged[i]).After(adminConversationTimeValue(merged[j]))
	})
	return merged
}

func parseAdminConversationListParams(r *http.Request) adminConversationListParams {
	query := r.URL.Query()
	page := parsePositiveIntWithDefault(query.Get("page"), 1)
	limit := parsePositiveIntWithDefault(query.Get("limit"), adminConversationDefaultListLimit)
	if limit > adminConversationMaxListLimit {
		limit = adminConversationMaxListLimit
	}
	return adminConversationListParams{
		Page:   page,
		Limit:  limit,
		Status: strings.ToLower(strings.TrimSpace(query.Get("status"))),
		Origin: strings.ToLower(strings.TrimSpace(query.Get("origin"))),
		Query:  strings.ToLower(strings.TrimSpace(query.Get("q"))),
	}
}

func parsePositiveIntWithDefault(raw string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func adminConversationRemoteFetchLimit(params adminConversationListParams) int {
	limit := params.Page*params.Limit + 1
	if limit <= 0 {
		return adminConversationDefaultListLimit
	}
	if limit > adminConversationMaxListLimit {
		return adminConversationMaxListLimit
	}
	return limit
}

func filterAdminConversationSummaries(items []ConversationSummary, params adminConversationListParams) []ConversationSummary {
	if params.Status == "" && params.Origin == "" && params.Query == "" {
		return items
	}
	out := make([]ConversationSummary, 0, len(items))
	for _, item := range items {
		if params.Status != "" && strings.ToLower(strings.TrimSpace(item.Status)) != params.Status {
			continue
		}
		if params.Origin != "" && strings.ToLower(strings.TrimSpace(item.Origin)) != params.Origin {
			continue
		}
		if params.Query != "" && !adminConversationSummaryMatchesQuery(item, params.Query) {
			continue
		}
		out = append(out, item)
	}
	return out
}

func adminConversationSummaryMatchesQuery(item ConversationSummary, query string) bool {
	values := []string{
		item.ID,
		item.Title,
		item.ThreadID,
		item.TraceID,
		item.MessageID,
		item.ResponseID,
		item.CompletionID,
		item.AccountEmail,
		item.CreatedByDisplay,
		item.Error,
		item.Preview,
		item.Source,
		item.Transport,
		item.Status,
		item.Model,
	}
	for _, value := range values {
		if strings.Contains(strings.ToLower(strings.TrimSpace(value)), query) {
			return true
		}
	}
	return false
}

func paginateAdminConversationSummaries(items []ConversationSummary, params adminConversationListParams) ([]ConversationSummary, bool) {
	start := (params.Page - 1) * params.Limit
	if start >= len(items) {
		return []ConversationSummary{}, false
	}
	end := minInt(start+params.Limit, len(items))
	return items[start:end], end < len(items)
}

func (a *App) loadAdminRemoteConversation(ctx context.Context, threadID string, accountEmail string, summary *InferenceTranscriptSummary) (ConversationEntry, error) {
	client, err := a.notionClientForAccount(ctx, accountEmail)
	if err != nil {
		return ConversationEntry{}, err
	}
	if summary != nil {
		return client.loadTranscriptConversation(ctx, *summary)
	}
	return client.loadTranscriptConversation(ctx, InferenceTranscriptSummary{ThreadID: threadID})
}

func (a *App) handleAdminConversations(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	cfg, _, _ := a.State.Snapshot()
	timedRequest, cancel := cloneRequestWithTimeout(r, adminSyncRequestTimeout(cfg))
	defer cancel()

	params := parseAdminConversationListParams(r)
	localItems := a.State.conversations().List()
	var remoteErr error
	remoteItems := []InferenceTranscriptSummary{}
	if params.Origin != "local" {
		client, err := a.notionClientForAccount(timedRequest.Context(), "")
		if err != nil {
			remoteErr = err
		} else {
			remoteItems, remoteErr = client.listInferenceTranscripts(timedRequest.Context(), adminConversationRemoteFetchLimit(params))
		}
	}
	merged := mergeAdminConversationSummaries(localItems, remoteItems)
	filtered := filterAdminConversationSummaries(merged, params)
	items, hasNext := paginateAdminConversationSummaries(filtered, params)

	response := map[string]any{
		"success":  true,
		"items":    items,
		"page":     params.Page,
		"limit":    params.Limit,
		"total":    len(filtered),
		"has_next": hasNext,
	}
	if remoteErr != nil {
		response["remote_error"] = remoteErr.Error()
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *App) deleteAdminConversationByID(r *http.Request, conversationID string) error {
	conversationID = strings.TrimSpace(conversationID)
	if threadID, ok := parseNotionThreadConversationID(conversationID); ok {
		cfg, _, _ := a.State.Snapshot()
		timedRequest, cancel := cloneRequestWithTimeout(r, adminSyncRequestTimeout(cfg))
		defer cancel()
		client, err := a.notionClientForAccount(timedRequest.Context(), "")
		if err != nil {
			return err
		}
		if err := client.deleteThread(timedRequest.Context(), threadID); err != nil {
			return err
		}
		a.State.deleteConversationSessionByConversationOrThread("", threadID)
		a.State.deleteResponsesByConversationOrThread("", threadID)
		return nil
	}
	return a.deleteConversation(conversationID)
}

func (a *App) handleAdminConversationBatchDelete(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	if r.Method != http.MethodPost {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	defer r.Body.Close()
	var req adminConversationBatchDeleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "invalid json body"})
		return
	}
	seen := map[string]struct{}{}
	ids := make([]string, 0, len(req.IDs))
	for _, raw := range req.IDs {
		id := strings.TrimSpace(raw)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "ids is required"})
		return
	}
	if len(ids) > adminConversationBatchDeleteMaxIDs {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "too many ids"})
		return
	}
	deleted := make([]string, 0, len(ids))
	failed := make([]map[string]any, 0)
	for _, id := range ids {
		if err := a.deleteAdminConversationByID(r, id); err != nil {
			failed = append(failed, map[string]any{
				"id":     id,
				"detail": err.Error(),
			})
			continue
		}
		deleted = append(deleted, id)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"success":       len(failed) == 0,
		"deleted_ids":   deleted,
		"deleted_count": len(deleted),
		"failed":        failed,
		"failed_count":  len(failed),
	})
}

func (a *App) handleAdminConversationByID(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	rawID := strings.TrimPrefix(r.URL.Path, "/admin/conversations/")
	decodedID, err := url.PathUnescape(rawID)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "invalid conversation id"})
		return
	}
	conversationID := strings.TrimSpace(decodedID)
	if conversationID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"detail": "conversation id is required"})
		return
	}
	switch r.Method {
	case http.MethodGet:
		cfg, _, _ := a.State.Snapshot()
		timedRequest, cancel := cloneRequestWithTimeout(r, adminSyncRequestTimeout(cfg))
		defer cancel()
		if item, ok := a.State.conversations().Get(conversationID); ok {
			if strings.TrimSpace(item.Origin) == "" {
				item.Origin = "local"
			}
			var remoteErr error
			if threadID := strings.TrimSpace(item.ThreadID); threadID != "" {
				remoteItem, err := a.loadAdminRemoteConversation(timedRequest.Context(), threadID, item.AccountEmail, nil)
				if err == nil {
					item = mergeConversationEntry(item, remoteItem)
				} else {
					remoteErr = err
				}
			}
			response := map[string]any{
				"success": true,
				"item":    item,
			}
			if remoteErr != nil {
				response["remote_error"] = remoteErr.Error()
			}
			writeJSON(w, http.StatusOK, response)
			return
		}
		threadID, ok := parseNotionThreadConversationID(conversationID)
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]any{"detail": "conversation not found"})
			return
		}
		item, err := a.loadAdminRemoteConversation(timedRequest.Context(), threadID, "", &InferenceTranscriptSummary{ThreadID: threadID})
		if err != nil {
			writeAdminUpstreamError(w, err, nil)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"item":    item,
		})
	case http.MethodDelete:
		if err := a.deleteAdminConversationByID(r, conversationID); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{"detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"success": true,
			"message": "conversation deleted",
		})
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
	}
}

func (a *App) handleAdminEvents(w http.ResponseWriter, r *http.Request) {
	if !a.adminAuthOK(w, r) {
		return
	}
	if r.Method != http.MethodGet {
		writeJSON(w, http.StatusMethodNotAllowed, map[string]any{"detail": "method not allowed"})
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"detail": "streaming is not supported by this response writer"})
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	applyCORSHeaders(w)
	w.WriteHeader(http.StatusOK)

	subID, events := a.State.conversations().Subscribe()
	defer a.State.conversations().Unsubscribe(subID)

	_ = writeSSEEvent(w, flusher, "admin.ready", map[string]any{
		"type":               "admin.ready",
		"at":                 time.Now().UTC(),
		"connected":          true,
		"conversation_count": len(a.State.conversations().List()),
	})

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := writeSSEEvent(w, flusher, event.Type, event); err != nil {
				return
			}
		case <-ticker.C:
			if _, err := w.Write([]byte(": keepalive\n\n")); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
