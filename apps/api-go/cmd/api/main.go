// Command api runs the api-go HTTP service.
package main

import (
	"log"
	"net/http"
	"os"

	apigo "bluebelle/apps/api-go"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := "127.0.0.1:" + port
	log.Printf("api-go listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, apigo.NewMux()))
}
