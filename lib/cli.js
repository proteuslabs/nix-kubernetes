#!/usr/bin/env node

const yargs = require('yargs');
const _ = require('lodash');
const Table = require('cli-table3');
const YAML = require('yamljs');

const Util = require('./util');
const Config = require('./models/Config');
const Deployment = require('./models/Deployment');
const Builder = require('./services/Builder');
const Deployer = require('./services/Deployer');
const JobRunner = require('./services/JobRunner');
const GarbageCollector = require('./services/GarbageCollector');
const Kubectl = require('./services/Kubectl');

const args = process.argv.join(' ');
const append = _.first(_.at(args.split(" -- "), 1));

function parseArgs(args) {
  const result = {};

  _.forEach(args, arg => {
    const key = _.first(arg.split('='));
    const value = _.last(arg.split('=')) || true;

    _.set(result, key, value);
  });

  return result;
}

yargs // eslint-disable-line no-unused-expressions
  .usage('Usage: $0 <command> [options]')
  .default('c', '~/.kube/nix-kubernetes.json')
  .alias('c', 'config').global('c')
  .describe('c', 'path to configuration file')
  .command('create <file>', 'Create deployment', yargs => {
    return yargs
      .demand('d')
      .alias('d', 'deployment')
      .describe('d', 'Deployment name')
      .example('$0 create -n deployment deploy.nix', 'create a new deployment');
  }, argv => {
    const fullPath = Util.resolvePath(argv.config);
    const config = Config.loadOrCreate(fullPath);

    if (_.has(config.deployments, argv.deployment)) {
      console.error('Deployment with this name already exists');
      process.exit(1);
    }

    config.updateOrCreate(argv.deployment, argv.file);
    config.save(fullPath);

    console.log('Deployment created');
  })
  .command('list', 'List all known deployments', _.noop, argv => {
    const fullPath = Util.resolvePath(argv.config);
    const config = Config.loadOrCreate(fullPath);

    const table = new Table({head: ['name', 'path']});
    _.forEach(config.deployments, deployment => {
      table.push([deployment.name, deployment.file]);
    });

    console.log(table.toString());
  })
  .command('delete', 'Delete deployment', yargs => {
    return yargs
      .demand('d')
      .alias('d', 'deployment')
      .describe('d', 'Deployment name')
      .example('$0 delete -d deployment', 'delete deployment');
  }, argv => {
    const fullPath = Util.resolvePath(argv.config);
    const config = Config.loadOrCreate(fullPath);

    if (!_.has(config.deployments, argv.deployment)) {
      console.error('Deployment with this name does not exist');
      process.exit(1);
    }

    config.delete(argv.deployment);
    config.save(fullPath);

    console.log('Deployment deleted');
  })
  .command('describe', 'Describes deployment', yargs => {
    return yargs
      .demand('d')
      .alias('d', 'deployment')
      .describe('d', 'Deployment name')
      .example('$0 describe -d deployment', 'describe deployment');
  }, argv => {
    const fullPath = Util.resolvePath(argv.config);
    const config = Config.loadOrCreate(fullPath);

    if (!_.has(config.deployments, argv.deployment)) {
      console.error('Deployment with this name does not exist');
      process.exit(1);
    }

    const deployment = config.deployments[argv.deployment];

    const builder = new Builder(deployment);
    builder.eval().then(deployment => {
      console.log(YAML.stringify(deployment.toJSON(), 4));
    });
  })
  .command('deploy', 'Deploy configuration', yargs => {
    return yargs
      .describe('f', 'Use prebuild deployment file')
      .alias('f', 'file')
      .describe('d', 'Deployment name')
      .alias('d', 'deployment')
      .describe('n', 'Namespace to deploy')
      .alias('n', 'namespace')
      .describe('i', 'Resources to include in deployment')
      .alias('i', 'include')
      .describe('o', 'Output generated config to file')
      .alias('o', 'output')
      .describe('context', 'Kubernetes config context to use for deployment')
      .describe('build-only', 'only build')
      .describe('dry-run', 'dry run')
      .describe('restart', 'restart replication controllers')
      .describe('rolling-update', 'do a rolling update of a controller')
      .describe('gc', 'garbage collect resources (will only gc nix-kubernetes resources)')
      .example('$0 deploy -d deployment -n namespace -i replicationcontrollers/gitlab --gc --context my-cluster')
      .example('$0 deploy -d deployment -n namespace -i services/mysql --dry-run');
  }, argv => {
    const fullPath = Util.resolvePath(argv.config);
    const config = Config.loadOrCreate(fullPath);

    let deployment;
    let evaledDeployment;
    if (argv.file) {
      deployment = new Deployment('local');
      deployment.loadSpec(Util.resolvePath(argv.file));

      evaledDeployment = Promise.resolve(deployment);
    } else {
      if (!_.has(config.deployments, argv.deployment)) {
        console.error('Deployment with this name does not exist');
        process.exit(1);
      }

      deployment = config.deployments[argv.deployment];

      const builder = new Builder(deployment);
      evaledDeployment = builder.eval();
    }

    evaledDeployment.then(deployment => {
      console.log('Config:', deployment.specPath);

      if (argv.output) {
        const outputPath = Util.resolvePath(argv.output);
        deployment.writeSpec(outputPath);
      }

      if (!argv["build-only"]) {
        if (!_.has(deployment.namespaces, argv.namespace)) {
          console.error('Namespace with this name does not exist');
          process.exit(1);
        }

        if (argv.context) {
          console.log("Using context:", argv.context);
        }

        const kubectl = new Kubectl({
          context: argv.context,
          dryRun: argv['dry-run'],
          append: append
        });
        const deployer = new Deployer(deployment.namespaces[argv.namespace], kubectl);
        const options = {
          restart: argv.restart,
          rollingUpdate: argv['rolling-update']
        };

        return deployer.deploy(argv.include, options).then(() => {
          console.log(`deployment complete${argv['dry-run'] ? " (dry-run)" : ""}`);
        }).catch(err => {
          console.error('error with deployment', err.toString());
        }).then(() => {
          if (argv.gc) {
            const garbageCollector =
              new GarbageCollector(deployment.namespaces[argv.namespace], kubectl);

            return garbageCollector.run();
          }
        });
      }
    });
  })
  .command('config', 'Manage deployment', yargs => {
    return yargs
      .describe('d', 'Deployment name')
      .alias('d', 'deployment')
      .demand('d')
      .describe('s', 'set argument')
      .alias('s', 'set-arg')
      .example('$0 args -d deployment --set key=value');
  }, argv => {
    const fullPath = Util.resolvePath(argv.config);
    const config = Config.loadOrCreate(fullPath);

    if (!_.has(config.deployments, argv.deployment)) {
      console.error('Deployment with this name does not exist');
      process.exit(1);
    }

    const deployment = config.deployments[argv.deployment];

    if (argv.setArg) {
      const args = parseArgs(_.isArray(argv.setArg) ? argv.setArg : [argv.setArg]);
      _.forEach(args, (value, key) => {
        if (value === '-') {
          deployment.unsetArg(key);
        } else {
          deployment.setArg(key, value);
        }
      });
    }

    config.save(fullPath);
  })
  .command('run-job <name>', 'Run distributed kubernetes job', yargs => {
    return yargs
      .describe('d', 'Deployment name')
      .alias('d', 'deployment')
      .demand('d')
      .describe('n', 'Namespace where job is defined')
      .alias('n', 'namespace')
      .describe('wait', 'Wait for job completion')
      .describe('gc', 'Garbage collect completed job')
      .implies('gc', 'wait')
      .describe('a', 'set argument')
      .alias('a', 'arg')
      .describe('dry-run', 'dry run')
      .example('$0 run-job -d deployment -n namespace jobname --arg key=value');
  }, argv => {
    const fullPath = Util.resolvePath(argv.config);
    const config = Config.loadOrCreate(fullPath);

    if (!_.has(config.deployments, argv.deployment)) {
      console.error('Deployment with this name does not exist');
      process.exit(1);
    }

    let args = {};
    if (_.isArray(argv.arg)) {
      args = parseArgs(argv.arg);
    } else if (argv.arg) {
      args = parseArgs([argv.arg]);
    }

    const deployment = config.deployments[argv.deployment];
    const builder = new Builder(deployment);
    builder.eval(args).then(config => {
      console.log('Config:', deployment.specPath);

      if (!_.has(config.namespaces, argv.namespace)) {
        console.error('Namespace with this name does not exist');
        process.exit(1);
      }

      if (argv.context) {
        console.log("Using context:", argv.context);
      }

      const kubectl = new Kubectl({context: argv.context, dryRun: argv['dry-run']});
      const jobRunner = new JobRunner(config.namespaces[argv.namespace], kubectl);
      jobRunner.run(argv.name, {wait: argv.wait, gc: argv.gc}).then(() => {
        console.log('job complete', argv.name);
      }).catch(err => {
        console.log('error with job processing', err.toString());
      });
    });
  })
  .command('gc', 'Garbage collect resources (will only gc nix-kubernetes resources)', yargs => {
    return yargs
      .demand('d')
      .alias('d', 'deployment')
      .describe('d', 'Deployment name')
      .describe('n', 'Namespace to be garbage collected')
      .alias('n', 'namespace')
      .describe('dry-run', 'dry run')
      .example('$0 describe -d deployment', 'describe deployment');
  }, argv => {
    const fullPath = Util.resolvePath(argv.config);
    const config = Config.loadOrCreate(fullPath);

    if (!_.has(config.deployments, argv.deployment)) {
      console.error('Deployment with this name does not exist');
      process.exit(1);
    }

    const deployment = config.deployments[argv.deployment];

    const builder = new Builder(deployment);
    builder.eval().then(deployment => {
      if (!_.has(deployment.namespaces, argv.namespace)) {
        console.error('Namespace with this name does not exist');
        process.exit(1);
      }

      const kubectl = new Kubectl({
        context: argv.context,
        dryRun: argv['dry-run'],
        append: append
      });

      const garbageCollector = new GarbageCollector(deployment.namespaces[argv.namespace], kubectl);
      return garbageCollector.run().catch(err => {
        console.error('error with garbage collection', err.toString());
      });
    });
  })
  .demand(1)
  .help('h').alias('h', 'help')
  .example('$0 create -d name deploy.nix', 'create deployment')
  .example('$0 deploy -d name -n namespace --context my-cluster', 'deploy resources')
  .example('$0 deploy -d name --build-only', 'only build')
  .wrap(null)
  .argv;
