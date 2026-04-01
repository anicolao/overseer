{
  description = "Overseer - Autonomous Agent Coordination System";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        packages.default = pkgs.buildNpmPackage {
          pname = "overseer";
          version = "1.0.0";
          src = ./.;
          npmDepsHash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
          buildPhase = ''
            npm run build
          '';
          installPhase = ''
            mkdir -p $out/bin
            cp -r dist/* $out/bin/ 2>/dev/null || cp -r . $out/bin/
          '';
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_20
            typescript
            gh
            git
          ];

          shellHook = ''
            echo "Overseer Development Environment Initialized"
            node --version
            gh --version
          '';
        };
      }
    );
}