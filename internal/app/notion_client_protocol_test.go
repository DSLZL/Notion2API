package app

import (
	"context"
	"encoding/json"
	"errors"
	"expvar"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

var urlSafeTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func resetNotionTransportCacheForTest() {
	notionTransportCache.mu.Lock()
	defer notionTransportCache.mu.Unlock()
	for _, transport := range notionTransportCache.items {
		if transport != nil {
			transport.CloseIdleConnections()
		}
	}
	notionTransportCache.items = map[notionHTTPTransportCacheKey]*http.Transport{}
	notionHTTPTransportCacheMetric.Init()
}

func newProtocolTestClient(cfg AppConfig) *NotionAIClient {
	cfg.APIKey = "test-api-key"
	if cfg.UpstreamBaseURL == "" {
		cfg.UpstreamBaseURL = "https://www.notion.so"
	}
	if cfg.UpstreamOrigin == "" {
		cfg.UpstreamOrigin = cfg.UpstreamBaseURL
	}
	return newNotionAIClient(SessionInfo{
		ClientVersion: "test-client-version",
		UserID:        "test-user",
		UserName:      "tester",
		UserEmail:     "tester@example.com",
		SpaceID:       "test-space",
		SpaceName:     "test-space-name",
		SpaceViewID:   "test-space-view",
		Cookies: []ProbeCookie{{
			Name:  "token_v2",
			Value: "test-cookie",
		}},
	}, cfg, "")
}

func transcriptStepValue(t *testing.T, payload map[string]any, stepType string) map[string]any {
	t.Helper()
	steps, ok := payload["transcript"].([]map[string]any)
	if !ok {
		t.Fatalf("payload transcript missing or wrong type: %#v", payload["transcript"])
	}
	for _, step := range steps {
		if stringValue(step["type"]) == stepType {
			return mapValue(step["value"])
		}
	}
	t.Fatalf("transcript step %q missing", stepType)
	return nil
}

func isURLSafeToken(v string) bool {
	token := strings.TrimSpace(v)
	if token == "" {
		return false
	}
	return urlSafeTokenPattern.MatchString(token)
}

func isCanonicalUUID(v string) bool {
	clean := strings.ToLower(strings.TrimSpace(v))
	if len(clean) != 36 {
		return false
	}
	for i, ch := range clean {
		switch i {
		case 8, 13, 18, 23:
			if ch != '-' {
				return false
			}
		default:
			if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') {
				return false
			}
		}
	}
	return true
}

func TestIsSyncRecordValuesRetryableError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "context canceled", err: context.Canceled, want: false},
		{name: "deadline exceeded", err: context.DeadlineExceeded, want: false},
		{name: "api error not retryable", err: &notionAPIError{URL: "https://example.com", StatusCode: 500, Message: "boom"}, want: false},
		{name: "plain eof", err: errors.New("EOF"), want: true},
		{name: "network reset", err: errors.New("read: connection reset by peer"), want: true},
		{name: "timeout", err: errors.New("i/o timeout"), want: true},
		{name: "other", err: errors.New("bad request"), want: false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := isSyncRecordValuesRetryableError(tc.err)
			if got != tc.want {
				t.Fatalf("isSyncRecordValuesRetryableError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestIsSaveTransactionsRetryableError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{name: "nil", err: nil, want: false},
		{name: "context canceled", err: context.Canceled, want: false},
		{name: "deadline exceeded", err: context.DeadlineExceeded, want: false},
		{name: "api error retryable no previtems", err: &notionAPIError{URL: "https://example.com", StatusCode: 500, Message: "Unsaved transactions: No prevItems available"}, want: true},
		{name: "api error retryable mixed case", err: &notionAPIError{URL: "https://example.com", StatusCode: 503, Message: "unsaved transactions: no previtems available"}, want: true},
		{name: "api error non 5xx", err: &notionAPIError{URL: "https://example.com", StatusCode: 400, Message: "Unsaved transactions: No prevItems available"}, want: false},
		{name: "api error other message", err: &notionAPIError{URL: "https://example.com", StatusCode: 500, Message: "boom"}, want: false},
		{name: "wrapped message contains unsaved transactions", err: errors.New("https://www.notion.so/api/v3/saveTransactionsFanout failed: 500 {\"debugMessage\":\"Unsaved transactions: No prevItems available\"}"), want: true},
		{name: "plain eof", err: errors.New("EOF"), want: true},
		{name: "network reset", err: errors.New("read: connection reset by peer"), want: true},
		{name: "connection aborted", err: errors.New("wsarecv: An established connection was aborted by the software in your host machine"), want: true},
		{name: "stream error", err: errors.New("stream error: stream ID 1; INTERNAL_ERROR"), want: true},
		{name: "timeout", err: errors.New("i/o timeout"), want: true},
		{name: "other", err: errors.New("bad request"), want: false},
	}
	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got := isSaveTransactionsRetryableError(tc.err)
			if got != tc.want {
				t.Fatalf("isSaveTransactionsRetryableError(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

func TestPostSaveTransactionsFanoutWithRetryRefreshesRequestAndTransactionIDs(t *testing.T) {
	var (
		callCount int
		bodies    []map[string]any
	)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/saveTransactionsFanout" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		callCount++
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode saveTransactionsFanout body failed: %v", err)
		}
		bodies = append(bodies, body)
		if callCount == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"isNotionError": true,
				"name":          "CrdtAssertionError",
				"debugMessage":  "Unsaved transactions: No prevItems available",
				"message":       "Something went wrong. (500)",
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	payload := map[string]any{
		"requestId": "request-first",
		"transactions": []any{
			map[string]any{
				"id": "txn-first-1",
				"operations": []any{
					map[string]any{
						"command": "set",
						"path":    []any{"alive"},
						"args":    true,
					},
				},
			},
			map[string]any{
				"id": "txn-first-2",
				"operations": []any{
					map[string]any{
						"command": "update",
						"path":    []any{"data"},
						"args": map[string]any{
							"foo": "bar",
						},
					},
				},
			},
		},
	}

	if err := client.postSaveTransactionsFanoutWithRetry(context.Background(), payload); err != nil {
		t.Fatalf("postSaveTransactionsFanoutWithRetry failed: %v", err)
	}
	if callCount != 2 {
		t.Fatalf("expected two saveTransactionsFanout calls, got %d", callCount)
	}
	if len(bodies) != 2 {
		t.Fatalf("expected two captured payloads, got %d", len(bodies))
	}
	first := bodies[0]
	second := bodies[1]
	firstReqID := strings.TrimSpace(stringValue(first["requestId"]))
	secondReqID := strings.TrimSpace(stringValue(second["requestId"]))
	if firstReqID == "" || secondReqID == "" {
		t.Fatalf("requestId should not be empty after retry")
	}
	if firstReqID == secondReqID {
		t.Fatalf("expected retry requestId refreshed, got same value %q", firstReqID)
	}
	if !isCanonicalUUID(secondReqID) {
		t.Fatalf("expected retry requestId to be canonical UUID, got %q", secondReqID)
	}
	firstTxns := sliceValue(first["transactions"])
	secondTxns := sliceValue(second["transactions"])
	if len(firstTxns) != len(secondTxns) {
		t.Fatalf("transactions length mismatch after retry: first=%d second=%d", len(firstTxns), len(secondTxns))
	}
	for i := range firstTxns {
		firstTxnID := strings.TrimSpace(stringValue(mapValue(firstTxns[i])["id"]))
		secondTxnID := strings.TrimSpace(stringValue(mapValue(secondTxns[i])["id"]))
		if firstTxnID == "" || secondTxnID == "" {
			t.Fatalf("transaction id should not be empty at index %d", i)
		}
		if firstTxnID == secondTxnID {
			t.Fatalf("expected retry transaction id refreshed at index %d, got same value %q", i, firstTxnID)
		}
		if !isCanonicalUUID(secondTxnID) {
			t.Fatalf("expected retry transaction id to be canonical UUID at index %d, got %q", i, secondTxnID)
		}
	}
}

func TestBuildDefaultWorkflowConfigValueMatchesCurrentWebDefaults(t *testing.T) {
	client := newProtocolTestClient(defaultConfig())

	value := client.buildDefaultWorkflowConfigValue("workflow", true, "")

	if !booleanValue(value["enableAgentAutomations"]) {
		t.Fatalf("expected enableAgentAutomations=true")
	}
	if !booleanValue(value["enableAgentIntegrations"]) {
		t.Fatalf("expected enableAgentIntegrations=true")
	}
	if !booleanValue(value["enableCustomAgents"]) {
		t.Fatalf("expected enableCustomAgents=true")
	}
	if !booleanValue(value["enableAgentDiffs"]) {
		t.Fatalf("expected enableAgentDiffs=true")
	}
	if !booleanValue(value["enableAgentGenerateImage"]) {
		t.Fatalf("expected enableAgentGenerateImage=true")
	}
	if !booleanValue(value["enableMailExplicitToolCalls"]) {
		t.Fatalf("expected enableMailExplicitToolCalls=true")
	}
	if !booleanValue(value["useRulePrioritization"]) {
		t.Fatalf("expected useRulePrioritization=true")
	}
	if !booleanValue(value["useWebSearch"]) {
		t.Fatalf("expected useWebSearch=true")
	}
	if booleanValue(value["useReadOnlyMode"]) {
		t.Fatalf("expected useReadOnlyMode=false")
	}
	if !booleanValue(value["enableUpdatePageAutofixer"]) {
		t.Fatalf("expected enableUpdatePageAutofixer=true")
	}
	if !booleanValue(value["enableUpdatePageOrderUpdates"]) {
		t.Fatalf("expected enableUpdatePageOrderUpdates=true")
	}
	if !booleanValue(value["enableAgentSupportPropertyReorder"]) {
		t.Fatalf("expected enableAgentSupportPropertyReorder=true")
	}
	if !booleanValue(value["enableAgentAskSurvey"]) {
		t.Fatalf("expected enableAgentAskSurvey=true")
	}
}

func TestBuildInferencePayloadPlacesSelectedModelInConfigAndCreatedSource(t *testing.T) {
	client := newProtocolTestClient(defaultConfig())

	payload, _ := client.buildInferencePayload(PromptRunRequest{
		Prompt:       "hello",
		NotionModel:  "apricot-sorbet-medium",
		UseWebSearch: true,
	}, "thread-1", nil)

	if got := stringValue(payload["createdSource"]); got != "ai_module" {
		t.Fatalf("createdSource mismatch: got %q want %q", got, "ai_module")
	}
	configValue := transcriptStepValue(t, payload, "config")
	if got := stringValue(configValue["model"]); got != "apricot-sorbet-medium" {
		t.Fatalf("config model mismatch: got %q want %q", got, "apricot-sorbet-medium")
	}
	if !booleanValue(configValue["modelFromUser"]) {
		t.Fatalf("expected config modelFromUser=true")
	}
	debugOverrides := mapValue(payload["debugOverrides"])
	if _, exists := debugOverrides["model"]; exists {
		t.Fatalf("expected debugOverrides.model to be omitted, got %#v", debugOverrides["model"])
	}
}

func TestMarkInferenceTranscriptSeenIncludesSpaceID(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/markInferenceTranscriptSeen" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode body failed: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	if err := client.markInferenceTranscriptSeen(context.Background(), "thread-1"); err != nil {
		t.Fatalf("markInferenceTranscriptSeen failed: %v", err)
	}
	if got := stringValue(gotBody["threadId"]); got != "thread-1" {
		t.Fatalf("threadId mismatch: got %q want %q", got, "thread-1")
	}
	if got := stringValue(gotBody["spaceId"]); got != "test-space" {
		t.Fatalf("spaceId mismatch: got %q want %q", got, "test-space")
	}
}

func TestSaveContinuationScaffoldOmitsUnretryableErrorBehavior(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/saveTransactionsFanout" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode body failed: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{})
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	if _, err := client.saveContinuationScaffold(context.Background(), "thread-1", "hello", &continuationTurnDraft{}); err != nil {
		t.Fatalf("saveContinuationScaffold failed: %v", err)
	}
	if _, exists := gotBody["unretryable_error_behavior"]; exists {
		t.Fatalf("expected saveTransactionsFanout payload to omit unretryable_error_behavior")
	}
}

func TestListCustomAgentsParsesWorkflowAndTranscriptFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/getCustomAgents" {
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode getCustomAgents body failed: %v", err)
			}
			if got := stringValue(body["spaceId"]); got != "test-space" {
				t.Fatalf("spaceId mismatch: got %q want %q", got, "test-space")
			}
			if got := stringValue(body["filter"]); got != "all" {
				t.Fatalf("filter mismatch: got %q want %q", got, "all")
			}
			if booleanValue(body["includeDeleted"]) {
				t.Fatalf("expected includeDeleted=false")
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"agentIds": []string{"workflow-1"},
				"mostRecentTranscripts": []map[string]any{
					{
						"id":        "thread-1",
						"parent_id": "workflow-1",
						"title":     "latest transcript",
					},
				},
				"activityScores": map[string]any{
					"workflow-1": "12345",
				},
			})
			return
		}
		if r.URL.Path == "/api/v3/syncRecordValuesSpaceInitial" {
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode syncRecordValuesSpaceInitial body failed: %v", err)
			}
			requests := sliceValue(body["requests"])
			if len(requests) != 1 {
				t.Fatalf("expected one workflow request, got %d", len(requests))
			}
			pointer := mapValue(mapValue(requests[0])["pointer"])
			if got := stringValue(pointer["table"]); got != "workflow" {
				t.Fatalf("pointer.table mismatch: got %q want %q", got, "workflow")
			}
			if got := stringValue(pointer["id"]); got != "workflow-1" {
				t.Fatalf("pointer.id mismatch: got %q want %q", got, "workflow-1")
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"recordMap": map[string]any{
					"workflow": map[string]any{
						"workflow-1": map[string]any{
							"value": map[string]any{
								"alive": true,
								"data": map[string]any{
									"name": "Agent One",
									"icon": "https://example.com/icon.png",
									"model": map[string]any{
										"type": "apricot-sorbet-high",
									},
								},
							},
						},
					},
				},
			})
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	items, err := client.listCustomAgents(context.Background())
	if err != nil {
		t.Fatalf("listCustomAgents failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected one agent item, got %d", len(items))
	}
	item := items[0]
	if item.ID != "workflow-1" {
		t.Fatalf("agent id mismatch: got %q want %q", item.ID, "workflow-1")
	}
	if item.Name != "Agent One" {
		t.Fatalf("agent name mismatch: got %q want %q", item.Name, "Agent One")
	}
	if item.Model.Type != "apricot-sorbet-high" {
		t.Fatalf("agent model mismatch: got %q want %q", item.Model.Type, "apricot-sorbet-high")
	}
	if item.ThreadID != "thread-1" {
		t.Fatalf("agent thread id mismatch: got %q want %q", item.ThreadID, "thread-1")
	}
	if item.LastActivityScore != "12345" {
		t.Fatalf("agent activity_score mismatch: got %q want %q", item.LastActivityScore, "12345")
	}
}

func TestListCustomAgentsParsesActivityScoresArrayPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/getCustomAgents" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"agentIds": []string{"workflow-1"},
				"mostRecentTranscripts": []map[string]any{
					{
						"id":        "thread-1",
						"parent_id": "workflow-1",
					},
				},
				"activityScores": []map[string]any{
					{
						"workflowId": "workflow-1",
						"score":      "8765",
					},
				},
			})
			return
		}
		if r.URL.Path == "/api/v3/syncRecordValuesSpaceInitial" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"recordMap": map[string]any{
					"workflow": map[string]any{
						"workflow-1": map[string]any{
							"value": map[string]any{
								"alive": true,
								"data": map[string]any{
									"name": "Agent One",
								},
							},
						},
					},
				},
			})
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	items, err := client.listCustomAgents(context.Background())
	if err != nil {
		t.Fatalf("listCustomAgents failed: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected one agent item, got %d", len(items))
	}
	if got := items[0].LastActivityScore; got != "8765" {
		t.Fatalf("agent activity_score mismatch: got %q want %q", got, "8765")
	}
}

func TestListCustomAgentsReplaysFanoutAndSkipsDefaultWorkflowRecords(t *testing.T) {
	var syncCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/getCustomAgents" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"agentIds": []string{"workflow-1", "workflow-deleted", "workflow-default"},
				"mostRecentTranscripts": []map[string]any{
					{
						"id":        "thread-1",
						"parent_id": "workflow-1",
						"title":     "fallback-title",
					},
				},
				"activityScores": map[string]any{
					"workflow-1": "9988",
				},
			})
			return
		}
		if r.URL.Path == "/api/v3/syncRecordValuesSpaceInitial" {
			syncCalls++
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode syncRecordValuesSpaceInitial body failed: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			if syncCalls == 1 {
				if got := r.Header.Get("x-notion-cell"); strings.TrimSpace(got) != "" {
					t.Fatalf("first sync call should not include x-notion-cell, got %q", got)
				}
				_ = json.NewEncoder(w).Encode(map[string]any{
					"recordMap": map[string]any{
						"__version__": 3,
					},
					"fanoutData": []map[string]any{
						{
							"headers": map[string]any{
								"x-notion-cell": "cell-test-1",
							},
							"request": body,
						},
					},
				})
				return
			}
			if got := r.Header.Get("x-notion-cell"); got != "cell-test-1" {
				t.Fatalf("second sync call x-notion-cell mismatch: got %q want %q", got, "cell-test-1")
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"recordMap": map[string]any{
					"workflow": map[string]any{
						"workflow-1": map[string]any{
							"value": map[string]any{
								"value": map[string]any{
									"alive": true,
									"data": map[string]any{
										"name": "Mapped Agent",
										"model": map[string]any{
											"type": "apricot-sorbet-high",
										},
									},
								},
							},
						},
						"workflow-deleted": map[string]any{
							"value": map[string]any{
								"value": map[string]any{
									"alive": false,
									"data": map[string]any{
										"name": "Deleted Agent",
									},
								},
							},
						},
						"workflow-default": map[string]any{
							"value": map[string]any{
								"role": "editor",
							},
						},
					},
				},
			})
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	items, err := client.listCustomAgents(context.Background())
	if err != nil {
		t.Fatalf("listCustomAgents failed: %v", err)
	}
	if syncCalls != 2 {
		t.Fatalf("expected two syncRecordValuesSpaceInitial calls due to fanout replay, got %d", syncCalls)
	}
	if len(items) != 1 {
		t.Fatalf("expected one custom agent item after filtering, got %d", len(items))
	}
	if got := items[0].ID; got != "workflow-1" {
		t.Fatalf("agent id mismatch: got %q want %q", got, "workflow-1")
	}
	if got := items[0].Name; got != "Mapped Agent" {
		t.Fatalf("agent name mismatch: got %q want %q", got, "Mapped Agent")
	}
	if got := items[0].Model.Type; got != "apricot-sorbet-high" {
		t.Fatalf("agent model mismatch: got %q want %q", got, "apricot-sorbet-high")
	}
}

func TestCreateCustomAgentBuildsExpectedSaveTransactionsPayload(t *testing.T) {
	var gotBodies []map[string]any
	var syncCalls int
	var saveReferers []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/syncRecordValuesSpaceInitial" {
			syncCalls++
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"recordMap": map[string]any{
					"space_view": map[string]any{
						"test-space-view": map[string]any{
							"value": map[string]any{
								"value": map[string]any{
									"settings": map[string]any{
										"library":              []any{"pinned"},
										"sidebar_workflow_ids": []any{"existing-workflow"},
									},
								},
							},
						},
					},
				},
			})
			return
		}
		if r.URL.Path != "/api/v3/saveTransactionsFanout" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		saveReferers = append(saveReferers, strings.TrimSpace(r.Header.Get("referer")))
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode saveTransactionsFanout body failed: %v", err)
		}
		gotBodies = append(gotBodies, body)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{})
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	created, err := client.createCustomAgent(context.Background(), CustomAgentMutationRequest{
		Name:      "Agent X",
		Icon:      "https://example.com/x.png",
		ModelType: "apricot-sorbet-high",
	})
	if err != nil {
		t.Fatalf("createCustomAgent failed: %v", err)
	}
	if strings.TrimSpace(created.ID) == "" {
		t.Fatalf("expected created agent id")
	}
	if len(gotBodies) != 2 {
		t.Fatalf("expected two saveTransactionsFanout calls (create + update model), got %d", len(gotBodies))
	}
	if len(saveReferers) != 2 {
		t.Fatalf("expected two referer captures for saveTransactionsFanout, got %d", len(saveReferers))
	}
	expectedReferer := server.URL + "/library/agents?spaceId=" + strings.ReplaceAll(strings.TrimSpace(client.Session.SpaceID), "-", "")
	for i, got := range saveReferers {
		if got != expectedReferer {
			t.Fatalf("saveTransactions referer %d mismatch: got %q want %q", i, got, expectedReferer)
		}
	}
	createBody := gotBodies[0]
	updateBody := gotBodies[1]
	if got := strings.TrimSpace(stringValue(createBody["referer"])); got == "" {
		t.Fatalf("create payload top-level referer should not be empty")
	}
	if got := strings.TrimSpace(stringValue(createBody["userTimeZone"])); got == "" {
		t.Fatalf("create payload top-level userTimeZone should not be empty")
	}

	txns := sliceValue(createBody["transactions"])
	if len(txns) != 2 {
		t.Fatalf("expected two transactions (create + sidebar add), got %d", len(txns))
	}
	firstTxn := mapValue(txns[0])
	if got := strings.TrimSpace(stringValue(firstTxn["spaceId"])); got == "" {
		t.Fatalf("create transaction spaceId should not be empty")
	}
	if got := strings.TrimSpace(stringValue(firstTxn["id"])); got == "" {
		t.Fatalf("create transaction id should not be empty")
	} else if !isCanonicalUUID(got) {
		t.Fatalf("create transaction id should be canonical UUID, got %q", got)
	}
	debug := mapValue(firstTxn["debug"])
	if got := stringValue(debug["userAction"]); got != "agentActions.createBlankAgent" {
		t.Fatalf("userAction mismatch: got %q want %q", got, "agentActions.createBlankAgent")
	}
	if _, exists := debug["userFlow"]; exists {
		t.Fatalf("create payload debug should omit userFlow")
	}
	ops := sliceValue(firstTxn["operations"])
	if len(ops) != 10 {
		t.Fatalf("expected ten operations for create payload, got %d", len(ops))
	}
	firstOp := mapValue(ops[0])
	if got := stringValue(firstOp["command"]); got != "set" {
		t.Fatalf("first operation command mismatch: got %q want %q", got, "set")
	}
	firstPointer := mapValue(firstOp["pointer"])
	if got := stringValue(firstPointer["table"]); got != "workflow" {
		t.Fatalf("first operation pointer.table mismatch: got %q want %q", got, "workflow")
	}
	firstArgs := mapValue(firstOp["args"])
	if !booleanValue(firstArgs["alive"]) {
		t.Fatalf("expected workflow alive=true in create set args")
	}
	data := mapValue(firstArgs["data"])
	if got := stringValue(data["name"]); got != "Agent X" {
		t.Fatalf("workflow data.name mismatch: got %q want %q", got, "Agent X")
	}
	if got := stringValue(data["icon"]); got != "https://example.com/x.png" {
		t.Fatalf("workflow data.icon mismatch: got %q want %q", got, "https://example.com/x.png")
	}
	if _, exists := data["model"]; exists {
		t.Fatalf("workflow data.model should not be set in createBlankAgent payload")
	}
	insertOp := mapValue(ops[2])
	if got := stringValue(insertOp["command"]); got != "insertText" {
		t.Fatalf("third operation command mismatch: got %q want %q", got, "insertText")
	}
	insertArgs := mapValue(insertOp["args"])
	if got := strings.TrimSpace(stringValue(insertArgs["textInstanceId"])); got == "" {
		t.Fatalf("insertText args.textInstanceId should not be empty")
	} else if !isURLSafeToken(got) {
		t.Fatalf("insertText args.textInstanceId should be URL-safe token, got %q", got)
	}
	insertID := sliceValue(insertArgs["id"])
	if len(insertID) != 2 {
		t.Fatalf("insertText args.id length mismatch: got %d want %d", len(insertID), 2)
	}
	if got := strings.TrimSpace(stringValue(insertID[0])); got == "" {
		t.Fatalf("insertText args.id[0] should not be empty")
	} else if !isURLSafeToken(got) {
		t.Fatalf("insertText args.id[0] should be URL-safe token, got %q", got)
	}
	if got := stringValue(insertArgs["content"]); got != "Instructions" {
		t.Fatalf("insertText content mismatch: got %q want %q", got, "Instructions")
	}
	instructionPtr := mapValue(mapValue(ops[1])["pointer"])
	guidePtr := mapValue(mapValue(ops[3])["pointer"])
	instructionID := strings.TrimSpace(stringValue(instructionPtr["id"]))
	guideID := strings.TrimSpace(stringValue(guidePtr["id"]))
	if instructionID == "" || guideID == "" {
		t.Fatalf("expected instruction/guide block ids in create payload")
	}
	guideSetOp := mapValue(ops[3])
	guideArgs := mapValue(guideSetOp["args"])
	guideCRDT := mapValue(mapValue(guideArgs["crdt_data"])["title"])
	guideTitleRef := strings.TrimSpace(stringValue(guideCRDT["r"]))
	if guideTitleRef == "" {
		t.Fatalf("guide block title ref should not be empty")
	}
	guideTitleNodes := mapValue(guideCRDT["n"])
	if len(guideTitleNodes) == 0 {
		t.Fatalf("guide block title nodes should not be empty")
	}
	guideNode := mapValue(guideTitleNodes[guideTitleRef])
	if len(guideNode) == 0 {
		t.Fatalf("guide block title node missing for ref %q", guideTitleRef)
	}
	guideState := mapValue(guideNode["s"])
	if strings.TrimSpace(stringValue(guideState["x"])) == "" {
		t.Fatalf("guide block title state.x should not be empty")
	}
	guideRange := sliceValue(guideState["i"])
	if len(guideRange) != 2 {
		t.Fatalf("guide block title state.i length mismatch: got %d want %d", len(guideRange), 2)
	}
	if got := strings.TrimSpace(stringValue(mapValue(guideRange[0])["t"])); got != "s" {
		t.Fatalf("guide block title range[0].t mismatch: got %q want %q", got, "s")
	}
	if got := strings.TrimSpace(stringValue(mapValue(guideRange[1])["t"])); got != "e" {
		t.Fatalf("guide block title range[1].t mismatch: got %q want %q", got, "e")
	}
	for i, expectedID := range []string{instructionID, guideID} {
		op := mapValue(ops[8+i])
		if got := stringValue(op["command"]); got != "update" {
			t.Fatalf("tail operation %d command mismatch: got %q want %q", 8+i, got, "update")
		}
		ptr := mapValue(op["pointer"])
		if got := stringValue(ptr["table"]); got != "block" {
			t.Fatalf("tail operation %d pointer.table mismatch: got %q want %q", 8+i, got, "block")
		}
		if got := strings.TrimSpace(stringValue(ptr["id"])); got == "" {
			t.Fatalf("tail operation %d pointer.id should not be empty", 8+i)
		} else if got != expectedID {
			t.Fatalf("tail operation %d should update block %q, got %q", 8+i, expectedID, got)
		}
		args := mapValue(op["args"])
		if got := stringValue(args["last_edited_by_table"]); got != "notion_user" {
			t.Fatalf("tail operation %d last_edited_by_table mismatch: got %q want %q", 8+i, got, "notion_user")
		}
	}
	sidebarTxn := mapValue(txns[1])
	if got := strings.TrimSpace(stringValue(sidebarTxn["spaceId"])); got == "" {
		t.Fatalf("sidebar transaction spaceId should not be empty")
	}
	if got := strings.TrimSpace(stringValue(sidebarTxn["id"])); got == "" {
		t.Fatalf("sidebar transaction id should not be empty")
	} else if !isCanonicalUUID(got) {
		t.Fatalf("sidebar transaction id should be canonical UUID, got %q", got)
	}
	sidebarDebug := mapValue(sidebarTxn["debug"])
	if got := stringValue(sidebarDebug["userAction"]); got != "sidebarWorkflowsActions.addSidebarWorkflow" {
		t.Fatalf("sidebar transaction userAction mismatch: got %q want %q", got, "sidebarWorkflowsActions.addSidebarWorkflow")
	}
	sidebarOps := sliceValue(sidebarTxn["operations"])
	if len(sidebarOps) != 1 {
		t.Fatalf("expected one sidebar operation, got %d", len(sidebarOps))
	}
	sidebarOp := mapValue(sidebarOps[0])
	sidebarArgs := mapValue(sidebarOp["args"])
	sidebarIDs := sliceValue(sidebarArgs["sidebar_workflow_ids"])
	if len(sidebarIDs) != 2 {
		t.Fatalf("expected sidebar_workflow_ids length=2, got %d", len(sidebarIDs))
	}
	if got := stringValue(sidebarIDs[0]); got != "existing-workflow" {
		t.Fatalf("expected existing sidebar workflow preserved, got %q", got)
	}
	if got := stringValue(sidebarIDs[1]); got != created.ID {
		t.Fatalf("expected created workflow appended to sidebar settings, got %q want %q", got, created.ID)
	}
	if syncCalls != 2 {
		t.Fatalf("expected two syncRecordValuesSpaceInitial calls, got %d", syncCalls)
	}

	updateTxns := sliceValue(updateBody["transactions"])
	if len(updateTxns) != 2 {
		t.Fatalf("expected two transactions for model update payload, got %d", len(updateTxns))
	}
	updateFirstTxn := mapValue(updateTxns[0])
	updateDebug := mapValue(updateFirstTxn["debug"])
	if got := stringValue(updateDebug["userAction"]); got != "WorkflowActions.saveModel" {
		t.Fatalf("model update userAction mismatch: got %q want %q", got, "WorkflowActions.saveModel")
	}
	updateOps := sliceValue(updateFirstTxn["operations"])
	if len(updateOps) != 2 {
		t.Fatalf("expected two operations in model update transaction, got %d", len(updateOps))
	}
	updateSetOp := mapValue(updateOps[0])
	if got := stringValue(updateSetOp["command"]); got != "update" {
		t.Fatalf("model update first operation command mismatch: got %q want %q", got, "update")
	}
	updateSetPath := sliceValue(updateSetOp["path"])
	if len(updateSetPath) != 2 || stringValue(updateSetPath[0]) != "data" || stringValue(updateSetPath[1]) != "model" {
		t.Fatalf("model update set operation path mismatch: got %#v", updateSetOp["path"])
	}
	updateSetArgs := mapValue(updateSetOp["args"])
	if got := stringValue(updateSetArgs["type"]); got != "apricot-sorbet-high" {
		t.Fatalf("model update set args.type mismatch: got %q want %q", got, "apricot-sorbet-high")
	}
}

func TestUpdateCustomAgentModelBuildsExpectedSaveTransactionsPayload(t *testing.T) {
	var gotBody map[string]any
	var syncCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/syncRecordValuesSpaceInitial" {
			syncCalls++
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"recordMap": map[string]any{
					"space_view": map[string]any{
						"test-space-view": map[string]any{
							"value": map[string]any{
								"settings": map[string]any{
									"sidebar_workflow_ids": []any{"workflow-1", "workflow-2"},
								},
							},
						},
					},
				},
			})
			return
		}
		if r.URL.Path != "/api/v3/saveTransactionsFanout" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode body failed: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{})
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	updated, err := client.updateCustomAgentModel(context.Background(), "workflow-1", "apricot-sorbet-high")
	if err != nil {
		t.Fatalf("updateCustomAgentModel failed: %v", err)
	}
	if updated.Model.Type != "apricot-sorbet-high" {
		t.Fatalf("updated model mismatch: got %q want %q", updated.Model.Type, "apricot-sorbet-high")
	}
	txns := sliceValue(gotBody["transactions"])
	if len(txns) != 2 {
		t.Fatalf("expected two transactions, got %d", len(txns))
	}
	firstTxn := mapValue(txns[0])
	if got := strings.TrimSpace(stringValue(firstTxn["id"])); got == "" {
		t.Fatalf("model update transaction id should not be empty")
	} else if !isCanonicalUUID(got) {
		t.Fatalf("model update transaction id should be canonical UUID, got %q", got)
	}
	debug := mapValue(firstTxn["debug"])
	if got := stringValue(debug["userAction"]); got != "WorkflowActions.saveModel" {
		t.Fatalf("userAction mismatch: got %q want %q", got, "WorkflowActions.saveModel")
	}
	ops := sliceValue(firstTxn["operations"])
	if len(ops) != 2 {
		t.Fatalf("expected two operations, got %d", len(ops))
	}
	firstOp := mapValue(ops[0])
	if got := stringValue(firstOp["command"]); got != "update" {
		t.Fatalf("first operation command mismatch: got %q want %q", got, "update")
	}
	pathValues := sliceValue(firstOp["path"])
	if len(pathValues) != 2 || stringValue(pathValues[0]) != "data" || stringValue(pathValues[1]) != "model" {
		t.Fatalf("first operation path mismatch: got %#v", firstOp["path"])
	}
	args := mapValue(firstOp["args"])
	if got := stringValue(args["type"]); got != "apricot-sorbet-high" {
		t.Fatalf("set model args.type mismatch: got %q want %q", got, "apricot-sorbet-high")
	}
	secondOp := mapValue(ops[1])
	if got := stringValue(secondOp["command"]); got != "update" {
		t.Fatalf("second operation command mismatch: got %q want %q", got, "update")
	}
	secondArgs := mapValue(secondOp["args"])
	if intFromAny(secondArgs["last_edited_time"]) <= 0 {
		t.Fatalf("expected update operation to carry last_edited_time")
	}
	if got := stringValue(secondArgs["last_edited_by_table"]); got != "notion_user" {
		t.Fatalf("last_edited_by_table mismatch: got %q want %q", got, "notion_user")
	}
	sidebarTxn := mapValue(txns[1])
	if got := strings.TrimSpace(stringValue(sidebarTxn["id"])); got == "" {
		t.Fatalf("model update sidebar transaction id should not be empty")
	} else if !isCanonicalUUID(got) {
		t.Fatalf("model update sidebar transaction id should be canonical UUID, got %q", got)
	}
	sidebarDebug := mapValue(sidebarTxn["debug"])
	if got := stringValue(sidebarDebug["userAction"]); got != "sidebarWorkflowsActions.updateSidebarWorkflowSettings" {
		t.Fatalf("sidebar transaction userAction mismatch: got %q want %q", got, "sidebarWorkflowsActions.updateSidebarWorkflowSettings")
	}
	sidebarOps := sliceValue(sidebarTxn["operations"])
	if len(sidebarOps) != 1 {
		t.Fatalf("expected one sidebar operation, got %d", len(sidebarOps))
	}
	sidebarArgs := mapValue(mapValue(sidebarOps[0])["args"])
	sidebarIDs := sliceValue(sidebarArgs["sidebar_workflow_ids"])
	if len(sidebarIDs) != 2 {
		t.Fatalf("expected sidebar_workflow_ids length=2, got %d", len(sidebarIDs))
	}
	if got := stringValue(sidebarIDs[0]); got != "workflow-1" {
		t.Fatalf("expected workflow-1 preserved in sidebar settings, got %q", got)
	}
	if got := stringValue(sidebarIDs[1]); got != "workflow-2" {
		t.Fatalf("expected workflow-2 preserved in sidebar settings, got %q", got)
	}
	if syncCalls != 1 {
		t.Fatalf("expected one syncRecordValuesSpaceInitial call, got %d", syncCalls)
	}
}

func TestSoftDeleteCustomAgentBuildsExpectedSaveTransactionsPayload(t *testing.T) {
	var saveBody map[string]any
	var deleteBody map[string]any
	var syncCalls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/syncRecordValuesSpaceInitial" {
			syncCalls++
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"recordMap": map[string]any{
					"space_view": map[string]any{
						"test-space-view": map[string]any{
							"value": map[string]any{
								"settings": map[string]any{
									"sidebar_workflow_ids": []any{"workflow-1", "workflow-2"},
								},
							},
						},
					},
				},
			})
			return
		}
		if r.URL.Path == "/api/v3/saveTransactionsFanout" {
			if err := json.NewDecoder(r.Body).Decode(&saveBody); err != nil {
				t.Fatalf("decode saveTransactionsFanout body failed: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{})
			return
		}
		if r.URL.Path == "/api/v3/deleteContentRecords" {
			if err := json.NewDecoder(r.Body).Decode(&deleteBody); err != nil {
				t.Fatalf("decode deleteContentRecords body failed: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"okay": true})
			return
		}
		t.Fatalf("unexpected path: %s", r.URL.Path)
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	client := newProtocolTestClient(cfg)

	if err := client.softDeleteCustomAgent(context.Background(), "workflow-1"); err != nil {
		t.Fatalf("softDeleteCustomAgent failed: %v", err)
	}
	txns := sliceValue(saveBody["transactions"])
	if len(txns) != 2 {
		t.Fatalf("expected two transactions (soft delete + sidebar remove), got %d", len(txns))
	}
	firstTxn := mapValue(txns[0])
	if got := strings.TrimSpace(stringValue(firstTxn["id"])); got == "" {
		t.Fatalf("soft delete transaction id should not be empty")
	} else if !isCanonicalUUID(got) {
		t.Fatalf("soft delete transaction id should be canonical UUID, got %q", got)
	}
	debug := mapValue(firstTxn["debug"])
	if got := stringValue(debug["userAction"]); got != "workflowActions.softDeleteWorkflow" {
		t.Fatalf("userAction mismatch: got %q want %q", got, "workflowActions.softDeleteWorkflow")
	}
	ops := sliceValue(firstTxn["operations"])
	if len(ops) != 2 {
		t.Fatalf("expected two operations, got %d", len(ops))
	}
	firstOp := mapValue(ops[0])
	if got := stringValue(firstOp["command"]); got != "set" {
		t.Fatalf("first operation command mismatch: got %q want %q", got, "set")
	}
	pathValues := sliceValue(firstOp["path"])
	if len(pathValues) != 1 || stringValue(pathValues[0]) != "alive" {
		t.Fatalf("first operation path mismatch: got %#v", firstOp["path"])
	}
	if booleanValue(firstOp["args"]) {
		t.Fatalf("expected first operation args=false")
	}
	secondOp := mapValue(ops[1])
	if got := stringValue(secondOp["command"]); got != "update" {
		t.Fatalf("second operation command mismatch: got %q want %q", got, "update")
	}
	secondArgs := mapValue(secondOp["args"])
	if intFromAny(secondArgs["last_edited_time"]) <= 0 {
		t.Fatalf("expected update operation to carry last_edited_time")
	}
	sidebarTxn := mapValue(txns[1])
	if got := strings.TrimSpace(stringValue(sidebarTxn["id"])); got == "" {
		t.Fatalf("soft delete sidebar transaction id should not be empty")
	} else if !isCanonicalUUID(got) {
		t.Fatalf("soft delete sidebar transaction id should be canonical UUID, got %q", got)
	}
	sidebarDebug := mapValue(sidebarTxn["debug"])
	if got := stringValue(sidebarDebug["userAction"]); got != "sidebarWorkflowsActions.removeSidebarWorkflow" {
		t.Fatalf("sidebar transaction userAction mismatch: got %q want %q", got, "sidebarWorkflowsActions.removeSidebarWorkflow")
	}
	sidebarOps := sliceValue(sidebarTxn["operations"])
	if len(sidebarOps) != 1 {
		t.Fatalf("expected one sidebar operation, got %d", len(sidebarOps))
	}
	sidebarArgs := mapValue(mapValue(sidebarOps[0])["args"])
	sidebarIDs := sliceValue(sidebarArgs["sidebar_workflow_ids"])
	if len(sidebarIDs) != 1 || stringValue(sidebarIDs[0]) != "workflow-2" {
		t.Fatalf("expected sidebar_workflow_ids to keep workflow-2 only, got %#v", sidebarArgs["sidebar_workflow_ids"])
	}
	if syncCalls != 1 {
		t.Fatalf("expected one syncRecordValuesSpaceInitial call, got %d", syncCalls)
	}

	records := sliceValue(deleteBody["records"])
	if len(records) != 1 {
		t.Fatalf("expected one deleteContentRecords record, got %d", len(records))
	}
	record := mapValue(records[0])
	if got := stringValue(record["table"]); got != "workflow" {
		t.Fatalf("deleteContentRecords table mismatch: got %q want %q", got, "workflow")
	}
	if got := stringValue(record["id"]); got != "workflow-1" {
		t.Fatalf("deleteContentRecords id mismatch: got %q want %q", got, "workflow-1")
	}
	if !booleanValue(deleteBody["permanentlyDelete"]) {
		t.Fatalf("expected permanentlyDelete=true")
	}
}

func TestPostJSONResponseAddsResinAccountHeaderWhenEnabled(t *testing.T) {
	capturedHeader := ""
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedHeader = r.Header.Get(defaultResinAccountHeader)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true})
	}))
	defer server.Close()

	cfg := defaultConfig()
	cfg.UpstreamBaseURL = server.URL
	cfg.UpstreamOrigin = server.URL
	cfg.ProxyMode = proxyModeResinForward
	cfg.ResinEnabled = true
	cfg.ResinURL = "http://127.0.0.1:2260/my-token"
	cfg.ResinPlatform = "Default"
	cfg.Accounts = []NotionAccount{{
		Email:              "alice@example.com",
		StickyProxyAccount: "alice",
	}}

	client := newNotionAIClientWithMode(SessionInfo{
		ClientVersion: "test-client-version",
		UserID:        "test-user",
		SpaceID:       "test-space",
		Cookies: []ProbeCookie{{
			Name:  "token_v2",
			Value: "test-cookie",
		}},
	}, cfg, "alice@example.com", false)
	client.HTTPClient.Transport = &http.Transport{}
	client.AccountEmail = "alice@example.com"

	if _, err := client.postJSONResponse(context.Background(), server.URL+"/api/v3/markInferenceTranscriptSeen", map[string]any{
		"threadId": "thread-test",
		"spaceId":  "test-space",
	}, "application/json"); err != nil {
		t.Fatalf("postJSONResponse failed: %v", err)
	}
	if got, want := capturedHeader, "alice"; got != want {
		t.Fatalf("%s = %q, want %q", defaultResinAccountHeader, got, want)
	}
}

func TestNewNotionAIClientWithModeReusesTransportForSameConfigAndAccount(t *testing.T) {
	resetNotionTransportCacheForTest()
	cfg := defaultConfig()
	cfg.APIKey = "test-api-key"
	session := SessionInfo{
		ClientVersion: "test-client-version",
		UserID:        "test-user",
		SpaceID:       "test-space",
		Cookies: []ProbeCookie{{
			Name:  "token_v2",
			Value: "test-cookie",
		}},
	}
	first := newNotionAIClientWithMode(session, cfg, "alice@example.com", false)
	second := newNotionAIClientWithMode(session, cfg, "alice@example.com", false)
	streaming := newNotionAIClientWithMode(session, cfg, "alice@example.com", true)

	if first.HTTPClient == nil || second.HTTPClient == nil || streaming.HTTPClient == nil {
		t.Fatalf("expected HTTP clients to be initialized")
	}
	if first.HTTPClient.Transport == nil || second.HTTPClient.Transport == nil || streaming.HTTPClient.Transport == nil {
		t.Fatalf("expected transports to be initialized")
	}
	if first.HTTPClient.Transport != second.HTTPClient.Transport {
		t.Fatalf("expected transport reuse for same account/config")
	}
	if first.HTTPClient.Transport != streaming.HTTPClient.Transport {
		t.Fatalf("expected streaming and standard clients to share transport cache")
	}
	if first.HTTPClient.Timeout <= 0 {
		t.Fatalf("expected non-streaming timeout to be configured")
	}
	if streaming.HTTPClient.Timeout != 0 {
		t.Fatalf("expected streaming client timeout to be disabled, got %s", streaming.HTTPClient.Timeout)
	}
}

func TestNewNotionAIClientWithModeSeparatesTransportWhenProxyPolicyDiffers(t *testing.T) {
	resetNotionTransportCacheForTest()
	cfg := defaultConfig()
	cfg.APIKey = "test-api-key"
	cfg.Accounts = []NotionAccount{
		{
			Email:     "alice@example.com",
			ProxyMode: proxyModeHTTP,
			ProxyURL:  "http://127.0.0.1:18080",
		},
		{
			Email:     "bob@example.com",
			ProxyMode: proxyModeHTTP,
			ProxyURL:  "http://127.0.0.1:28080",
		},
	}
	session := SessionInfo{
		ClientVersion: "test-client-version",
		UserID:        "test-user",
		SpaceID:       "test-space",
		Cookies: []ProbeCookie{{
			Name:  "token_v2",
			Value: "test-cookie",
		}},
	}
	alice := newNotionAIClientWithMode(session, cfg, "alice@example.com", false)
	bob := newNotionAIClientWithMode(session, cfg, "bob@example.com", false)

	if alice.HTTPClient == nil || bob.HTTPClient == nil {
		t.Fatalf("expected HTTP clients to be initialized")
	}
	if alice.HTTPClient.Transport == nil || bob.HTTPClient.Transport == nil {
		t.Fatalf("expected transports to be initialized")
	}
	if alice.HTTPClient.Transport == bob.HTTPClient.Transport {
		t.Fatalf("expected separate transports when account proxy policy differs")
	}
}

func TestCachedNotionHTTPTransportRecordsCacheMetrics(t *testing.T) {
	resetNotionTransportCacheForTest()
	cfg := defaultConfig()
	cfg.APIKey = "test-api-key"
	session := SessionInfo{
		ClientVersion: "test-client-version",
		UserID:        "test-user",
		SpaceID:       "test-space",
		Cookies: []ProbeCookie{{
			Name:  "token_v2",
			Value: "test-cookie",
		}},
	}
	_ = newNotionAIClientWithMode(session, cfg, "alice@example.com", false)
	_ = newNotionAIClientWithMode(session, cfg, "alice@example.com", false)
	_ = newNotionAIClientWithMode(session, cfg, "alice@example.com", true)

	mustAtLeast := func(label string, wantMin int64) {
		var got int64
		if v := notionHTTPTransportCacheMetric.Get(label); v != nil {
			got = v.(*expvar.Int).Value()
		}
		if got < wantMin {
			t.Fatalf("metric %s too small: got %d want >= %d", label, got, wantMin)
		}
	}
	mustAtLeast("miss_new", 1)
	mustAtLeast("hit_rlock", 1)
}

func BenchmarkNewNotionAIClientWithModeTransportCache(b *testing.B) {
	cfg := defaultConfig()
	cfg.APIKey = "test-api-key"
	session := SessionInfo{
		ClientVersion: "test-client-version",
		UserID:        "test-user",
		SpaceID:       "test-space",
		Cookies: []ProbeCookie{{
			Name:  "token_v2",
			Value: "test-cookie",
		}},
	}

	b.Run("warm_cache", func(b *testing.B) {
		resetNotionTransportCacheForTest()
		_ = newNotionAIClientWithMode(session, cfg, "alice@example.com", false)
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			client := newNotionAIClientWithMode(session, cfg, "alice@example.com", false)
			if client == nil || client.HTTPClient == nil || client.HTTPClient.Transport == nil {
				b.Fatalf("expected client with transport")
			}
		}
	})

	b.Run("cold_cache_reset_each_iter", func(b *testing.B) {
		b.ReportAllocs()
		for i := 0; i < b.N; i++ {
			resetNotionTransportCacheForTest()
			client := newNotionAIClientWithMode(session, cfg, "alice@example.com", false)
			if client == nil || client.HTTPClient == nil || client.HTTPClient.Transport == nil {
				b.Fatalf("expected client with transport")
			}
		}
	})
}
