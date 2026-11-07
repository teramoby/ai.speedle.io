// Custom function server for Pattern 2 of the delegated agent sample.
//
// Pattern 2 runs the whole delegation chain inside one is-allowed call. The
// policy in pattern2.spdl calls two functions served here:
//
//   - DelegationValid(token, agent, action, resource): verifies the HS256
//     delegation token (signature, issuer, audience, expiry, act.sub) and checks
//     that its scope covers the action and resource;
//   - DelegatorAllowed(token, action, resource): verifies the token again, takes
//     the delegator from its sub, and asks ADS whether that user may do the
//     action on the resource now.
//
// DelegatorAllowed calls back into ADS from inside an evaluation. The inner
// request has a user subject, which the delegated-agent grant cannot match, so
// it does not recurse into these functions again.
//
// DEMO ONLY. demoKey is a fixed, public signing key shared with pep.py; anyone
// with this file can mint tokens. The server refuses any address that is not a
// loopback IP. See README.md for production notes.
//
// Self-hosted Speedle only: Speedle Cloud does not run custom functions.
//
// Standard library only. Run with: go run .
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
)

// demoKey is DEMO ONLY: a fixed, public signing key. Never use a key written in code.
var demoKey = []byte("speedle-delegation-demo-key-DEMO-ONLY-do-not-use-in-production")

const (
	issuer    = "https://issuer.example/demo"
	audience  = "crm"
	clockSkew = 60 // seconds allowed for iat in the future
	service   = "crm-fn"
)

var (
	adsURL = flag.String("ads", "http://127.0.0.1:6734/authz-check/v1/is-allowed", "ADS is-allowed URL for DelegatorAllowed")
	client = &http.Client{Timeout: 2 * time.Second}
)

type funcRequest struct {
	Params []interface{} `json:"params"`
}

type funcResponse struct {
	Result interface{} `json:"result"`
	Error  string      `json:"error,omitempty"`
}

type claims struct {
	Iss string `json:"iss"`
	Aud string `json:"aud"`
	Sub string `json:"sub"`
	Iat *int64 `json:"iat"`
	Exp *int64 `json:"exp"`
	Act struct {
		Sub string `json:"sub"`
	} `json:"act"`
	Scope struct {
		Actions   []string `json:"actions"`
		Resources []string `json:"resources"`
	} `json:"scope"`
}

func verify(token string, now int64) (*claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed token")
	}
	headerJSON, err1 := base64.RawURLEncoding.DecodeString(parts[0])
	payloadJSON, err2 := base64.RawURLEncoding.DecodeString(parts[1])
	signature, err3 := base64.RawURLEncoding.DecodeString(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return nil, errors.New("malformed token")
	}
	var header struct {
		Alg string `json:"alg"`
	}
	if json.Unmarshal(headerJSON, &header) != nil || header.Alg != "HS256" {
		return nil, errors.New("unsupported alg")
	}
	mac := hmac.New(sha256.New, demoKey)
	mac.Write([]byte(parts[0] + "." + parts[1]))
	if !hmac.Equal(mac.Sum(nil), signature) {
		return nil, errors.New("bad signature")
	}
	var c claims
	if json.Unmarshal(payloadJSON, &c) != nil {
		return nil, errors.New("malformed claims")
	}
	switch {
	case c.Iss != issuer:
		return nil, errors.New("wrong issuer")
	case c.Aud != audience:
		return nil, errors.New("wrong audience")
	case c.Exp == nil || c.Iat == nil:
		return nil, errors.New("missing exp or iat")
	case now >= *c.Exp:
		return nil, errors.New("token expired")
	case *c.Iat > now+clockSkew:
		return nil, errors.New("token issued in the future")
	case c.Sub == "" || c.Act.Sub == "":
		return nil, errors.New("missing sub or act.sub")
	}
	return &c, nil
}

func contains(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// stringParams decodes exactly n string parameters.
func stringParams(w http.ResponseWriter, r *http.Request, n int) ([]string, bool) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		send(w, http.StatusMethodNotAllowed, funcResponse{Error: "POST required"})
		return nil, false
	}
	var input funcRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<16)).Decode(&input); err != nil || len(input.Params) != n {
		send(w, http.StatusBadRequest, funcResponse{Error: "wrong number of params"})
		return nil, false
	}
	out := make([]string, n)
	for i, p := range input.Params {
		s, ok := p.(string)
		if !ok {
			send(w, http.StatusBadRequest, funcResponse{Error: "params must be strings"})
			return nil, false
		}
		out[i] = s
	}
	return out, true
}

func send(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// POST /func/delegation-valid {"params":[token, agent, action, resource]}
func delegationValid(w http.ResponseWriter, r *http.Request) {
	p, ok := stringParams(w, r, 4)
	if !ok {
		return
	}
	token, agent, action, resource := p[0], p[1], p[2], p[3]
	c, err := verify(token, time.Now().Unix())
	result, reason := false, ""
	switch {
	case err != nil:
		reason = err.Error()
	case c.Act.Sub != agent:
		reason = "token was not issued to this agent"
	case !contains(c.Scope.Actions, action) || !contains(c.Scope.Resources, resource):
		reason = "scope does not cover " + action + " " + resource
	default:
		result, reason = true, "ok"
	}
	log.Printf("DelegationValid(agent=%q, %s %s) -> %v (%s)", agent, action, resource, result, reason)
	send(w, http.StatusOK, funcResponse{Result: result})
}

// POST /func/delegator-allowed {"params":[token, action, resource]}
func delegatorAllowed(w http.ResponseWriter, r *http.Request) {
	p, ok := stringParams(w, r, 3)
	if !ok {
		return
	}
	token, action, resource := p[0], p[1], p[2]
	c, err := verify(token, time.Now().Unix())
	if err != nil {
		log.Printf("DelegatorAllowed(%s %s) -> false (%s)", action, resource, err)
		send(w, http.StatusOK, funcResponse{Result: false})
		return
	}
	body, _ := json.Marshal(map[string]interface{}{
		"subject":     map[string]interface{}{"principals": []map[string]string{{"type": "user", "name": c.Sub}}},
		"serviceName": service,
		"resource":    resource,
		"action":      action,
		"attributes":  []interface{}{},
	})
	resp, err := client.Post(*adsURL, "application/json", bytes.NewReader(body))
	allowed := false
	if err == nil {
		var decision struct {
			Allowed bool `json:"allowed"`
		}
		if resp.StatusCode == http.StatusOK {
			_ = json.NewDecoder(io.LimitReader(resp.Body, 1<<16)).Decode(&decision)
			allowed = decision.Allowed
		}
		resp.Body.Close()
	}
	// Fail closed: an ADS error or timeout is false.
	log.Printf("DelegatorAllowed(sub=%q, %s %s) -> %v (inner is-allowed err=%v)", c.Sub, action, resource, allowed, err)
	send(w, http.StatusOK, funcResponse{Result: allowed})
}

func main() {
	listen := flag.String("listen", "127.0.0.1:23457", "listen address; must be a loopback IP")
	flag.Parse()

	host, _, err := net.SplitHostPort(*listen)
	ip := net.ParseIP(host)
	if err != nil || ip == nil || !ip.IsLoopback() {
		log.Fatalf("demo server refuses non-loopback address %q: bind 127.0.0.1", *listen)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/func/delegation-valid", delegationValid)
	mux.HandleFunc("/func/delegator-allowed", delegatorAllowed)

	server := &http.Server{
		Addr:              *listen,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
	}
	log.Printf("delegation function server on http://%s (demo key, demo only)", *listen)
	log.Fatal(server.ListenAndServe())
}
