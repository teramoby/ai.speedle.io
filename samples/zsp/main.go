// Custom function and consume server for the zero standing privileges (ZSP) sample.
//
// It plays two roles in one process so the demo runs in one terminal:
//
//   - the read-only token status function the SPDL policy calls:
//     TokenUnused(token_id) reports the store state and changes nothing;
//   - the application or enforcement layer's consume step: an atomic
//     compare-and-set after Speedle allows the request and before the
//     operation runs, so a single-use token is spent at most once.
//
// Demo only. Token state lives in process memory and resets on restart, and the
// admin endpoints are unauthenticated. The server refuses any address that is
// not a loopback IP. Production needs a persistent shared store and a protected
// admin API; see README.md.
//
// Standard library only. Run with: go run .
package main

import (
	"encoding/json"
	"flag"
	"log"
	"net"
	"net/http"
	"sync"
	"time"
)

// request is the wire format Speedle uses for a custom function call.
type request struct {
	Params []interface{} `json:"params"`
}

type response struct {
	Result interface{} `json:"result,omitempty"`
	Error  string      `json:"error,omitempty"`
}

// consumeRequest is the application's atomic consume call, made after the
// policy allows the request and before the operation runs.
type consumeRequest struct {
	TokenID        string `json:"token_id"`
	IdempotencyKey string `json:"idempotency_key"`
}

type consumeResponse struct {
	Consumed bool   `json:"consumed"`
	Reason   string `json:"reason,omitempty"`
	Replay   bool   `json:"idempotent_replay,omitempty"`
}

type tokenStore struct {
	mu         sync.Mutex
	status     map[string]string // "unused", "used" or "revoked"
	consumedBy map[string]string // token id -> idempotency key of the winning consume
}

func newTokenStore() *tokenStore {
	return &tokenStore{
		status: map[string]string{
			"tok-fresh":      "unused",
			"tok-long-lived": "unused",
			"tok-expired":    "unused",
			"tok-used":       "used",
			"tok-revoked":    "revoked",
			"tok-concurrent": "unused",
			"tok-future":     "unused",
			"tok-backwards":  "unused",
			"tok-nbf-future": "unused",
		},
		consumedBy: map[string]string{},
	}
}

func send(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func decodeParams(w http.ResponseWriter, r *http.Request) (string, bool) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		send(w, http.StatusMethodNotAllowed, response{Error: "POST required"})
		return "", false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	var input request
	if err := decoder.Decode(&input); err != nil || len(input.Params) != 1 {
		send(w, http.StatusBadRequest, response{Error: "params must contain exactly one token id"})
		return "", false
	}
	tokenID, ok := input.Params[0].(string)
	if !ok || tokenID == "" {
		send(w, http.StatusBadRequest, response{Error: "token id must be a non-empty string"})
		return "", false
	}
	return tokenID, true
}

// POST /func/token-unused {"params":["tok-fresh"]}
// Read-only: returns true only while the store says unused. The policy calls it
// at decision time; it never consumes or changes anything.
func (s *tokenStore) tokenUnused(w http.ResponseWriter, r *http.Request) {
	tokenID, ok := decodeParams(w, r)
	if !ok {
		return
	}
	s.mu.Lock()
	state, found := s.status[tokenID]
	s.mu.Unlock()
	if !found {
		// Unknown tokens are denied: fail closed.
		send(w, http.StatusOK, response{Result: false})
		return
	}
	log.Printf("TokenUnused(%q) -> %v (store state %q)", tokenID, state == "unused", state)
	send(w, http.StatusOK, response{Result: state == "unused"})
}

// POST /consume {"token_id":"tok-fresh","idempotency_key":"req-1"}
// Compare-and-set in one critical section: exactly one caller moves the token
// from unused to used. A retry with the same idempotency key returns the same
// success; a different key on a spent token is denied.
func (s *tokenStore) consume(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		send(w, http.StatusMethodNotAllowed, response{Error: "POST required"})
		return
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	var input consumeRequest
	if err := decoder.Decode(&input); err != nil || input.TokenID == "" {
		send(w, http.StatusBadRequest, response{Error: "token_id is required"})
		return
	}
	if input.IdempotencyKey == "" {
		send(w, http.StatusBadRequest, response{Error: "idempotency_key is required"})
		return
	}

	s.mu.Lock()
	state, found := s.status[input.TokenID]
	var reply consumeResponse
	switch {
	case !found:
		reply = consumeResponse{Consumed: false, Reason: "unknown"}
	case state == "unused":
		s.status[input.TokenID] = "used"
		s.consumedBy[input.TokenID] = input.IdempotencyKey
		reply = consumeResponse{Consumed: true}
	case state == "used" && s.consumedBy[input.TokenID] == input.IdempotencyKey:
		reply = consumeResponse{Consumed: true, Replay: true}
	case state == "used":
		reply = consumeResponse{Consumed: false, Reason: "used"}
	default:
		reply = consumeResponse{Consumed: false, Reason: state}
	}
	s.mu.Unlock()

	log.Printf("consume(%q, key %q) -> consumed=%v reason=%q replay=%v",
		input.TokenID, input.IdempotencyKey, reply.Consumed, reply.Reason, reply.Replay)
	send(w, http.StatusOK, reply)
}

// POST /admin/use, /admin/revoke or /admin/issue {"params":["tok-fresh"]}
// Demo-only state changes; production protects these behind its admin API.
func (s *tokenStore) adminSet(value string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenID, ok := decodeParams(w, r)
		if !ok {
			return
		}
		s.mu.Lock()
		if value == "unused" {
			delete(s.consumedBy, tokenID)
		}
		s.status[tokenID] = value
		s.mu.Unlock()
		log.Printf("store: %q marked %s", tokenID, value)
		send(w, http.StatusOK, response{Result: true})
	}
}

func main() {
	listen := flag.String("listen", "127.0.0.1:23456", "listen address; must be a loopback IP")
	flag.Parse()

	host, _, err := net.SplitHostPort(*listen)
	ip := net.ParseIP(host)
	if err != nil || ip == nil || !ip.IsLoopback() {
		log.Fatalf("demo server refuses non-loopback address %q: bind 127.0.0.1", *listen)
	}

	store := newTokenStore()
	mux := http.NewServeMux()
	mux.HandleFunc("/func/token-unused", store.tokenUnused)
	mux.HandleFunc("/consume", store.consume)
	mux.HandleFunc("/admin/use", store.adminSet("used"))
	mux.HandleFunc("/admin/revoke", store.adminSet("revoked"))
	mux.HandleFunc("/admin/issue", store.adminSet("unused"))

	server := &http.Server{
		Addr:              *listen,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
	}
	log.Printf("ZSP demo server listening on http://%s (in-memory state, demo only)", *listen)
	log.Fatal(server.ListenAndServe())
}
