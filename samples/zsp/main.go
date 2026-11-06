// Custom function server for the zero standing privileges (ZSP) sample.
//
// It stands in for the token issuer's used and revoked token store. The SPDL
// policy calls TokenUnused(token_id); this server answers with the store state.
// The application marks a token used or revoked through /admin/use and
// /admin/revoke after the token has served its purpose.
//
// Standard library only. Run with: go run .
package main

import (
	"encoding/json"
	"flag"
	"log"
	"net/http"
	"sync"
	"time"
)

type request struct {
	Params []interface{} `json:"params"`
}

type response struct {
	Result interface{} `json:"result,omitempty"`
	Error  string      `json:"error,omitempty"`
}

var (
	mu    sync.Mutex
	state = map[string]string{
		"tok-fresh":      "unused",
		"tok-long-lived": "unused",
		"tok-expired":    "unused",
		"tok-used":       "used",
		"tok-revoked":    "revoked",
	}
)

func send(w http.ResponseWriter, status int, value response) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func decode(w http.ResponseWriter, r *http.Request) (request, bool) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		send(w, http.StatusMethodNotAllowed, response{Error: "POST required"})
		return request{}, false
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	var input request
	if err := decoder.Decode(&input); err != nil || len(input.Params) != 1 {
		send(w, http.StatusBadRequest, response{Error: "params must contain exactly one token id"})
		return request{}, false
	}
	return input, true
}

// POST /func/token-unused {"params":["tok-fresh"]}
// Returns true only when the store says the token has not been used or revoked.
func tokenUnused(w http.ResponseWriter, r *http.Request) {
	input, ok := decode(w, r)
	if !ok {
		return
	}
	tokenID, ok := input.Params[0].(string)
	if !ok {
		send(w, http.StatusBadRequest, response{Error: "token id must be a string"})
		return
	}
	mu.Lock()
	s, found := state[tokenID]
	mu.Unlock()
	if !found {
		// Unknown tokens are denied: fail closed.
		send(w, http.StatusOK, response{Result: false})
		return
	}
	log.Printf("TokenUnused(%q) -> %v (store state %q)", tokenID, s == "unused", s)
	send(w, http.StatusOK, response{Result: s == "unused"})
}

func setState(value string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		input, ok := decode(w, r)
		if !ok {
			return
		}
		tokenID, ok := input.Params[0].(string)
		if !ok {
			send(w, http.StatusBadRequest, response{Error: "token id must be a string"})
			return
		}
		mu.Lock()
		state[tokenID] = value
		mu.Unlock()
		log.Printf("store: %q marked %s", tokenID, value)
		send(w, http.StatusOK, response{Result: true})
	}
}

func main() {
	listen := flag.String("listen", "127.0.0.1:23456", "function listen address")
	flag.Parse()
	mux := http.NewServeMux()
	mux.HandleFunc("/func/token-unused", tokenUnused)
	mux.HandleFunc("/admin/use", setState("used"))
	mux.HandleFunc("/admin/revoke", setState("revoked"))
	server := &http.Server{
		Addr:              *listen,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
	}
	log.Printf("ZSP token store listening on http://%s", *listen)
	log.Fatal(server.ListenAndServe())
}
