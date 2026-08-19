package main

import (
	"embed"
	"flag"
	"os"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	noGpu := flag.Bool("no-gpu", false, "disable webview hardware acceleration (Linux)")
	flag.Parse()

	gpuPolicy := application.WebviewGpuPolicyAlways
	if *noGpu {
		gpuPolicy = application.WebviewGpuPolicyNever
	}

	app := NewApp()

	wailsApp := application.New(application.Options{
		Name: "openbooru",
		Services: []application.Service{
			application.NewService(app),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})

	wailsApp.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "openbooru",
		Width:            1280,
		Height:           800,
		StartState:       application.WindowStateMaximised,
		BackgroundColour: application.RGBA{Red: 15, Green: 15, Blue: 17, Alpha: 1},
		Linux: application.LinuxWindow{
			WebviewGpuPolicy: gpuPolicy,
		},
		DevToolsEnabled:        os.Getenv("DEBUG") != "",
		OpenInspectorOnStartup: os.Getenv("DEBUG") != "",
	})

	if err := wailsApp.Run(); err != nil {
		println("Error:", err.Error())
	}
}
