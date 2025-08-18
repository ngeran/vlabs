{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.python312
    pkgs.python312Packages.venvShellHook
    pkgs.libxml2
    pkgs.libxslt
    pkgs.openssl
    pkgs.pkg-config
    pkgs.gcc
  ];

  venvDir = "./.venv";

  shellHook = ''
    # Activate virtual environment
    source .venv/bin/activate

    # Ensure required Python packages are installed
    pip install --upgrade pip
    pip install jsnapy junos-eznc pyyaml jinja2 tabulate

    # Point JSNAPy to this project’s config directory
    export JSNAPY_HOME=$PWD

    echo "🐍 Virtualenv activated with jsnapy + junos-eznc + yaml + jinja2 + tabulate"
    echo "JSNAPY_HOME set to: $JSNAPY_HOME"
  '';
}
