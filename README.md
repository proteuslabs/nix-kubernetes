**This repository is deprecated, please use https://github.com/xtruder/kubenix**

# nix-kubernetes [![NPM version][npm-image]][npm-url] [![Build Status][travis-image]][travis-url] [![Dependency Status][daviddm-image]][daviddm-url] [![Coverage percentage][coveralls-image]][coveralls-url]
> Kubernetes deployment manager written in nix

## About

Nix-kubernetes is deployment manager for kubernetes that uses nixos module
system to do declarative kubernetes configuration and deployment. By combining
nix package manager and nix-kubernetes declarative cluster configuration it can
do fully deterministic deployments from packages to configuration.

## Depencies

- nix (for installation instructions go to https://nixos.org/nix/)

## Installation

```sh
$ nix-env -f https://github.com/xtruder/nix-kubernetes/archive/v0.25.1.tar.gz -iA package
```

## Usage

```bash
Usage: bin/nix-kubernetes <command> [options]

Commands:
  create <file>   Create deployment
  list            List all known deployments
  delete          Delete deployment
  describe        Describes deployment
  deploy          Deploy configuration
  config          Manage deployment
  run-job <name>  Run distributed kubernetes job
  gc              Garbage collect resources (will only gc nix-kubernetes resources)

Options:
  -c, --config  path to configuration file  [default: "~/.kube/nix-kubernetes.json"]
  -h, --help    Show help  [boolean]

Examples:
  bin/nix-kubernetes create -d name deploy.nix                         create deployment
  bin/nix-kubernetes deploy -d name -n namespace --context my-cluster  deploy resources
  bin/nix-kubernetes deploy -d name --build-only                       only build
```

**Deploy**

```bash
nix-kubernetes deploy

Options:
  -c, --config      path to configuration file  [default: "~/.kube/nix-kubernetes.json"]
  -h, --help        Show help  [boolean]
  -f, --file        Use prebuild deployment file
  -d, --deployment  Deployment name
  -n, --namespace   Namespace to deploy
  -i, --include     Resources to include in deployment
  -o, --output      Output generated config to file
  --context         Kubernetes config context to use for deployment
  --build-only      only build
  --dry-run         dry run
  --restart         restart replication controllers
  --rolling-update  do a rolling update of a controller
  --gc              garbage collect resources (will only gc nix-kubernetes resources)

Examples:
  nix-kubernetes deploy -d deployment -n namespace -i replicationcontrollers/gitlab --gc --context my-cluster
  nix-kubernetes deploy -d deployment -n namespace -i services/mysql --dry-run
```

## Example usage

```sh
$ nix-kubernetes create -d gatehub deploy.nix
$ export NIX_PATH="services=/home/offlinehacker/projects/x-truder.net/services:$NIX_PATH"
$ nix-kubernetes deploy -d gatehub --build-only
$ nix-kubernetes deploy -d gatehub -n namespace --context my-cluster --gc
```

## Example deployment configurations

look into examples folder with example deployment configurations. 

## Options

For a list of all options look into [options.md](options.md)

## Nix-kubernetes services

Repo with bundle of nix-kubernetes
services is avalible on [https://github.com/x-truder/services](https://github.com/x-truder/services).

## Development

### Use development version

```sh
$ npm link
$ export PATH=~/.npm/bin:$PATH
```

## Build deployments

```sh
$ nix-build -A staging --arg configuration deploy.nix
```

## License

MIT © [Jaka Hudoklin](https://x-truder.net)


[npm-image]: https://badge.fury.io/js/nix-kubernetes.svg
[npm-url]: https://npmjs.org/package/nix-kubernetes
[travis-image]: https://travis-ci.org/x-truder/nix-kubernetes.svg?branch=master
[travis-url]: https://travis-ci.org/x-truder/nix-kubernetes
[daviddm-image]: https://david-dm.org/x-truder/nix-kubernetes.svg?theme=shields.io
[daviddm-url]: https://david-dm.org/x-truder/nix-kubernetes
[coveralls-image]: https://coveralls.io/repos/x-truder/nix-kubernetes/badge.svg
[coveralls-url]: https://coveralls.io/r/x-truder/nix-kubernetes
