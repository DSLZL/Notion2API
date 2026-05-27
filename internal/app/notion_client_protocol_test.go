package app

import (
	"context"
	"encoding/json"
	"expvar"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
			if !booleanValue(body["includeDeleted"]) {
				t.Fatalf("expected includeDeleted=true")
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

func TestCreateCustomAgentBuildsExpectedSaveTransactionsPayload(t *testing.T) {
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v3/saveTransactionsFanout" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode saveTransactionsFanout body failed: %v", err)
		}
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
	txns := sliceValue(gotBody["transactions"])
	if len(txns) != 2 {
		t.Fatalf("expected two transactions (create + sidebar add), got %d", len(txns))
	}
	firstTxn := mapValue(txns[0])
	debug := mapValue(firstTxn["debug"])
	if got := stringValue(debug["userAction"]); got != "agentActions.createBlankAgent" {
		t.Fatalf("userAction mismatch: got %q want %q", got, "agentActions.createBlankAgent")
	}
	if got := stringValue(debug["userFlow"]); got != "user_flow_create_page" {
		t.Fatalf("userFlow mismatch: got %q want %q", got, "user_flow_create_page")
	}
	ops := sliceValue(firstTxn["operations"])
	if len(ops) < 8 {
		t.Fatalf("expected at least eight operations for create payload, got %d", len(ops))
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
	model := mapValue(data["model"])
	if got := stringValue(model["type"]); got != "apricot-sorbet-high" {
		t.Fatalf("workflow data.model.type mismatch: got %q want %q", got, "apricot-sorbet-high")
	}
	sidebarTxn := mapValue(txns[1])
	sidebarDebug := mapValue(sidebarTxn["debug"])
	if got := stringValue(sidebarDebug["userAction"]); got != "sidebarWorkflowsActions.addSidebarWorkflow" {
		t.Fatalf("sidebar transaction userAction mismatch: got %q want %q", got, "sidebarWorkflowsActions.addSidebarWorkflow")
	}
}

func TestUpdateCustomAgentModelBuildsExpectedSaveTransactionsPayload(t *testing.T) {
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

	updated, err := client.updateCustomAgentModel(context.Background(), "workflow-1", "apricot-sorbet-high")
	if err != nil {
		t.Fatalf("updateCustomAgentModel failed: %v", err)
	}
	if updated.Model.Type != "apricot-sorbet-high" {
		t.Fatalf("updated model mismatch: got %q want %q", updated.Model.Type, "apricot-sorbet-high")
	}
	txns := sliceValue(gotBody["transactions"])
	if len(txns) == 0 {
		t.Fatalf("expected transactions")
	}
	firstTxn := mapValue(txns[0])
	debug := mapValue(firstTxn["debug"])
	if got := stringValue(debug["userAction"]); got != "WorkflowActions.saveModel" {
		t.Fatalf("userAction mismatch: got %q want %q", got, "WorkflowActions.saveModel")
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
}

func TestSoftDeleteCustomAgentBuildsExpectedSaveTransactionsPayload(t *testing.T) {
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

	if err := client.softDeleteCustomAgent(context.Background(), "workflow-1"); err != nil {
		t.Fatalf("softDeleteCustomAgent failed: %v", err)
	}
	txns := sliceValue(gotBody["transactions"])
	if len(txns) != 2 {
		t.Fatalf("expected two transactions (soft delete + sidebar remove), got %d", len(txns))
	}
	firstTxn := mapValue(txns[0])
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
	sidebarDebug := mapValue(sidebarTxn["debug"])
	if got := stringValue(sidebarDebug["userAction"]); got != "sidebarWorkflowsActions.removeSidebarWorkflow" {
		t.Fatalf("sidebar transaction userAction mismatch: got %q want %q", got, "sidebarWorkflowsActions.removeSidebarWorkflow")
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
