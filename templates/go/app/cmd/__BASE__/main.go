// Command __BASE__ runs the __NAME__ HTTP service.
package main

import (
	"log"
	"net/http"
	"os"

	__PKG__ "bluebelle/apps/__NAME__"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := "127.0.0.1:" + port
	log.Printf("__NAME__ listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, __PKG__.NewMux()))
}
