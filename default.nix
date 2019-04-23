let
  pkgs = import <nixpkgs> {};

  options = (import <nixpkgs/nixos/lib/eval-config.nix> {
    modules = [ (import ./nix/options.nix) ];
  }).options;
  optionsList = with pkgs.lib;
    filter (opt: opt.visible && !opt.internal) (optionAttrSetToDocList options);
  # Replace functions by the string <function>
  substFunction = with pkgs.lib; x:
    if builtins.isAttrs x then mapAttrs (name: substFunction) x
    else if builtins.isList x then map substFunction x
    else if builtins.isFunction x then "<function>"
    else x;
  optionsList' = with pkgs.lib; flip map optionsList (opt: opt // {
    declarations = opt.declarations;
  }
  // optionalAttrs (opt ? description) { example = substFunction opt.description; }
  // optionalAttrs (opt ? example) { example = substFunction opt.example; }
  // optionalAttrs (opt ? default) { default = substFunction opt.default; }
  // optionalAttrs (opt ? type) { type = substFunction opt.type; });

  exposedOptionList = with pkgs.lib; (map (o: {
      name = o.name;
      value = removeAttrs o ["name" "visible" "internal"];
    }) optionsList'
  );

  filterOptions = prefixes: with pkgs.lib;
    (filter (v: any (p: hasPrefix p v.name) prefixes)
      exposedOptionList
    );

  sections = [
    "namespaces" "pods" "services" "controllers" "deployments" "daemonsets"
    "scheduledJobs" "jobs" "ingress" "secrets" "pvc" "roles" "clusterRoles"
    "roleBindings" "clusterRoleBindings" "serviceAccounts" "configMaps"
    "petSets" "statefulSets" "networkPolicies" "customResources"
    "defaults"
  ];

  version = (builtins.fromJSON (builtins.readFile ./package.json)).version;

in
	with pkgs.lib;
  with (import (builtins.fetchTarball https://github.com/moretea/yarn2nix/archive/master.tar.gz) { inherit pkgs; });
{
  package = mkYarnPackage {
    name = "nix-kubernetes-${version}";
    src = ./.;
    packageJson = ./package.json;
    yarnLock = ./yarn.lock;
    # NOTE: this is optional and generated dynamically if omitted
    yarnNix = ./yarn.nix;
  };

  options = pkgs.stdenv.mkDerivation {
    name = "options-json";

    buildCommand = ''
      mkdir -p $out
      cp ${pkgs.writeText "options.json" (let
        mkSection = prefix: concatMapStringsSep "\n" (v: ''
        * `${v.name}`:

          ${v.value.description or "No description"}

          **Default:** ${builtins.toJSON v.value.default or "..."}
          **Example:** ${if v.value.description == v.value.example then "..." else (builtins.toJSON v.value.example)}
        '') (filterOptions [prefix]);
      in ''
        # nix-kubernetes options

        List of all nix-kubernetes options

      '' + (concatMapStringsSep "\n" (name:
        "## ${name} options\n\n" +
        (mkSection "kubernetes.${name}")
      ) sections))} $out/options.md
    ''; # */

    meta.description = "List of NixOS options in markdown format";
  };
}
