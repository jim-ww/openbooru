package main

import (
	"context"
	"encoding/json"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// App struct
type App struct {
	app *application.App
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// consoleForwardPayload mirrors the {level, message} object emitted by the
// frontend's console-forwarding hook.
type consoleForwardPayload struct {
	Level   string `json:"level"`
	Message string `json:"message"`
}

// ServiceStartup is called when the app starts. The application handle is
// saved so other methods can call runtime managers, and the frontend's
// console-forwarding event is wired up so `wails dev` output surfaces
// frontend console/error messages too.
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	a.app = application.Get()
	a.app.Event.On("console:forward", func(event *application.CustomEvent) {
		data, err := json.Marshal(event.Data)
		if err != nil {
			return
		}
		var payload consoleForwardPayload
		if err := json.Unmarshal(data, &payload); err != nil {
			return
		}
		if payload.Level == "error" {
			log.Printf("[frontend error] %s", payload.Message)
		} else {
			log.Printf("[frontend] %s", payload.Message)
		}
	})
	return nil
}
