{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = [ pkgs.dotnet-sdk_10 ];
}
