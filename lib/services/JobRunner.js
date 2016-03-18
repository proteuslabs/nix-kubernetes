'use strict';

const _ = require('lodash');
const assert = require('hoek').assert;

class JobRunner {
  constructor(namespace, kubectl) {
    this.namespace = namespace;
    this.kubectl = kubectl;
  }

  /**
   * Run job with a name
   *
   * @param {string} name Name of the job to run
   * @param {object} options Options passed to job runner
   * @return {Object.<string,Namespace>} Namespaces
   */
  run(name, options) {
    const job = this.namespace.getJob(name);
    const id = (Date.now() % 100000000).toString();

    if (!job) {
      return Promise.reject(new Error('Job with that name not defined'));
    }

    job.metadata.name = job.metadata.name + '-' + id;
    job.spec.selector = {matchLabels: { "job-id": id }};
    job.spec.template.metadata.labels =
      _.extend( job.spec.template.metadata.labels, {"job-id": id});

    return this.kubectl.deploy(this.namespace.name, 'job', job.metadata.name, job).then(result => {
      if (options.wait) {
        return this.kubectl.wait(this.namespace.name, 'pod', `-l job-id=${id}`, {timeout: 10000}, pods => {
          const pod = _.first(pods.items);

          if (
            _.get(pod, 'status.phase') == 'Running' ||
            _.get(pod, 'status.phase') == 'Succeeded'
          ) {
            return pod;
          }

          return Promise.reject();
        }).then(pod => {
          const child = this.kubectl.logs(this.namespace.name, pod.metadata.name);
          child.stdout.pipe(process.stdout);

          return this.kubectl.wait(this.namespace.name, 'job', job.metadata.name, {timeout: 100000}, job => {
            if (!job.status.succeeded) {
              return Promise.reject();
            }
          }).then(result => {
            child.kill();
            console.log("job complete");

          });
        }).then(() => {
          if (options.gc) {
            return this.kubectl.delete(this.namespace.name, 'job', job.metadata.name);
          }
        });
      }
    });
  }
}

module.exports = JobRunner;