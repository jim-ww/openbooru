{
  description = "openbooru - Wails desktop wrapper around the SvelteKit app";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};

      # Wails v3's Linux backend defaults to GTK4 + webkitgtk-6.0; this
      # nixpkgs only ships the older GTK3 + webkitgtk-4.1 ABI, so both the
      # devShell and the package build select that backend via the `gtk3` Go
      # build tag instead.
      webkitDeps = pkgs.lib.optionals pkgs.stdenv.hostPlatform.isLinux [
        pkgs.gtk3
        pkgs.webkitgtk_4_1
      ];

      # nixpkgs has no wails3 package yet (v3 is alpha) — run the pinned CLI
      # straight from its module cache instead. Version must match go.mod's
      # github.com/wailsapp/wails/v3 requirement.
      wails3Version = "v3.0.0-alpha2.117";
      wails3 = pkgs.writeShellScriptBin "wails3" ''
        exec env GOFLAGS=-tags=gtk3 ${pkgs.go}/bin/go run github.com/wailsapp/wails/v3/cmd/wails3@${wails3Version} "$@"
      '';

      desktopItem = pkgs.makeDesktopItem {
        name = "openbooru";
        desktopName = "openbooru";
        comment = "Decentralized, unmoderated imageboard on Nostr";
        exec = "openbooru";
        icon = "openbooru";
        categories = ["Network" "Graphics"];
      };

      frontendDist = pkgs.stdenv.mkDerivation (finalAttrs: {
        pname = "openbooru-frontend";
        version = "0.1.0";
        src = ./frontend;

        nativeBuildInputs = [
          pkgs.nodejs
          pkgs.pnpm
          pkgs.pnpmConfigHook
        ];

        pnpmDeps = pkgs.fetchPnpmDeps {
          inherit (finalAttrs) pname version src;
          fetcherVersion = 4;
          # Placeholder — `nix build` will fail with the real hash to paste
          # in here on the first run (and again whenever pnpm-lock.yaml
          # changes).
          hash = pkgs.lib.fakeHash;
        };

        buildPhase = ''
          runHook preBuild
          pnpm exec paraglide-js compile --project ./project.inlang --outdir ./src/lib/paraglide
          pnpm run build
          runHook postBuild
        '';

        installPhase = ''
          runHook preInstall
          cp -r dist $out
          runHook postInstall
        '';
      });
    in {
      packages.default = pkgs.buildGoModule {
        pname = "openbooru";
        version = "0.1.0";
        src = ./.;

        # Placeholder — `nix build` will fail with the real hash to paste in
        # here on the first run (and again whenever go.mod/go.sum change).
        vendorHash = pkgs.lib.fakeHash;

        # `go mod vendor` (buildGoModule's default) unconditionally resolves
        # every dependency's go:embed patterns for every GOOS/GOARCH, and
        # Wails v3's alpha releases ship a Windows-only embed that's missing
        # from the published module zip — this fails even though we're
        # building for linux and never touch that package. proxyVendor uses
        # `go mod download` instead, which doesn't do that resolution.
        proxyVendor = true;

        overrideModAttrs = _: {
          preBuild = "";
        };

        # "desktop" and "production" mirror what `wails build` normally
        # passes itself. "gtk3" selects the GTK3/webkitgtk-4.1 backend.
        tags = ["desktop" "production" "gtk3"];

        nativeBuildInputs = [pkgs.pkg-config pkgs.makeWrapper];
        buildInputs = webkitDeps;

        # main.go embeds frontend/dist at compile time, so the prebuilt
        # static site needs to land there before `go build` runs.
        preBuild = ''
          rm -rf frontend/dist
          cp -r ${frontendDist} frontend/dist
        '';

        postInstall = ''
          install -Dm644 ${desktopItem}/share/applications/*.desktop \
            $out/share/applications/openbooru.desktop
        '';

        postFixup = with pkgs; ''
          wrapProgram $out/bin/openbooru \
            --suffix XDG_DATA_DIRS : "${gsettings-desktop-schemas}/share/gsettings-schemas/${gsettings-desktop-schemas.name}:${gtk3}/share/gsettings-schemas/${gtk3.name}" \
            --set GIO_EXTRA_MODULES "${glib-networking}/lib/gio/modules" \
            --set SSL_CERT_FILE "${cacert}/etc/ssl/certs/ca-bundle.crt" \
            --set NIX_SSL_CERT_FILE "${cacert}/etc/ssl/certs/ca-bundle.crt"
        '';

        meta = {
          description = "openbooru desktop app";
          mainProgram = "openbooru";
        };
      };

      devShells.default = pkgs.mkShell {
        buildInputs =
          [
            pkgs.go
            wails3
            pkgs.nodejs
            pkgs.pnpm
            pkgs.pkg-config
            pkgs.gh
          ]
          ++ webkitDeps;

        # Picked up by plain `go build`/`go run` in this shell. `wails3
        # build`/`wails3 dev` add their own "desktop"/"production"/"dev"
        # tags themselves, so only the webkit backend tag is needed here.
        GOFLAGS = "-tags=gtk3";

        # Without GSettings schemas on XDG_DATA_DIRS, GTK/WebKitGTK fall back
        # to a default font config that renders text tiny/wrong-sized in the
        # webview. GIO_EXTRA_MODULES is needed for glib-networking's TLS gio
        # module to load at all, and SSL_CERT_FILE gives it an actual CA
        # bundle to validate against — NixOS has no /etc/ssl/certs.
        shellHook = with pkgs; ''
          export XDG_DATA_DIRS=${gsettings-desktop-schemas}/share/gsettings-schemas/${gsettings-desktop-schemas.name}:${gtk3}/share/gsettings-schemas/${gtk3.name}:$XDG_DATA_DIRS;
          export GIO_EXTRA_MODULES="${pkgs.glib-networking}/lib/gio/modules";
          export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
          export NIX_SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
        '';
      };
    });
}
