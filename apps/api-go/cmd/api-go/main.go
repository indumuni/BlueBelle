// Command api-go runs the sample HTTP service.
package main

import (
	"log"
	"net/http"

	apigo "bluebelle/apps/api-go"
)

func main() {
	addr := "127.0.0.1:8080"
	log.Printf("api-go listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, apigo.NewMux()))
}
